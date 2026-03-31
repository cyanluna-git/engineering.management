#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <certificate.pfx> [output-dir]" >&2
  exit 1
fi

PFX_PATH="$1"
OUTPUT_DIR="${2:-nginx/ssl/phase-b}"
CRT_PATH="${OUTPUT_DIR}/tls.crt"
KEY_PATH="${OUTPUT_DIR}/tls.key"

mkdir -p "${OUTPUT_DIR}"

openssl pkcs12 -in "${PFX_PATH}" -clcerts -nokeys -out "${CRT_PATH}"
openssl pkcs12 -in "${PFX_PATH}" -nocerts -nodes -out "${KEY_PATH}"

echo "Converted:"
echo "  ${CRT_PATH}"
echo "  ${KEY_PATH}"
