"""
Pydantic schemas for Portal access logging and statistics
"""

from datetime import datetime
from typing import Dict, List
from pydantic import BaseModel


class AccessLogCreate(BaseModel):
    service: str


class AccessLogResponse(BaseModel):
    id: int
    user_id: str
    service: str
    accessed_at: datetime

    class Config:
        from_attributes = True


class TopUserItem(BaseModel):
    user_id: str
    name: str
    count: int


class HourlyActivityItem(BaseModel):
    hour: int
    count: int


class PortalStatsResponse(BaseModel):
    service_counts: Dict[str, int]
    top_users: List[TopUserItem]
    hourly_activity: List[HourlyActivityItem]


class MyAccessHistoryResponse(BaseModel):
    items: List[AccessLogResponse]


class ServerStats(BaseModel):
    cpu_percent: float
    memory_used_mb: float
    memory_total_mb: float
    disk_used_gb: float
    disk_total_gb: float
    network_rx_mb: float
    network_tx_mb: float


class ContainerInfo(BaseModel):
    name: str
    status: str
    stack: str
    cpu_percent: float
    memory_usage_mb: float
    memory_limit_mb: float
    network_rx_mb: float
    network_tx_mb: float
    uptime_seconds: int


class ContainerStackGroup(BaseModel):
    name: str
    containers: List[ContainerInfo]


class ContainerMonitoringResponse(BaseModel):
    stacks: List[ContainerStackGroup]
    server_stats: ServerStats
