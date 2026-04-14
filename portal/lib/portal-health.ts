import { getGuideWritePolicy } from "@/lib/guide-write-guard";
import { getGatewayHealth } from "@/lib/gateway-config";
import { getPortalAuthHealth } from "@/lib/portal-auth";
import { getGuideStoreInfo } from "@/lib/guides-store";
import { PORTAL_SERVICES, type PortalService } from "@/lib/services";

type ServiceHealthStatus = "internal" | "configured" | "ok" | "degraded";

interface ServiceHealthEntry {
  id: string;
  name: string;
  category: PortalService["category"];
  destination: PortalService["destination"];
  url: string;
  status: ServiceHealthStatus;
  detail: string;
  httpStatus?: number;
  responseTimeMs?: number;
}

async function probeRemoteService(
  service: PortalService,
): Promise<ServiceHealthEntry> {
  const startedAt = Date.now();

  try {
    let response: Response;

    try {
      response = await fetch(service.url, {
        method: "HEAD",
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(2500),
      });
    } catch {
      response = await fetch(service.url, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(2500),
      });
    }

    const ok = response.ok || (response.status >= 300 && response.status < 400);

    return {
      id: service.id,
      name: service.name,
      category: service.category,
      destination: service.destination,
      url: service.url,
      status: ok ? "ok" : "degraded",
      detail: ok
        ? "Remote service responded to probe."
        : `Remote service returned HTTP ${response.status}.`,
      httpStatus: response.status,
      responseTimeMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      id: service.id,
      name: service.name,
      category: service.category,
      destination: service.destination,
      url: service.url,
      status: "degraded",
      detail:
        error instanceof Error ? error.message : "Remote health probe failed.",
      responseTimeMs: Date.now() - startedAt,
    };
  }
}

async function summarizeService(
  service: PortalService,
  probe: boolean,
): Promise<ServiceHealthEntry> {
  if (service.destination === "internal") {
    return {
      id: service.id,
      name: service.name,
      category: service.category,
      destination: service.destination,
      url: service.url,
      status: "internal",
      detail: "Served inside the portal runtime.",
    };
  }

  if (!probe) {
    return {
      id: service.id,
      name: service.name,
      category: service.category,
      destination: service.destination,
      url: service.url,
      status: "configured",
      detail: "Live probe skipped. Pass ?probe=1 to attempt remote checks.",
    };
  }

  return probeRemoteService(service);
}

export function shouldProbeServices(value: string | null): boolean {
  return value === "1" || value === "true" || value === "live";
}

export async function getPortalHealthSummary(options?: { probe?: boolean }) {
  const probe = options?.probe ?? false;
  const services = await Promise.all(
    PORTAL_SERVICES.map((service) => summarizeService(service, probe)),
  );

  const summary = services.reduce(
    (acc, service) => {
      acc.total += 1;
      acc[service.status] += 1;
      return acc;
    },
    {
      total: 0,
      internal: 0,
      configured: 0,
      ok: 0,
      degraded: 0,
    },
  );

  return {
    checkedAt: new Date().toISOString(),
    probeMode: probe ? "live" : "summary",
    guideStore: getGuideStoreInfo(),
    guideWritePolicy: getGuideWritePolicy(),
    auth: getPortalAuthHealth(),
    gateway: getGatewayHealth(),
    summary,
    services,
  };
}
