# Configuration file for Synapse.
#
# This is a YAML file: see [1] for a quick introduction. Note in particular
# that *indentation is important*: all the elements of a list or dictionary
# should have the same indentation.
#
# [1] https://docs.ansible.com/ansible/latest/reference_appendices/YAMLSyntax.html
#
# For more information on how to configure Synapse, including a complete accounting of
# each option, go to docs/usage/configuration/config_documentation.md or
# https://matrix-org.github.io/synapse/latest/usage/configuration/config_documentation.html
server_name: "$SYNAPSE_SERVER_NAME"
pid_file: /data/homeserver.pid
listeners:
  - port: 8008
    tls: false
    type: http
    x_forwarded: true
    resources:
      - names: [client, federation]
        compress: false
database:
  name: psycopg2
  txn_limit: 10000
  args:
    user: matrix
    password: password
    database: matrix
    host: postgres
    port: 5432
    cp_min: 5
    cp_max: 10
log_config: "/data/$SYNAPSE_SERVER_NAME.log.config"
media_store_path: /data/media_store
registration_shared_secret: "$REGISTRATION_SHARED_SECRET"
report_stats: false
macaroon_secret_key: "$MACAROON_SECRET_KEY"
form_secret: "$FORM_SECRET"
signing_key_path: "/data/$SYNAPSE_SERVER_NAME.signing.key"
trusted_key_servers:
  - server_name: "matrix.org"
turn_uris: [ "$TURN_URI" ]
turn_shared_secret: "$TURN_SECRET"
turn_user_lifetime: 86400000
turn_allow_guests: True
recaptcha_public_key: "$RECAPTCHA_PUBLIC_KEY"
recaptcha_private_key: "$RECAPTCHA_PRIVATE_KEY"
enable_registration_captcha: true
serve_server_wellknown: true
enable_registration: true
# vim:ft=yaml
