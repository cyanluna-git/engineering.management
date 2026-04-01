"""
Authentication endpoints
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl, quote, urlencode, urlparse, urlunparse

from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    create_registration_token,
    decode_registration_token,
    decode_token,
    get_current_user,
    verify_password,
    get_password_hash,
    require_write_permission,
)
from app.core.config import settings
from app.services.auth_service import authenticate_user
from app.services.oidc_service import OIDCService
from app.services.oauth_connection_service import OAuthConnectionService
from app.schemas.auth import (
    CalendarConnectionStatusResponse,
    CalendarConnectStartRequest,
    CalendarConnectStartResponse,
    Token,
    TokenRefreshRequest,
    UserResponse,
    PasswordChangeRequest,
    PasswordChangeResponse,
    SSORegistrationRequest,
    ReleaseNotesAckRequest,
    ReleaseNotesAckResponse,
)
from app.models.user import User
from sqlalchemy.orm import joinedload

router = APIRouter()
logger = logging.getLogger(__name__)

OIDC_FLOW_COOKIE_NAME = "eob_oidc_flow"


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    """
    Login endpoint - authenticate user and return JWT access token.

    Uses OAuth2 password flow:
    - username: user's email address
    - password: user's password

    Returns JWT access token on successful authentication.
    """
    try:
        user = authenticate_user(db, form_data.username, form_data.password)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        access_token = create_access_token(
            data={"sub": user.id, "role": user.role},
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        )
        refresh_token = create_refresh_token(data={"sub": user.id, "role": user.role})
        return Token(access_token=access_token, refresh_token=refresh_token, token_type="bearer")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Login failed: %s", e)
        detail = "Internal server error during login."
        if settings.DEBUG:
            detail += f" Debug: {type(e).__name__}: {e}"
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=detail)


@router.post("/refresh", response_model=Token)
async def refresh_token(body: TokenRefreshRequest, db: Session = Depends(get_db)):
    """
    Refresh access token using a valid refresh token.

    Accepts a refresh token in the request body.
    Returns new access and refresh tokens.
    """
    payload = decode_token(body.refresh_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    new_access_token = create_access_token(
        data={"sub": user.id, "role": user.role},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    new_refresh_token = create_refresh_token(data={"sub": user.id, "role": user.role})
    return Token(access_token=new_access_token, refresh_token=new_refresh_token, token_type="bearer")


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get current authenticated user info with full profile details.

    Requires a valid Bearer token in Authorization header.
    Returns the authenticated user's profile information including department, sub_team, position, and business unit.
    """
    # Reload user with relationships
    user = (
        db.query(User)
        .options(
            joinedload(User.department),
            joinedload(User.sub_team),
            joinedload(User.position),
            joinedload(User.primary_business_unit),
        )
        .filter(User.id == current_user.id)
        .first()
    )

    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        korean_name=user.korean_name,
        role=user.role,
        sub_team_id=user.sub_team_id,
        position_id=user.position_id,
        department_id=user.department_id,
        primary_business_unit_id=user.primary_business_unit_id,
        seen_release_note_version=user.seen_release_note_version,
        is_active=user.is_active,
        department={
            "id": user.department.id,
            "name": user.department.name,
            "code": user.department.code,
        }
        if user.department
        else None,
        sub_team={
            "id": user.sub_team.id,
            "name": user.sub_team.name,
            "code": user.sub_team.code,
        }
        if user.sub_team
        else None,
        position={
            "id": user.position.id,
            "name": user.position.name,
            "level": user.position.level,
        }
        if user.position
        else None,
        primary_business_unit={
            "id": user.primary_business_unit.id,
            "name": user.primary_business_unit.name,
            "code": user.primary_business_unit.code,
        }
        if user.primary_business_unit
        else None,
    )


@router.post("/release-notes/ack", response_model=ReleaseNotesAckResponse)
async def acknowledge_release_notes(
    body: ReleaseNotesAckRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Persist the latest release note version seen by the current user.
    """
    current_user.seen_release_note_version = body.version
    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    return ReleaseNotesAckResponse(
        success=True,
        seen_release_note_version=current_user.seen_release_note_version,
    )


@router.post("/change-password", response_model=PasswordChangeResponse)
async def change_password(
    password_data: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Change user's password.

    Requires:
    - Valid Bearer token in Authorization header
    - Current password (for verification)
    - New password (minimum 6 characters)

    Returns success message on successful password change.
    """
    # Verify current password
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    # Validate new password
    if len(password_data.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters long",
        )

    # Update password
    current_user.hashed_password = get_password_hash(password_data.new_password)
    db.add(current_user)
    db.flush()
    db.commit()

    # Verify the change persisted
    db.refresh(current_user)
    if not verify_password(password_data.new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Password change failed to persist. Please try again.",
        )

    return PasswordChangeResponse(
        message="Password changed successfully",
        success=True,
    )


def _validate_redirect_url(redirect_url: str | None) -> str | None:
    """Validate redirect URL against whitelist of allowed domains."""
    if not redirect_url:
        return None
    from urllib.parse import urlparse
    parsed = urlparse(redirect_url)
    allowed_patterns = [
        ".10.182.252.32.sslip.io",
        ".atlascopco.group",
        ".edwardsvacuum.com",
        "localhost",
    ]
    hostname = parsed.hostname or ""
    if any(hostname.endswith(p) or hostname == p.lstrip(".") for p in allowed_patterns):
        return redirect_url
    logger.warning(f"Auth redirect blocked for disallowed domain: {hostname}")
    return None


def _append_query_params(url: str, **params: str) -> str:
    """Append or replace query parameters while preserving existing ones."""
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.update({key: value for key, value in params.items() if value is not None})
    return urlunparse(parsed._replace(query=urlencode(query)))


def _parse_requested_scopes(scopes: str | None) -> list[str]:
    """Parse comma or space separated scope list."""
    if not scopes:
        return []
    normalized = scopes.replace(",", " ")
    return [scope.strip() for scope in normalized.split() if scope.strip()]


def _frontend_base_url(request: Request) -> str:
    """Resolve the frontend base URL used for auth redirects."""
    if settings.DEBUG:
        return "http://localhost:3004"
    scheme = "https" if request.url.scheme == "https" or not settings.DEBUG else "http"
    return f"{scheme}://{request.url.netloc}"


def _create_oidc_flow_token(flow: dict, redirect_url: str | None) -> str:
    """Sign the transient OIDC auth-code flow state into a short-lived JWT cookie."""
    payload = {
        "type": "oidc_flow",
        "flow": flow,
        "redirect_url": redirect_url,
        "flow_type": flow.get("_app_flow_type", "login"),
        "link_user_id": flow.get("_app_link_user_id"),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def _decode_oidc_flow_token(token: str | None) -> dict | None:
    """Decode and validate the transient OIDC auth-code flow state cookie."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != "oidc_flow":
        return None
    return payload


def _set_flow_cookie(response: RedirectResponse, flow_token: str) -> None:
    """Persist auth-code flow state securely across the OIDC round-trip."""
    response.set_cookie(
        key=OIDC_FLOW_COOKIE_NAME,
        value=flow_token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        max_age=600,
        path="/",
    )


def _clear_flow_cookie(response: RedirectResponse) -> None:
    """Remove the transient OIDC flow cookie after callback completes."""
    response.delete_cookie(
        key=OIDC_FLOW_COOKIE_NAME,
        path="/",
        secure=not settings.DEBUG,
        httponly=True,
        samesite="lax",
    )


async def _start_oidc_login(request: Request, redirect: str | None = None, scopes: str | None = None):
    """Start the OIDC authorization-code flow and persist state in a secure cookie."""
    if not settings.OIDC_ENABLED:
        raise HTTPException(status_code=400, detail="OIDC is not enabled")

    validated_redirect = _validate_redirect_url(redirect)
    try:
        flow = OIDCService.initiate_auth_code_flow(
            extra_scopes=_parse_requested_scopes(scopes),
            redirect_uri=settings.OIDC_REDIRECT_URI.strip(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    response = RedirectResponse(flow["auth_uri"])
    _set_flow_cookie(response, _create_oidc_flow_token(flow, validated_redirect))
    return response


async def _start_oidc_calendar_connect(current_user: User, redirect_url: str | None = None):
    """Start incremental consent for Microsoft Calendar access and persist flow in a cookie."""
    validated_redirect = _validate_redirect_url(redirect_url)
    try:
        flow = OIDCService.initiate_auth_code_flow(
            extra_scopes=["Calendars.Read"],
            redirect_uri=settings.OIDC_REDIRECT_URI.strip(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    flow["_app_flow_type"] = "calendar_connect"
    flow["_app_link_user_id"] = current_user.id

    response = JSONResponse(
        CalendarConnectStartResponse(authorization_url=flow["auth_uri"]).model_dump()
    )
    _set_flow_cookie(response, _create_oidc_flow_token(flow, validated_redirect))
    return response


async def _handle_oidc_callback(request: Request, db: Session):
    """Complete the OIDC auth-code flow, then issue EOB JWTs and redirect to the frontend."""
    if not settings.OIDC_ENABLED:
        raise HTTPException(status_code=400, detail="OIDC is not enabled")

    flow_payload = _decode_oidc_flow_token(request.cookies.get(OIDC_FLOW_COOKIE_NAME))
    if flow_payload is None:
        raise HTTPException(status_code=400, detail="Missing or invalid OIDC flow state")

    auth_response = dict(request.query_params)
    try:
        token_result = OIDCService.exchange_code_for_token(
            flow=flow_payload["flow"],
            auth_response=auth_response,
            redirect_uri=settings.OIDC_REDIRECT_URI.strip(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if token_result.get("error"):
        logger.error("OIDC token exchange failed: %s", token_result)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"OIDC authentication failed: {token_result.get('error_description') or token_result['error']}",
        )

    user_info = OIDCService.extract_user_attributes(token_result)
    email = user_info.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Email not found in OIDC claims")

    flow_type = flow_payload.get("flow_type") or "login"
    if flow_type == "calendar_connect":
        link_user_id = flow_payload.get("link_user_id")
        if not link_user_id:
            raise HTTPException(status_code=400, detail="Missing linked user for calendar connect")

        linked_user = db.query(User).filter(User.id == link_user_id).first()
        if linked_user is None or not linked_user.is_active:
            raise HTTPException(status_code=400, detail="Linked user is missing or inactive")

        if linked_user.email.lower() != email.lower():
            logger.warning(
                "OIDC calendar connect email mismatch: expected %s but got %s",
                linked_user.email,
                email,
            )
            frontend_base = _frontend_base_url(request)
            redirect_target = _validate_redirect_url(flow_payload.get("redirect_url"))
            base_target = redirect_target or f"{frontend_base}/worklogs"
            response = RedirectResponse(
                url=_append_query_params(base_target, calendar="account-mismatch"),
                status_code=status.HTTP_302_FOUND,
            )
            _clear_flow_cookie(response)
            return response

        OAuthConnectionService.upsert_microsoft_connection(
            db,
            user=linked_user,
            provider_subject=user_info.get("provider_id"),
            provider_email=email,
            tenant_id=user_info.get("tenant_id"),
            granted_scopes=OIDCService.granted_scopes(token_result),
            refresh_token=token_result.get("refresh_token"),
            access_token=token_result.get("access_token"),
            expires_in_seconds=token_result.get("expires_in"),
        )

        frontend_base = _frontend_base_url(request)
        redirect_target = _validate_redirect_url(flow_payload.get("redirect_url"))
        base_target = redirect_target or f"{frontend_base}/worklogs"
        response = RedirectResponse(
            url=_append_query_params(base_target, calendar="connected"),
            status_code=status.HTTP_302_FOUND,
        )
        _clear_flow_cookie(response)
        return response

    from sqlalchemy import func

    user = db.query(User).filter(func.lower(User.email) == func.lower(email)).first()
    frontend_base = _frontend_base_url(request)

    if not user:
        logger.info("OIDC: Unregistered user %s, redirecting to registration", email)
        reg_token = create_registration_token(
            {
                "email": email,
                "name": user_info.get("name", ""),
                "provider_id": user_info.get("provider_id", ""),
            }
        )
        response = RedirectResponse(
            url=f"{frontend_base}/register?token={reg_token}",
            status_code=status.HTTP_302_FOUND,
        )
        _clear_flow_cookie(response)
        return response

    if not user.is_active:
        logger.warning("OIDC login attempt for inactive user: %s", email)
        response = RedirectResponse(
            url=f"{frontend_base}/login?error=inactive&email={quote(email)}",
            status_code=status.HTTP_302_FOUND,
        )
        _clear_flow_cookie(response)
        return response

    OAuthConnectionService.upsert_microsoft_connection(
        db,
        user=user,
        provider_subject=user_info.get("provider_id"),
        provider_email=email,
        tenant_id=user_info.get("tenant_id"),
        granted_scopes=OIDCService.granted_scopes(token_result),
        refresh_token=token_result.get("refresh_token"),
        access_token=token_result.get("access_token"),
        expires_in_seconds=token_result.get("expires_in"),
    )

    access_token = create_access_token(
        data={"sub": user.id, "role": user.role},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_token = create_refresh_token(data={"sub": user.id, "role": user.role})

    redirect_target = _validate_redirect_url(flow_payload.get("redirect_url"))
    if redirect_target:
        redirect_url = f"{redirect_target.rstrip('/')}/#token={access_token}&refresh={refresh_token}"
    else:
        redirect_url = f"{frontend_base}/#token={access_token}&refresh={refresh_token}"

    response = RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)
    _clear_flow_cookie(response)
    return response


@router.get("/sso/login")
@router.get("/oidc/login")
async def sso_login(request: Request, redirect: str | None = None, scopes: str | None = None):
    """
    Initiate the Microsoft Entra ID auth-code flow.
    `/sso/login` remains as a compatibility alias for the frontend.
    """
    return await _start_oidc_login(request, redirect=redirect, scopes=scopes)


@router.get("/sso/callback")
@router.get("/oidc/callback")
async def sso_callback(request: Request, db: Session = Depends(get_db)):
    """
    Authentication callback endpoint.
    `/sso/callback` remains as a compatibility alias, but the flow is OIDC-only.
    """
    return await _handle_oidc_callback(request, db)


@router.post("/sso/register", response_model=Token)
async def sso_register(body: SSORegistrationRequest, db: Session = Depends(get_db)):
    """
    SSO self-registration endpoint.
    Creates a new user from a valid registration token (issued during SSO callback for unregistered users).
    """
    import secrets
    from sqlalchemy import func
    from app.services.user_service import UserService
    from app.schemas.user import UserCreate
    from app.models.organization import Department, JobPosition

    # 1. Decode and validate registration token
    payload = decode_registration_token(body.registration_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired registration token. Please sign in with SSO again.",
        )

    email = payload.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid registration token: missing email",
        )

    # 2. Check for duplicate user
    existing_user = db.query(User).filter(func.lower(User.email) == func.lower(email)).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    # 3. Validate department_id and position_id
    department = db.query(Department).filter(Department.id == body.department_id).first()
    if not department:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid department selected.",
        )

    position = db.query(JobPosition).filter(JobPosition.id == body.position_id).first()
    if not position:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid position selected.",
        )

    # 4. Create user via UserService (handles UserHistory automatically)
    user_service = UserService(db)
    user_create = UserCreate(
        email=email,
        name=body.name,
        korean_name=body.korean_name,
        department_id=body.department_id,
        position_id=body.position_id,
        password=secrets.token_urlsafe(32),
        role="USER",
    )
    new_user = user_service.create_user(user_create)

    # 5. Issue tokens
    access_token = create_access_token(
        data={"sub": new_user.id, "role": new_user.role},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_token = create_refresh_token(data={"sub": new_user.id, "role": new_user.role})

    logger.info(f"SSO self-registration successful for {email}")
    return Token(access_token=access_token, refresh_token=refresh_token, token_type="bearer")


@router.get("/oidc/calendar/status", response_model=CalendarConnectionStatusResponse)
async def get_calendar_connection_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the persisted Microsoft Calendar consent status for the current user."""
    connection = OAuthConnectionService.get_connection(db, user_id=current_user.id)
    return CalendarConnectionStatusResponse(**OAuthConnectionService.serialize_status(connection))


@router.post("/oidc/calendar/connect", response_model=CalendarConnectStartResponse)
async def start_calendar_connect(
    body: CalendarConnectStartRequest,
    current_user: User = Depends(get_current_user),
):
    """Start incremental consent for Microsoft Calendar access."""
    return await _start_oidc_calendar_connect(current_user, redirect_url=body.redirect_url)


@router.delete("/oidc/calendar/connect", response_model=CalendarConnectionStatusResponse)
async def disconnect_calendar_connect(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disconnect the stored Microsoft Calendar delegated token for the current user."""
    OAuthConnectionService.disconnect_microsoft_connection(db, user_id=current_user.id)
    return CalendarConnectionStatusResponse(
        **OAuthConnectionService.serialize_status(
            OAuthConnectionService.get_connection(db, user_id=current_user.id)
        )
    )
