# Project Ghost - Terraform Infrastructure

This directory contains Terraform configurations for deploying Project Ghost infrastructure to Google Cloud Platform.

## Resources Created

### Networking
- **VPC Network** (`ghost-vpc`): Custom VPC with private subnets
- **Subnet** (`ghost-subnet`): Primary subnet with secondary ranges for pods/services
- **Cloud Router**: For NAT gateway
- **Cloud NAT**: Outbound internet access for private nodes
- **Firewall Rules**: Allow HTTP/HTTPS, SIP, XMPP, STUN/TURN traffic

### Compute
- **GKE Cluster** (`ghost-cluster`): Managed Kubernetes cluster
  - Private nodes with public endpoint
  - Workload Identity enabled
  - Network policies (Calico)
  - Managed Prometheus
- **Node Pool**: Configurable machine type and count

### Static IPs
- **Ingress IP** (Global): For HTTP/HTTPS load balancer
- **Asterisk IP** (Regional): For SIP traffic
- **Coturn IP 1** (Regional): Primary STUN/TURN
- **Coturn IP 2** (Regional): TURN relay

### Storage
- **GCS Bucket**: For backups

### IAM
- **Workload Service Account**: For GKE workloads
- **Workload Identity Binding**: Links K8s service account to GCP SA

### DNS (Cloudflare)
- A records for all services
- SRV records for Matrix, XMPP, STUN/TURN

## Usage

### Prerequisites

1. GCP Project with billing enabled
2. APIs enabled:
   ```bash
   gcloud services enable container.googleapis.com
   gcloud services enable compute.googleapis.com
   gcloud services enable iam.googleapis.com
   ```

3. GCS bucket for Terraform state:
   ```bash
   gsutil mb gs://ghost-terraform-state
   ```

4. Cloudflare API tokens for both domains

### Configuration

1. Copy the example vars file:
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   ```

2. Edit `terraform.tfvars` with your values

3. Set sensitive variables as environment variables:
   ```bash
   export TF_VAR_cloudflare_api_token_primary="your-token"
   export TF_VAR_cloudflare_api_token_stun="your-token"
   ```

### Deploy

```bash
# Initialize
terraform init

# Plan
terraform plan

# Apply
terraform apply
```

### Outputs

After apply, retrieve outputs:
```bash
terraform output ingress_ip
terraform output asterisk_ip
terraform output coturn_ip_1
terraform output coturn_ip_2
terraform output kubeconfig_command
```

## Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `project_id` | GCP Project ID | (required) |
| `region` | GCP Region | `us-central1` |
| `zone` | GCP Zone | `us-central1-a` |
| `cluster_name` | GKE cluster name | `ghost-cluster` |
| `primary_domain` | Primary domain | `pyrosec.is` |
| `stun_domain` | STUN domain | `pyrosec.gg` |
| `node_machine_type` | Node machine type | `e2-standard-4` |
| `node_count` | Number of nodes | `3` |
| `disk_size_gb` | Node disk size | `100` |

## DNS Records Created

### pyrosec.is (Primary)
| Type | Name | Target |
|------|------|--------|
| A | @ | Ingress IP |
| A | matrix | Ingress IP |
| A | vault | Ingress IP |
| A | sip | Asterisk IP |
| A | xmpp | Ingress IP |
| SRV | _matrix._tcp | matrix.pyrosec.is:443 |
| SRV | _xmpp-client._tcp | xmpp.pyrosec.is:5222 |
| SRV | _xmpp-server._tcp | xmpp.pyrosec.is:5269 |

### pyrosec.gg (STUN)
| Type | Name | Target |
|------|------|--------|
| A | @ | Coturn IP 1 |
| A | turn | Coturn IP 2 |
| SRV | _stun._udp | pyrosec.gg:3478 |
| SRV | _turn._udp | turn.pyrosec.gg:3478 |
| SRV | _turn._tcp | turn.pyrosec.gg:3478 |
| SRV | _turns._tcp | turn.pyrosec.gg:5349 |

## Cost Estimate

Approximate monthly costs (us-central1):
- GKE Control Plane: ~$73/month (free tier available)
- 3x e2-standard-4 nodes: ~$300/month
- 4x Static IPs: ~$29/month
- Cloud NAT: ~$32/month
- Storage: Variable

**Total: ~$430-500/month**

Consider using preemptible/spot nodes for non-production or cost savings.
