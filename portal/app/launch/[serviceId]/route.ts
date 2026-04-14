import { NextRequest, NextResponse } from "next/server";

import { getGatewayMode } from "@/lib/gateway-config";
import { getPortalSessionFromRequest } from "@/lib/portal-auth";
import { findPortalServiceById } from "@/lib/services";

export const dynamic = "force-dynamic";

interface LaunchRouteParams {
  params: Promise<{
    serviceId: string;
  }>;
}

export async function GET(request: NextRequest, context: LaunchRouteParams) {
  const { serviceId } = await context.params;
  const service = findPortalServiceById(serviceId);
  if (!service || !service.launchPath) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const session = await getPortalSessionFromRequest(request);
  if (!session) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("returnTo", service.launchPath);
    return NextResponse.redirect(loginUrl);
  }

  if (!service.gatewayAudience || getGatewayMode(service.gatewayAudience) === "direct") {
    return NextResponse.redirect(service.url);
  }

  const destination = new URL("/", request.url);
  destination.searchParams.set("launchError", "handoff-not-ready");
  destination.searchParams.set("service", service.id);
  return NextResponse.redirect(destination);
}
