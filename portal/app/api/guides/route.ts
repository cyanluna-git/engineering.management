import { NextRequest, NextResponse } from "next/server";
import { listGuides, createGuide } from "@/lib/guides-store";

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category") || undefined;
  const search = searchParams.get("search") || undefined;
  return NextResponse.json(listGuides(category, search));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const guide = createGuide({ ...body, author: body.author || "admin" });
  return NextResponse.json(guide, { status: 201 });
}
