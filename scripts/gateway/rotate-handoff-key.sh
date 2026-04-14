#!/usr/bin/env bash
set -euo pipefail

NEW_KEY="$(openssl rand -hex 32)"

if [[ ${#NEW_KEY} -lt 64 ]]; then
  echo "Failed to generate a 32-byte handoff key." >&2
  exit 1
fi

cat <<EOF
Generated portal handoff key (64 hex chars):

  $NEW_KEY

Recommended staged rotation:
1. Set PORTAL_HANDOFF_VERIFY_KEY_PREV to the current verify key on downstream services.
2. Set PORTAL_HANDOFF_SIGNING_KEY to the new key on the portal runtime.
3. Set PORTAL_HANDOFF_VERIFY_KEY to the new key on downstream services.
4. Wait at least one token TTL window before clearing PORTAL_HANDOFF_VERIFY_KEY_PREV.

Example env updates:
  PORTAL_HANDOFF_SIGNING_KEY=$NEW_KEY
  PORTAL_HANDOFF_VERIFY_KEY=$NEW_KEY
  PORTAL_HANDOFF_VERIFY_KEY_PREV=<previous-key-during-rotation>
EOF
