"""
Generated Report Model
Stores periodically generated AI-powered engineering intelligence reports.
"""

from datetime import datetime, date
from uuid import uuid4
from sqlalchemy import Column, String, Date, DateTime, Text, Index, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base


def _uuid() -> str:
    return str(uuid4())


class GeneratedReport(Base):
    """AI-generated periodic engineering report"""

    __tablename__ = "generated_reports"

    id = Column(String(36), primary_key=True, default=_uuid)
    report_type = Column(String(20), nullable=False)  # "weekly" | "monthly"
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    title = Column(String(200), nullable=False)
    sections = Column(JSONB, nullable=True)  # 5 AI-generated sections
    charts_data = Column(JSONB, nullable=True)  # Chart rendering data
    status = Column(String(20), nullable=False, default="generating")
    ai_model = Column(String(50), nullable=True)
    generated_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    creator = relationship("User", foreign_keys=[generated_by])

    __table_args__ = (
        Index("ix_generated_reports_lookup", "report_type", "period_start"),
    )
