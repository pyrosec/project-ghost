# Project Ghost - Kubernetes Deployment

This directory contains the Kubernetes manifests and Flux GitOps configuration for deploying Project Ghost to Google Kubernetes Engine (GKE).

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Internet                                     │
└─────────────────────────────────────────────────────────────────────────┘
         │                    │                    │              │
         │ HTTPS (443)        │ SIP (35061)        │ STUN/TURN    │ XMPP
         ▼                    ▼                    ▼              ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌───────┐
│   OpenResty     │  │    Asterisk     │  │     Coturn      │  │Prosody│
│   (Ingress)     │  │  LoadBalancer   │  │  (Dual IP LB)   │  │  LB   │
└────────┬────────┘  └─────────────────┘  └─────────────────┘  └───────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌──────────┐
│Matrix │ │Vaultwarden│
│Synapse│ │          │
└───┬───┘ └──────────┘
    │
    ▼
┌─────────┐     ┌───────┐
│PostgreSQL│◄───│ Redis │
└─────────┘     └───────┘
```

## Directory Structure

```
k8s/
├── base/                    # Base configurations
│   ├── namespace.yaml       # Namespace definitions
│   ├── configmaps.yaml      # Shared configuration
│   ├── secrets.yaml         # Secret templates (DO NOT COMMIT VALUES)
│   ├── storage.yaml         # PersistentVolumeClaims
│   ├── network-policies.yaml # Network isolation rules
│   ├── cert-manager.yaml    # TLS certificate configuration
│   └── kustomization.yaml
│
├── apps/                    # Application deployments
│   ├── redis/
│   ├── postgres/
│   ├── synapse/             # Matrix homeserver
│   ├── vaultwarden/         # Password manager
│   ├── asterisk/            # VoIP PBX
│   ├── prosody/             # XMPP server
│   ├── coturn/              # TURN/STUN server
│   ├── openresty/           # Ingress controller
│   ├── dossi/               # Intelligence service
│   ├── sms-pipeline/        # SMS handling
│   ├── voicemail-pipeline/  # Voicemail transcription
│   ├── rtt-bridge/          # Real-time text
│   └── kustomization.yaml
│
└── flux-system/             # Flux GitOps
    ├── gotk-components.yaml # Flux toolkit (generated)
    ├── gotk-sync.yaml       # GitRepository & Kustomizations
    ├── image-automation.yaml # Auto image updates
    └── notifications.yaml   # Deployment alerts
```

## Prerequisites

1. **GCP Project** with the following APIs enabled:
   - Kubernetes Engine API
   - Compute Engine API
   - Cloud DNS API (optional)

2. **Cloudflare** accounts for both domains:
   - `pyrosec.is` (primary services)
   - `pyrosec.gg` (STUN/TURN)

3. **GitHub Secrets** configured:
   ```
   GCP_PROJECT_ID
   GCP_SA_KEY              # Service account JSON
   CLOUDFLARE_API_TOKEN_PRIMARY
   CLOUDFLARE_API_TOKEN_STUN
   FLUX_GITHUB_TOKEN       # For Flux to push image updates
   DOMAIN
   ROOT_PASSWORD
   POSTGRES_PASSWORD
   VOIPMS_SIP_USERNAME
   VOIPMS_SIP_PASSWORD
   VOIPMS_SIP_HOST
   VOIPMS_SIP_PORT
   VOIPMS_API_USERNAME
   VOIPMS_API_PASSWORD
   TWILIO_ACCOUNT_SID
   TWILIO_AUTH_TOKEN
   ENDATO_API_KEY
   ENDATO_API_SECRET
   RECAPTCHA_PUBLIC_KEY
   RECAPTCHA_PRIVATE_KEY
   TURN_SHARED_SECRET
   AWS_ACCESS_KEY
   AWS_SECRET_KEY
   AWS_REGION
   AWS_MODEL
   ```

## Deployment

### Initial Setup

1. **Deploy Infrastructure with Terraform:**
   ```bash
   cd terraform
   terraform init
   terraform plan
   terraform apply
   ```

2. **Configure kubectl:**
   ```bash
   gcloud container clusters get-credentials ghost-cluster --zone us-central1-a
   ```

3. **Bootstrap Flux:**
   ```bash
   # Via GitHub Actions
   gh workflow run flux-bootstrap.yaml

   # Or manually
   flux bootstrap github \
     --owner=YOUR_ORG \
     --repository=project-ghost \
     --branch=master \
     --path=k8s/flux-system
   ```

4. **Create Secrets:**
   ```bash
   # Run the deploy workflow or manually:
   kubectl create secret generic ghost-secrets -n ghost \
     --from-literal=DOMAIN=pyrosec.is \
     --from-literal=ROOT_PASSWORD=xxx \
     # ... (see deploy.yaml for full list)
   ```

### Updating

With Flux configured, updates happen automatically:

1. **Code changes**: Push to `master` → CI builds images → Flux detects new images → Updates deployments
2. **Config changes**: Push k8s/ changes to `master` → Flux reconciles within 5 minutes
3. **Manual reconcile**: `flux reconcile kustomization ghost-apps`

## Services

### External Endpoints

| Service | Domain | Port | Protocol |
|---------|--------|------|----------|
| Matrix | matrix.pyrosec.is | 443 | HTTPS |
| Vaultwarden | vault.pyrosec.is | 443 | HTTPS |
| Asterisk SIP | pyrosec.is | 35061 | TLS |
| Asterisk RTP | pyrosec.is | 30000-30099 | UDP |
| XMPP Client | pyrosec.is | 5222, 5223 | TCP |
| XMPP Server | pyrosec.is | 5269 | TCP |
| STUN/TURN | pyrosec.gg | 3478, 5349 | UDP/TCP |

### Internal Services

| Service | Port | Purpose |
|---------|------|---------|
| Redis | 6379 | Caching, queues |
| PostgreSQL | 5432 | Matrix database |
| Synapse | 8008 | Matrix homeserver |
| Vaultwarden | 80, 3012 | Password manager |
| Prosody | 5222+ | XMPP server |

## TLS Certificates

Certificates are managed by cert-manager with Cloudflare DNS01 challenges:

- **Primary Domain**: `*.pyrosec.is` - Wildcard certificate
- **STUN Domain**: `*.pyrosec.gg` - Wildcard certificate

Certificates are automatically renewed and synced to services via the `cert-sync` CronJob.

## Coturn (TURN/STUN)

Coturn is configured for DTLS with two external IPs:
- **Primary IP**: STUN and TURN requests
- **Relay IP**: Media relay for NAT traversal

The dual-IP setup enables ICE candidates with different addresses for better NAT traversal.

## Monitoring

### Check Flux Status
```bash
flux get all
flux logs --all-namespaces
```

### Check Pods
```bash
kubectl get pods -n ghost
kubectl logs -f deployment/synapse -n ghost
```

### Force Reconciliation
```bash
flux reconcile source git project-ghost
flux reconcile kustomization ghost-apps --with-source
```

## Troubleshooting

### Flux Not Syncing
```bash
flux get sources git
flux get kustomizations
kubectl describe kustomization ghost-apps -n flux-system
```

### Certificate Issues
```bash
kubectl get certificates -n ghost
kubectl describe certificate pyrosec-is-cert -n ghost
kubectl get challenges -n ghost
```

### Pod Failures
```bash
kubectl describe pod POD_NAME -n ghost
kubectl logs POD_NAME -n ghost --previous
```

## Cleanup

To destroy all resources:
```bash
# Via GitHub Actions
gh workflow run terraform-destroy.yaml -f confirm=destroy

# Or manually
terraform destroy
```
