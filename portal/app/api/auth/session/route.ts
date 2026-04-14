import { NextResponse } from "next/server";

import { getPortalSession } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json(
      {
        authenticated: false,
      },
      { status: 401 },
    );
  }

  return NextResponse.json({
    authenticated: true,
    session,
  });
}
