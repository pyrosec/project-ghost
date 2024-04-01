#!/bin/bash
function make_secret() {
  dd if=/dev/urandom bs=3 count=32 | sha256sum | cut -d ' ' -f 1
}
if [[ ! -f /data/env.sh ]]; then
  cat > /data/env.sh <<EOF
export MACAROON_SHARED_SECRET=$(make_secret)
export FORM_SECRET=$(make_secret)
export REGISTRATION_SHARED_SECRET=$(make_secret)
EOF
fi
source /data/env.sh
cat /templates/homeserver.yaml.tpl | envsubst > ${SYNAPSE_DATA_DIR}/homeserver.yaml
cat /templates/log.config.tpl | envsubst > ${SYNAPSE_DATA_DIR}/${SYNAPSE_SERVER_NAME}.log.config
chmod 666 /data/homeserver.yaml
exec python3 /start.py $@
