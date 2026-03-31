#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-pcas-portal.10.182.252.32.sslip.io}"
OUTPUT_DIR="${2:-nginx/ssl}"
CRT_PATH="${OUTPUT_DIR}/nginx-selfsigned.crt"
KEY_PATH="${OUTPUT_DIR}/nginx-selfsigned.key"

mkdir -p "${OUTPUT_DIR}"

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "${KEY_PATH}" \
  -out "${CRT_PATH}" \
  -days 365 \
  -subj "/CN=${DOMAIN}"

echo "Generated:"
echo "  ${CRT_PATH}"
echo "  ${KEY_PATH}"
