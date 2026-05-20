#!/usr/bin/env bash
# EOB Test Deploy — deploy to test server (VTISAZUAPP230, 10.182.255.5)
# Connects to Azure Dev DB (oqc-dev-db → eob-db)
#
# Usage:
#   ./scripts/deploy/quick_deploy_test.sh frontend   # frontend only (~30s)
#   ./scripts/deploy/quick_deploy_test.sh backend    # backend only (~30s)
#   ./scripts/deploy/quick_deploy_test.sh both       # frontend + backend (~50s)
#
# Aliases: f/fe=frontend, b/be=backend, all=both
# Options: --no-cache  (clean Docker build)

set -euo pipefail

# ── Config ──
SERVER_IP="10.182.255.5"
USERNAME="atlasAdmin"
REMOTE_PATH="~/data/eob/edwards_project_test"
EOB_DOMAIN="test.eob.10.182.255.5.sslip.io"
ENV_SOURCE=".env.dev"
REMOTE_ENV_FILE=".env.test"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
NO_CACHE=""
FRONTEND_BUILD_ARGS=(
  --build-arg "VITE_APP_BASE=/"
  --build-arg "VITE_API_URL=/api"
  --build-arg "VITE_PORTAL_URL=https://pcas-portal.atlascopco.group"
  --build-arg "VITE_OQC_URL=https://oqc.atlascopco.group"
  --build-arg "VITE_JARVIS_URL=https://sw-portal.atlascopco.group"
)

# ── Colors ──
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
CYAN='\033[36m'
RESET='\033[0m'

info()  { echo -e "${GREEN}$1${RESET}"; }
warn()  { echo -e "${YELLOW}$1${RESET}"; }
error() { echo -e "${RED}$1${RESET}"; }

# ── Parse args ──
TARGET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    f|fe|frontend)   TARGET="frontend"; shift ;;
    b|be|backend)    TARGET="backend"; shift ;;
    all|both)        TARGET="both"; shift ;;
    --no-cache)      NO_CACHE="--no-cache"; shift ;;
    -h|--help)
      echo "Usage: $0 <frontend|backend|both> [--no-cache]"
      echo "Aliases: f/fe=frontend, b/be=backend, all=both"
      echo ""
      echo "Deploys to test server: $SERVER_IP ($USERNAME)"
      echo "Database: Azure Dev (oqc-dev-db → eob-db)"
      echo "Domain:   https://$EOB_DOMAIN"
      exit 0
      ;;
    *) error "Unknown argument: $1"; exit 1 ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  error "Target required: frontend, backend, or both"
  echo "Usage: $0 <frontend|backend|both> [--no-cache]"
  exit 1
fi

START_TIME=$(date +%s)
echo -e "\n${CYAN}━━━ EOB Test Deploy: ${TARGET} ━━━${RESET}"
echo -e "${CYAN}  Server: $USERNAME@$SERVER_IP${RESET}"
echo -e "${CYAN}  DB:     Azure Dev (oqc-dev-db → eob-db)${RESET}"
echo -e "${CYAN}  Domain: https://$EOB_DOMAIN${RESET}\n"

# ── SSH check ──
if ! ssh -o BatchMode=yes -o ConnectTimeout=5 "$USERNAME@$SERVER_IP" "exit" 2>/dev/null; then
  error "Cannot connect to $USERNAME@$SERVER_IP. Check VPN."
  exit 1
fi
info "✓ SSH OK"

cd "$PROJECT_ROOT"

# ── Generate .env.test from .env.dev ──
generate_test_env() {
  if [[ ! -f "$ENV_SOURCE" ]]; then
    error "Source env file not found: $ENV_SOURCE"
    exit 1
  fi

  info "[ENV] Generating $REMOTE_ENV_FILE from $ENV_SOURCE..."

  # Read source env and apply test server overrides
  local tmp_env
  tmp_env=$(mktemp)

  while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip empty lines and comments
    if [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]]; then
      echo "$line" >> "$tmp_env"
      continue
    fi

    local key="${line%%=*}"
    local value="${line#*=}"

    case "$key" in
      DEBUG)           echo "DEBUG=false" >> "$tmp_env" ;;
      LOG_LEVEL)       echo "LOG_LEVEL=info" >> "$tmp_env" ;;
      CORS_ORIGINS)    echo "CORS_ORIGINS=http://localhost:3004,https://$EOB_DOMAIN" >> "$tmp_env" ;;
      VITE_PORTAL_URL) echo "VITE_PORTAL_URL=https://pcas-portal.atlascopco.group" >> "$tmp_env" ;;
      VITE_OQC_URL)    echo "VITE_OQC_URL=https://oqc.atlascopco.group" >> "$tmp_env" ;;
      VITE_JARVIS_URL) echo "VITE_JARVIS_URL=https://sw-portal.atlascopco.group" >> "$tmp_env" ;;
      SAML_ENTITY_ID)  echo "SAML_ENTITY_ID=https://$EOB_DOMAIN" >> "$tmp_env" ;;
      SAML_ACS_URL)    echo "SAML_ACS_URL=https://$EOB_DOMAIN/api/auth/sso/callback" >> "$tmp_env" ;;
      SAML_SLO_URL)    echo "SAML_SLO_URL=https://$EOB_DOMAIN/api/auth/logout" >> "$tmp_env" ;;
      OIDC_REDIRECT_URI)   echo "OIDC_REDIRECT_URI=https://$EOB_DOMAIN/api/auth/oidc/callback" >> "$tmp_env" ;;
      OIDC_POST_LOGOUT_REDIRECT_URI) echo "OIDC_POST_LOGOUT_REDIRECT_URI=https://$EOB_DOMAIN/login" >> "$tmp_env" ;;
      *) echo "$line" >> "$tmp_env" ;;
    esac
  done < "$ENV_SOURCE"

  # Upload to test server
  scp -q "$tmp_env" "$USERNAME@$SERVER_IP:${REMOTE_PATH}/${REMOTE_ENV_FILE}" 2>/dev/null || {
    # Remote directory might not exist, create it first
    ssh "$USERNAME@$SERVER_IP" "mkdir -p ${REMOTE_PATH}"
    scp -q "$tmp_env" "$USERNAME@$SERVER_IP:${REMOTE_PATH}/${REMOTE_ENV_FILE}"
  }

  rm -f "$tmp_env"
  info "  ✓ $REMOTE_ENV_FILE uploaded to test server"
}

# ── Ensure network exists ──
ensure_network() {
  ssh "$USERNAME@$SERVER_IP" "docker network inspect edwards_test_net >/dev/null 2>&1 || docker network create edwards_test_net" 2>/dev/null
}

# ── Build + Deploy functions ──
# Uses docker run directly (docker-compose 1.29.2 is broken with newer image formats)

deploy_backend() {
  local tar_name="eob-backend-test.tar.gz"
  local image="edwards_project-backend"

  info "\n[BUILD] backend..."
  docker build $NO_CACHE -t "$image:latest" "$PROJECT_ROOT/backend" 2>&1 | tail -5

  info "[EXPORT] $image → $tar_name"
  docker save "$image:latest" | gzip > "/tmp/$tar_name"
  local size=$(du -sh "/tmp/$tar_name" | cut -f1)
  info "  ✓ $tar_name ($size)"

  info "[UPLOAD] → $USERNAME@$SERVER_IP"
  scp -q "/tmp/$tar_name" "$USERNAME@$SERVER_IP:/tmp/$tar_name"

  info "[LOAD + RESTART] edwards-api-test"
  ssh "$USERNAME@$SERVER_IP" "
    docker load < /tmp/\$tar_name && rm /tmp/\$tar_name
    docker rm -f edwards-api-test 2>/dev/null || true
    cd $REMOTE_PATH

    # Read env vars from .env.test
    DATABASE_URL=\$(grep '^DATABASE_URL=' .env.test | head -1 | cut -d= -f2-)
    SECRET_KEY=\$(grep '^SECRET_KEY=' .env.test | head -1 | cut -d= -f2-)
    DEBUG=\$(grep '^DEBUG=' .env.test | head -1 | cut -d= -f2-)
    LOG_LEVEL=\$(grep '^LOG_LEVEL=' .env.test | head -1 | cut -d= -f2-)
    CORS_ORIGINS=\$(grep '^CORS_ORIGINS=' .env.test | head -1 | cut -d= -f2-)

    docker run -d \
      --name edwards-api-test \
      --restart unless-stopped \
      --network edwards_test_net \
      -p 8004:8004 \
      -e \"DATABASE_URL=\$DATABASE_URL\" \
      -e \"SECRET_KEY=\$SECRET_KEY\" \
      -e \"DEBUG=\$DEBUG\" \
      -e \"LOG_LEVEL=\$LOG_LEVEL\" \
      -e \"CORS_ORIGINS=\$CORS_ORIGINS\" \
      -e \"SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt\" \
      -e \"REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt\" \
      -v /var/run/docker.sock:/var/run/docker.sock:ro \
      $image:latest
  "

  info "[HEALTH] Checking backend..."
  sleep 3
  ssh "$USERNAME@$SERVER_IP" "curl -sf http://localhost:8004/health > /dev/null"
  info "  ✓ Backend /health OK"
  ssh "$USERNAME@$SERVER_IP" "docker logs edwards-api-test --tail 10 2>&1 | grep -iE 'database|postgres|connected|startup' | tail -3 || true"

  rm -f "/tmp/$tar_name"
}

deploy_frontend() {
  local tar_name="eob-frontend-test.tar.gz"
  local image="edwards_project-frontend"

  info "\n[BUILD] frontend..."
  docker build $NO_CACHE --target production "${FRONTEND_BUILD_ARGS[@]}" -t "$image:latest" "$PROJECT_ROOT/frontend" 2>&1 | tail -5

  info "[EXPORT] $image → $tar_name"
  docker save "$image:latest" | gzip > "/tmp/$tar_name"
  local size=$(du -sh "/tmp/$tar_name" | cut -f1)
  info "  ✓ $tar_name ($size)"

  info "[UPLOAD] → $USERNAME@$SERVER_IP"
  scp -q "/tmp/$tar_name" "$USERNAME@$SERVER_IP:/tmp/$tar_name"

  info "[LOAD + RESTART] edwards-web-test"
  ssh "$USERNAME@$SERVER_IP" "
    docker load < /tmp/\$tar_name && rm /tmp/\$tar_name
    docker rm -f edwards-web-test 2>/dev/null || true
    docker run -d \
      --name edwards-web-test \
      --restart unless-stopped \
      --network edwards_test_net \
      -p 3004:80 \
      $image:latest
  "

  info "[HEALTH] Checking frontend..."
  sleep 3
  ssh "$USERNAME@$SERVER_IP" "curl -sf http://localhost:3004 > /dev/null"
  info "  ✓ Frontend OK"

  rm -f "/tmp/$tar_name"
}

# ── Execute ──

# Generate and upload env file
generate_test_env

# Ensure Docker network exists
ensure_network

if [[ "$TARGET" == "frontend" || "$TARGET" == "both" ]]; then
  deploy_frontend
fi

if [[ "$TARGET" == "backend" || "$TARGET" == "both" ]]; then
  deploy_backend
fi

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
echo -e "\n${CYAN}━━━ Test Deploy Complete (${ELAPSED}s) ━━━${RESET}"
echo -e "  ${GREEN}✓${RESET} Target: $TARGET"
echo -e "  ${GREEN}✓${RESET} Server: $USERNAME@$SERVER_IP"
echo -e "  ${GREEN}✓${RESET} EOB:    https://$EOB_DOMAIN"
echo -e "  ${GREEN}✓${RESET} DB:     Azure Dev (oqc-dev-db → eob-db)"
