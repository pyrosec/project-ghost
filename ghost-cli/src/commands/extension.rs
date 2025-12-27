use anyhow::Result;
use colored::Colorize;
use tabled::{settings::Style, Table, Tabled};

use crate::api::{
    ApiClient, CreateExtensionRequest, UpdateExtensionRequest, UpdateSettingsRequest,
    VoicemailRequest,
};

#[derive(Tabled)]
struct ExtensionRow {
    #[tabled(rename = "Extension")]
    extension: String,
    #[tabled(rename = "Name")]
    name: String,
    #[tabled(rename = "DID")]
    did: String,
    #[tabled(rename = "Status")]
    status: String,
    #[tabled(rename = "Devices")]
    devices: String,
}

pub async fn info(api: &ApiClient, extension: Option<String>) -> Result<()> {
    let ext = api.get_extension_info(extension.as_deref()).await?;

    println!("{}", "Extension Information".bold());
    println!("{}", "=".repeat(40));
    println!();
    println!("  Extension:  {}", ext.extension.cyan());
    println!("  Caller ID:  {}", ext.callerid);
    println!("  Context:    {}", ext.context);
    println!(
        "  DID:        {}",
        ext.did.as_ref().unwrap_or(&"None".dimmed().to_string())
    );
    println!();
    println!("{}", "Devices".bold());
    println!("{}", "-".repeat(40));

    if ext.devices.is_empty() {
        println!("  {}", "No devices registered".dimmed());
    } else {
        for device in &ext.devices {
            println!("  • {}", device);
        }
    }

    println!();
    println!("{}", "Settings".bold());
    println!("{}", "-".repeat(40));
    println!(
        "  Voicemail:     {}",
        if ext.voicemail_enabled {
            "Enabled".green()
        } else {
            "Disabled".dimmed()
        }
    );
    println!(
        "  Fallback:      {}",
        ext.settings
            .fallback
            .as_ref()
            .unwrap_or(&"None".dimmed().to_string())
    );
    println!(
        "  SMS Fallback:  {}",
        ext.settings
            .sms_fallback
            .as_ref()
            .unwrap_or(&"None".dimmed().to_string())
    );
    println!(
        "  Superuser:     {}",
        if ext.settings.is_superuser {
            "Yes".yellow()
        } else {
            "No".normal()
        }
    );

    if !ext.blacklist.is_empty() {
        println!();
        println!("{}", "Blacklist".bold());
        println!("{}", "-".repeat(40));
        for number in &ext.blacklist {
            println!("  • {}", number);
        }
    }

    Ok(())
}

pub async fn list(api: &ApiClient) -> Result<()> {
    let result = api.list_extensions().await?;

    if result.extensions.is_empty() {
        println!("{}", "No extensions found".dimmed());
        return Ok(());
    }

    let rows: Vec<ExtensionRow> = result
        .extensions
        .iter()
        .map(|ext| ExtensionRow {
            extension: ext.extension.clone(),
            name: ext
                .display_name
                .clone()
                .unwrap_or_else(|| "-".dimmed().to_string()),
            did: ext.did.clone().unwrap_or_else(|| "-".to_string()),
            status: if !ext.is_active {
                "Disabled".red().to_string()
            } else if ext.registered {
                "Online".green().to_string()
            } else {
                "Offline".dimmed().to_string()
            },
            devices: ext.devices_count.to_string(),
        })
        .collect();

    let table = Table::new(rows).with(Style::rounded()).to_string();

    println!("{}", table);
    println!();
    println!("Total: {} extensions", result.extensions.len());

    Ok(())
}

pub async fn create(
    api: &ApiClient,
    extension: &str,
    callerid: &str,
    did: Option<String>,
    context: &str,
    voicemail: bool,
) -> Result<()> {
    let req = CreateExtensionRequest {
        extension: extension.to_string(),
        callerid: callerid.to_string(),
        did,
        context: context.to_string(),
        voicemail: Some(VoicemailRequest { enabled: voicemail }),
    };

    let result = api.create_extension(&req).await?;

    println!("{}", "Extension created successfully!".green());
    println!();
    println!("  Extension:    {}", result.extension.cyan());
    println!("  SIP Username: {}", result.sip_username);
    println!();
    println!(
        "{}",
        "Initial password (save it now, it won't be shown again):".yellow()
    );
    println!();
    println!("  {}", result.password.cyan());
    println!();

    Ok(())
}

pub async fn update(
    api: &ApiClient,
    extension: &str,
    password: Option<String>,
    callerid: Option<String>,
    did: Option<String>,
    fallback: Option<String>,
    sms_fallback: Option<String>,
) -> Result<()> {
    // Build settings if any setting is provided
    let settings = if fallback.is_some() || sms_fallback.is_some() {
        Some(UpdateSettingsRequest {
            fallback,
            sms_fallback,
        })
    } else {
        None
    };

    let req = UpdateExtensionRequest {
        extension: extension.to_string(),
        password,
        callerid,
        did,
        settings,
    };

    let result = api.update_extension(&req).await?;

    if result.changes.is_empty() {
        println!("{}", "No changes made".dimmed());
    } else {
        println!("{}", "Extension updated successfully!".green());
        println!();
        println!("Changes applied:");
        for change in &result.changes {
            println!("  • {}", change);
        }
    }

    Ok(())
}

pub async fn delete(api: &ApiClient, extension: &str) -> Result<()> {
    // Confirm deletion
    print!(
        "Are you sure you want to delete extension {}? [y/N]: ",
        extension.cyan()
    );
    std::io::Write::flush(&mut std::io::stdout())?;

    let mut input = String::new();
    std::io::stdin().read_line(&mut input)?;

    if !input.trim().to_lowercase().starts_with('y') {
        println!("{}", "Cancelled".dimmed());
        return Ok(());
    }

    api.delete_extension(extension).await?;

    println!("{}", "Extension deleted successfully".green());
    Ok(())
}

pub async fn blacklist_list(api: &ApiClient, extension: Option<String>) -> Result<()> {
    let result = api.get_blacklist(extension.as_deref()).await?;

    println!(
        "Blacklist for extension {}",
        result.extension.cyan()
    );
    println!("{}", "-".repeat(40));

    if result.blacklist.is_empty() {
        println!("{}", "No numbers blacklisted".dimmed());
    } else {
        for number in &result.blacklist {
            println!("  • {}", number);
        }
        println!();
        println!("Total: {} numbers", result.blacklist.len());
    }

    Ok(())
}

pub async fn blacklist_add(
    api: &ApiClient,
    extension: Option<String>,
    number: &str,
) -> Result<()> {
    api.add_to_blacklist(extension.as_deref(), number).await?;

    println!(
        "{} added to blacklist",
        number.cyan()
    );
    Ok(())
}

pub async fn blacklist_remove(
    api: &ApiClient,
    extension: Option<String>,
    number: &str,
) -> Result<()> {
    api.remove_from_blacklist(extension.as_deref(), number)
        .await?;

    println!(
        "{} removed from blacklist",
        number.cyan()
    );
    Ok(())
}
