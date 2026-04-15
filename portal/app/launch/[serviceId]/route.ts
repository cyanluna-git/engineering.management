import { NextRequest, NextResponse } from "next/server";

import { getGatewayMode } from "@/lib/gateway-config";
import {
  buildPortalUrl,
  createPortalHandoffToken,
  getPortalSessionFromRequest,
} from "@/lib/portal-auth";
import { findPortalServiceById } from "@/lib/services";

export const dynamic = "force-dynamic";

interface RelayTokenPair {
  access_token: string;
  refresh_token: string;
}

interface LaunchRouteParams {
  params: Promise<{
    serviceId: string;
  }>;
}

function buildTokenRelayDestination(
  targetUrl: string,
  relay: RelayTokenPair,
  mode: "fragment" | "query",
) {
  const destination = new URL(targetUrl);
  const params = new URLSearchParams({
    token: relay.access_token,
    refresh: relay.refresh_token,
  }).toString();

  if (mode === "query") {
    destination.search = params;
  } else {
    destination.hash = params;
  }

  return destination;
}

async function exchangeRelaySessionForAudience(
  handoffToken: string,
  audience: "eob",
) {
  const relaySource = findPortalServiceById("eob-dashboard");
  if (!relaySource) {
    throw new Error("EOB relay source is not registered.");
  }

  const exchangePath =
    audience === "eob" ? "/api/auth/gateway/relay-login" : "/api/auth/gateway/login";
  const exchangeUrl = new URL(exchangePath, relaySource.url);
  const response = await fetch(exchangeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ handoff_token: handoffToken }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | Partial<RelayTokenPair> & { detail?: string }
    | null;
  if (!response.ok) {
    throw new Error(payload?.detail || "Relay session exchange failed.");
  }
  if (!payload?.access_token || !payload.refresh_token) {
    throw new Error("Relay session exchange returned an invalid token pair.");
  }

  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
  } satisfies RelayTokenPair;
}

export async function GET(request: NextRequest, context: LaunchRouteParams) {
  const { serviceId } = await context.params;
  const service = findPortalServiceById(serviceId);
  if (!service || !service.launchPath) {
    return NextResponse.redirect(buildPortalUrl("/"));
  }

  const session = await getPortalSessionFromRequest(request);
  if (!session) {
    const loginUrl = buildPortalUrl("/auth/login");
    loginUrl.searchParams.set("returnTo", service.launchPath);
    return NextResponse.redirect(loginUrl);
  }

  if (service.tokenRelayAudience && service.tokenRelay) {
    try {
      const handoff = await createPortalHandoffToken(
        session,
        service.tokenRelayAudience,
      );
      if (service.tokenRelayAudience !== "eob") {
        throw new Error("Unsupported relay audience.");
      }
      const relaySession = await exchangeRelaySessionForAudience(
        handoff.token,
        service.tokenRelayAudience,
      );
      return NextResponse.redirect(
        buildTokenRelayDestination(service.url, relaySession, service.tokenRelay),
      );
    } catch {
      const destination = buildPortalUrl("/");
      destination.searchParams.set("launchError", "handoff-not-ready");
      destination.searchParams.set("service", service.id);
      return NextResponse.redirect(destination);
    }
  }

  if (!service.gatewayAudience || getGatewayMode(service.gatewayAudience) === "direct") {
    return NextResponse.redirect(service.url);
  }

  try {
    const handoff = await createPortalHandoffToken(session, service.gatewayAudience);
    const destination = new URL("/auth/gateway", service.url);
    destination.searchParams.set("handoff", handoff.token);
    destination.searchParams.set(
      "returnTo",
      service.defaultReturnPath || "/",
    );
    return NextResponse.redirect(destination);
  } catch {
    const destination = buildPortalUrl("/");
    destination.searchParams.set("launchError", "handoff-not-ready");
    destination.searchParams.set("service", service.id);
    return NextResponse.redirect(destination);
  }
}
