#!/bin/sh
set -eu

CERT_PATH="${NGINX_SSL_CERT:-/etc/nginx/ssl/nginx-selfsigned.crt}"
KEY_PATH="${NGINX_SSL_KEY:-/etc/nginx/ssl/nginx-selfsigned.key}"
CERT_DOMAIN="${NGINX_CERT_DOMAIN:-pcas-portal.10.182.252.32.sslip.io}"

mkdir -p "$(dirname "$CERT_PATH")"

if [ ! -f "$CERT_PATH" ] || [ ! -f "$KEY_PATH" ]; then
  echo "Generating self-signed certificate for ${CERT_DOMAIN}"
  openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "$KEY_PATH" \
    -out "$CERT_PATH" \
    -days 365 \
    -subj "/CN=${CERT_DOMAIN}"
fi

envsubst '${PORTAL_DOMAIN} ${BASE_DOMAIN} ${OQC_UPSTREAM} ${JARVIS_UPSTREAM} ${NGINX_SSL_CERT} ${NGINX_SSL_KEY}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
