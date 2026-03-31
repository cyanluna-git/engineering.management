import { NextRequest, NextResponse } from "next/server";
import {
  getPortalHealthSummary,
  shouldProbeServices,
} from "@/lib/portal-health";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const probe = shouldProbeServices(request.nextUrl.searchParams.get("probe"));
  const health = await getPortalHealthSummary({ probe });
  return NextResponse.json(health);
}
