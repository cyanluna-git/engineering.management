"""
Service layer for absence-related business logic
"""

from typing import List, Optional
from datetime import date
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_

from app.models.absence import Absence
from app.schemas.absence import AbsenceCreate, AbsenceUpdate


class AbsenceService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_id(self, absence_id: str) -> Optional[Absence]:
        """Get an absence by its ID."""
        return (
            self.db.query(Absence)
            .options(
                joinedload(Absence.user),
                joinedload(Absence.department),
                joinedload(Absence.sub_team),
                joinedload(Absence.creator),
            )
            .filter(Absence.id == absence_id)
            .first()
        )

    def get_multi(
        self,
        *,
        user_id: Optional[str] = None,
        department_id: Optional[str] = None,
        sub_team_id: Optional[str] = None,
        absence_type: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Absence]:
        """Retrieve absences with filters. Date range finds overlapping absences."""
        query = self.db.query(Absence).options(
            joinedload(Absence.user),
            joinedload(Absence.department),
            joinedload(Absence.sub_team),
            joinedload(Absence.creator),
        )

        if user_id:
            query = query.filter(Absence.user_id == user_id)
        if department_id:
            query = query.filter(Absence.department_id == department_id)
        if sub_team_id:
            query = query.filter(Absence.sub_team_id == sub_team_id)
        if absence_type:
            query = query.filter(Absence.absence_type == absence_type)
        if start_date:
            query = query.filter(
                or_(Absence.end_date.is_(None), Absence.end_date >= start_date)
            )
        if end_date:
            query = query.filter(Absence.start_date <= end_date)

        return (
            query.order_by(Absence.start_date.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def create(self, data: AbsenceCreate, created_by: str) -> Absence:
        """Create a new absence record."""
        db_absence = Absence(
            **data.model_dump(),
            created_by=created_by,
        )
        self.db.add(db_absence)
        self.db.commit()
        self.db.refresh(db_absence)
        return db_absence

    def update(self, absence_id: str, data: AbsenceUpdate) -> Optional[Absence]:
        """Update an existing absence record."""
        db_absence = self.db.query(Absence).filter(Absence.id == absence_id).first()
        if not db_absence:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_absence, field, value)

        self.db.commit()
        self.db.refresh(db_absence)
        return db_absence

    def delete(self, absence_id: str) -> bool:
        """Delete an absence record."""
        db_absence = self.db.query(Absence).filter(Absence.id == absence_id).first()
        if not db_absence:
            return False

        self.db.delete(db_absence)
        self.db.commit()
        return True
