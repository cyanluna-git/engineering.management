"""
Absence CRUD endpoints
"""

from typing import Optional, List
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_write_permission
from app.schemas.absence import AbsenceCreate, AbsenceResponse, AbsenceUpdate
from app.services.absence_service import AbsenceService

router = APIRouter()


def _to_response(absence) -> dict:
    """Convert Absence ORM object to response dict with nested names."""
    return {
        "id": absence.id,
        "user_id": absence.user_id,
        "absence_type": absence.absence_type,
        "start_date": absence.start_date,
        "end_date": absence.end_date,
        "fte_impact": absence.fte_impact,
        "department_id": absence.department_id,
        "sub_team_id": absence.sub_team_id,
        "remarks": absence.remarks,
        "created_by": absence.created_by,
        "created_at": absence.created_at,
        "updated_at": absence.updated_at,
        "user_name": absence.user.name if absence.user else None,
        "department_name": absence.department.name if absence.department else None,
        "sub_team_name": absence.sub_team.name if absence.sub_team else None,
        "creator_name": absence.creator.name if absence.creator else None,
    }


@router.get("/", response_model=List[AbsenceResponse])
async def list_absences(
    user_id: Optional[str] = Query(None),
    department_id: Optional[str] = Query(None),
    sub_team_id: Optional[str] = Query(None),
    absence_type: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List absences with optional filters."""
    service = AbsenceService(db)
    absences = service.get_multi(
        user_id=user_id,
        department_id=department_id,
        sub_team_id=sub_team_id,
        absence_type=absence_type,
        start_date=start_date,
        end_date=end_date,
        skip=skip,
        limit=limit,
    )
    return [_to_response(a) for a in absences]


@router.post("/", response_model=AbsenceResponse, status_code=status.HTTP_201_CREATED)
async def create_absence(
    data: AbsenceCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_write_permission()),
):
    """Create a new absence record."""
    service = AbsenceService(db)
    absence = service.create(data, created_by=current_user.id)
    return _to_response(service.get_by_id(absence.id))


@router.get("/{absence_id}", response_model=AbsenceResponse)
async def get_absence(
    absence_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get a specific absence by ID."""
    service = AbsenceService(db)
    absence = service.get_by_id(absence_id)
    if not absence:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Absence not found",
        )
    return _to_response(absence)


@router.put("/{absence_id}", response_model=AbsenceResponse)
async def update_absence(
    absence_id: str,
    data: AbsenceUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_write_permission()),
):
    """Update an existing absence record."""
    service = AbsenceService(db)
    absence = service.update(absence_id, data)
    if not absence:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Absence not found",
        )
    return _to_response(service.get_by_id(absence_id))


@router.delete("/{absence_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_absence(
    absence_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_write_permission()),
):
    """Delete an absence record."""
    service = AbsenceService(db)
    deleted = service.delete(absence_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Absence not found",
        )
    return None
