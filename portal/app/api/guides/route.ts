import { NextRequest, NextResponse } from "next/server";
import { listGuides, createGuide } from "@/lib/guides-store";
import { requireGuideWriteAccess } from "@/lib/guide-write-guard";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category") || undefined;
  const search = searchParams.get("search") || undefined;
  return NextResponse.json(listGuides(category, search));
}

export async function POST(request: NextRequest) {
  const denied = requireGuideWriteAccess(request);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  if (
    !body ||
    !isNonEmptyString(body.title) ||
    !isNonEmptyString(body.category) ||
    !isNonEmptyString(body.content)
  ) {
    return NextResponse.json(
      { error: "Invalid guide payload." },
      { status: 400 },
    );
  }

  const guide = createGuide({
    title: body.title.trim(),
    category: body.category.trim(),
    content: body.content.trim(),
    author: isNonEmptyString(body.author) ? body.author.trim() : "admin",
  });
  return NextResponse.json(guide, { status: 201 });
}
