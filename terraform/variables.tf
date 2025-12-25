variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP Zone"
  type        = string
  default     = "us-central1-a"
}

variable "cluster_name" {
  description = "GKE Cluster Name"
  type        = string
  default     = "ghost-cluster"
}

variable "primary_domain" {
  description = "Primary domain for services"
  type        = string
  default     = "pyrosec.is"
}

variable "stun_domain" {
  description = "STUN/TURN domain"
  type        = string
  default     = "pyrosec.gg"
}

variable "cloudflare_api_token_primary" {
  description = "Cloudflare API token for primary domain"
  type        = string
  sensitive   = true
}

variable "cloudflare_api_token_stun" {
  description = "Cloudflare API token for STUN domain"
  type        = string
  sensitive   = true
}

variable "node_machine_type" {
  description = "Machine type for GKE nodes"
  type        = string
  default     = "e2-standard-4"
}

variable "node_count" {
  description = "Number of nodes in the node pool"
  type        = number
  default     = 3
}

variable "disk_size_gb" {
  description = "Boot disk size in GB"
  type        = number
  default     = 100
}
