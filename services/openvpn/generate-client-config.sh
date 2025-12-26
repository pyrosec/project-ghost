#!/bin/bash
# Generate OpenVPN client configuration file
# Usage: ./generate-client-config.sh <client-name>

set -e

CLIENT_NAME="${1:-}"
PKI_DIR="/home/ubuntu/ghostvpn/ghostvpn/easy-rsa/pki"
OUTPUT_DIR="/tmp/vpn-configs"

if [ -z "$CLIENT_NAME" ]; then
    echo "Usage: $0 <client-name>"
    echo ""
    echo "Available clients:"
    ls -1 "$PKI_DIR/issued/" | sed 's/\.crt$//' | grep -v "^server" | sort
    exit 1
fi

# Check if client cert exists
if [ ! -f "$PKI_DIR/issued/${CLIENT_NAME}.crt" ]; then
    echo "Error: Client certificate not found for '$CLIENT_NAME'"
    echo ""
    echo "Available clients:"
    ls -1 "$PKI_DIR/issued/" | sed 's/\.crt$//' | grep -v "^server" | sort
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Read PKI files
CA_CERT=$(cat "$PKI_DIR/ca.crt")
CLIENT_CERT=$(sed -n '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p' "$PKI_DIR/issued/${CLIENT_NAME}.crt")
CLIENT_KEY=$(cat "$PKI_DIR/private/${CLIENT_NAME}.key")
TA_KEY=$(cat "$PKI_DIR/ta.key")

# Generate config file
cat > "${OUTPUT_DIR}/${CLIENT_NAME}.ovpn" << EOF
client
dev tun
proto tcp
http-proxy pyrosec.is 8880 auth.txt basic
remote localhost 1194
resolv-retry infinite
nobind
persist-key
persist-tun
<ca>
${CA_CERT}
</ca>
<cert>
${CLIENT_CERT}
</cert>
<key>
${CLIENT_KEY}
</key>
remote-cert-tls server
<tls-auth>
${TA_KEY}
</tls-auth>
key-direction 1
cipher AES-256-CBC
data-ciphers AES-256-CBC
verb 3
redirect-gateway def1
EOF

# Create auth.txt file
cat > "${OUTPUT_DIR}/${CLIENT_NAME}-auth.txt" << EOF
${PROXY_USERNAME:-ghost}
${PROXY_PASSWORD:?PROXY_PASSWORD environment variable required}
EOF

echo "Generated: ${OUTPUT_DIR}/${CLIENT_NAME}.ovpn"
echo "Generated: ${OUTPUT_DIR}/${CLIENT_NAME}-auth.txt"
echo ""
echo "Instructions:"
echo "1. Place ${CLIENT_NAME}.ovpn in your OpenVPN config directory"
echo "2. Place ${CLIENT_NAME}-auth.txt as 'auth.txt' in the same directory"
echo "3. Connect using: openvpn --config ${CLIENT_NAME}.ovpn"
