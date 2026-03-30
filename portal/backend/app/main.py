from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.guides import router as guides_router
from app.api.health import router as health_router
from app.config import settings
from app.database import Base, engine

app = FastAPI(
    title="PCAS Portal API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(guides_router, prefix="/api")
app.include_router(health_router, prefix="/api")


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
