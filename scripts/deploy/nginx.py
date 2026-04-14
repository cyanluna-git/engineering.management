#!/usr/bin/env python3
"""
Finalize Server Infrastructure:
1. Stops competing Traefik (coolify-proxy)
2. Cleans up redundant Nginx configs
3. Deploys the definitive PCAS portal-domain Nginx proxy config
"""

import argparse
import os
import subprocess
import tempfile
from pathlib import Path

PORTAL_DOMAIN_DEFAULT = "pcas-portal.atlascopco.group"
EOB_DOMAIN_DEFAULT = "eob.atlascopco.group"
OQC_DOMAIN_DEFAULT = "oqc.atlascopco.group"
JARVIS_DOMAIN_DEFAULT = "sw-portal.atlascopco.group"

class Colors:
    CYAN = '\033[36m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    RED = '\033[31m'
    RESET = '\033[0m'

def print_colored(message, color=''):
    print(f"{color}{message}{Colors.RESET}")

def run_remote(ssh_base, cmd, desc):
    print_colored(f">>> {desc}...", Colors.CYAN)
    full_cmd = ssh_base + [cmd]
    result = subprocess.run(full_cmd)
    if result.returncode != 0:
        print_colored(f"Warning: {desc} returned non-zero exit code.", Colors.YELLOW)
    return result.returncode == 0


def resolve_service_domains(portal_domain, eob_domain, oqc_domain, jarvis_domain):
    base = portal_domain.split(".", 1)[1] if "." in portal_domain else portal_domain
    return (
        eob_domain or f"eob.{base}",
        oqc_domain or f"oqc.{base}",
        jarvis_domain or f"sw-portal.{base}",
    )

def main():
    parser = argparse.ArgumentParser(description="Finalize Server Proxy Infrastructure")
    parser.add_argument("--host", default="10.182.252.32", help="Remote host IP")
    parser.add_argument("--user", default="atlasAdmin", help="Remote SSH user")
    parser.add_argument(
        "--portal-domain",
        default=PORTAL_DOMAIN_DEFAULT,
        help=f"Portal domain to configure (default: {PORTAL_DOMAIN_DEFAULT})",
    )
    parser.add_argument(
        "--eob-domain",
        default=None,
        help=f"EOB domain to configure (default derived from portal domain, e.g. {EOB_DOMAIN_DEFAULT})",
    )
    parser.add_argument(
        "--oqc-domain",
        default=None,
        help=f"OQC domain to configure (default derived from portal domain, e.g. {OQC_DOMAIN_DEFAULT})",
    )
    parser.add_argument(
        "--jarvis-domain",
        default=None,
        help=f"Jarvis domain to configure (default derived from portal domain, e.g. {JARVIS_DOMAIN_DEFAULT})",
    )
    args = parser.parse_args()

    ssh_base = ["ssh", "-t", f"{args.user}@{args.host}"]
    portal_domain = args.portal_domain
    eob_domain, oqc_domain, jarvis_domain = resolve_service_domains(
        portal_domain,
        args.eob_domain,
        args.oqc_domain,
        args.jarvis_domain,
    )
    
    # 1. Stop Traefik/Coolify Proxy
    run_remote(ssh_base, 
               "sudo docker stop coolify-proxy 2>/dev/null && sudo docker update --restart=no coolify-proxy 2>/dev/null", 
               "Stopping Traefik (coolify-proxy) to free Port 80")

    # 2. Cleanup Nginx sites-enabled
    run_remote(ssh_base, 
               "sudo rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/edwards /etc/nginx/sites-enabled/euvcfg", 
               "Cleaning up redundant Nginx configurations")

    # 3. Render, upload, and deploy new config
    local_conf = Path("nginx_remote_proxy.conf")
    if not local_conf.exists():
        print_colored("Error: nginx_remote_proxy.conf not found locally!", Colors.RED)
        return

    rendered = (
        local_conf.read_text(encoding="utf-8")
        .replace("pcas-portal.10.182.252.32.sslip.io", portal_domain)
        .replace("pcas-portal.atlascopco.group", portal_domain)
        .replace("eob.10.182.252.32.sslip.io", eob_domain)
        .replace("eob.atlascopco.group", eob_domain)
        .replace("oqc.10.182.252.32.sslip.io", oqc_domain)
        .replace("oqc.atlascopco.group", oqc_domain)
        .replace("jarvis.10.182.252.32.sslip.io", jarvis_domain)
        .replace("sw-portal.atlascopco.group", jarvis_domain)
    )

    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as tmp:
        tmp.write(rendered)
        tmp_path = tmp.name

    print_colored("\n>>> Uploading new Nginx configuration...", Colors.CYAN)
    try:
        subprocess.run(["scp", tmp_path, f"{args.user}@{args.host}:/tmp/pcas-portal.conf"], check=False)
    finally:
        os.unlink(tmp_path)
    
    run_remote(ssh_base, 
               "sudo mv /tmp/pcas-portal.conf /etc/nginx/sites-available/pcas-portal.conf && " +
               "sudo ln -sf /etc/nginx/sites-available/pcas-portal.conf /etc/nginx/sites-enabled/pcas-portal.conf",
               "Activating new Nginx configuration")

    # 4. Final Reload
    run_remote(ssh_base, "sudo nginx -t && sudo systemctl restart nginx", "Restarting Nginx")

    print_colored("\n✅ Infrastructure Cleanup & Nginx Deployment Complete!", Colors.GREEN)
    print_colored(f"Target URL: https://{portal_domain}", Colors.CYAN)

if __name__ == "__main__":
    main()
