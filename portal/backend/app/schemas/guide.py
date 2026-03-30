from datetime import datetime

from pydantic import BaseModel, Field


class GuideCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    category: str = Field(..., min_length=1, max_length=50)
    content: str = ""


class GuideUpdate(BaseModel):
    title: str | None = None
    category: str | None = None
    content: str | None = None


class GuideResponse(BaseModel):
    id: str
    title: str
    category: str
    content: str
    author: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
