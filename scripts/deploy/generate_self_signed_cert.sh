#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-pcas-portal.atlascopco.group}"
OUTPUT_DIR="${2:-nginx/ssl}"
CRT_PATH="${OUTPUT_DIR}/nginx-selfsigned.crt"
KEY_PATH="${OUTPUT_DIR}/nginx-selfsigned.key"
EOB_DOMAIN="${3:-eob.10.182.252.32.sslip.io}"
OQC_DOMAIN="${4:-oqc.atlascopco.group}"
JARVIS_DOMAIN="${5:-sw-portal.atlascopco.group}"

mkdir -p "${OUTPUT_DIR}"

SAN_CONFIG="$(mktemp)"
cat > "${SAN_CONFIG}" <<EOF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = ${DOMAIN}

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${DOMAIN}
DNS.2 = ${EOB_DOMAIN}
DNS.3 = ${OQC_DOMAIN}
DNS.4 = ${JARVIS_DOMAIN}
EOF

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "${KEY_PATH}" \
  -out "${CRT_PATH}" \
  -days 365 \
  -config "${SAN_CONFIG}" \
  -extensions v3_req

rm -f "${SAN_CONFIG}"

echo "Generated:"
echo "  ${CRT_PATH}"
echo "  ${KEY_PATH}"
