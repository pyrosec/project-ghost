use anyhow::Result;
use colored::Colorize;

use crate::api::ApiClient;

pub async fn openvpn(api: &ApiClient) -> Result<()> {
    let status = api.get_openvpn_status().await?;

    println!("{}", "OpenVPN Status".cyan().bold());
    println!("{}", "=".repeat(80));

    if let Some(updated) = &status.updated {
        println!("Updated: {}", updated.dimmed());
    }

    // Build a map of common_name -> virtual_address from routes
    let mut vpn_ips: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    if let Some(routes) = &status.routes {
        for route in routes {
            if let (Some(cn), Some(vaddr)) = (
                route.get("common_name").and_then(|v| v.as_str()),
                route.get("virtual_address").and_then(|v| v.as_str()),
            ) {
                vpn_ips.insert(cn.to_string(), vaddr.to_string());
            }
        }
    }

    println!("\n{}", "Connected Clients:".green().bold());
    if status.clients.is_empty() {
        println!("  {}", "No clients connected".dimmed());
    } else {
        println!(
            "  {:<20} {:<16} {:<22} {:>10} {:>10}",
            "Name".bold(),
            "VPN IP".bold(),
            "Real Address".bold(),
            "Received".bold(),
            "Sent".bold()
        );
        for client in &status.clients {
            let vpn_ip = vpn_ips.get(&client.common_name)
                .map(|s| s.as_str())
                .unwrap_or("-");
            println!(
                "  {:<20} {:<16} {:<22} {:>10} {:>10}",
                client.common_name,
                vpn_ip,
                client.real_address,
                format_bytes(client.bytes_received),
                format_bytes(client.bytes_sent),
            );
        }
    }

    if let Some(stats) = &status.global_stats {
        if !stats.is_empty() {
            println!("\n{}", "Global Stats:".yellow().bold());
            for (key, value) in stats {
                println!("  {}: {}", key, value);
            }
        }
    }

    Ok(())
}

pub async fn sms_pipeline(api: &ApiClient) -> Result<()> {
    let status = api.get_sms_pipeline_status().await?;

    println!("{}", "SMS Pipeline Status".cyan().bold());
    println!("{}", "=".repeat(60));

    if status.last_time == 0 {
        println!("{}", "No last-time recorded".yellow());
        return Ok(());
    }

    println!("Last processed: {}", status.last_time_iso.unwrap_or_default().green());
    println!("Unix timestamp: {}", status.last_time);

    if let Some(behind) = status.behind_seconds {
        let default_str = format!("{}s", behind);
        let behind_str = status.behind_human.as_deref().unwrap_or(&default_str);

        if behind < 300 {
            println!("Behind: {}", behind_str.green());
        } else if behind < 900 {
            println!("Behind: {}", behind_str.yellow());
        } else {
            println!("Behind: {}", behind_str.red());
        }
    }

    Ok(())
}

pub async fn set_sms_time(api: &ApiClient, time: i64) -> Result<()> {
    let result = api.set_sms_pipeline_time(time).await?;

    println!("{}", "SMS Pipeline Time Updated".green().bold());
    println!("New time: {}", result.last_time_iso);
    println!("Unix timestamp: {}", result.last_time);

    Ok(())
}

pub async fn redis_get(api: &ApiClient, key: &str) -> Result<()> {
    let result = api.get_redis_key(key).await?;

    println!("{}: {}", "Key".cyan(), result.key);

    if result.exists {
        println!("{}: {}", "Value".green(), result.value.unwrap_or_default());
        if let Some(ttl) = result.ttl {
            println!("{}: {}s", "TTL".yellow(), ttl);
        }
    } else {
        println!("{}", "Key does not exist".red());
    }

    Ok(())
}

pub async fn redis_set(api: &ApiClient, key: &str, value: &str, ttl: Option<i64>) -> Result<()> {
    let result = api.set_redis_key(key, value, ttl).await?;

    println!("{}", "Redis Key Set".green().bold());
    println!("Key: {}", result.key);
    println!("Value: {}", result.value);
    if let Some(t) = result.ttl {
        println!("TTL: {}s", t);
    }

    Ok(())
}

fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}
