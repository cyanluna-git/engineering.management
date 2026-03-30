from fastapi import APIRouter

from app.services.health_service import check_services

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> dict:
    services = await check_services()
    all_online = all(s["status"] == "online" for s in services)
    return {
        "portal": "ok",
        "services": services,
        "all_online": all_online,
    }
