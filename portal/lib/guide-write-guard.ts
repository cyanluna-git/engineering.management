import { NextRequest, NextResponse } from "next/server";
import { getPortalSessionFromRequest } from "@/lib/portal-auth";

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

export async function requireGuideWriteAccess(
  request: NextRequest,
): Promise<NextResponse | null> {
  // Accept legacy admin token
  const configuredToken = process.env.PORTAL_GUIDE_WRITE_TOKEN?.trim();
  const providedToken = request.headers.get(GUIDE_ADMIN_HEADER);
  if (configuredToken && providedToken === configuredToken) {
    return null;
  }

  // Accept any active portal OIDC session
  const session = await getPortalSessionFromRequest(request);
  if (session) {
    return null;
  }

  // Neither auth method passed
  const policy = getGuideWritePolicy();
  return NextResponse.json(
    {
      error: "Authentication required. Provide a valid session or admin token.",
      policy,
    },
    { status: 401 },
  );
}
