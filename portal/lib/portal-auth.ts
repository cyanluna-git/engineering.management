import "server-only";

import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { JWTPayload, SignJWT, createRemoteJWKSet, jwtVerify } from "jose";

import { GatewayTarget, getGatewayTokenTtlSeconds } from "@/lib/gateway-config";

const FLOW_COOKIE_NAME = "portal_oidc_flow";
const SESSION_COOKIE_NAME = "portal_session";
const SESSION_ALGORITHM = "HS256";
const FLOW_MAX_AGE_SECONDS = 60 * 10;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const encoder = new TextEncoder();

interface OidcMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
}

interface PortalFlowClaims extends JWTPayload {
  type: "portal_oidc_flow";
  state: string;
  nonce: string;
  returnTo: string;
}

interface PortalSessionClaims extends JWTPayload {
  type: "portal_session";
  email: string;
  name: string;
  providerId?: string;
  tenantId?: string;
  grantedScopes?: string[];
  idToken?: string;
}

export interface PortalSession {
  subject: string;
  email: string;
  name: string;
  providerId: string | null;
  tenantId: string | null;
  grantedScopes: string[];
  idToken: string | null;
  expiresAt: string | null;
}

export interface PortalAuthHealth {
  enabled: boolean;
  oidcConfigured: boolean;
  sessionSecretConfigured: boolean;
  handoffSigningConfigured: boolean;
  redirectUri: string;
  postLogoutRedirectUri: string;
  scopes: string[];
}

interface PortalTokenResponse {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  scope?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

let oidcMetadataPromise: Promise<OidcMetadata> | null = null;
let oidcJwks:
  | ReturnType<typeof createRemoteJWKSet>
  | null = null;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function readEnv(name: string): string {
  return process.env[name]?.trim() || "";
}

function isTruthy(value: string): boolean {
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function isPortalOidcEnabled(): boolean {
  return isTruthy(readEnv("PORTAL_OIDC_ENABLED"));
}

function getPortalOidcAuthority(): string {
  const configuredAuthority = readEnv("PORTAL_OIDC_AUTHORITY");
  if (configuredAuthority) {
    return configuredAuthority.replace(/\/+$/, "");
  }

  const tenantId = readEnv("PORTAL_OIDC_TENANT_ID");
  if (!tenantId) {
    return "";
  }
  return `https://login.microsoftonline.com/${tenantId}`;
}

function getPortalOidcDiscoveryUrl(): string {
  const authority = getPortalOidcAuthority();
  if (!authority) {
    return "";
  }
  if (authority.endsWith("/v2.0")) {
    return `${authority}/.well-known/openid-configuration`;
  }
  return `${authority}/v2.0/.well-known/openid-configuration`;
}

function getPortalOidcClientId(): string {
  return readEnv("PORTAL_OIDC_CLIENT_ID");
}

function getPortalOidcClientSecret(): string {
  return readEnv("PORTAL_OIDC_CLIENT_SECRET");
}

function getPortalSessionSecret(): string {
  return readEnv("PORTAL_SESSION_SECRET");
}

function getPortalHandoffSigningKey(): string {
  return readEnv("PORTAL_HANDOFF_SIGNING_KEY");
}

export function getPortalOidcRedirectUri(): string {
  return (
    readEnv("PORTAL_OIDC_REDIRECT_URI") || "http://localhost:3000/auth/callback"
  );
}

export function getPortalOidcPostLogoutRedirectUri(): string {
  return readEnv("PORTAL_OIDC_POST_LOGOUT_REDIRECT_URI") || "http://localhost:3000/";
}

export function getPortalOidcScopes(): string[] {
  const rawScopes =
    readEnv("PORTAL_OIDC_SCOPES") ||
    "openid,profile,email,offline_access,User.Read";
  const normalized = rawScopes.replace(/,/g, " ").split(/\s+/);
  return normalized.filter(Boolean);
}

function requirePortalOidcConfig(): void {
  if (!isPortalOidcEnabled()) {
    throw new Error("Portal OIDC is disabled.");
  }
  if (!getPortalOidcClientId()) {
    throw new Error("PORTAL_OIDC_CLIENT_ID is required.");
  }
  if (!getPortalOidcClientSecret()) {
    throw new Error("PORTAL_OIDC_CLIENT_SECRET is required.");
  }
  if (!getPortalOidcAuthority()) {
    throw new Error("PORTAL_OIDC_TENANT_ID or PORTAL_OIDC_AUTHORITY is required.");
  }
  if (getPortalSessionSecret().length < 32) {
    throw new Error("PORTAL_SESSION_SECRET must be at least 32 characters.");
  }
}

function buildPortalSecret(secret: string): Uint8Array {
  return encoder.encode(secret);
}

function normalizeReturnTo(input: string | null): string {
  if (!input || !input.startsWith("/") || input.startsWith("//")) {
    return "/";
  }

  try {
    const url = new URL(input, "http://portal.local");
    if (url.origin !== "http://portal.local") {
      return "/";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function normalizeScopes(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const deduped: string[] = [];
  for (const scope of value.replace(/,/g, " ").split(/\s+/)) {
    const cleaned = scope.trim();
    if (cleaned && !deduped.includes(cleaned)) {
      deduped.push(cleaned);
    }
  }
  return deduped;
}

function parseFlowClaims(payload: JWTPayload): PortalFlowClaims | null {
  if (
    payload.type !== "portal_oidc_flow" ||
    typeof payload.state !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.returnTo !== "string"
  ) {
    return null;
  }

  return {
    ...payload,
    type: "portal_oidc_flow",
    state: payload.state,
    nonce: payload.nonce,
    returnTo: payload.returnTo,
  };
}

function parseSessionClaims(payload: JWTPayload): PortalSessionClaims | null {
  if (
    payload.type !== "portal_session" ||
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.name !== "string"
  ) {
    return null;
  }

  const grantedScopes = Array.isArray(payload.grantedScopes)
    ? payload.grantedScopes.filter(
        (scope): scope is string => typeof scope === "string" && Boolean(scope),
      )
    : [];

  return {
    ...payload,
    type: "portal_session",
    email: payload.email,
    name: payload.name,
    providerId:
      typeof payload.providerId === "string" ? payload.providerId : undefined,
    tenantId: typeof payload.tenantId === "string" ? payload.tenantId : undefined,
    grantedScopes,
    idToken: typeof payload.idToken === "string" ? payload.idToken : undefined,
  };
}

function toPortalSession(payload: PortalSessionClaims): PortalSession {
  return {
    subject: payload.sub as string,
    email: payload.email,
    name: payload.name,
    providerId: payload.providerId || null,
    tenantId: payload.tenantId || null,
    grantedScopes: payload.grantedScopes || [],
    idToken: payload.idToken || null,
    expiresAt:
      typeof payload.exp === "number"
        ? new Date(payload.exp * 1000).toISOString()
        : null,
  };
}

async function signPortalCookieToken(
  claims: Record<string, string | string[]>,
  type: PortalFlowClaims["type"] | PortalSessionClaims["type"],
  subject: string,
  maxAgeSeconds: number,
): Promise<string> {
  return new SignJWT({ ...claims, type })
    .setProtectedHeader({ alg: SESSION_ALGORITHM })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(buildPortalSecret(getPortalSessionSecret()));
}

async function verifyPortalCookieToken(token: string): Promise<JWTPayload | null> {
  const secret = getPortalSessionSecret();
  if (!secret || secret.length < 32) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, buildPortalSecret(secret), {
      algorithms: [SESSION_ALGORITHM],
    });
    return payload;
  } catch {
    return null;
  }
}

function setCookie(
  response: NextResponse,
  name: string,
  value: string,
  maxAge: number,
): void {
  response.cookies.set({
    name,
    value,
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

function clearCookie(response: NextResponse, name: string): void {
  response.cookies.set({
    name,
    value: "",
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

async function readPortalFlowToken(token: string | undefined): Promise<PortalFlowClaims | null> {
  if (!token) {
    return null;
  }

  const payload = await verifyPortalCookieToken(token);
  if (!payload) {
    return null;
  }
  return parseFlowClaims(payload);
}

async function readPortalSessionToken(
  token: string | undefined,
): Promise<PortalSession | null> {
  if (!token) {
    return null;
  }

  const payload = await verifyPortalCookieToken(token);
  if (!payload) {
    return null;
  }

  const claims = parseSessionClaims(payload);
  if (!claims) {
    return null;
  }

  return toPortalSession(claims);
}

async function getOidcMetadata(): Promise<OidcMetadata> {
  requirePortalOidcConfig();
  if (!oidcMetadataPromise) {
    const discoveryUrl = getPortalOidcDiscoveryUrl();
    oidcMetadataPromise = fetch(discoveryUrl, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to load portal OIDC metadata: HTTP ${response.status}`,
          );
        }

        const metadata = (await response.json()) as Partial<OidcMetadata>;
        if (
          !metadata.authorization_endpoint ||
          !metadata.token_endpoint ||
          !metadata.jwks_uri ||
          !metadata.issuer
        ) {
          throw new Error("Portal OIDC metadata response is incomplete.");
        }

        return {
          issuer: metadata.issuer,
          authorization_endpoint: metadata.authorization_endpoint,
          token_endpoint: metadata.token_endpoint,
          jwks_uri: metadata.jwks_uri,
          end_session_endpoint: metadata.end_session_endpoint,
        };
      })
      .catch((error) => {
        oidcMetadataPromise = null;
        oidcJwks = null;
        throw error;
      });
  }

  return oidcMetadataPromise;
}

async function verifyOidcIdToken(idToken: string, nonce: string): Promise<PortalSession> {
  const metadata = await getOidcMetadata();
  if (!oidcJwks) {
    oidcJwks = createRemoteJWKSet(new URL(metadata.jwks_uri));
  }

  const { payload } = await jwtVerify(idToken, oidcJwks, {
    audience: getPortalOidcClientId(),
    issuer: metadata.issuer,
  });

  if (payload.nonce !== nonce) {
    throw new Error("Portal OIDC nonce validation failed.");
  }

  const emailCandidate =
    (typeof payload.preferred_username === "string" &&
      payload.preferred_username) ||
    (typeof payload.email === "string" && payload.email) ||
    (typeof payload.upn === "string" && payload.upn);

  if (!emailCandidate) {
    throw new Error("Portal OIDC claims did not include an email address.");
  }

  return {
    subject: typeof payload.sub === "string" ? payload.sub : emailCandidate,
    email: emailCandidate,
    name:
      (typeof payload.name === "string" && payload.name) || emailCandidate,
    providerId:
      (typeof payload.oid === "string" && payload.oid) ||
      (typeof payload.sub === "string" ? payload.sub : null),
    tenantId:
      typeof payload.tid === "string" ? payload.tid : null,
    grantedScopes: [],
    idToken,
    expiresAt:
      typeof payload.exp === "number"
        ? new Date(payload.exp * 1000).toISOString()
        : null,
  };
}

async function exchangeAuthorizationCode(code: string): Promise<PortalTokenResponse> {
  const metadata = await getOidcMetadata();
  const body = new URLSearchParams({
    client_id: getPortalOidcClientId(),
    client_secret: getPortalOidcClientSecret(),
    code,
    grant_type: "authorization_code",
    redirect_uri: getPortalOidcRedirectUri(),
    scope: getPortalOidcScopes().join(" "),
  });

  const response = await fetch(metadata.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const tokenResult = (await response.json()) as PortalTokenResponse;
  if (!response.ok || tokenResult.error) {
    throw new Error(
      tokenResult.error_description ||
        tokenResult.error ||
        `Portal OIDC token exchange failed: HTTP ${response.status}`,
    );
  }

  return tokenResult;
}

function redirectToPortalStatus(
  request: NextRequest,
  params: Record<string, string>,
): NextResponse {
  const destination = new URL("/", request.url);
  for (const [key, value] of Object.entries(params)) {
    destination.searchParams.set(key, value);
  }
  return NextResponse.redirect(destination);
}

export async function getPortalSession(): Promise<PortalSession | null> {
  const cookieStore = await cookies();
  return readPortalSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export async function getPortalSessionFromRequest(
  request: NextRequest,
): Promise<PortalSession | null> {
  return readPortalSessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

export function getPortalAuthHealth(): PortalAuthHealth {
  const enabled = isPortalOidcEnabled();
  const sessionSecretConfigured = getPortalSessionSecret().length >= 32;
  const oidcConfigured = Boolean(
    getPortalOidcAuthority() &&
      getPortalOidcClientId() &&
      getPortalOidcClientSecret() &&
      sessionSecretConfigured,
  );

  return {
    enabled,
    oidcConfigured,
    sessionSecretConfigured,
    handoffSigningConfigured: getPortalHandoffSigningKey().length >= 32,
    redirectUri: getPortalOidcRedirectUri(),
    postLogoutRedirectUri: getPortalOidcPostLogoutRedirectUri(),
    scopes: getPortalOidcScopes(),
  };
}

export async function createPortalLoginResponse(
  request: NextRequest,
): Promise<NextResponse> {
  const returnTo = normalizeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const existingSession = await getPortalSessionFromRequest(request);
  if (existingSession) {
    return NextResponse.redirect(new URL(returnTo, request.url));
  }

  try {
    const metadata = await getOidcMetadata();
    const state = randomUUID();
    const nonce = randomUUID();
    const loginUrl = new URL(metadata.authorization_endpoint);
    loginUrl.searchParams.set("client_id", getPortalOidcClientId());
    loginUrl.searchParams.set("response_type", "code");
    loginUrl.searchParams.set("redirect_uri", getPortalOidcRedirectUri());
    loginUrl.searchParams.set("response_mode", "query");
    loginUrl.searchParams.set("scope", getPortalOidcScopes().join(" "));
    loginUrl.searchParams.set("state", state);
    loginUrl.searchParams.set("nonce", nonce);

    const flowToken = await signPortalCookieToken(
      {
        state,
        nonce,
        returnTo,
      },
      "portal_oidc_flow",
      state,
      FLOW_MAX_AGE_SECONDS,
    );

    const response = NextResponse.redirect(loginUrl);
    setCookie(response, FLOW_COOKIE_NAME, flowToken, FLOW_MAX_AGE_SECONDS);
    return response;
  } catch (error) {
    return redirectToPortalStatus(request, {
      authError:
        error instanceof Error && error.message.includes("disabled")
          ? "oidc-disabled"
          : "oidc-misconfigured",
    });
  }
}

export async function createPortalCallbackResponse(
  request: NextRequest,
): Promise<NextResponse> {
  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    const response = redirectToPortalStatus(request, { authError: "oidc-denied" });
    clearCookie(response, FLOW_COOKIE_NAME);
    return response;
  }

  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const flow = await readPortalFlowToken(request.cookies.get(FLOW_COOKIE_NAME)?.value);
  if (!flow || !state || flow.state !== state) {
    const response = redirectToPortalStatus(request, { authError: "invalid-state" });
    clearCookie(response, FLOW_COOKIE_NAME);
    clearCookie(response, SESSION_COOKIE_NAME);
    return response;
  }
  if (!code) {
    const response = redirectToPortalStatus(request, { authError: "missing-code" });
    clearCookie(response, FLOW_COOKIE_NAME);
    return response;
  }

  try {
    const tokenResult = await exchangeAuthorizationCode(code);
    if (!tokenResult.id_token) {
      throw new Error("Portal OIDC token response did not include an id_token.");
    }

    const verifiedSession = await verifyOidcIdToken(tokenResult.id_token, flow.nonce);
    const sessionToken = await signPortalCookieToken(
      {
        email: verifiedSession.email,
        name: verifiedSession.name,
        providerId: verifiedSession.providerId || "",
        tenantId: verifiedSession.tenantId || "",
        grantedScopes: normalizeScopes(tokenResult.scope),
        idToken: tokenResult.id_token,
      },
      "portal_session",
      verifiedSession.subject,
      SESSION_MAX_AGE_SECONDS,
    );

    const response = NextResponse.redirect(new URL(flow.returnTo, request.url));
    setCookie(response, SESSION_COOKIE_NAME, sessionToken, SESSION_MAX_AGE_SECONDS);
    clearCookie(response, FLOW_COOKIE_NAME);
    return response;
  } catch {
    const response = redirectToPortalStatus(request, { authError: "token-exchange" });
    clearCookie(response, FLOW_COOKIE_NAME);
    clearCookie(response, SESSION_COOKIE_NAME);
    return response;
  }
}

export async function createPortalLogoutResponse(
  request: NextRequest,
): Promise<NextResponse> {
  const currentSession = await getPortalSessionFromRequest(request);
  const fallbackResponse = redirectToPortalStatus(request, {
    authStatus: "signed-out",
  });
  clearCookie(fallbackResponse, FLOW_COOKIE_NAME);
  clearCookie(fallbackResponse, SESSION_COOKIE_NAME);

  if (!isPortalOidcEnabled()) {
    return fallbackResponse;
  }

  try {
    const metadata = await getOidcMetadata();
    if (!metadata.end_session_endpoint) {
      return fallbackResponse;
    }

    const logoutUrl = new URL(metadata.end_session_endpoint);
    logoutUrl.searchParams.set(
      "post_logout_redirect_uri",
      getPortalOidcPostLogoutRedirectUri(),
    );
    if (currentSession?.idToken) {
      logoutUrl.searchParams.set("id_token_hint", currentSession.idToken);
    }

    const response = NextResponse.redirect(logoutUrl);
    clearCookie(response, FLOW_COOKIE_NAME);
    clearCookie(response, SESSION_COOKIE_NAME);
    return response;
  } catch {
    return fallbackResponse;
  }
}

export async function createPortalHandoffToken(
  session: PortalSession,
  audience: GatewayTarget,
): Promise<{ token: string; expiresAt: string }> {
  const signingKey = getPortalHandoffSigningKey();
  if (signingKey.length < 32) {
    throw new Error("PORTAL_HANDOFF_SIGNING_KEY must be configured for handoff issuance.");
  }

  const ttlSeconds = getGatewayTokenTtlSeconds();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const token = await new SignJWT({
    type: "portal_handoff",
    email: session.email,
    name: session.name,
    oid: session.providerId || undefined,
    tid: session.tenantId || undefined,
    jti: randomUUID(),
  })
    .setProtectedHeader({ alg: SESSION_ALGORITHM })
    .setIssuer("pcas-portal")
    .setAudience(audience)
    .setSubject(session.email)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(buildPortalSecret(signingKey));

  return { token, expiresAt };
}
