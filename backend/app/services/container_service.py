"""
Service layer for Docker container resource monitoring
"""

import logging
from typing import List

from fastapi import HTTPException

logger = logging.getLogger(__name__)


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
