use anyhow::Result;
use clap::{Parser, Subcommand};

mod api;
mod auth;
mod commands;
mod config;

use commands::{extension, logs, openvpn, status, token};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "ghost")]
#[command(author = "Ghost Team")]
#[command(version = "0.1.0")]
#[command(about = "CLI tool for managing Ghost telephony system")]
#[command(propagate_version = true)]
struct Cli {
    /// API endpoint URL
    #[arg(long, env = "GHOST_API_URL", default_value = "https://pyrosec.is")]
    api_url: String,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Login to Ghost API
    Login {
        /// Extension number
        #[arg(short, long)]
        extension: Option<String>,
    },

    /// Logout and clear stored credentials
    Logout,

    /// Show current authentication status
    Whoami,

    /// Manage API tokens
    #[command(subcommand)]
    Token(TokenCommands),

    /// Manage extensions
    #[command(subcommand)]
    Extension(ExtensionCommands),

    /// View service logs
    #[command(subcommand)]
    Logs(LogsCommands),

    /// Manage blacklist
    #[command(subcommand)]
    Blacklist(BlacklistCommands),

    /// System status commands
    #[command(subcommand)]
    Status(StatusCommands),

    /// Redis key operations
    #[command(subcommand)]
    Redis(RedisCommands),

    /// Issue an OpenVPN client certificate (superuser only)
    #[command(name = "issue-cert")]
    IssueCert {
        /// Username for the certificate (e.g., rauss)
        username: String,

        /// Output file path (default: <username>.ovpn)
        #[arg(short, long)]
        output: Option<PathBuf>,
    },

    /// List issued OpenVPN certificates (superuser only)
    #[command(name = "list-certs")]
    ListCerts,

    /// Revoke an OpenVPN certificate (superuser only)
    #[command(name = "revoke-cert")]
    RevokeCert {
        /// Username of the certificate to revoke
        username: String,
    },
}

#[derive(Subcommand)]
enum TokenCommands {
    /// Create a new API token
    Create {
        /// Token name
        #[arg(short, long)]
        name: String,

        /// Expiration in days (optional)
        #[arg(short, long)]
        expires_in_days: Option<u32>,
    },

    /// List all API tokens
    List,

    /// Revoke an API token
    Revoke {
        /// Token ID to revoke
        id: String,
    },
}

#[derive(Subcommand)]
enum ExtensionCommands {
    /// Show extension info
    Info {
        /// Extension number (default: your own)
        extension: Option<String>,
    },

    /// List all extensions (superuser only)
    List,

    /// Create a new extension (superuser only)
    Create {
        /// Extension number
        #[arg(short, long)]
        extension: String,

        /// Caller ID name
        #[arg(short, long)]
        callerid: String,

        /// DID number (optional)
        #[arg(short, long)]
        did: Option<String>,

        /// Dialplan context (default: from-internal)
        #[arg(long, default_value = "from-internal")]
        context: String,

        /// Enable voicemail
        #[arg(long, default_value = "true")]
        voicemail: bool,
    },

    /// Update an extension
    Update {
        /// Extension number
        extension: String,

        /// New password
        #[arg(short, long)]
        password: Option<String>,

        /// New caller ID
        #[arg(short, long)]
        callerid: Option<String>,

        /// New DID
        #[arg(short, long)]
        did: Option<String>,

        /// Fallback number for unanswered calls
        #[arg(long)]
        fallback: Option<String>,

        /// SMS fallback number
        #[arg(long)]
        sms_fallback: Option<String>,
    },

    /// Delete an extension (superuser only)
    Delete {
        /// Extension number to delete
        extension: String,
    },
}

#[derive(Subcommand)]
enum LogsCommands {
    /// View Asterisk logs
    Asterisk {
        /// Number of lines to show
        #[arg(short, long, default_value = "100")]
        lines: u32,

        /// Follow log output (stream)
        #[arg(short, long)]
        follow: bool,
    },

    /// View Prosody logs
    Prosody {
        /// Number of lines to show
        #[arg(short, long, default_value = "100")]
        lines: u32,

        /// Follow log output (stream)
        #[arg(short, long)]
        follow: bool,
    },

    /// View OpenVPN logs
    Openvpn {
        /// Number of lines to show
        #[arg(short, long, default_value = "100")]
        lines: u32,

        /// Follow log output (stream)
        #[arg(short, long)]
        follow: bool,
    },

    /// View SMS Pipeline logs
    SmsPipeline {
        /// Number of lines to show
        #[arg(short, long, default_value = "100")]
        lines: u32,

        /// Follow log output (stream)
        #[arg(short, long)]
        follow: bool,
    },

    /// View logs for a specific service
    Service {
        /// Service name
        name: String,

        /// Number of lines to show
        #[arg(short, long, default_value = "100")]
        lines: u32,

        /// Follow log output (stream)
        #[arg(short, long)]
        follow: bool,
    },
}

#[derive(Subcommand)]
enum BlacklistCommands {
    /// List blacklisted numbers
    List {
        /// Extension (default: your own)
        extension: Option<String>,
    },

    /// Add a number to blacklist
    Add {
        /// Phone number to blacklist
        number: String,

        /// Extension (default: your own)
        #[arg(short, long)]
        extension: Option<String>,
    },

    /// Remove a number from blacklist
    Remove {
        /// Phone number to remove
        number: String,

        /// Extension (default: your own)
        #[arg(short, long)]
        extension: Option<String>,
    },
}

#[derive(Subcommand)]
enum StatusCommands {
    /// Show OpenVPN connected clients
    Openvpn,

    /// Show SMS pipeline processing status
    SmsPipeline,

    /// Set SMS pipeline last processed time
    SetSmsTime {
        /// Unix timestamp
        time: i64,
    },
}

#[derive(Subcommand)]
enum RedisCommands {
    /// Get a Redis key value
    Get {
        /// Key name
        key: String,
    },

    /// Set a Redis key value
    Set {
        /// Key name
        key: String,

        /// Value to set
        value: String,

        /// TTL in seconds (optional)
        #[arg(short, long)]
        ttl: Option<i64>,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let config = config::Config::load()?;
    let api = api::ApiClient::new(&cli.api_url);

    match cli.command {
        Commands::Login { extension } => {
            auth::login(&api, extension).await?;
        }
        Commands::Logout => {
            auth::logout()?;
        }
        Commands::Whoami => {
            auth::whoami(&api).await?;
        }
        Commands::Token(cmd) => match cmd {
            TokenCommands::Create { name, expires_in_days } => {
                token::create(&api, &name, expires_in_days).await?;
            }
            TokenCommands::List => {
                token::list(&api).await?;
            }
            TokenCommands::Revoke { id } => {
                token::revoke(&api, &id).await?;
            }
        },
        Commands::Extension(cmd) => match cmd {
            ExtensionCommands::Info { extension: ext } => {
                extension::info(&api, ext).await?;
            }
            ExtensionCommands::List => {
                extension::list(&api).await?;
            }
            ExtensionCommands::Create {
                extension: ext,
                callerid,
                did,
                context,
                voicemail,
            } => {
                extension::create(&api, &ext, &callerid, did, &context, voicemail).await?;
            }
            ExtensionCommands::Update {
                extension: ext,
                password,
                callerid,
                did,
                fallback,
                sms_fallback,
            } => {
                extension::update(&api, &ext, password, callerid, did, fallback, sms_fallback)
                    .await?;
            }
            ExtensionCommands::Delete { extension: ext } => {
                extension::delete(&api, &ext).await?;
            }
        },
        Commands::Logs(cmd) => match cmd {
            LogsCommands::Asterisk { lines, follow } => {
                logs::stream(&api, "asterisk", lines, follow).await?;
            }
            LogsCommands::Prosody { lines, follow } => {
                logs::stream(&api, "prosody", lines, follow).await?;
            }
            LogsCommands::Openvpn { lines, follow } => {
                logs::stream(&api, "openvpn", lines, follow).await?;
            }
            LogsCommands::SmsPipeline { lines, follow } => {
                logs::stream(&api, "sms-pipeline", lines, follow).await?;
            }
            LogsCommands::Service { name, lines, follow } => {
                logs::stream(&api, &name, lines, follow).await?;
            }
        },
        Commands::Blacklist(cmd) => match cmd {
            BlacklistCommands::List { extension: ext } => {
                extension::blacklist_list(&api, ext).await?;
            }
            BlacklistCommands::Add { number, extension: ext } => {
                extension::blacklist_add(&api, ext, &number).await?;
            }
            BlacklistCommands::Remove { number, extension: ext } => {
                extension::blacklist_remove(&api, ext, &number).await?;
            }
        },
        Commands::Status(cmd) => match cmd {
            StatusCommands::Openvpn => {
                status::openvpn(&api).await?;
            }
            StatusCommands::SmsPipeline => {
                status::sms_pipeline(&api).await?;
            }
            StatusCommands::SetSmsTime { time } => {
                status::set_sms_time(&api, time).await?;
            }
        },
        Commands::Redis(cmd) => match cmd {
            RedisCommands::Get { key } => {
                status::redis_get(&api, &key).await?;
            }
            RedisCommands::Set { key, value, ttl } => {
                status::redis_set(&api, &key, &value, ttl).await?;
            }
        },
        Commands::IssueCert { username, output } => {
            openvpn::issue_cert(&api, &username, output).await?;
        }
        Commands::ListCerts => {
            openvpn::list_certs(&api).await?;
        }
        Commands::RevokeCert { username } => {
            openvpn::revoke_cert(&api, &username).await?;
        }
    }

    Ok(())
}
