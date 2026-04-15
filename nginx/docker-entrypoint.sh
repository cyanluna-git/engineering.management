#!/bin/sh
set -eu

CERT_PATH="${NGINX_SSL_CERT:-/etc/nginx/ssl/nginx-selfsigned.crt}"
KEY_PATH="${NGINX_SSL_KEY:-/etc/nginx/ssl/nginx-selfsigned.key}"
PORTAL_DOMAIN="${PORTAL_DOMAIN:-pcas-portal.atlascopco.group}"
EOB_DOMAIN="${EOB_DOMAIN:-eob.10.182.252.32.sslip.io}"
OQC_DOMAIN="${OQC_DOMAIN:-oqc.atlascopco.group}"
JARVIS_DOMAIN="${JARVIS_DOMAIN:-sw-portal.atlascopco.group}"
CERT_DOMAIN="${NGINX_CERT_DOMAIN:-$PORTAL_DOMAIN}"

mkdir -p "$(dirname "$CERT_PATH")"

if [ ! -f "$CERT_PATH" ] || [ ! -f "$KEY_PATH" ]; then
  SAN_CONFIG="$(mktemp)"
  cat > "$SAN_CONFIG" <<EOF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = ${CERT_DOMAIN}

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${PORTAL_DOMAIN}
DNS.2 = ${EOB_DOMAIN}
DNS.3 = ${OQC_DOMAIN}
DNS.4 = ${JARVIS_DOMAIN}
EOF

  echo "Generating self-signed certificate for ${CERT_DOMAIN} with SANs"
  openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "$KEY_PATH" \
    -out "$CERT_PATH" \
    -days 365 \
    -config "$SAN_CONFIG" \
    -extensions v3_req
  rm -f "$SAN_CONFIG"
fi

envsubst '${PORTAL_DOMAIN} ${EOB_DOMAIN} ${OQC_DOMAIN} ${JARVIS_DOMAIN} ${OQC_UPSTREAM} ${JARVIS_UPSTREAM} ${NGINX_SSL_CERT} ${NGINX_SSL_KEY}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
