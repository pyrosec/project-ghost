terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }

  backend "gcs" {
    bucket = "project-ghost-695752-terraform-state"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# VPC Network
resource "google_compute_network" "ghost_vpc" {
  name                    = "ghost-vpc"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

# Primary Subnet for GKE
resource "google_compute_subnetwork" "ghost_subnet" {
  name          = "ghost-subnet"
  ip_cidr_range = "10.0.0.0/20"
  region        = var.region
  network       = google_compute_network.ghost_vpc.id

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.48.0.0/14"
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.52.0.0/20"
  }

  private_ip_google_access = true
}

# Cloud Router for NAT
resource "google_compute_router" "ghost_router" {
  name    = "ghost-router"
  region  = var.region
  network = google_compute_network.ghost_vpc.id
}

# Cloud NAT for outbound internet access
resource "google_compute_router_nat" "ghost_nat" {
  name                               = "ghost-nat"
  router                             = google_compute_router.ghost_router.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# Static IP for Ingress (primary services)
resource "google_compute_global_address" "ingress_ip" {
  name = "ghost-ingress-ip"
}

# Static IP for Asterisk SIP (regional, for direct exposure)
resource "google_compute_address" "asterisk_ip" {
  name   = "ghost-asterisk-ip"
  region = var.region
}

# Static IPs for Coturn (needs 2 IPs for DTLS)
resource "google_compute_address" "coturn_ip_1" {
  name   = "ghost-coturn-ip-1"
  region = var.region
}

resource "google_compute_address" "coturn_ip_2" {
  name   = "ghost-coturn-ip-2"
  region = var.region
}

# Firewall Rules
resource "google_compute_firewall" "allow_http_https" {
  name    = "ghost-allow-http-https"
  network = google_compute_network.ghost_vpc.name

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["ghost-ingress"]
}

resource "google_compute_firewall" "allow_sip" {
  name    = "ghost-allow-sip"
  network = google_compute_network.ghost_vpc.name

  allow {
    protocol = "tcp"
    ports    = ["35061"]
  }

  allow {
    protocol = "udp"
    ports    = ["30000-30099"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["ghost-asterisk"]
}

resource "google_compute_firewall" "allow_xmpp" {
  name    = "ghost-allow-xmpp"
  network = google_compute_network.ghost_vpc.name

  allow {
    protocol = "tcp"
    ports    = ["5222", "5223", "5269", "5280", "5281"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["ghost-prosody"]
}

resource "google_compute_firewall" "allow_coturn" {
  name    = "ghost-allow-coturn"
  network = google_compute_network.ghost_vpc.name

  allow {
    protocol = "tcp"
    ports    = ["3478", "5349"]
  }

  allow {
    protocol = "udp"
    ports    = ["3478", "5349", "49152-65535"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["ghost-coturn"]
}

resource "google_compute_firewall" "allow_internal" {
  name    = "ghost-allow-internal"
  network = google_compute_network.ghost_vpc.name

  allow {
    protocol = "icmp"
  }

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }

  source_ranges = ["10.0.0.0/8"]
}

# GKE Cluster
resource "google_container_cluster" "ghost_cluster" {
  provider = google-beta

  name     = var.cluster_name
  location = var.zone

  # Use release channel for automatic upgrades
  release_channel {
    channel = "REGULAR"
  }

  # Remove default node pool
  remove_default_node_pool = true
  initial_node_count       = 1

  network    = google_compute_network.ghost_vpc.name
  subnetwork = google_compute_subnetwork.ghost_subnet.name

  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  # Enable Workload Identity
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # Private cluster configuration
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = "172.16.0.0/28"
  }

  master_authorized_networks_config {
    cidr_blocks {
      cidr_block   = "0.0.0.0/0"
      display_name = "All networks"
    }
  }

  # Enable network policy
  network_policy {
    enabled  = true
    provider = "CALICO"
  }

  addons_config {
    http_load_balancing {
      disabled = false
    }
    horizontal_pod_autoscaling {
      disabled = false
    }
    network_policy_config {
      disabled = false
    }
  }

  # Logging and monitoring
  logging_config {
    enable_components = ["SYSTEM_COMPONENTS", "WORKLOADS"]
  }

  monitoring_config {
    enable_components = ["SYSTEM_COMPONENTS"]
    managed_prometheus {
      enabled = true
    }
  }
}

# Primary Node Pool
resource "google_container_node_pool" "ghost_nodes" {
  name       = "ghost-node-pool"
  location   = var.zone
  cluster    = google_container_cluster.ghost_cluster.name
  node_count = var.node_count

  node_config {
    machine_type = var.node_machine_type
    disk_size_gb = var.disk_size_gb
    disk_type    = "pd-ssd"

    # Use Container-Optimized OS
    image_type = "COS_CONTAINERD"

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    tags = ["ghost-node", "ghost-ingress", "ghost-asterisk", "ghost-prosody", "ghost-coturn"]

    labels = {
      environment = "production"
      app         = "ghost"
    }
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  upgrade_settings {
    max_surge       = 1
    max_unavailable = 0
  }
}

# GCS Bucket for persistent data backups
resource "google_storage_bucket" "ghost_backups" {
  name     = "${var.project_id}-ghost-backups"
  location = var.region

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }
}

# Service Account for GKE workloads
resource "google_service_account" "ghost_workload_sa" {
  account_id   = "ghost-workload-sa"
  display_name = "Ghost Workload Service Account"
}

# Grant storage access to workload SA
resource "google_storage_bucket_iam_member" "ghost_workload_storage" {
  bucket = google_storage_bucket.ghost_backups.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.ghost_workload_sa.email}"
}

# Workload Identity binding
# Depends on node pool to ensure identity pool is fully initialized
resource "google_service_account_iam_member" "workload_identity_binding" {
  service_account_id = google_service_account.ghost_workload_sa.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[ghost/ghost-workload]"

  depends_on = [google_container_node_pool.ghost_nodes]
}
