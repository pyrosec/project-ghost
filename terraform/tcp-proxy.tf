# TCP Proxy VM for non-HTTP services
# Routes XMPP, OpenVPN, SIP traffic to GKE services

# Static IP for TCP Proxy
resource "google_compute_address" "tcp_proxy_ip" {
  name   = "ghost-tcp-proxy-ip"
  region = var.region
}

# Firewall rule for TCP Proxy
resource "google_compute_firewall" "allow_tcp_proxy" {
  name    = "ghost-allow-tcp-proxy"
  network = google_compute_network.ghost_vpc.name

  allow {
    protocol = "tcp"
    ports    = ["80", "443", "1194", "5222", "5223", "5269", "8880", "35061"]
  }

  allow {
    protocol = "icmp"
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["ghost-tcp-proxy"]
}

# TCP Proxy VM
resource "google_compute_instance" "tcp_proxy" {
  name         = "ghost-tcp-proxy"
  machine_type = "e2-small"
  zone         = var.zone

  tags = ["ghost-tcp-proxy"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 20
      type  = "pd-ssd"
    }
  }

  network_interface {
    network    = google_compute_network.ghost_vpc.name
    subnetwork = google_compute_subnetwork.ghost_subnet.name

    access_config {
      nat_ip = google_compute_address.tcp_proxy_ip.address
    }
  }

  metadata = {
    # Internal LoadBalancer IP for OpenResty services
    openresty-internal-ip = "10.0.0.6"
  }

  metadata_startup_script = <<-EOF
    #!/bin/bash
    set -e

    # Install nginx with stream module
    apt-get update
    apt-get install -y nginx libnginx-mod-stream

    # Get the internal LB IP from instance metadata (or use placeholder for initial setup)
    INTERNAL_LB_IP=$(curl -s -H "Metadata-Flavor: Google" \
      http://metadata.google.internal/computeMetadata/v1/instance/attributes/openresty-internal-ip 2>/dev/null || echo "10.52.5.99")

    # Configure nginx for TCP proxying
    cat > /etc/nginx/nginx.conf << 'NGINX_CONF'
    user www-data;
    worker_processes auto;
    pid /run/nginx.pid;
    include /etc/nginx/modules-enabled/*.conf;

    events {
        worker_connections 4096;
        use epoll;
        multi_accept on;
    }

    stream {
        log_format tcp_proxy '$remote_addr [$time_local] '
                             '$protocol $status $bytes_sent $bytes_received '
                             '$session_time "$upstream_addr"';

        access_log /var/log/nginx/tcp_access.log tcp_proxy;

        # OpenVPN - pyrosec.is:1194
        upstream openvpn_backend {
            server INTERNAL_LB_IP:1194;
        }
        server {
            listen 1194;
            proxy_pass openvpn_backend;
            proxy_timeout 600s;
            proxy_connect_timeout 10s;
        }

        # Tinyproxy - pyrosec.is:8880
        upstream tinyproxy_backend {
            server INTERNAL_LB_IP:8880;
        }
        server {
            listen 8880;
            proxy_pass tinyproxy_backend;
            proxy_timeout 600s;
            proxy_connect_timeout 10s;
        }

        # XMPP Client - pyrosec.is:5222
        upstream xmpp_client_backend {
            server INTERNAL_LB_IP:5222;
        }
        server {
            listen 5222;
            proxy_pass xmpp_client_backend;
            proxy_timeout 300s;
            proxy_connect_timeout 10s;
        }

        # XMPP Client TLS - pyrosec.is:5223
        upstream xmpp_tls_backend {
            server INTERNAL_LB_IP:5223;
        }
        server {
            listen 5223;
            proxy_pass xmpp_tls_backend;
            proxy_timeout 300s;
            proxy_connect_timeout 10s;
        }

        # XMPP S2S - pyrosec.is:5269
        upstream xmpp_s2s_backend {
            server INTERNAL_LB_IP:5269;
        }
        server {
            listen 5269;
            proxy_pass xmpp_s2s_backend;
            proxy_timeout 300s;
            proxy_connect_timeout 10s;
        }

        # SIP - pyrosec.is:35061
        upstream sip_backend {
            server INTERNAL_LB_IP:35061;
        }
        server {
            listen 35061;
            proxy_pass sip_backend;
            proxy_timeout 300s;
            proxy_connect_timeout 10s;
        }

        # HTTP passthrough - pyrosec.is:80
        upstream http_backend {
            server INTERNAL_LB_IP:80;
        }
        server {
            listen 80;
            proxy_pass http_backend;
            proxy_timeout 60s;
            proxy_connect_timeout 10s;
        }

        # HTTPS passthrough - pyrosec.is:443
        upstream https_backend {
            server INTERNAL_LB_IP:443;
        }
        server {
            listen 443;
            proxy_pass https_backend;
            proxy_timeout 60s;
            proxy_connect_timeout 10s;
        }
    }
    NGINX_CONF

    # Replace placeholder with actual IP
    sed -i "s/INTERNAL_LB_IP/$INTERNAL_LB_IP/g" /etc/nginx/nginx.conf

    # Enable and start nginx
    systemctl enable nginx
    systemctl restart nginx

    echo "TCP Proxy configured successfully"
  EOF

  service_account {
    scopes = ["cloud-platform"]
  }

  labels = {
    environment = "production"
    app         = "ghost"
    role        = "tcp-proxy"
  }

  # Allow stopping for updates
  allow_stopping_for_update = true
}

# Output the TCP Proxy IP
output "tcp_proxy_external_ip" {
  description = "External IP of the TCP proxy VM"
  value       = google_compute_address.tcp_proxy_ip.address
}

output "tcp_proxy_internal_ip" {
  description = "Internal IP of the TCP proxy VM"
  value       = google_compute_instance.tcp_proxy.network_interface[0].network_ip
}
