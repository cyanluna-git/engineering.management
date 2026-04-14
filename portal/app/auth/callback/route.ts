import { NextRequest } from "next/server";

import { createPortalCallbackResponse } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return createPortalCallbackResponse(request);
}
