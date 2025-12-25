output "cluster_name" {
  description = "GKE Cluster Name"
  value       = google_container_cluster.ghost_cluster.name
}

output "cluster_endpoint" {
  description = "GKE Cluster Endpoint"
  value       = google_container_cluster.ghost_cluster.endpoint
  sensitive   = true
}

output "cluster_ca_certificate" {
  description = "GKE Cluster CA Certificate"
  value       = google_container_cluster.ghost_cluster.master_auth[0].cluster_ca_certificate
  sensitive   = true
}

output "ingress_ip" {
  description = "Global static IP for ingress"
  value       = google_compute_global_address.ingress_ip.address
}

output "asterisk_ip" {
  description = "Static IP for Asterisk SIP"
  value       = google_compute_address.asterisk_ip.address
}

output "coturn_ip_1" {
  description = "Static IP for Coturn (primary)"
  value       = google_compute_address.coturn_ip_1.address
}

output "coturn_ip_2" {
  description = "Static IP for Coturn (relay)"
  value       = google_compute_address.coturn_ip_2.address
}

output "vpc_name" {
  description = "VPC Network Name"
  value       = google_compute_network.ghost_vpc.name
}

output "subnet_name" {
  description = "Subnet Name"
  value       = google_compute_subnetwork.ghost_subnet.name
}

output "workload_sa_email" {
  description = "Workload Service Account Email"
  value       = google_service_account.ghost_workload_sa.email
}

output "backup_bucket" {
  description = "GCS bucket for backups"
  value       = google_storage_bucket.ghost_backups.name
}

output "kubeconfig_command" {
  description = "Command to configure kubectl"
  value       = "gcloud container clusters get-credentials ${google_container_cluster.ghost_cluster.name} --zone ${var.zone} --project ${var.project_id}"
}
