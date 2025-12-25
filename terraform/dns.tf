# Cloudflare DNS Configuration
# Two separate zones: pyrosec.is (primary) and pyrosec.gg (STUN)

# Provider for primary domain
provider "cloudflare" {
  alias     = "primary"
  api_token = var.cloudflare_api_token_primary
}

# Provider for STUN domain
provider "cloudflare" {
  alias     = "stun"
  api_token = var.cloudflare_api_token_stun
}

# Data sources for zone IDs
data "cloudflare_zone" "primary" {
  provider = cloudflare.primary
  name     = var.primary_domain
}

data "cloudflare_zone" "stun" {
  provider = cloudflare.stun
  name     = var.stun_domain
}

# Primary Domain Records (pyrosec.is)

# Root domain - points to ingress
resource "cloudflare_record" "primary_root" {
  provider = cloudflare.primary
  zone_id  = data.cloudflare_zone.primary.id
  name     = "@"
  content  = google_compute_global_address.ingress_ip.address
  type     = "A"
  proxied  = false # Disable proxy for direct TLS termination
  ttl      = 300
}

# Matrix subdomain
resource "cloudflare_record" "matrix" {
  provider        = cloudflare.primary
  zone_id         = data.cloudflare_zone.primary.id
  name            = "matrix"
  content         = google_compute_global_address.ingress_ip.address
  type            = "A"
  proxied         = false
  ttl             = 300
  allow_overwrite = true
}

# Vault subdomain
resource "cloudflare_record" "vault" {
  provider        = cloudflare.primary
  zone_id         = data.cloudflare_zone.primary.id
  name            = "vault"
  content         = google_compute_global_address.ingress_ip.address
  type            = "A"
  proxied         = false
  ttl             = 300
  allow_overwrite = true
}

# Asterisk - direct SIP access (port 35061)
resource "cloudflare_record" "sip" {
  provider = cloudflare.primary
  zone_id  = data.cloudflare_zone.primary.id
  name     = "sip"
  content  = google_compute_address.asterisk_ip.address
  type     = "A"
  proxied  = false
  ttl      = 300
}

# XMPP records
resource "cloudflare_record" "xmpp" {
  provider = cloudflare.primary
  zone_id  = data.cloudflare_zone.primary.id
  name     = "xmpp"
  content  = google_compute_global_address.ingress_ip.address
  type     = "A"
  proxied  = false
  ttl      = 300
}

# Matrix SRV records for federation
resource "cloudflare_record" "matrix_srv" {
  provider = cloudflare.primary
  zone_id  = data.cloudflare_zone.primary.id
  name     = "_matrix._tcp"
  type     = "SRV"
  ttl      = 300

  data {
    priority = 10
    weight   = 5
    port     = 443
    target   = "matrix.${var.primary_domain}"
  }
}

# XMPP SRV records
resource "cloudflare_record" "xmpp_client_srv" {
  provider = cloudflare.primary
  zone_id  = data.cloudflare_zone.primary.id
  name     = "_xmpp-client._tcp"
  type     = "SRV"
  ttl      = 300

  data {
    priority = 10
    weight   = 5
    port     = 5222
    target   = "xmpp.${var.primary_domain}"
  }
}

resource "cloudflare_record" "xmpp_server_srv" {
  provider = cloudflare.primary
  zone_id  = data.cloudflare_zone.primary.id
  name     = "_xmpp-server._tcp"
  type     = "SRV"
  ttl      = 300

  data {
    priority = 10
    weight   = 5
    port     = 5269
    target   = "xmpp.${var.primary_domain}"
  }
}

# STUN Domain Records (pyrosec.gg)

# Root STUN record - Coturn IP 1
resource "cloudflare_record" "stun_root" {
  provider        = cloudflare.stun
  zone_id         = data.cloudflare_zone.stun.id
  name            = "@"
  content         = google_compute_address.coturn_ip_1.address
  type            = "A"
  proxied         = false
  ttl             = 300
  allow_overwrite = true
}

# Secondary TURN record - Coturn IP 2 (for relay)
resource "cloudflare_record" "turn" {
  provider = cloudflare.stun
  zone_id  = data.cloudflare_zone.stun.id
  name     = "turn"
  content  = google_compute_address.coturn_ip_2.address
  type     = "A"
  proxied  = false
  ttl      = 300
}

# STUN SRV record
resource "cloudflare_record" "stun_srv" {
  provider = cloudflare.stun
  zone_id  = data.cloudflare_zone.stun.id
  name     = "_stun._udp"
  type     = "SRV"
  ttl      = 300

  data {
    priority = 10
    weight   = 5
    port     = 3478
    target   = var.stun_domain
  }
}

# TURN SRV records
resource "cloudflare_record" "turn_udp_srv" {
  provider = cloudflare.stun
  zone_id  = data.cloudflare_zone.stun.id
  name     = "_turn._udp"
  type     = "SRV"
  ttl      = 300

  data {
    priority = 10
    weight   = 5
    port     = 3478
    target   = "turn.${var.stun_domain}"
  }
}

resource "cloudflare_record" "turn_tcp_srv" {
  provider = cloudflare.stun
  zone_id  = data.cloudflare_zone.stun.id
  name     = "_turn._tcp"
  type     = "SRV"
  ttl      = 300

  data {
    priority = 10
    weight   = 5
    port     = 3478
    target   = "turn.${var.stun_domain}"
  }
}

resource "cloudflare_record" "turns_srv" {
  provider = cloudflare.stun
  zone_id  = data.cloudflare_zone.stun.id
  name     = "_turns._tcp"
  type     = "SRV"
  ttl      = 300

  data {
    priority = 10
    weight   = 5
    port     = 5349
    target   = "turn.${var.stun_domain}"
  }
}
