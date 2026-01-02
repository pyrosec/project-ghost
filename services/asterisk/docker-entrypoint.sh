#!/bin/bash

# optional Docker environment variables
ASTERISK_UID="${ASTERISK_UID:-}"
ASTERISK_GID="${ASTERISK_GID:-}"

# run as user asterisk by default
ASTERISK_USER="${ASTERISK_USER:-asterisk}"
ASTERISK_GROUP="${ASTERISK_GROUP:-${ASTERISK_USER}}"

if [ "$1" = "" ]; then
  COMMAND="/usr/sbin/asterisk -T -U "$ASTERISK_USER" -W -p -vvvdddf"
else
  COMMAND="$@"
fi

function write_sip_conf() {
  export IPV4_ADDRESS=$(ip route show | grep -oE '([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+)' | head -1)
  if [ ! -f /etc/asterisk/sip.conf ]; then
    cat /templates/sip.conf.tpl | envsubst > /etc/asterisk/sip.conf
  else
    sed -i "s/externip=.*$/externip=$EXTERNAL_SIGNALING_IP/" /etc/asterisk/sip.conf
    sed -i "s/localnet=.*$/localnet=$IPV4_ADDRESS/" /etc/asterisk/sip.conf
  fi
}

function write_rtp_conf() {
  if [ ! -f /etc/asterisk/rtp.conf ]; then
    cat /templates/rtp.conf.tpl | envsubst > /etc/asterisk/rtp.conf
  else
    cat /etc/asterisk/rtp.conf | sed -e "s/stunaddr=.*$/stunaddr=$STUN_HOST/" > /etc/asterisk/rtp.conf.2
    mv /etc/asterisk/rtp.conf.2 /etc/asterisk/rtp.conf
  fi
}

function write_pjsip_conf() {
  # Update transport settings in pjsip.conf
  # This preserves user endpoints while updating external addresses
  if [ ! -f /etc/asterisk/pjsip.conf ]; then
    # First time: generate from template
    cat /templates/pjsip.conf.tpl | envsubst > /etc/asterisk/pjsip.conf
  else
    # Update existing: fix external addresses and remove local_net
    sed -i "s/^external_signaling_address = .*/external_signaling_address = ${EXTERNAL_SIGNALING_IP}/" /etc/asterisk/pjsip.conf
    sed -i "s/^external_media_address = .*/external_media_address = ${EXTERNAL_MEDIA_IP}/" /etc/asterisk/pjsip.conf
    # Remove local_net lines (causes issues with proxy)
    sed -i '/^local_net = /d' /etc/asterisk/pjsip.conf
  fi
}

function add_certs_group() {
  if [[ -n "$CERTS_GID" && -d "/etc/letsencrypt" ]]; then
    addgroup -g ${CERTS_GID} letsencrypt 2> /dev/null || true
    adduser asterisk letsencrypt 2> /dev/null || true
    chown -R 0:${CERTS_GID} /etc/letsencrypt/* 2>/dev/null || true
    chmod -R 770 /etc/letsencrypt/* 2>/dev/null || true
  fi
}

function setup_certificates() {
  CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
  if [[ ! -d "$CERT_DIR" ]]; then
    echo "Generating self-signed certificates for ${DOMAIN}..."
    mkdir -p "$CERT_DIR"
    openssl req -new -x509 -days 365 -nodes \
      -out "$CERT_DIR/fullchain.pem" \
      -keyout "$CERT_DIR/privkey.pem" \
      -subj "/CN=${DOMAIN}" 2>/dev/null
    chown -R ${ASTERISK_USER}:${ASTERISK_GROUP} "$CERT_DIR" 2>/dev/null || true
    chmod 600 "$CERT_DIR/privkey.pem"
  fi
}

export REDIS_HOST=$(echo $REDIS_URI | cut -d '/' -f 3)
function echo_env() {
  echo "REDIS_HOST: $REDIS_HOST"
  echo "EXTERN_IP: $EXTERN_IP"
  echo "VOIPMS_SIP_PROTOCOL: $VOIPMS_SIP_PROTOCOL"
  echo "VOIPMS_SIP_USERNAME: $VOIPMS_SIP_USERNAME"
  local rewrite=$(echo ${VOIPMS_SIP_PASSWORD} | sed -e 's/./x/g')
  echo "VOIPMS_SIP_PASSWORD: $rewrite"
  echo "VOIPMS_SIP_HOST: $VOIPMS_SIP_HOST"
  echo "VOIPMS_SIP_PORT: $VOIPMS_SIP_PORT"
}

function init_asterisk() {
  echo_env
  echo "INITIALIZING GHOSTDIAL/ASTERISK..."
  write_sip_conf
  write_rtp_conf
  write_pjsip_conf
  include_conf
  # Always copy extensions.lua from image to ensure consistency
  cp /config/extensions.lua /etc/asterisk/extensions.lua
}

function include_conf() {
  cd /config
  for file in *.conf; do
    if [[ -f "$file" && ! -f "/etc/asterisk/$file" ]]; then
      cp -v "/config/$file" "/etc/asterisk/$file"
    fi
  done
  # Always update http.conf to ensure HTTP server is enabled
  cp -v "/config/http.conf" "/etc/asterisk/http.conf"
}

echo "ASTERISK_UID: $ASTERISK_UID"
echo "ASTERISK_GID: $ASTERISK_GID"

# Ensure asterisk user exists (should already exist in mlan/asterisk image)
id asterisk 2>/dev/null || adduser -D -u ${ASTERISK_UID:-1000} asterisk

# Ensure directories exist and have correct ownership
mkdir -p /var/log/asterisk /var/lib/asterisk /var/run/asterisk /var/spool/asterisk
chown -R asterisk /var/log/asterisk \
                  /var/lib/asterisk \
                  /var/run/asterisk \
                  /var/spool/asterisk 2>/dev/null || true

setup_certificates
add_certs_group
init_asterisk

echo "Starting asterisk..."
exec ${COMMAND}
