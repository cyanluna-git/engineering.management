import { NextRequest, NextResponse } from "next/server";
import {
  deleteGuide,
  getGuide,
  isGuideReadonly,
  updateGuide,
} from "@/lib/guides-store";
import { requireGuideWriteAccess } from "@/lib/guide-write-guard";

const HTML_MAX_BYTES = 1_048_576; // 1 MiB

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidFormat(value: unknown): value is "markdown" | "static-html" {
  return value === "markdown" || value === "static-html";
}

export function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return params.then(async ({ id }) => {
    const guide = await getGuide(id);
    if (!guide) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(guide);
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireGuideWriteAccess(request);
  if (denied) return denied;

  const { id } = await params;
  if (isGuideReadonly(id)) {
    return NextResponse.json(
      { error: "This guide is read-only and managed from static HTML source files." },
      { status: 403 },
    );
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Invalid guide payload." },
      { status: 400 },
    );
  }

  const format = isValidFormat(body.format) ? body.format : undefined;

  // Validate HTML content when format is static-html
  if (format === "static-html" && isNonEmptyString(body.content)) {
    const content: string = body.content;
    if (new TextEncoder().encode(content).length > HTML_MAX_BYTES) {
      return NextResponse.json(
        { error: "HTML content exceeds 1 MiB limit." },
        { status: 413 },
      );
    }
    if (!content.includes("<")) {
      return NextResponse.json(
        { error: "Content does not appear to be valid HTML." },
        { status: 400 },
      );
    }
  }

  const isHtmlContent = format === "static-html";
  const nextGuide = {
    title: isNonEmptyString(body.title) ? body.title.trim() : undefined,
    category: isNonEmptyString(body.category) ? body.category.trim() : undefined,
    // Preserve HTML verbatim; trim markdown
    content: isNonEmptyString(body.content)
      ? isHtmlContent ? body.content : body.content.trim()
      : undefined,
    author: isNonEmptyString(body.author) ? body.author.trim() : undefined,
    format,
  };

  if (
    !nextGuide.title &&
    !nextGuide.category &&
    !nextGuide.content &&
    !nextGuide.author &&
    nextGuide.format === undefined
  ) {
    return NextResponse.json(
      { error: "At least one updatable field is required." },
      { status: 400 },
    );
  }

  const guide = await updateGuide(id, nextGuide);
  if (!guide) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(guide);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireGuideWriteAccess(_request);
  if (denied) return denied;

  const { id } = await params;
  if (isGuideReadonly(id)) {
    return NextResponse.json(
      { error: "This guide is read-only and managed from static HTML source files." },
      { status: 403 },
    );
  }
  if (!(await deleteGuide(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
