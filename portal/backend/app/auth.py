"""Temporary auth: validate EOB JWT tokens to identify admin users."""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings

security = HTTPBearer(auto_error=False)


def _decode_token(token: str) -> dict | None:
    if not settings.EOB_SECRET_KEY:
        return None
    try:
        return jwt.decode(token, settings.EOB_SECRET_KEY, algorithms=["HS256"])
    except JWTError:
        return None


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict | None:
    if not credentials:
        return None
    return _decode_token(credentials.credentials)


def require_admin(
    user: dict | None = Depends(get_current_user),
) -> dict:
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if user.get("role") != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return user
