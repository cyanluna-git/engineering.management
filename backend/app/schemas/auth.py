"""
Authentication Schemas - Pydantic models for auth endpoints
"""

from typing import Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr


class Token(BaseModel):
    """JWT Token response"""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """JWT payload data"""

    user_id: Optional[str] = None
    role: Optional[str] = None


class UserLogin(BaseModel):
    """Login request body"""

    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """User info response"""

    id: str
    email: str
    name: str
    korean_name: Optional[str] = None
    role: str
    sub_team_id: Optional[str] = None
    position_id: str
    department_id: Optional[str] = None
    primary_business_unit_id: Optional[str] = None
    seen_release_note_version: Optional[str] = None
    is_active: bool
    # Nested relationships
    department: Optional[dict] = None
    sub_team: Optional[dict] = None
    position: Optional[dict] = None
    primary_business_unit: Optional[dict] = None

    class Config:
        from_attributes = True


class PasswordChangeRequest(BaseModel):
    """Password change request"""

    current_password: str
    new_password: str


class PasswordChangeResponse(BaseModel):
    """Password change response"""

    message: str
    success: bool


class TokenRefreshRequest(BaseModel):
    """Token refresh request - uses refresh token"""

    refresh_token: str


class ReleaseNotesAckRequest(BaseModel):
    """Request to acknowledge a release note version."""

    version: str


class ReleaseNotesAckResponse(BaseModel):
    """Response after acknowledging a release note version."""

    success: bool
    seen_release_note_version: str


class SSORegistrationRequest(BaseModel):
    """SSO self-registration request for unregistered Microsoft sign-in users."""

    registration_token: str
    name: str
    korean_name: str
    department_id: str
    position_id: str


class CalendarConnectStartRequest(BaseModel):
    """Request to start delegated Microsoft Calendar consent."""

    redirect_url: Optional[str] = None


class CalendarConnectStartResponse(BaseModel):
    """Authorization URL for Microsoft Calendar consent."""

    authorization_url: str


class CalendarConnectionStatusResponse(BaseModel):
    """Persisted Microsoft Calendar connection state for the current user."""

    connected: bool
    provider: str
    provider_email: Optional[str] = None
    granted_scopes: list[str]
    has_calendar_scope: bool
    token_expires_at: Optional[datetime] = None
    connected_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
