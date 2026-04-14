#!/usr/bin/env bash
# EOB Quick Deploy — deploy frontend, backend, or both without touching DB
#
# Usage:
#   ./scripts/deploy/quick_deploy.sh frontend   # frontend only (~30s)
#   ./scripts/deploy/quick_deploy.sh backend    # backend only (~30s)
#   ./scripts/deploy/quick_deploy.sh both       # frontend + backend (~50s)
#
# Aliases: f/fe=frontend, b/be=backend, all=both
# Options: --no-cache  (clean Docker build)

set -euo pipefail

# ── Config ──
SERVER_IP="10.182.252.32"
USERNAME="atlasAdmin"
REMOTE_PATH="/data/eob/edwards_project"
PORTAL_DOMAIN="pcas-portal.atlascopco.group"
EOB_DOMAIN="eob.atlascopco.group"
OQC_DOMAIN="oqc.atlascopco.group"
JARVIS_DOMAIN="sw-portal.atlascopco.group"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
NO_CACHE=""
FRONTEND_BUILD_ARGS=(
  --build-arg "VITE_APP_BASE=/"
  --build-arg "VITE_API_URL=/api"
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
echo -e "\n${CYAN}━━━ EOB Quick Deploy: ${TARGET} ━━━${RESET}\n"

# ── SSH check ──
if ! ssh -o BatchMode=yes -o ConnectTimeout=5 "$USERNAME@$SERVER_IP" "exit" 2>/dev/null; then
  error "Cannot connect to $USERNAME@$SERVER_IP. Check VPN."
  exit 1
fi
info "✓ SSH OK"

cd "$PROJECT_ROOT"

# ── Build + Deploy functions ──

deploy_service() {
  local service="$1"      # docker-compose service name: frontend | backend
  local image="$2"        # image name: edwards_project-frontend | edwards_project-backend
  local container="$3"    # container name: edwards-web | edwards-api
  local tar_name="$4"     # tar file name

  info "\n[BUILD] $service..."
  # Use docker build directly to avoid docker compose BuildKit cache issues
  local dockerfile_dir
  if [[ "$service" == "frontend" ]]; then
    dockerfile_dir="$PROJECT_ROOT/frontend"
  else
    dockerfile_dir="$PROJECT_ROOT/backend"
  fi
  if [[ "$service" == "frontend" ]]; then
    # Copy root .env to frontend dir so Vite picks up VITE_* vars at build time
    # (Vite reads .env from the project root during build)
    local copied_env=false
    if [[ -f "$PROJECT_ROOT/.env" && ! -f "$dockerfile_dir/.env" ]]; then
      cp "$PROJECT_ROOT/.env" "$dockerfile_dir/.env"
      copied_env=true
    fi
  fi
  if [[ "$service" == "frontend" ]]; then
    docker build $NO_CACHE --target production "${FRONTEND_BUILD_ARGS[@]}" -t "$image:latest" "$dockerfile_dir" 2>&1 | tail -5
  else
    docker build $NO_CACHE -t "$image:latest" "$dockerfile_dir" 2>&1 | tail -5
  fi
  # Clean up copied .env (don't leave secrets in frontend dir)
  if [[ "${copied_env:-false}" == true ]]; then
    rm -f "$dockerfile_dir/.env"
  fi

  info "[EXPORT] $image → $tar_name"
  docker save "$image:latest" | gzip > "/tmp/$tar_name"
  local size=$(du -sh "/tmp/$tar_name" | cut -f1)
  info "  ✓ $tar_name ($size)"

  info "[UPLOAD] → $USERNAME@$SERVER_IP"
  scp -q "/tmp/$tar_name" "$USERNAME@$SERVER_IP:/tmp/$tar_name"

  info "[LOAD + RESTART] $container"
  ssh "$USERNAME@$SERVER_IP" "
    docker load < /tmp/$tar_name && rm /tmp/$tar_name
    cd $REMOTE_PATH && docker-compose up -d --no-deps --force-recreate $service
  "

  info "[HEALTH] Checking $container..."
  sleep 3
  if [[ "$service" == "backend" ]]; then
    ssh "$USERNAME@$SERVER_IP" "curl -sf http://localhost:8004/health > /dev/null"
    info "  ✓ Backend /health OK"
  else
    ssh "$USERNAME@$SERVER_IP" "curl -sf http://localhost:3004 > /dev/null"
    info "  ✓ Frontend OK"
  fi

  rm -f "/tmp/$tar_name"
}

# ── Execute ──

if [[ "$TARGET" == "frontend" || "$TARGET" == "both" ]]; then
  deploy_service "frontend" "edwards_project-frontend" "edwards-web" "eob-frontend.tar.gz"
fi

if [[ "$TARGET" == "backend" || "$TARGET" == "both" ]]; then
  deploy_service "backend" "edwards_project-backend" "edwards-api" "eob-backend.tar.gz"
fi

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
echo -e "\n${CYAN}━━━ Quick Deploy Complete (${ELAPSED}s) ━━━${RESET}"
echo -e "  ${GREEN}✓${RESET} Target: $TARGET"
echo -e "  ${GREEN}✓${RESET} Portal: https://${PORTAL_DOMAIN}"
echo -e "  ${GREEN}✓${RESET} EOB:    https://${EOB_DOMAIN}"
echo -e "  ${GREEN}✓${RESET} OQC:    https://${OQC_DOMAIN}"
echo -e "  ${GREEN}✓${RESET} Jarvis: https://${JARVIS_DOMAIN}"
