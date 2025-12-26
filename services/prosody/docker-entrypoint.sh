#!/bin/bash -ex
set -e

export REDIS_HOST=$(echo $REDIS_URI | cut -d '/' -f 3)

data_dir_owner="$(stat -c %u "/usr/local/var/lib/prosody/")"

if [[ "$(id -u prosody)" != "$data_dir_owner" ]]; then
    usermod -u "$data_dir_owner" prosody
fi

# Only set up letsencrypt group if CERTS_GID is set
if [[ -n "$CERTS_GID" ]]; then
    groupadd letsencrypt -g $CERTS_GID -f 2> /dev/null || true
    adduser prosody letsencrypt 2> /dev/null || true
fi

if [[ "$(stat -c %u /var/run/prosody/)" != "$data_dir_owner" ]]; then
    chown "$data_dir_owner" /var/run/prosody/
fi
mkdir -p /usr/local/etc/prosody/conf.avail 2> /dev/null
mkdir -p /usr/local/etc/prosody/conf.d 2> /dev/null
chown -R prosody /usr/local/etc/prosody 2> /dev/null
chown -R prosody /usr/local/var

# Handle certificates - generate self-signed if not present
CERT_DIR="/etc/prosody/certs"
mkdir -p "$CERT_DIR"
if [[ -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
    chown -R 0:${CERTS_GID:-0} /etc/letsencrypt/* 2>/dev/null || true
    chmod -R 770 /etc/letsencrypt/* 2>/dev/null || true
    export TLS_CERTIFICATE=/etc/letsencrypt/live/${DOMAIN}/fullchain.pem
    export TLS_PRIVATE_KEY=/etc/letsencrypt/live/${DOMAIN}/privkey.pem
else
    echo "Generating self-signed certificates for ${DOMAIN}..."
    openssl req -new -x509 -days 365 -nodes \
        -out "$CERT_DIR/fullchain.pem" \
        -keyout "$CERT_DIR/privkey.pem" \
        -subj "/CN=${DOMAIN}" 2>/dev/null
    chown -R prosody:prosody "$CERT_DIR"
    chmod 600 "$CERT_DIR/privkey.pem"
    export TLS_CERTIFICATE="$CERT_DIR/fullchain.pem"
    export TLS_PRIVATE_KEY="$CERT_DIR/privkey.pem"
fi

cat /templates/prosody.cfg.lua.tpl | envsubst > /usr/local/etc/prosody/prosody.cfg.lua
cat /templates/server.cfg.lua.tpl | envsubst >> /usr/local/etc/prosody/prosody.cfg.lua

prosodyctl register voicemail ${DOMAIN} ${ROOT_PASSWORD} 2>/dev/null || true
prosodyctl register dossi ${DOMAIN} ${ROOT_PASSWORD} 2>/dev/null || true

exec setpriv --reuid=prosody --regid=prosody --init-groups "$@"
