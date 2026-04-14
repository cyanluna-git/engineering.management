import { NextRequest } from "next/server";

import { createPortalLoginResponse } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return createPortalLoginResponse(request);
}
