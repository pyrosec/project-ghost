use anyhow::Result;
use colored::Colorize;
use std::io::{self, Write};

use crate::api::ApiClient;
use crate::config::credentials;

pub async fn login(api: &ApiClient, extension: Option<String>) -> Result<()> {
    // Get extension
    let extension = match extension {
        Some(ext) => ext,
        None => {
            print!("Extension: ");
            io::stdout().flush()?;
            let mut input = String::new();
            io::stdin().read_line(&mut input)?;
            input.trim().to_string()
        }
    };

    // Get password (hidden input)
    let password = ::rpassword::prompt_password("Password: ")?;

    // Attempt login
    print!("Logging in... ");
    io::stdout().flush()?;

    match api.login(&extension, &password).await {
        Ok(response) => {
            credentials::store_token(&response.token)?;

            println!("{}", "OK".green());
            println!();
            println!("Logged in as extension {}", extension.cyan());

            if response.is_superuser {
                println!("  {} Superuser access", "✓".green());
            }

            println!(
                "  Token expires: {}",
                response.expires_at.dimmed()
            );

            Ok(())
        }
        Err(e) => {
            println!("{}", "FAILED".red());
            anyhow::bail!("Login failed: {}", e)
        }
    }
}

pub fn logout() -> Result<()> {
    credentials::delete_token()?;
    credentials::delete_api_key()?;

    println!("{}", "Logged out successfully".green());
    Ok(())
}

pub async fn whoami(api: &ApiClient) -> Result<()> {
    match api.get_me().await {
        Ok(user) => {
            println!("Extension: {}", user.extension.cyan());

            if let Some(name) = &user.display_name {
                println!("Name:      {}", name);
            }

            if let Some(email) = &user.email {
                println!("Email:     {}", email);
            }

            if user.is_superuser {
                println!("Role:      {}", "Superuser".yellow());
            } else {
                println!("Role:      User");
            }

            println!();
            println!("API Keys:  {}", user.api_keys.len());

            Ok(())
        }
        Err(e) => {
            if e.to_string().contains("Not authenticated") {
                println!("{}", "Not logged in".yellow());
                println!("Run '{}' to authenticate", "ghost login".cyan());
            } else {
                anyhow::bail!("{}", e)
            }
            Ok(())
        }
    }
}
