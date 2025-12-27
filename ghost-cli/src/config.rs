use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const APP_NAME: &str = "ghost-cli";
const CONFIG_FILE: &str = "config.toml";

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Config {
    pub api_url: Option<String>,
    pub default_extension: Option<String>,
}

impl Config {
    pub fn config_dir() -> Result<PathBuf> {
        let dir = dirs::config_dir()
            .context("Could not find config directory")?
            .join(APP_NAME);

        if !dir.exists() {
            fs::create_dir_all(&dir).context("Failed to create config directory")?;
        }

        Ok(dir)
    }

    pub fn config_file() -> Result<PathBuf> {
        Ok(Self::config_dir()?.join(CONFIG_FILE))
    }

    pub fn load() -> Result<Self> {
        let path = Self::config_file()?;

        if !path.exists() {
            return Ok(Self::default());
        }

        let contents = fs::read_to_string(&path).context("Failed to read config file")?;

        toml::from_str(&contents).context("Failed to parse config file")
    }

    pub fn save(&self) -> Result<()> {
        let path = Self::config_file()?;
        let contents = toml::to_string_pretty(self).context("Failed to serialize config")?;

        fs::write(&path, contents).context("Failed to write config file")?;

        Ok(())
    }
}

/// Credential storage using system keyring
pub mod credentials {
    use anyhow::{Context, Result};
    use keyring::Entry;

    const SERVICE_NAME: &str = "ghost-cli";

    pub fn store_token(token: &str) -> Result<()> {
        let entry = Entry::new(SERVICE_NAME, "token").context("Failed to create keyring entry")?;
        entry
            .set_password(token)
            .context("Failed to store token in keyring")?;
        Ok(())
    }

    pub fn get_token() -> Result<Option<String>> {
        let entry = Entry::new(SERVICE_NAME, "token").context("Failed to create keyring entry")?;

        match entry.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e).context("Failed to get token from keyring"),
        }
    }

    pub fn delete_token() -> Result<()> {
        let entry = Entry::new(SERVICE_NAME, "token").context("Failed to create keyring entry")?;

        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()), // Already deleted
            Err(e) => Err(e).context("Failed to delete token from keyring"),
        }
    }

    pub fn store_api_key(key: &str) -> Result<()> {
        let entry =
            Entry::new(SERVICE_NAME, "api_key").context("Failed to create keyring entry")?;
        entry
            .set_password(key)
            .context("Failed to store API key in keyring")?;
        Ok(())
    }

    pub fn get_api_key() -> Result<Option<String>> {
        let entry =
            Entry::new(SERVICE_NAME, "api_key").context("Failed to create keyring entry")?;

        match entry.get_password() {
            Ok(key) => Ok(Some(key)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e).context("Failed to get API key from keyring"),
        }
    }

    pub fn delete_api_key() -> Result<()> {
        let entry =
            Entry::new(SERVICE_NAME, "api_key").context("Failed to create keyring entry")?;

        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e).context("Failed to delete API key from keyring"),
        }
    }
}
