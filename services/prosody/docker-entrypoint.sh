#!/bin/bash -ex
set -e

export REDIS_HOST=$(echo $REDIS_URI | cut -d '/' -f 3)

data_dir_owner="$(stat -c %u "/usr/local/var/lib/prosody/")"

if [[ "$(id -u prosody)" != "$data_dir_owner" ]]; then
    usermod -u "$data_dir_owner" prosody
fi
groupadd letsencrypt -g $CERTS_GID -f 2> /dev/null
adduser prosody letsencrypt 2> /dev/null
if [[ "$(stat -c %u /var/run/prosody/)" != "$data_dir_owner" ]]; then
    chown "$data_dir_owner" /var/run/prosody/
fi
mkdir -p /usr/local/etc/prosody/conf.avail 2> /dev/null
mkdir -p /usr/local/etc/prosody/conf.d 2> /dev/null
chown -R prosody /usr/local/etc/prosody 2> /dev/null
chown -R prosody /usr/local/var
conf_dir_owner="$(stat -c %u "/usr/local/etc/prosody")"
chown -R 0:${CERTS_GID} /etc/letsencrypt/*
chmod -R 770 /etc/letsencrypt/*
export TLS_CERTIFICATE=/etc/letsencrypt/live/${DOMAIN}/fullchain.pem
export TLS_PRIVATE_KEY=/etc/letsencrypt/live/${DOMAIN}/privkey.pem

cat /templates/prosody.cfg.lua.tpl | envsubst > /usr/local/etc/prosody/prosody.cfg.lua
cat /templates/server.cfg.lua.tpl | envsubst >> /usr/local/etc/prosody/prosody.cfg.lua
cat /templates/push_notification.cfg.lua.tpl | envsubst > /usr/local/etc/prosody/push_notification.cfg.lua

prosodyctl register voicemail ${DOMAIN} ${ROOT_PASSWORD}
prosodyctl register dossi ${DOMAIN} ${ROOT_PASSWORD}

exec setpriv --reuid=prosody --regid=prosody --init-groups "$@"
