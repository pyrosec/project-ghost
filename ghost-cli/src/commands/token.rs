use anyhow::Result;
use colored::Colorize;
use tabled::{settings::Style, Table, Tabled};

use crate::api::ApiClient;
use crate::config::credentials;

#[derive(Tabled)]
struct TokenRow {
    #[tabled(rename = "ID")]
    id: String,
    #[tabled(rename = "Name")]
    name: String,
    #[tabled(rename = "Prefix")]
    prefix: String,
    #[tabled(rename = "Created")]
    created: String,
    #[tabled(rename = "Last Used")]
    last_used: String,
    #[tabled(rename = "Expires")]
    expires: String,
}

pub async fn create(api: &ApiClient, name: &str, expires_in_days: Option<u32>) -> Result<()> {
    let result = api.create_token(name, expires_in_days).await?;

    println!("{}", "API key created successfully!".green());
    println!();
    println!("  Name:    {}", result.name);
    println!("  ID:      {}", result.key_id);
    println!("  Prefix:  {}", result.key_prefix);

    if let Some(expires) = &result.expires_at {
        println!("  Expires: {}", expires);
    } else {
        println!("  Expires: {}", "Never".dimmed());
    }

    println!();
    println!("{}", "Your API key (save it now, it won't be shown again):".yellow());
    println!();
    println!("  {}", result.api_key.cyan());
    println!();

    // Offer to store the API key
    print!("Store this API key for CLI use? [Y/n]: ");
    std::io::Write::flush(&mut std::io::stdout())?;

    let mut input = String::new();
    std::io::stdin().read_line(&mut input)?;

    let should_store = input.trim().is_empty() || input.trim().to_lowercase().starts_with('y');

    if should_store {
        credentials::store_api_key(&result.api_key)?;
        println!("{}", "API key stored securely".green());
    }

    Ok(())
}

pub async fn list(api: &ApiClient) -> Result<()> {
    let user = api.get_me().await?;

    if user.api_keys.is_empty() {
        println!("{}", "No API keys found".dimmed());
        println!("Create one with: {}", "ghost token create --name <name>".cyan());
        return Ok(());
    }

    let rows: Vec<TokenRow> = user
        .api_keys
        .iter()
        .map(|key| TokenRow {
            id: key.id[..8].to_string(), // Show first 8 chars of UUID
            name: key.name.clone(),
            prefix: key.key_prefix.clone(),
            created: format_datetime(&key.created_at),
            last_used: key
                .last_used_at
                .as_ref()
                .map(|d| format_datetime(d))
                .unwrap_or_else(|| "Never".dimmed().to_string()),
            expires: key
                .expires_at
                .as_ref()
                .map(|d| format_datetime(d))
                .unwrap_or_else(|| "Never".to_string()),
        })
        .collect();

    let table = Table::new(rows).with(Style::rounded()).to_string();

    println!("{}", table);
    println!();
    println!(
        "To revoke a token: {}",
        "ghost token revoke <id>".cyan()
    );

    Ok(())
}

pub async fn revoke(api: &ApiClient, id: &str) -> Result<()> {
    api.revoke_token(id).await?;

    println!("{}", "API key revoked successfully".green());
    Ok(())
}

fn format_datetime(dt: &str) -> String {
    // Simple ISO8601 formatting - just show date and time
    if let Some(idx) = dt.find('T') {
        let date = &dt[..idx];
        let time = dt.get(idx + 1..idx + 6).unwrap_or("00:00");
        format!("{} {}", date, time)
    } else {
        dt.to_string()
    }
}
