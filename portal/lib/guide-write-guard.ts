import { NextRequest, NextResponse } from "next/server";

const GUIDE_ADMIN_HEADER = "x-portal-admin-token";

export interface GuideWritePolicy {
  enabled: boolean;
  header: string;
  mode: "disabled" | "token";
  reason: string;
}

export function getGuideWritePolicy(): GuideWritePolicy {
  const token = process.env.PORTAL_GUIDE_WRITE_TOKEN?.trim();

  if (!token) {
    return {
      enabled: false,
      header: GUIDE_ADMIN_HEADER,
      mode: "disabled",
      reason:
        "Guide write endpoints are temporarily disabled until PORTAL_GUIDE_WRITE_TOKEN is configured.",
    };
  }

  return {
    enabled: true,
    header: GUIDE_ADMIN_HEADER,
    mode: "token",
    reason: `Send ${GUIDE_ADMIN_HEADER} with the configured admin token to mutate guides.`,
  };
}

export function requireGuideWriteAccess(
  request: NextRequest,
): NextResponse | null {
  const configuredToken = process.env.PORTAL_GUIDE_WRITE_TOKEN?.trim();
  const policy = getGuideWritePolicy();

  if (!configuredToken) {
    return NextResponse.json(
      {
        error: "Guide write endpoints are temporarily disabled.",
        policy,
      },
      { status: 503 },
    );
  }

  const providedToken = request.headers.get(GUIDE_ADMIN_HEADER);
  if (providedToken !== configuredToken) {
    return NextResponse.json(
      {
        error: `Missing or invalid ${GUIDE_ADMIN_HEADER}.`,
        policy,
      },
      { status: 401 },
    );
  }

  return null;
}
