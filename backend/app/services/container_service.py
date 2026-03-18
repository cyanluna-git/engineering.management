"""
Service layer for Docker container resource monitoring
"""

import logging
import os
import time
from typing import List

from fastapi import HTTPException

logger = logging.getLogger(__name__)


def _parse_proc_stat() -> dict[str, float]:
    """Parse aggregate CPU times from /proc/stat first line."""
    with open("/proc/stat", "r") as f:
        line = f.readline()  # 'cpu  user nice system idle iowait irq softirq ...'
    parts = line.split()
    # indices: 1=user, 2=nice, 3=system, 4=idle, 5=iowait, 6=irq, 7=softirq, 8=steal
    values = [float(v) for v in parts[1:]]
    idle = values[3] + values[4]  # idle + iowait
    total = sum(values)
    return {"idle": idle, "total": total}


class ContainerService:
    """Fetches resource metrics from Docker containers via the Docker SDK."""

    def get_containers(self) -> List[dict]:
        """Return a list of container metrics for all containers."""
        try:
            import docker
            client = docker.from_env()
        except Exception as exc:
            logger.error("Cannot connect to Docker daemon: %s", exc)
            raise HTTPException(status_code=503, detail="Docker not available")

        containers = client.containers.list(all=True)
        results: List[dict] = []

        for container in containers:
            info = {
                "name": container.name,
                "status": container.status,
                "cpu_percent": 0.0,
                "memory_usage_mb": 0.0,
                "memory_limit_mb": 0.0,
                "network_rx_mb": 0.0,
                "network_tx_mb": 0.0,
                "uptime_seconds": 0,
            }

            if container.status == "running":
                try:
                    stats = container.stats(stream=False)
                    info["cpu_percent"] = self._calc_cpu_percent(stats)
                    info["memory_usage_mb"] = round(
                        stats["memory_stats"].get("usage", 0) / (1024 * 1024), 1
                    )
                    info["memory_limit_mb"] = round(
                        stats["memory_stats"].get("limit", 0) / (1024 * 1024), 1
                    )
                    info["network_rx_mb"], info["network_tx_mb"] = self._calc_network(stats)
                    info["uptime_seconds"] = self._calc_uptime(container)
                except Exception as exc:
                    logger.warning("Failed to get stats for %s: %s", container.name, exc)

            results.append(info)

        return results

    @staticmethod
    def _calc_cpu_percent(stats: dict) -> float:
        """Calculate CPU usage percentage from Docker stats."""
        cpu_stats = stats.get("cpu_stats", {})
        precpu_stats = stats.get("precpu_stats", {})

        cpu_delta = (
            cpu_stats.get("cpu_usage", {}).get("total_usage", 0)
            - precpu_stats.get("cpu_usage", {}).get("total_usage", 0)
        )
        system_cpu_delta = (
            cpu_stats.get("system_cpu_usage", 0)
            - precpu_stats.get("system_cpu_usage", 0)
        )

        if system_cpu_delta <= 0 or cpu_delta < 0:
            return 0.0

        num_cpus = cpu_stats.get("online_cpus") or len(
            cpu_stats.get("cpu_usage", {}).get("percpu_usage", []) or [1]
        )
        return round((cpu_delta / system_cpu_delta) * num_cpus * 100, 2)

    @staticmethod
    def _calc_network(stats: dict) -> tuple[float, float]:
        """Calculate total network RX/TX in MB."""
        networks = stats.get("networks", {})
        rx_bytes = sum(net.get("rx_bytes", 0) for net in networks.values())
        tx_bytes = sum(net.get("tx_bytes", 0) for net in networks.values())
        return (
            round(rx_bytes / (1024 * 1024), 1),
            round(tx_bytes / (1024 * 1024), 1),
        )

    def get_server_stats(self) -> dict:
        """Return host-level resource stats (CPU, memory, disk, network).

        Primary path reads from /proc and os.statvfs.
        Falls back to psutil if /proc is unavailable.
        Raises 503 if both methods fail.
        """
        try:
            return self._read_proc_stats()
        except Exception as exc:
            logger.warning("Failed to read /proc stats, falling back to psutil: %s", exc)

        try:
            return self._read_psutil_stats()
        except Exception as exc:
            logger.error("Failed to read server stats via psutil: %s", exc)
            raise HTTPException(status_code=503, detail="Server stats unavailable")

    @staticmethod
    def _read_proc_stats() -> dict:
        """Read server stats from /proc filesystem and os.statvfs."""
        # --- CPU: two samples 0.1s apart from /proc/stat ---
        cpu1 = _parse_proc_stat()
        time.sleep(0.1)
        cpu2 = _parse_proc_stat()

        idle_delta = cpu2["idle"] - cpu1["idle"]
        total_delta = cpu2["total"] - cpu1["total"]
        cpu_percent = round((1.0 - idle_delta / total_delta) * 100, 2) if total_delta > 0 else 0.0

        # --- Memory from /proc/meminfo ---
        meminfo: dict[str, int] = {}
        with open("/proc/meminfo", "r") as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    key = parts[0].rstrip(":")
                    meminfo[key] = int(parts[1])  # kB

        mem_total_kb = meminfo.get("MemTotal", 0)
        mem_available_kb = meminfo.get("MemAvailable", 0)
        memory_total_mb = round(mem_total_kb / 1024, 1)
        memory_used_mb = round((mem_total_kb - mem_available_kb) / 1024, 1)

        # --- Disk from os.statvfs ---
        st = os.statvfs("/")
        disk_total_gb = round((st.f_frsize * st.f_blocks) / (1024 ** 3), 1)
        disk_used_gb = round((st.f_frsize * (st.f_blocks - st.f_bfree)) / (1024 ** 3), 1)

        # --- Network from /proc/net/dev (exclude lo) ---
        rx_bytes = 0
        tx_bytes = 0
        with open("/proc/net/dev", "r") as f:
            for line in f:
                line = line.strip()
                if ":" not in line:
                    continue
                iface, data = line.split(":", 1)
                iface = iface.strip()
                if iface == "lo":
                    continue
                fields = data.split()
                if len(fields) >= 10:
                    rx_bytes += int(fields[0])
                    tx_bytes += int(fields[8])

        return {
            "cpu_percent": cpu_percent,
            "memory_used_mb": memory_used_mb,
            "memory_total_mb": memory_total_mb,
            "disk_used_gb": disk_used_gb,
            "disk_total_gb": disk_total_gb,
            "network_rx_mb": round(rx_bytes / (1024 * 1024), 1),
            "network_tx_mb": round(tx_bytes / (1024 * 1024), 1),
        }

    @staticmethod
    def _read_psutil_stats() -> dict:
        """Read server stats using psutil as fallback."""
        import psutil

        cpu_percent = psutil.cpu_percent(interval=0.1)

        mem = psutil.virtual_memory()
        memory_total_mb = round(mem.total / (1024 * 1024), 1)
        memory_used_mb = round(mem.used / (1024 * 1024), 1)

        disk = psutil.disk_usage("/")
        disk_total_gb = round(disk.total / (1024 ** 3), 1)
        disk_used_gb = round(disk.used / (1024 ** 3), 1)

        net = psutil.net_io_counters()
        network_rx_mb = round(net.bytes_recv / (1024 * 1024), 1)
        network_tx_mb = round(net.bytes_sent / (1024 * 1024), 1)

        return {
            "cpu_percent": round(cpu_percent, 2),
            "memory_used_mb": memory_used_mb,
            "memory_total_mb": memory_total_mb,
            "disk_used_gb": disk_used_gb,
            "disk_total_gb": disk_total_gb,
            "network_rx_mb": network_rx_mb,
            "network_tx_mb": network_tx_mb,
        }

    @staticmethod
    def _calc_uptime(container) -> int:
        """Calculate container uptime in seconds from started_at."""
        from datetime import datetime, timezone

        attrs = container.attrs or {}
        state = attrs.get("State", {})
        started_at = state.get("StartedAt", "")
        if not started_at or started_at.startswith("0001"):
            return 0
        try:
            # Docker timestamps: "2026-03-18T10:00:00.123456789Z"
            started_at = started_at[:26].rstrip("Z") + "+00:00"
            started = datetime.fromisoformat(started_at)
            now = datetime.now(timezone.utc)
            return max(0, int((now - started).total_seconds()))
        except Exception:
            return 0
