use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::fs;
use std::path::PathBuf;

const APP_DIR: &str = ".ghost";
const SESSION_FILE: &str = "session.json";
const CONFIG_FILE: &str = "config.toml";
const PBKDF2_ITERATIONS: u32 = 100_000;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Config {
    pub api_url: Option<String>,
    pub default_extension: Option<String>,
}

/// Encrypted session stored in ~/.ghost/session.json
#[derive(Debug, Serialize, Deserialize)]
struct EncryptedSession {
    salt: String,      // Base64 encoded
    nonce: String,     // Base64 encoded
    ciphertext: String, // Base64 encoded
}

/// Decrypted session data
#[derive(Debug, Serialize, Deserialize, Default)]
struct SessionData {
    token: Option<String>,
    api_key: Option<String>,
}

impl Config {
    pub fn ghost_dir() -> Result<PathBuf> {
        let home = dirs::home_dir().context("Could not find home directory")?;
        let dir = home.join(APP_DIR);

        if !dir.exists() {
            fs::create_dir_all(&dir).context("Failed to create .ghost directory")?;
        }

        Ok(dir)
    }

    pub fn config_file() -> Result<PathBuf> {
        Ok(Self::ghost_dir()?.join(CONFIG_FILE))
    }

    pub fn load() -> Result<Self> {
        let path = Self::config_file()?;

        if !path.exists() {
            return Ok(Self::default());
        }

        let contents = fs::read_to_string(&path).context("Failed to read config file")?;
        toml::from_str(&contents).context("Failed to parse config file")
    }

    #[allow(dead_code)]
    pub fn save(&self) -> Result<()> {
        let path = Self::config_file()?;
        let contents = toml::to_string_pretty(self).context("Failed to serialize config")?;
        fs::write(&path, contents).context("Failed to write config file")?;
        Ok(())
    }
}

/// Get machine-specific key material for encryption
/// Uses username + home directory as the base
fn get_machine_key_material() -> Vec<u8> {
    let username = whoami::username();
    let hostname = whoami::fallible::hostname().unwrap_or_else(|_| "unknown".to_string());
    let home = dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    format!("ghost-cli:{}:{}:{}", username, hostname, home).into_bytes()
}

/// Derive encryption key using PBKDF2
fn derive_key(salt: &[u8]) -> [u8; KEY_LEN] {
    let password = get_machine_key_material();
    let mut key = [0u8; KEY_LEN];
    pbkdf2_hmac::<Sha256>(&password, salt, PBKDF2_ITERATIONS, &mut key);
    key
}

/// Encrypt session data
fn encrypt_session(data: &SessionData) -> Result<EncryptedSession> {
    let json = serde_json::to_string(data).context("Failed to serialize session")?;

    // Generate random salt and nonce
    let mut salt = [0u8; SALT_LEN];
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    rand::thread_rng().fill_bytes(&mut nonce_bytes);

    // Derive key
    let key = derive_key(&salt);

    // Encrypt
    let cipher = Aes256Gcm::new_from_slice(&key).context("Failed to create cipher")?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, json.as_bytes())
        .map_err(|e| anyhow::anyhow!("Encryption failed: {}", e))?;

    Ok(EncryptedSession {
        salt: BASE64.encode(salt),
        nonce: BASE64.encode(nonce_bytes),
        ciphertext: BASE64.encode(ciphertext),
    })
}

/// Decrypt session data
fn decrypt_session(encrypted: &EncryptedSession) -> Result<SessionData> {
    let salt = BASE64.decode(&encrypted.salt).context("Invalid salt")?;
    let nonce_bytes = BASE64.decode(&encrypted.nonce).context("Invalid nonce")?;
    let ciphertext = BASE64.decode(&encrypted.ciphertext).context("Invalid ciphertext")?;

    // Derive key
    let key = derive_key(&salt);

    // Decrypt
    let cipher = Aes256Gcm::new_from_slice(&key).context("Failed to create cipher")?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| anyhow::anyhow!("Decryption failed - session may be from another machine"))?;

    let json = String::from_utf8(plaintext).context("Invalid UTF-8 in session")?;
    serde_json::from_str(&json).context("Failed to parse session")
}

/// Session file path
fn session_file() -> Result<PathBuf> {
    Ok(Config::ghost_dir()?.join(SESSION_FILE))
}

/// Load session from disk
fn load_session() -> Result<SessionData> {
    let path = session_file()?;

    if !path.exists() {
        return Ok(SessionData::default());
    }

    let contents = fs::read_to_string(&path).context("Failed to read session file")?;
    let encrypted: EncryptedSession = serde_json::from_str(&contents)
        .context("Failed to parse session file")?;

    decrypt_session(&encrypted)
}

/// Save session to disk
fn save_session(data: &SessionData) -> Result<()> {
    let path = session_file()?;
    let encrypted = encrypt_session(data)?;
    let json = serde_json::to_string_pretty(&encrypted).context("Failed to serialize session")?;
    fs::write(&path, json).context("Failed to write session file")?;

    // Set restrictive permissions on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        fs::set_permissions(&path, perms).ok();
    }

    Ok(())
}

/// Delete session file
fn delete_session() -> Result<()> {
    let path = session_file()?;
    if path.exists() {
        fs::remove_file(&path).context("Failed to delete session file")?;
    }
    Ok(())
}

/// Credential storage functions
pub mod credentials {
    use super::*;

    pub fn store_token(token: &str) -> Result<()> {
        let mut session = load_session().unwrap_or_default();
        session.token = Some(token.to_string());
        save_session(&session)
    }

    pub fn get_token() -> Result<Option<String>> {
        let session = load_session()?;
        Ok(session.token)
    }

    pub fn delete_token() -> Result<()> {
        let mut session = load_session().unwrap_or_default();
        session.token = None;
        if session.api_key.is_none() {
            delete_session()
        } else {
            save_session(&session)
        }
    }

    pub fn store_api_key(key: &str) -> Result<()> {
        let mut session = load_session().unwrap_or_default();
        session.api_key = Some(key.to_string());
        save_session(&session)
    }

    pub fn get_api_key() -> Result<Option<String>> {
        let session = load_session()?;
        Ok(session.api_key)
    }

    pub fn delete_api_key() -> Result<()> {
        let mut session = load_session().unwrap_or_default();
        session.api_key = None;
        if session.token.is_none() {
            delete_session()
        } else {
            save_session(&session)
        }
    }
}
