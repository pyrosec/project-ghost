; PJSIP Configuration Template
; Environment variables: EXTERNAL_SIGNALING_IP, EXTERNAL_MEDIA_IP, PRIMARY_DOMAIN

; TLS Transport for secure SIP
[transport-tls]
type = transport
protocol = tls
bind = 0.0.0.0:35061
cert_file = /etc/letsencrypt/live/${PRIMARY_DOMAIN}/fullchain.pem
priv_key_file = /etc/letsencrypt/live/${PRIMARY_DOMAIN}/privkey.pem
method = tlsv1_2
external_signaling_address = ${EXTERNAL_SIGNALING_IP}
external_media_address = ${EXTERNAL_MEDIA_IP}
; NOTE: local_net is intentionally omitted - all SIP traffic comes through
; the OpenResty proxy which has internal IPs, so we always use external addresses

; TCP Transport (fallback)
[transport-tcp]
type = transport
protocol = tcp
bind = 0.0.0.0:35060
external_signaling_address = ${EXTERNAL_SIGNALING_IP}
external_media_address = ${EXTERNAL_MEDIA_IP}

; UDP Transport (disabled by default for security)
[transport-udp]
type = transport
protocol = udp
bind = 0.0.0.0:5060
external_signaling_address = ${EXTERNAL_SIGNALING_IP}
external_media_address = ${EXTERNAL_MEDIA_IP}

;================================ GHOST ENDPOINT TEMPLATE ==
[ghost-endpoint](!)
type = endpoint
context = authenticated
allow = !all,g722,ulaw,alaw,gsm
direct_media = no
trust_id_outbound = yes
device_state_busy_at = 1
dtmf_mode = rfc4733
rtp_symmetric = yes
force_rport = yes
rewrite_contact = yes
transport = transport-tls
media_encryption = sdes
media_encryption_optimistic = yes

[ghost-auth](!)
type = auth
auth_type = userpass

[ghost-aor](!)
type = aor
max_contacts = 5
remove_existing = yes

;================================ VOIPMS TRUNK ==
; Uncomment and configure for VoIP.ms integration
;[voipms-registration]
;type = registration
;transport = transport-udp
;outbound_auth = voipms-auth
;server_uri = sip:${VOIPMS_SIP_HOST}:${VOIPMS_SIP_PORT}
;client_uri = sip:${VOIPMS_SIP_USERNAME}@${VOIPMS_SIP_HOST}:${VOIPMS_SIP_PORT}
;retry_interval = 60

;[voipms-auth]
;type = auth
;auth_type = userpass
;username = ${VOIPMS_SIP_USERNAME}
;password = ${VOIPMS_SIP_PASSWORD}

;[voipms-aor]
;type = aor
;contact = sip:${VOIPMS_SIP_HOST}:${VOIPMS_SIP_PORT}

;[voipms-endpoint]
;type = endpoint
;context = from-pstn
;allow = !all,ulaw,alaw
;outbound_auth = voipms-auth
;aors = voipms-aor
;direct_media = no
;from_domain = ${VOIPMS_SIP_HOST}

;[voipms-identify]
;type = identify
;endpoint = voipms-endpoint
;match = ${VOIPMS_SIP_HOST}

;================================ ENDPOINT DEFINITIONS ==
; User endpoints are managed dynamically via ghost-api
; or can be appended below this line
