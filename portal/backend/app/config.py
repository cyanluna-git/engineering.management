from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5434/portal"
    EOB_SECRET_KEY: str = ""
    CORS_ORIGINS: str = "http://localhost:3000"
    HEALTH_CHECK_TIMEOUT: int = 5

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
