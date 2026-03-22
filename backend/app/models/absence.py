"""
SQLAlchemy Model for Absence
Tracks employee absences that affect resource capacity (parental leave, medical leave, etc.)
"""

import uuid
from datetime import datetime, date
from sqlalchemy import (
    Column,
    String,
    Float,
    ForeignKey,
    DateTime,
    Date,
    Text,
    Index,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


def generate_uuid():
    return str(uuid.uuid4())


class Absence(Base):
    """부재 관리 - 육아휴직, 병가, 파견 등 리소스 영향 추적"""

    __tablename__ = "absences"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    absence_type = Column(String(30), nullable=False)
    # Types: PARENTAL_LEAVE, MEDICAL_LEAVE, SECONDMENT, SABBATICAL, OTHER
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)  # NULL = ongoing / indefinite
    fte_impact = Column(Float, nullable=False, default=-1.0)
    # -1.0 = full absence, -0.5 = half-time absence, etc.
    department_id = Column(String(50), ForeignKey("departments.id"), nullable=False)
    sub_team_id = Column(String(50), ForeignKey("sub_teams.id"), nullable=True)
    remarks = Column(Text, nullable=True)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="absences", foreign_keys=[user_id])
    department = relationship("Department")
    sub_team = relationship("SubTeam")
    creator = relationship("User", foreign_keys=[created_by])

    __table_args__ = (
        Index("ix_absences_user_id", "user_id"),
        Index("ix_absences_department_id", "department_id"),
        Index("ix_absences_date_range", "start_date", "end_date"),
    )
