use anyhow::Result;
use colored::Colorize;
use futures_util::StreamExt;

use crate::api::ApiClient;

pub async fn stream(api: &ApiClient, service: &str, lines: u32, follow: bool) -> Result<()> {
    if follow {
        // Stream logs using SSE
        println!(
            "Streaming logs from {}... (Ctrl+C to stop)",
            service.cyan()
        );
        println!("{}", "-".repeat(60));

        let response = api.stream_logs(service, lines).await?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to stream logs: {} - {}", status, error_text);
        }

        // Read the streaming response
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    buffer.push_str(&text);

                    // Process complete lines
                    while let Some(idx) = buffer.find('\n') {
                        let line = buffer[..idx].trim();

                        // SSE format: "data: <content>"
                        if let Some(content) = line.strip_prefix("data: ") {
                            println!("{}", content);
                        } else if let Some(_) = line.strip_prefix("event: error") {
                            // Error event
                            eprintln!("{}", line.red());
                        } else if !line.is_empty() && !line.starts_with(':') {
                            // Regular line (not SSE comment)
                            println!("{}", line);
                        }

                        buffer = buffer[idx + 1..].to_string();
                    }
                }
                Err(e) => {
                    eprintln!("{}: {}", "Stream error".red(), e);
                    break;
                }
            }
        }

        Ok(())
    } else {
        // Fetch logs once
        let result = api.get_logs(service, lines, false).await?;

        if let Some(pod) = &result.pod {
            println!(
                "Logs from {} (pod: {})",
                service.cyan(),
                pod.dimmed()
            );
        } else {
            println!("Logs from {}", service.cyan());
        }
        println!("{}", "-".repeat(60));

        if result.logs.is_empty() {
            println!("{}", "No logs available".dimmed());
        } else {
            for line in &result.logs {
                println!("{}", line);
            }
        }

        Ok(())
    }
}
