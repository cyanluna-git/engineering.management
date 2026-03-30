from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.database import get_db
from app.schemas import GuideCreate, GuideResponse, GuideUpdate
from app.services.guide_service import GuideService

router = APIRouter(prefix="/guides", tags=["guides"])


@router.get("/", response_model=list[GuideResponse])
async def list_guides(
    category: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
) -> list[GuideResponse]:
    service = GuideService(db)
    return service.list(category=category, search=search)


@router.get("/{guide_id}", response_model=GuideResponse)
async def get_guide(
    guide_id: str,
    db: Session = Depends(get_db),
) -> GuideResponse:
    service = GuideService(db)
    guide = service.get_by_id(guide_id)
    if not guide:
        raise HTTPException(status_code=404, detail="Guide not found")
    return guide


@router.post("/", response_model=GuideResponse, status_code=status.HTTP_201_CREATED)
async def create_guide(
    data: GuideCreate,
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db),
) -> GuideResponse:
    service = GuideService(db)
    return service.create(data, author=admin.get("sub", "admin"))


@router.put("/{guide_id}", response_model=GuideResponse)
async def update_guide(
    guide_id: str,
    data: GuideUpdate,
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db),
) -> GuideResponse:
    service = GuideService(db)
    guide = service.update(guide_id, data)
    if not guide:
        raise HTTPException(status_code=404, detail="Guide not found")
    return guide


@router.delete("/{guide_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_guide(
    guide_id: str,
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    service = GuideService(db)
    if not service.delete(guide_id):
        raise HTTPException(status_code=404, detail="Guide not found")
