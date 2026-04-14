import { NextRequest, NextResponse } from "next/server";

import { getGatewayMode } from "@/lib/gateway-config";
import {
  createPortalHandoffToken,
  getPortalSession,
} from "@/lib/portal-auth";
import { findPortalServiceById } from "@/lib/services";

export const dynamic = "force-dynamic";

interface HandoffRequestBody {
  service?: string;
}

export async function POST(request: NextRequest) {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json(
      { detail: "Portal login is required before issuing a handoff token." },
      { status: 401 },
    );
  }

  let body: HandoffRequestBody;
  try {
    body = (await request.json()) as HandoffRequestBody;
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body." }, { status: 400 });
  }

  const service = body.service ? findPortalServiceById(body.service) : undefined;
  if (!service || !service.gatewayAudience) {
    return NextResponse.json(
      { detail: "Unknown or unsupported gateway service." },
      { status: 400 },
    );
  }

  try {
    const handoff = await createPortalHandoffToken(session, service.gatewayAudience);
    return NextResponse.json({
      service: service.id,
      audience: service.gatewayAudience,
      gatewayMode: getGatewayMode(service.gatewayAudience),
      targetUrl: service.url,
      handoffToken: handoff.token,
      expiresAt: handoff.expiresAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Failed to issue portal handoff token.",
      },
      { status: 503 },
    );
  }
}
