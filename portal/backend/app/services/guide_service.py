from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.guide import Guide
from app.schemas.guide import GuideCreate, GuideUpdate


class GuideService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list(
        self,
        category: str | None = None,
        search: str | None = None,
    ) -> list[Guide]:
        q = self.db.query(Guide)
        if category:
            q = q.filter(Guide.category == category)
        if search:
            pattern = f"%{search}%"
            q = q.filter(
                or_(Guide.title.ilike(pattern), Guide.content.ilike(pattern))
            )
        return q.order_by(Guide.updated_at.desc()).all()

    def get_by_id(self, guide_id: str) -> Guide | None:
        return self.db.query(Guide).filter(Guide.id == guide_id).first()

    def create(self, data: GuideCreate, author: str) -> Guide:
        guide = Guide(
            title=data.title,
            category=data.category,
            content=data.content,
            author=author,
        )
        self.db.add(guide)
        self.db.commit()
        self.db.refresh(guide)
        return guide

    def update(self, guide_id: str, data: GuideUpdate) -> Guide | None:
        guide = self.get_by_id(guide_id)
        if not guide:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(guide, field, value)
        self.db.commit()
        self.db.refresh(guide)
        return guide

    def delete(self, guide_id: str) -> bool:
        guide = self.get_by_id(guide_id)
        if not guide:
            return False
        self.db.delete(guide)
        self.db.commit()
        return True
