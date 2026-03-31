import { NextRequest, NextResponse } from "next/server";
import { getGuide, updateGuide, deleteGuide } from "@/lib/guides-store";
import { requireGuideWriteAccess } from "@/lib/guide-write-guard";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return params.then(({ id }) => {
    const guide = getGuide(id);
    if (!guide) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(guide);
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireGuideWriteAccess(request);
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Invalid guide payload." },
      { status: 400 },
    );
  }

  const nextGuide = {
    title: isNonEmptyString(body.title) ? body.title.trim() : undefined,
    category: isNonEmptyString(body.category) ? body.category.trim() : undefined,
    content: isNonEmptyString(body.content) ? body.content.trim() : undefined,
  };

  if (!nextGuide.title && !nextGuide.category && !nextGuide.content) {
    return NextResponse.json(
      { error: "At least one updatable field is required." },
      { status: 400 },
    );
  }

  const guide = updateGuide(id, nextGuide);
  if (!guide) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(guide);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireGuideWriteAccess(_request);
  if (denied) return denied;

  const { id } = await params;
  if (!deleteGuide(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
