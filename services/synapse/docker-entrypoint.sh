#!/bin/bash
cat /templates/homeserver.yaml.tpl | envsubst > ${SYNAPSE_DATA_DIR}/homeserver.yaml
cat /templates/log.config.tpl | envsubst > ${SYNAPSE_DATA_DIR}/${SYNAPSE_SERVER_NAME}.log.config
chmod 666 /data/homeserver.yaml
exec python3 /start.py $@
