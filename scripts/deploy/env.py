#!/usr/bin/env python3
"""Generate and optionally upload a server-ready .env.remote.

Why this exists
- .env.remote should NOT be committed (it contains secrets).
- .env.remote.example is committed as a template.
- This script helps you:
  1) create/update .env.remote from the template
  2) fill in required secrets (interactive or via --set)
  3) optionally upload it to a remote server using scp

Examples
- Auto-generate from .env with server profile (recommended):
  python3 scripts/deploy/env.py --profile server
  python3 scripts/deploy/env.py --profile server --domain custom.domain.com
  python3 scripts/deploy/env.py --profile server --scp user@host:/path/.env.remote

- Create .env.remote interactively (legacy):
  python3 scripts/deploy/env.py

- Non-interactive (CI style):
  python3 scripts/deploy/env.py --non-interactive \
    --set POSTGRES_PASSWORD=... \
    --set SECRET_KEY=... \
    --set CORS_ORIGINS=http://your.domain

- Create then upload:
  python3 scripts/deploy/env.py --scp user@1.2.3.4:/opt/edwards/.env.remote

- Upload with ssh key and port:
  python3 scripts/deploy/env.py --scp user@1.2.3.4:/opt/edwards/.env.remote --port 2222 --identity ~/.ssh/id_rsa
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import tempfile
from getpass import getpass
from pathlib import Path
from typing import Dict, List, Optional, Tuple


DEFAULT_TEMPLATE = ".env.remote.example"
DEFAULT_OUTPUT = ".env.remote"

# ---------------------------------------------------------------------------
# Server profile: transform rules for generating .env.remote from .env
# ---------------------------------------------------------------------------

PORTAL_DOMAIN_DEFAULT = "pcas-portal.atlascopco.group"
EOB_DOMAIN_DEFAULT = "eob.atlascopco.group"
OQC_DOMAIN_DEFAULT = "oqc.atlascopco.group"
JARVIS_DOMAIN_DEFAULT = "sw-portal.atlascopco.group"

# Static overrides applied when --profile server is used
SERVER_OVERRIDES: Dict[str, str] = {
    "DEBUG": "false",
    "LOG_LEVEL": "info",
}

# Keys to remove from server env (managed by docker-compose or dev-only)
REMOVE_KEYS = {"DATABASE_URL", "VITE_DEV_PROXY_TARGET"}


def build_domain_overrides(
    portal_domain: str,
    eob_domain: str,
    oqc_domain: str,
    jarvis_domain: str,
) -> Dict[str, str]:
    """Build overrides for the canonical service domains."""
    cors = ",".join([
        "http://localhost:3000",
        "http://localhost:3004",
        f"http://{portal_domain}",
        f"https://{portal_domain}",
        f"https://{eob_domain}",
    ])
    return {
        "PORTAL_OIDC_REDIRECT_URI": f"https://{portal_domain}/auth/callback",
        "PORTAL_OIDC_POST_LOGOUT_REDIRECT_URI": f"https://{portal_domain}/",
        "OIDC_REDIRECT_URI": f"https://{eob_domain}/api/auth/oidc/callback",
        "OIDC_POST_LOGOUT_REDIRECT_URI": f"https://{eob_domain}/login",
        "CORS_ORIGINS": cors,
        "VITE_APP_BASE": "/",
        "VITE_API_URL": "/api",
        "VITE_PORTAL_URL": f"https://{portal_domain}",
        "VITE_OQC_URL": f"https://{oqc_domain}",
        "VITE_JARVIS_URL": f"https://{jarvis_domain}",
        "NEXT_PUBLIC_EOB_URL": f"https://{eob_domain}",
        "NEXT_PUBLIC_OQC_URL": f"https://{oqc_domain}",
        "NEXT_PUBLIC_JARVIS_URL": f"https://{jarvis_domain}",
        "PORTAL_DOMAIN": portal_domain,
        "EOB_DOMAIN": eob_domain,
        "OQC_DOMAIN": oqc_domain,
        "JARVIS_DOMAIN": jarvis_domain,
        "OQC_UPSTREAM": f"https://{oqc_domain}/",
        "JARVIS_UPSTREAM": f"https://{jarvis_domain}/",
    }


def resolve_service_domains(
    portal_domain: str,
    eob_domain: str | None,
    oqc_domain: str | None,
    jarvis_domain: str | None,
) -> tuple[str, str, str]:
    """Resolve service domains from explicit values or the portal base domain."""
    base = portal_domain.split(".", 1)[1] if "." in portal_domain else portal_domain
    return (
        eob_domain or f"eob.{base}",
        oqc_domain or f"oqc.{base}",
        jarvis_domain or f"sw-portal.{base}",
    )


def render_env_from_source(
    source_env: Dict[str, str],
    overrides: Dict[str, str],
    remove_keys: set[str],
) -> List[str]:
    """Render .env.remote lines from a source env dict with overrides and removals."""
    merged = dict(source_env)
    merged.update(overrides)

    lines: List[str] = []
    for key in merged:
        if key in remove_keys:
            continue
        lines.append(f"{key}={merged[key]}")

    return lines


# ---------------------------------------------------------------------------
# Existing helpers (unchanged)
# ---------------------------------------------------------------------------

def _parse_key_value(line: str) -> Optional[Tuple[str, str]]:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        return None
    key, value = stripped.split("=", 1)
    return key.strip(), value.strip()


def read_env_file(path: Path) -> Dict[str, str]:
    env: Dict[str, str] = {}
    if not path.exists():
        return env

    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        parsed = _parse_key_value(raw)
        if not parsed:
            continue
        key, value = parsed
        env[key] = value
    return env


def render_from_template(template_lines: List[str], overrides: Dict[str, str]) -> List[str]:
    out: List[str] = []
    for raw in template_lines:
        parsed = _parse_key_value(raw)
        if not parsed:
            out.append(raw)
            continue

        key, old_value = parsed
        if key in overrides:
            out.append(f"{key}={overrides[key]}")
        else:
            out.append(f"{key}={old_value}")
    return out


def find_placeholders(lines: List[str]) -> Dict[str, str]:
    placeholders: Dict[str, str] = {}
    for raw in lines:
        parsed = _parse_key_value(raw)
        if not parsed:
            continue
        key, value = parsed
        if "CHANGE_ME" in value:
            placeholders[key] = value
    return placeholders


def validate_required(lines: List[str]) -> List[str]:
    """Return list of problems (empty if ok)."""
    problems: List[str] = []

    # Basic checks: no CHANGE_ME placeholders
    placeholders = find_placeholders(lines)
    for key, value in placeholders.items():
        problems.append(f"{key} still contains placeholder value: {value}")

    # Ensure SECRET_KEY is not too short
    env = {}
    for raw in lines:
        parsed = _parse_key_value(raw)
        if parsed:
            env[parsed[0]] = parsed[1]

    secret = env.get("SECRET_KEY")
    if secret and len(secret) < 32:
        problems.append("SECRET_KEY looks short (< 32 chars). Use a long random secret.")

    # CORS sanity
    cors = env.get("CORS_ORIGINS")
    if cors:
        bad = [o for o in (c.strip() for c in cors.split(",")) if o and not re.match(r"^https?://", o)]
        if bad:
            problems.append(
                "CORS_ORIGINS contains non-http(s) origins: " + ", ".join(bad)
            )

    gateway_modes = [
        env.get("GATEWAY_MODE_EOB", "direct"),
        env.get("GATEWAY_MODE_OQC", "direct"),
        env.get("GATEWAY_MODE_JARVIS", "direct"),
    ]
    gateway_enabled = any(mode in {"gateway", "gateway_only"} for mode in gateway_modes)
    if gateway_enabled:
        signing_key = env.get("PORTAL_HANDOFF_SIGNING_KEY", "")
        verify_key = env.get("PORTAL_HANDOFF_VERIFY_KEY", "")
        if len(signing_key.strip()) < 32:
            problems.append(
                "PORTAL_HANDOFF_SIGNING_KEY must be at least 32 chars when any GATEWAY_MODE_* is enabled."
            )
        if len(verify_key.strip()) < 32:
            problems.append(
                "PORTAL_HANDOFF_VERIFY_KEY must be at least 32 chars when any GATEWAY_MODE_* is enabled."
            )

    portal_oidc_enabled = env.get("PORTAL_OIDC_ENABLED", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    if portal_oidc_enabled:
        required = [
            "PORTAL_OIDC_CLIENT_ID",
            "PORTAL_OIDC_CLIENT_SECRET",
            "PORTAL_OIDC_REDIRECT_URI",
            "PORTAL_OIDC_POST_LOGOUT_REDIRECT_URI",
        ]
        for key in required:
            if not env.get(key, "").strip():
                problems.append(f"{key} is required when PORTAL_OIDC_ENABLED=true.")
        if len(env.get("PORTAL_SESSION_SECRET", "").strip()) < 32:
            problems.append(
                "PORTAL_SESSION_SECRET must be at least 32 chars when PORTAL_OIDC_ENABLED=true."
            )

    return problems


def write_file_atomic(path: Path, lines: List[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = "\n".join(lines).rstrip() + "\n"
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    tmp.replace(path)


def scp_upload(
    local_path: Path,
    remote_spec: str,
    port: Optional[int] = None,
    identity: Optional[str] = None,
) -> None:
    cmd = ["scp"]
    if port:
        cmd += ["-P", str(port)]
    if identity:
        cmd += ["-i", identity]

    cmd += [str(local_path), remote_spec]

    try:
        subprocess.run(cmd, check=True)
    except FileNotFoundError as e:
        raise RuntimeError(
            "scp executable not found. Install OpenSSH client or run from WSL."
        ) from e


def parse_set_items(items: List[str]) -> Dict[str, str]:
    overrides: Dict[str, str] = {}
    for item in items:
        if "=" not in item:
            raise ValueError(f"Invalid --set value (expected KEY=VALUE): {item}")
        key, value = item.split("=", 1)
        key = key.strip()
        if not key:
            raise ValueError(f"Invalid --set value (empty key): {item}")
        overrides[key] = value
    return overrides


# ---------------------------------------------------------------------------
# Server profile flow
# ---------------------------------------------------------------------------

def run_server_profile(args) -> int:
    """Generate .env.remote from .env using server transform rules."""
    env_path = Path(args.env_source)
    if not env_path.exists():
        print(f"[ERROR] Source env file not found: {env_path}", file=sys.stderr)
        return 2

    source_env = read_env_file(env_path)
    if not source_env:
        print(f"[ERROR] No variables found in {env_path}", file=sys.stderr)
        return 2

    portal_domain = args.domain
    eob_domain, oqc_domain, jarvis_domain = resolve_service_domains(
        portal_domain=portal_domain,
        eob_domain=args.eob_domain,
        oqc_domain=args.oqc_domain,
        jarvis_domain=args.jarvis_domain,
    )

    # Build combined overrides: static + domain-based
    overrides: Dict[str, str] = {}
    overrides.update(SERVER_OVERRIDES)
    overrides.update(
        build_domain_overrides(
            portal_domain=portal_domain,
            eob_domain=eob_domain,
            oqc_domain=oqc_domain,
            jarvis_domain=jarvis_domain,
        )
    )

    # Apply explicit --set overrides (highest priority)
    overrides.update(parse_set_items(args.set_items))

    # Render from source env
    rendered_lines = render_env_from_source(source_env, overrides, REMOVE_KEYS)

    # Validate
    problems = validate_required(rendered_lines)
    if problems:
        print("[ERROR] Generated .env.remote has issues:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 2

    out_path = Path(args.out)

    # Report what was transformed
    print(f"[INFO] Source: {env_path}")
    print(f"[INFO] Portal domain: {portal_domain}")
    print(f"[INFO] EOB domain: {eob_domain}")
    print(f"[INFO] OQC domain: {oqc_domain}")
    print(f"[INFO] Jarvis domain: {jarvis_domain}")
    print(f"[INFO] Overrides applied: {', '.join(sorted(overrides.keys()))}")
    print(f"[INFO] Keys removed: {', '.join(sorted(k for k in REMOVE_KEYS if k in source_env))}")

    # Write or temp-write for scp
    if args.no_write and args.scp:
        with tempfile.TemporaryDirectory() as td:
            tmp_path = Path(td) / out_path.name
            write_file_atomic(tmp_path, rendered_lines)
            scp_upload(tmp_path, args.scp, port=args.port, identity=args.identity)
            print(f"[OK] Uploaded to {args.scp}")
            return 0

    if not args.no_write:
        write_file_atomic(out_path, rendered_lines)
        print(f"[OK] Wrote {out_path}")

    if args.scp:
        scp_upload(out_path, args.scp, port=args.port, identity=args.identity)
        print(f"[OK] Uploaded to {args.scp}")

    return 0


# ---------------------------------------------------------------------------
# Template-based flow (legacy, unchanged)
# ---------------------------------------------------------------------------

def run_template_flow(args) -> int:
    """Original template-based .env.remote generation."""
    template_path = Path(args.template)
    if not template_path.exists():
        print(f"[ERROR] Template not found: {template_path}", file=sys.stderr)
        return 2

    template_lines = template_path.read_text(encoding="utf-8", errors="replace").splitlines()

    overrides: Dict[str, str] = {}

    # Optionally fill from a local env file
    if args.from_env:
        from_env = read_env_file(Path(args.from_env))
        # Only fill keys that exist in the template
        template_keys = {k for k, _v in (_parse_key_value(l) for l in template_lines) if k}  # type: ignore
        for key in template_keys:
            if key in from_env:
                overrides.setdefault(key, from_env[key])

    # Apply explicit overrides (wins)
    overrides.update(parse_set_items(args.set_items))

    rendered_lines = render_from_template(template_lines, overrides)

    placeholders = find_placeholders(rendered_lines)
    if placeholders and not args.non_interactive:
        print("[INFO] Some values are still placeholders. Please enter real values.")
        for key, value in placeholders.items():
            if key in overrides:
                continue

            prompt = f"{key} ({value})"
            if "PASSWORD" in key or key in {"SECRET_KEY"}:
                entered = getpass(prompt + ": ")
            else:
                entered = input(prompt + ": ")

            entered = entered.strip()
            if entered:
                overrides[key] = entered

        rendered_lines = render_from_template(template_lines, overrides)

    problems = validate_required(rendered_lines)
    if problems:
        print("[ERROR] .env.remote is not ready:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        if args.non_interactive:
            return 2
        print("\n[HINT] Re-run with --set KEY=VALUE for missing values, or run interactively.")
        return 2

    out_path = Path(args.out)

    # Write or temp-write
    if args.no_write and args.scp:
        with tempfile.TemporaryDirectory() as td:
            tmp_path = Path(td) / out_path.name
            write_file_atomic(tmp_path, rendered_lines)
            scp_upload(tmp_path, args.scp, port=args.port, identity=args.identity)
            print(f"[OK] Uploaded to {args.scp}")
            return 0

    if not args.no_write:
        write_file_atomic(out_path, rendered_lines)
        print(f"[OK] Wrote {out_path}")

    if args.scp:
        if args.no_write:
            print("[ERROR] --no-write requires --scp (already provided) and uses temp file")
            return 2
        scp_upload(out_path, args.scp, port=args.port, identity=args.identity)
        print(f"[OK] Uploaded to {args.scp}")

    return 0


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Generate and optionally upload .env.remote")
    parser.add_argument("--template", default=DEFAULT_TEMPLATE, help="Template file (default: .env.remote.example)")
    parser.add_argument("--out", default=DEFAULT_OUTPUT, help="Output file path (default: .env.remote)")
    parser.add_argument(
        "--from-env",
        default=None,
        help="Optional .env file to source defaults from (e.g., .env). Only fills missing keys.",
    )
    parser.add_argument(
        "--set",
        dest="set_items",
        action="append",
        default=[],
        help="Override a value (repeatable): --set KEY=VALUE",
    )
    parser.add_argument(
        "--non-interactive",
        action="store_true",
        help="Fail if required placeholders remain after applying overrides.",
    )
    parser.add_argument(
        "--scp",
        default=None,
        help="Upload generated file via scp, e.g. user@host:/path/.env.remote",
    )
    parser.add_argument("--port", type=int, default=None, help="SSH port for scp")
    parser.add_argument("--identity", default=None, help="SSH identity file for scp (e.g., ~/.ssh/id_rsa)")
    parser.add_argument(
        "--no-write",
        action="store_true",
        help="Do not write .env.remote to disk (useful with --scp).",
    )

    # Server profile options
    parser.add_argument(
        "--profile",
        choices=["server"],
        default=None,
        help="Use a predefined profile. 'server' reads .env and applies server transform rules.",
    )
    parser.add_argument(
        "--domain",
        default=PORTAL_DOMAIN_DEFAULT,
        help=f"Portal domain for OIDC/CORS URLs (default: {PORTAL_DOMAIN_DEFAULT})",
    )
    parser.add_argument(
        "--eob-domain",
        default=None,
        help=f"Canonical EOB domain (default derived from portal domain, e.g. {EOB_DOMAIN_DEFAULT})",
    )
    parser.add_argument(
        "--oqc-domain",
        default=None,
        help=f"Canonical OQC domain (default derived from portal domain, e.g. {OQC_DOMAIN_DEFAULT})",
    )
    parser.add_argument(
        "--jarvis-domain",
        default=None,
        help=f"Canonical Jarvis domain (default derived from portal domain, e.g. {JARVIS_DOMAIN_DEFAULT})",
    )
    parser.add_argument(
        "--env-source",
        default=".env",
        help="Source .env file for --profile server (default: .env)",
    )

    args = parser.parse_args(argv)

    if args.profile == "server":
        return run_server_profile(args)
    else:
        return run_template_flow(args)


if __name__ == "__main__":
    raise SystemExit(main())
