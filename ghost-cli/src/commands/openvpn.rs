use anyhow::Result;
use colored::Colorize;
use std::fs;
use std::path::PathBuf;

use crate::api::ApiClient;

pub async fn issue_cert(api: &ApiClient, username: &str, output: Option<PathBuf>) -> Result<()> {
    println!("{}", "Issuing OpenVPN Certificate".cyan().bold());
    println!("{}", "=".repeat(60));
    println!("Username: {}", username.green());
    println!();

    let result = api.issue_cert(username).await?;

    // Determine output path
    let output_path = output.unwrap_or_else(|| PathBuf::from(format!("{}.ovpn", username)));

    // Write the .ovpn file
    fs::write(&output_path, &result.ovpn_config)?;

    println!("{}", "Certificate issued successfully!".green().bold());
    println!();
    println!("Output file: {}", output_path.display().to_string().cyan());
    println!("Expires: {}", result.expires_at.yellow());
    println!();
    println!(
        "{}",
        "Import this file into your OpenVPN client to connect.".dimmed()
    );

    Ok(())
}

pub async fn list_certs(api: &ApiClient) -> Result<()> {
    let result = api.list_certs().await?;

    println!("{}", "Issued OpenVPN Certificates".cyan().bold());
    println!("{}", "=".repeat(40));

    if result.certificates.is_empty() {
        println!("{}", "No certificates issued".dimmed());
    } else {
        for cert in &result.certificates {
            println!("  {}", cert.green());
        }
        println!();
        println!("Total: {} certificate(s)", result.certificates.len());
    }

    Ok(())
}

pub async fn revoke_cert(api: &ApiClient, username: &str) -> Result<()> {
    println!("{}", "Revoking OpenVPN Certificate".red().bold());
    println!("Username: {}", username);
    println!();

    api.revoke_cert(username).await?;

    println!("{}", "Certificate revoked successfully!".green());
    println!(
        "{}",
        "The user will no longer be able to connect with this certificate.".dimmed()
    );

    Ok(())
}
