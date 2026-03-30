import { NextRequest, NextResponse } from "next/server";
import { getGuide, updateGuide, deleteGuide } from "@/lib/guides-store";

export function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return params.then(({ id }) => {
    const guide = getGuide(id);
    if (!guide) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(guide);
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const guide = updateGuide(id, body);
  if (!guide) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(guide);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!deleteGuide(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
