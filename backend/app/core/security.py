"""
Security utilities - JWT and password hashing
"""

import time
from threading import Lock
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# Read-only roles (can only view, cannot create/update/delete)
READ_ONLY_ROLES = ["GUEST", "VIEWER"]
_portal_handoff_jti_lock = Lock()
_portal_handoff_jti_cache: dict[str, int] = {}


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    """Create a JWT refresh token with longer expiry"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def create_registration_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a short-lived JWT registration token for Microsoft sign-in self-registration.
    Contains IdP-verified email and name. Default 10 minute expiry."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=10)
    to_encode.update({"exp": expire, "type": "registration"})
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def decode_registration_token(token: str) -> Optional[dict]:
    """Decode and validate a registration token. Returns payload if valid, None otherwise."""
    payload = decode_token(token)
    if payload is None:
        return None
    if payload.get("type") != "registration":
        return None
    return payload


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT token"""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        return payload
    except JWTError:
        return None


def _normalize_audience_claim(value) -> set[str]:
    if isinstance(value, str):
        return {value}
    if isinstance(value, list):
        return {item for item in value if isinstance(item, str)}
    return set()


def verify_portal_handoff_token(token: str, audience: str) -> Optional[dict]:
    """Decode a short-lived portal handoff token with current/previous verify keys."""
    keys = [
        settings.PORTAL_HANDOFF_VERIFY_KEY.strip(),
        settings.PORTAL_HANDOFF_VERIFY_KEY_PREV.strip(),
    ]

    if not any(keys):
        return None

    payload: dict | None = None
    for key in keys:
        if not key:
            continue
        try:
            payload = jwt.decode(
                token,
                key,
                algorithms=[settings.ALGORITHM],
                options={"verify_aud": False},
            )
            break
        except JWTError:
            continue

    if payload is None:
        return None
    if payload.get("type") != "portal_handoff":
        return None
    if payload.get("iss") != "pcas-portal":
        return None

    token_audience = _normalize_audience_claim(payload.get("aud"))
    if audience not in token_audience:
        return None

    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject.strip():
        return None
    jti = payload.get("jti")
    if not isinstance(jti, str) or not jti.strip():
        return None

    return payload


def consume_portal_handoff_token(payload: dict) -> bool:
    """Mark a portal handoff token as used once for its remaining TTL window."""
    jti = payload.get("jti")
    expires_at = payload.get("exp")
    if not isinstance(jti, str) or not jti.strip():
        return False
    if not isinstance(expires_at, (int, float)):
        return False

    now = int(time.time())
    ttl_cutoff = int(expires_at)
    with _portal_handoff_jti_lock:
        expired = [key for key, exp in _portal_handoff_jti_cache.items() if exp <= now]
        for key in expired:
            del _portal_handoff_jti_cache[key]

        if jti in _portal_handoff_jti_cache:
            return False

        _portal_handoff_jti_cache[jti] = ttl_cutoff
        return True


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
):
    """
    Dependency to get current authenticated user from database.
    Raises HTTPException if token is invalid or user not found.
    """
    from app.models.user import User  # Import here to avoid circular import

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(token)
    if payload is None:
        raise credentials_exception

    if payload.get("type") != "access":
        raise credentials_exception

    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    # Get user from database
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )

    return user


async def get_current_active_user(current_user=Depends(get_current_user)):
    """Dependency to ensure user is active (convenience wrapper)"""
    return current_user


def require_role(*allowed_roles: str):
    """
    Factory function to create a dependency that requires specific roles.
    Usage: Depends(require_role("ADMIN", "PM"))
    """

    async def role_checker(current_user=Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return role_checker


def require_write_permission():
    """
    Factory function to create a dependency that requires write permissions.
    Blocks read-only roles (GUEST, VIEWER) from creating/updating/deleting.
    Usage: Depends(require_write_permission())
    """

    async def write_checker(current_user=Depends(get_current_user)):
        if current_user.role in READ_ONLY_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Read-only access. This account does not have permission to modify data.",
            )
        return current_user

    return write_checker
