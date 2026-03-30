import httpx

from app.config import settings

SERVICES = [
    {"id": "eob", "name": "Engineering Operation Board", "url": "http://localhost:8004/docs"},
    {"id": "oqc", "name": "Outbound Quality Control", "url": "http://localhost:3005"},
    {"id": "jarvis", "name": "IS Software Portal", "url": "http://localhost:3009"},
]


async def check_services() -> list[dict]:
    results = []
    async with httpx.AsyncClient(timeout=settings.HEALTH_CHECK_TIMEOUT) as client:
        for svc in SERVICES:
            try:
                resp = await client.get(svc["url"])
                results.append({
                    "id": svc["id"],
                    "name": svc["name"],
                    "status": "online" if resp.status_code < 500 else "error",
                    "status_code": resp.status_code,
                })
            except (httpx.ConnectError, httpx.TimeoutException):
                results.append({
                    "id": svc["id"],
                    "name": svc["name"],
                    "status": "offline",
                    "status_code": None,
                })
    return results
