use anyhow::{Context, Result};
use reqwest::{header, Client, Response};
use serde::{de::DeserializeOwned, Deserialize, Serialize};

use crate::config::credentials;

pub struct ApiClient {
    client: Client,
    base_url: String,
}

#[derive(Debug, Deserialize)]
pub struct ErrorResponse {
    pub error: String,
    pub details: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct LoginRequest {
    pub extension: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginResponse {
    pub token: String,
    pub extension: String,
    pub is_superuser: bool,
    pub expires_at: String,
}

#[derive(Debug, Serialize)]
pub struct CreateTokenRequest {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_in_days: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTokenResponse {
    pub api_key: String,
    pub key_id: String,
    pub name: String,
    pub key_prefix: String,
    pub expires_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ApiKeyInfo {
    pub id: String,
    pub name: String,
    pub key_prefix: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
    pub expires_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UserInfo {
    pub extension: String,
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub is_superuser: bool,
    pub api_keys: Vec<ApiKeyInfo>,
}

#[derive(Debug, Deserialize)]
pub struct ExtensionInfo {
    pub extension: String,
    pub callerid: String,
    pub context: String,
    pub did: Option<String>,
    pub devices: Vec<String>,
    pub voicemail_enabled: bool,
    pub settings: ExtensionSettings,
    pub blacklist: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct ExtensionSettings {
    pub fallback: Option<String>,
    pub sms_fallback: Option<String>,
    pub is_superuser: bool,
}

#[derive(Debug, Deserialize)]
pub struct ExtensionListItem {
    pub extension: String,
    pub display_name: Option<String>,
    pub is_active: bool,
    pub did: Option<String>,
    pub registered: bool,
    pub devices_count: u32,
}

#[derive(Debug, Deserialize)]
pub struct ExtensionListResponse {
    pub extensions: Vec<ExtensionListItem>,
}

#[derive(Debug, Serialize)]
pub struct CreateExtensionRequest {
    pub extension: String,
    pub callerid: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub did: Option<String>,
    pub context: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub voicemail: Option<VoicemailRequest>,
}

#[derive(Debug, Serialize)]
pub struct VoicemailRequest {
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateExtensionResponse {
    pub extension: String,
    pub password: String,
    pub sip_username: String,
    pub created: bool,
}

#[derive(Debug, Serialize)]
pub struct UpdateExtensionRequest {
    pub extension: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub callerid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub did: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub settings: Option<UpdateSettingsRequest>,
}

#[derive(Debug, Serialize)]
pub struct UpdateSettingsRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sms_fallback: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateExtensionResponse {
    pub success: bool,
    pub changes: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct BlacklistResponse {
    pub extension: String,
    pub blacklist: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct BlacklistAddRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extension: Option<String>,
    pub number: String,
}

#[derive(Debug, Deserialize)]
pub struct LogsResponse {
    pub logs: Vec<String>,
    pub pod: Option<String>,
    pub service: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct OpenVPNClient {
    pub common_name: String,
    pub real_address: String,
    pub bytes_received: u64,
    pub bytes_sent: u64,
    pub connected_since: String,
}

#[derive(Debug, Deserialize)]
pub struct OpenVPNStatus {
    pub updated: Option<String>,
    pub clients: Vec<OpenVPNClient>,
    pub routes: Option<Vec<serde_json::Value>>,
    pub global_stats: Option<std::collections::HashMap<String, String>>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SmsPipelineStatus {
    pub last_time: i64,
    pub last_time_iso: Option<String>,
    pub behind_seconds: Option<i64>,
    pub behind_human: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SmsPipelineSetResponse {
    pub success: bool,
    pub last_time: i64,
    pub last_time_iso: String,
}

#[derive(Debug, Deserialize)]
pub struct RedisKeyResponse {
    pub key: String,
    pub value: Option<String>,
    pub ttl: Option<i64>,
    pub exists: bool,
}

#[derive(Debug, Deserialize)]
pub struct RedisSetResponse {
    pub success: bool,
    pub key: String,
    pub value: String,
    pub ttl: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct IssueCertRequest {
    pub username: String,
}

#[derive(Debug, Deserialize)]
pub struct IssueCertResponse {
    pub username: String,
    pub ovpn_config: String,
    pub expires_at: String,
}

#[derive(Debug, Deserialize)]
pub struct ListCertsResponse {
    pub certificates: Vec<String>,
}

impl ApiClient {
    pub fn new(base_url: &str) -> Self {
        let client = Client::builder()
            .danger_accept_invalid_certs(false)
            .build()
            .expect("Failed to build HTTP client");

        Self {
            client,
            base_url: base_url.trim_end_matches('/').to_string(),
        }
    }

    fn get_auth_header() -> Result<Option<String>> {
        // Try API key first, then JWT
        if let Some(api_key) = credentials::get_api_key()? {
            return Ok(Some(format!("Bearer {}", api_key)));
        }
        if let Some(token) = credentials::get_token()? {
            return Ok(Some(format!("Bearer {}", token)));
        }
        Ok(None)
    }

    async fn request_with_auth(&self, builder: reqwest::RequestBuilder) -> Result<Response> {
        let auth = Self::get_auth_header()?.context("Not authenticated. Please run 'ghost login' first.")?;

        builder
            .header(header::AUTHORIZATION, auth)
            .send()
            .await
            .context("Request failed")
    }

    async fn handle_response<T: DeserializeOwned>(response: Response) -> Result<T> {
        let status = response.status();

        if status.is_success() {
            response.json().await.context("Failed to parse response")
        } else {
            let error: ErrorResponse = response
                .json()
                .await
                .unwrap_or(ErrorResponse {
                    error: format!("HTTP {}", status),
                    details: None,
                });
            anyhow::bail!("{}", error.error)
        }
    }

    pub async fn login(&self, extension: &str, password: &str) -> Result<LoginResponse> {
        let response = self
            .client
            .post(format!("{}/api/auth/login", self.base_url))
            .json(&LoginRequest {
                extension: extension.to_string(),
                password: password.to_string(),
            })
            .send()
            .await
            .context("Login request failed")?;

        Self::handle_response(response).await
    }

    pub async fn get_me(&self) -> Result<UserInfo> {
        let response = self
            .request_with_auth(self.client.get(format!("{}/api/auth/me", self.base_url)))
            .await?;

        Self::handle_response(response).await
    }

    pub async fn create_token(
        &self,
        name: &str,
        expires_in_days: Option<u32>,
    ) -> Result<CreateTokenResponse> {
        let response = self
            .request_with_auth(
                self.client
                    .post(format!("{}/api/auth/token", self.base_url))
                    .json(&CreateTokenRequest {
                        name: name.to_string(),
                        expires_in_days,
                    }),
            )
            .await?;

        Self::handle_response(response).await
    }

    pub async fn revoke_token(&self, id: &str) -> Result<()> {
        let response = self
            .request_with_auth(
                self.client
                    .delete(format!("{}/api/auth/token/{}", self.base_url, id)),
            )
            .await?;

        if response.status().is_success() {
            Ok(())
        } else {
            let error: ErrorResponse = response.json().await.unwrap_or(ErrorResponse {
                error: "Unknown error".to_string(),
                details: None,
            });
            anyhow::bail!("{}", error.error)
        }
    }

    pub async fn get_extension_info(&self, extension: Option<&str>) -> Result<ExtensionInfo> {
        let url = match extension {
            Some(ext) => format!(
                "{}/api/asterisk/extension/info?extension={}",
                self.base_url, ext
            ),
            None => format!("{}/api/asterisk/extension/info", self.base_url),
        };

        let response = self
            .request_with_auth(self.client.get(&url))
            .await?;

        Self::handle_response(response).await
    }

    pub async fn list_extensions(&self) -> Result<ExtensionListResponse> {
        let response = self
            .request_with_auth(
                self.client
                    .get(format!("{}/api/asterisk/extension/list", self.base_url)),
            )
            .await?;

        Self::handle_response(response).await
    }

    pub async fn create_extension(
        &self,
        req: &CreateExtensionRequest,
    ) -> Result<CreateExtensionResponse> {
        let response = self
            .request_with_auth(
                self.client
                    .post(format!("{}/api/asterisk/extension/create", self.base_url))
                    .json(req),
            )
            .await?;

        Self::handle_response(response).await
    }

    pub async fn update_extension(
        &self,
        req: &UpdateExtensionRequest,
    ) -> Result<UpdateExtensionResponse> {
        let response = self
            .request_with_auth(
                self.client
                    .put(format!("{}/api/asterisk/extension/update", self.base_url))
                    .json(req),
            )
            .await?;

        Self::handle_response(response).await
    }

    pub async fn delete_extension(&self, extension: &str) -> Result<()> {
        let response = self
            .request_with_auth(
                self.client.delete(format!(
                    "{}/api/asterisk/extension/delete?extension={}",
                    self.base_url, extension
                )),
            )
            .await?;

        if response.status().is_success() {
            Ok(())
        } else {
            let error: ErrorResponse = response.json().await.unwrap_or(ErrorResponse {
                error: "Unknown error".to_string(),
                details: None,
            });
            anyhow::bail!("{}", error.error)
        }
    }

    pub async fn get_blacklist(&self, extension: Option<&str>) -> Result<BlacklistResponse> {
        let url = match extension {
            Some(ext) => format!(
                "{}/api/asterisk/extension/blacklist?extension={}",
                self.base_url, ext
            ),
            None => format!("{}/api/asterisk/extension/blacklist", self.base_url),
        };

        let response = self
            .request_with_auth(self.client.get(&url))
            .await?;

        Self::handle_response(response).await
    }

    pub async fn add_to_blacklist(&self, extension: Option<&str>, number: &str) -> Result<()> {
        let response = self
            .request_with_auth(
                self.client
                    .post(format!(
                        "{}/api/asterisk/extension/blacklist/add",
                        self.base_url
                    ))
                    .json(&BlacklistAddRequest {
                        extension: extension.map(String::from),
                        number: number.to_string(),
                    }),
            )
            .await?;

        if response.status().is_success() {
            Ok(())
        } else {
            let error: ErrorResponse = response.json().await.unwrap_or(ErrorResponse {
                error: "Unknown error".to_string(),
                details: None,
            });
            anyhow::bail!("{}", error.error)
        }
    }

    pub async fn remove_from_blacklist(&self, extension: Option<&str>, number: &str) -> Result<()> {
        let url = match extension {
            Some(ext) => format!(
                "{}/api/asterisk/extension/blacklist/remove?extension={}&number={}",
                self.base_url, ext, number
            ),
            None => format!(
                "{}/api/asterisk/extension/blacklist/remove?number={}",
                self.base_url, number
            ),
        };

        let response = self
            .request_with_auth(self.client.delete(&url))
            .await?;

        if response.status().is_success() {
            Ok(())
        } else {
            let error: ErrorResponse = response.json().await.unwrap_or(ErrorResponse {
                error: "Unknown error".to_string(),
                details: None,
            });
            anyhow::bail!("{}", error.error)
        }
    }

    pub async fn get_logs(
        &self,
        service: &str,
        lines: u32,
        follow: bool,
    ) -> Result<LogsResponse> {
        let url = format!(
            "{}/api/logs/{}?lines={}&follow={}",
            self.base_url, service, lines, follow
        );

        let response = self
            .request_with_auth(self.client.get(&url))
            .await?;

        Self::handle_response(response).await
    }

    pub async fn stream_logs(&self, service: &str, lines: u32) -> Result<Response> {
        let url = format!(
            "{}/api/logs/{}?lines={}&follow=true",
            self.base_url, service, lines
        );

        self.request_with_auth(self.client.get(&url)).await
    }

    pub async fn get_openvpn_status(&self) -> Result<OpenVPNStatus> {
        let response = self
            .request_with_auth(
                self.client
                    .get(format!("{}/api/status/openvpn", self.base_url)),
            )
            .await?;

        Self::handle_response(response).await
    }

    pub async fn get_sms_pipeline_status(&self) -> Result<SmsPipelineStatus> {
        let response = self
            .request_with_auth(
                self.client
                    .get(format!("{}/api/status/sms-pipeline", self.base_url)),
            )
            .await?;

        Self::handle_response(response).await
    }

    pub async fn set_sms_pipeline_time(&self, time: i64) -> Result<SmsPipelineSetResponse> {
        let response = self
            .request_with_auth(
                self.client
                    .post(format!("{}/api/status/sms-pipeline", self.base_url))
                    .json(&serde_json::json!({ "time": time })),
            )
            .await?;

        Self::handle_response(response).await
    }

    pub async fn get_redis_key(&self, key: &str) -> Result<RedisKeyResponse> {
        let response = self
            .request_with_auth(
                self.client
                    .get(format!("{}/api/status/redis/{}", self.base_url, key)),
            )
            .await?;

        Self::handle_response(response).await
    }

    pub async fn set_redis_key(
        &self,
        key: &str,
        value: &str,
        ttl: Option<i64>,
    ) -> Result<RedisSetResponse> {
        let mut body = serde_json::json!({ "value": value });
        if let Some(t) = ttl {
            body["ttl"] = serde_json::json!(t);
        }

        let response = self
            .request_with_auth(
                self.client
                    .put(format!("{}/api/status/redis/{}", self.base_url, key))
                    .json(&body),
            )
            .await?;

        Self::handle_response(response).await
    }

    pub async fn issue_cert(&self, username: &str) -> Result<IssueCertResponse> {
        let response = self
            .request_with_auth(
                self.client
                    .post(format!("{}/api/openvpn/issue-cert", self.base_url))
                    .json(&IssueCertRequest {
                        username: username.to_string(),
                    }),
            )
            .await?;

        Self::handle_response(response).await
    }

    pub async fn list_certs(&self) -> Result<ListCertsResponse> {
        let response = self
            .request_with_auth(
                self.client
                    .get(format!("{}/api/openvpn/certs", self.base_url)),
            )
            .await?;

        Self::handle_response(response).await
    }

    pub async fn revoke_cert(&self, username: &str) -> Result<()> {
        let response = self
            .request_with_auth(
                self.client
                    .delete(format!("{}/api/openvpn/certs/{}", self.base_url, username)),
            )
            .await?;

        if response.status().is_success() {
            Ok(())
        } else {
            let error: ErrorResponse = response.json().await.unwrap_or(ErrorResponse {
                error: "Unknown error".to_string(),
                details: None,
            });
            anyhow::bail!("{}", error.error)
        }
    }
}
