/**
 * Unit tests for PUT /api/guides/:id markdown update path.
 * Tests validation logic and update behaviour for markdown guides.
 */
import { describe, it, expect } from "vitest";

// ── Helper functions replicated from route handler ────────────────────────────

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidFormat(value: unknown): value is "markdown" | "static-html" {
  return value === "markdown" || value === "static-html";
}

type UpdatePayload = {
  title?: unknown;
  category?: unknown;
  content?: unknown;
  author?: unknown;
  format?: unknown;
};

type NormalizedUpdate = {
  title?: string;
  category?: string;
  content?: string;
  author?: string;
  format?: "markdown" | "static-html";
};

function normalizeUpdatePayload(body: UpdatePayload): NormalizedUpdate | null {
  const format = isValidFormat(body.format) ? body.format : undefined;
  const isHtmlContent = format === "static-html";

  const next: NormalizedUpdate = {
    title: isNonEmptyString(body.title) ? body.title.trim() : undefined,
    category: isNonEmptyString(body.category) ? body.category.trim() : undefined,
    content: isNonEmptyString(body.content)
      ? isHtmlContent
        ? (body.content as string)
        : (body.content as string).trim()
      : undefined,
    author: isNonEmptyString(body.author) ? body.author.trim() : undefined,
    format,
  };

  const hasAny =
    next.title !== undefined ||
    next.category !== undefined ||
    next.content !== undefined ||
    next.author !== undefined ||
    next.format !== undefined;

  return hasAny ? next : null;
}

// ── Format defaulting ─────────────────────────────────────────────────────────

describe("PUT /api/guides/:id — format handling", () => {
  it("sets format to 'markdown' when explicitly provided", () => {
    const result = normalizeUpdatePayload({ content: "## Hello", format: "markdown" });
    expect(result?.format).toBe("markdown");
  });

  it("leaves format undefined when not provided (store keeps existing)", () => {
    const result = normalizeUpdatePayload({ content: "## Hello" });
    expect(result?.format).toBeUndefined();
  });

  it("leaves format undefined when an invalid value is provided", () => {
    const result = normalizeUpdatePayload({ title: "T", format: "pdf" });
    expect(result?.format).toBeUndefined();
  });

  it("trims markdown content", () => {
    const result = normalizeUpdatePayload({ content: "  ## Hello  ", format: "markdown" });
    expect(result?.content).toBe("## Hello");
  });
});

// ── Title-only update ─────────────────────────────────────────────────────────

describe("PUT /api/guides/:id — title-only update", () => {
  it("accepts a title-only payload", () => {
    const result = normalizeUpdatePayload({ title: "New Title" });
    expect(result).not.toBeNull();
    expect(result?.title).toBe("New Title");
    expect(result?.content).toBeUndefined();
    expect(result?.format).toBeUndefined();
  });

  it("trims whitespace from title", () => {
    const result = normalizeUpdatePayload({ title: "  Trimmed Title  " });
    expect(result?.title).toBe("Trimmed Title");
  });
});

// ── Content-only update ───────────────────────────────────────────────────────

describe("PUT /api/guides/:id — content-only update", () => {
  it("accepts markdown content update without format field", () => {
    const result = normalizeUpdatePayload({ content: "## Updated markdown" });
    expect(result).not.toBeNull();
    expect(result?.content).toBe("## Updated markdown");
  });

  it("trims markdown content by default", () => {
    const result = normalizeUpdatePayload({ content: "\n\n## Heading\n\n" });
    expect(result?.content).toBe("## Heading");
  });
});

// ── Full markdown update (title + category + content + author) ────────────────

describe("PUT /api/guides/:id — full markdown update payload", () => {
  it("normalizes a complete markdown update", () => {
    const result = normalizeUpdatePayload({
      title: "Complete Guide",
      category: "IT",
      content: "## Step 1\n\nDo the thing.",
      author: "gerald.park",
      format: "markdown",
    });
    expect(result).toEqual({
      title: "Complete Guide",
      category: "IT",
      content: "## Step 1\n\nDo the thing.",
      author: "gerald.park",
      format: "markdown",
    });
  });
});

// ── Empty / invalid payloads ─────────────────────────────────────────────────

describe("PUT /api/guides/:id — invalid payloads", () => {
  it("returns null for empty body object", () => {
    expect(normalizeUpdatePayload({})).toBeNull();
  });

  it("returns null when all string fields are whitespace-only", () => {
    expect(normalizeUpdatePayload({ title: "   ", content: "\t\n" })).toBeNull();
  });

  it("returns null for all-undefined equivalent body", () => {
    expect(normalizeUpdatePayload({ title: undefined, content: undefined })).toBeNull();
  });
});

// ── Author update ─────────────────────────────────────────────────────────────

describe("PUT /api/guides/:id — author update", () => {
  it("preserves author from the payload", () => {
    const result = normalizeUpdatePayload({ author: "new.author", format: "markdown" });
    expect(result?.author).toBe("new.author");
  });

  it("trims whitespace from author", () => {
    const result = normalizeUpdatePayload({ author: "  spaced.author  " });
    expect(result?.author).toBe("spaced.author");
  });
});
