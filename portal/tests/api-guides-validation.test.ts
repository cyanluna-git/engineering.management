/**
 * Unit tests for API route validation logic (guides POST / PUT).
 * Tests the helper functions and validation rules extracted from the route handlers.
 * These mirror exactly what the route handlers check.
 */
import { describe, it, expect } from "vitest";

// ── Helper functions replicated from route handlers for isolated testing ──────

const HTML_MAX_BYTES = 1_048_576; // 1 MiB

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidFormat(value: unknown): value is "markdown" | "static-html" {
  return value === "markdown" || value === "static-html";
}

function validateStaticHtmlContent(content: string): { valid: true } | { valid: false; status: number; error: string } {
  if (new TextEncoder().encode(content).length > HTML_MAX_BYTES) {
    return { valid: false, status: 413, error: "HTML content exceeds 1 MiB limit." };
  }
  if (!content.includes("<")) {
    return { valid: false, status: 400, error: "Content does not appear to be valid HTML." };
  }
  return { valid: true };
}

// ── isNonEmptyString ──────────────────────────────────────────────────────────

describe("isNonEmptyString", () => {
  it("returns true for normal strings", () => {
    expect(isNonEmptyString("hello")).toBe(true);
    expect(isNonEmptyString("  hello  ")).toBe(true);
    expect(isNonEmptyString("<html></html>")).toBe(true);
  });

  it("returns false for empty or whitespace-only strings", () => {
    expect(isNonEmptyString("")).toBe(false);
    expect(isNonEmptyString("   ")).toBe(false);
    expect(isNonEmptyString("\t\n")).toBe(false);
  });

  it("returns false for non-string types", () => {
    expect(isNonEmptyString(null)).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
    expect(isNonEmptyString(123)).toBe(false);
    expect(isNonEmptyString({})).toBe(false);
    expect(isNonEmptyString([])).toBe(false);
  });
});

// ── isValidFormat ─────────────────────────────────────────────────────────────

describe("isValidFormat", () => {
  it("accepts 'markdown'", () => {
    expect(isValidFormat("markdown")).toBe(true);
  });

  it("accepts 'static-html'", () => {
    expect(isValidFormat("static-html")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isValidFormat("html")).toBe(false);
    expect(isValidFormat("pdf")).toBe(false);
    expect(isValidFormat("")).toBe(false);
    expect(isValidFormat(null)).toBe(false);
    expect(isValidFormat(undefined)).toBe(false);
    expect(isValidFormat(42)).toBe(false);
  });
});

// ── HTML content validation ───────────────────────────────────────────────────

describe("validateStaticHtmlContent — empty / missing angle bracket", () => {
  it("returns 400 for content with no HTML tags", () => {
    const result = validateStaticHtmlContent("plain text only");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/html/i);
    }
  });

  it("returns 400 for empty string content", () => {
    const result = validateStaticHtmlContent("");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.status).toBe(400);
    }
  });

  it("accepts minimal valid HTML containing angle bracket", () => {
    const result = validateStaticHtmlContent("<html><body>hello</body></html>");
    expect(result.valid).toBe(true);
  });

  it("accepts self-closing tag content", () => {
    const result = validateStaticHtmlContent("<br/>");
    expect(result.valid).toBe(true);
  });
});

describe("validateStaticHtmlContent — size limit", () => {
  it("accepts content exactly at 1 MiB boundary", () => {
    // 1 MiB - 1 byte: should pass
    const content = "<" + "a".repeat(HTML_MAX_BYTES - 2) + ">";
    const size = new TextEncoder().encode(content).length;
    expect(size).toBeLessThanOrEqual(HTML_MAX_BYTES);
    const result = validateStaticHtmlContent(content);
    expect(result.valid).toBe(true);
  });

  it("rejects content exceeding 1 MiB", () => {
    // Build a string that encodes to > 1 MiB
    const bigContent = "<p>" + "x".repeat(HTML_MAX_BYTES) + "</p>";
    const result = validateStaticHtmlContent(bigContent);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.status).toBe(413);
      expect(result.error).toMatch(/1 MiB/i);
    }
  });

  it("correctly measures multi-byte (UTF-8) content size", () => {
    // Korean characters are 3 bytes each in UTF-8
    const koreanStr = "안";
    const byteLen = new TextEncoder().encode(koreanStr).length;
    expect(byteLen).toBe(3);

    // Build 350,000 Korean chars = ~1.05 MiB — should exceed limit
    const bigKorean = "<p>" + "안".repeat(350_000) + "</p>";
    const result = validateStaticHtmlContent(bigKorean);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.status).toBe(413);
    }
  });

  it("accepts typical AI-generated HTML (~60 KB)", () => {
    // Simulate ~60 KB HTML file
    const content = `<!DOCTYPE html><html><head><title>Demo</title></head><body>${"<p>content</p>".repeat(4000)}</body></html>`;
    const size = new TextEncoder().encode(content).length;
    expect(size).toBeLessThan(HTML_MAX_BYTES); // sanity check it's actually small
    const result = validateStaticHtmlContent(content);
    expect(result.valid).toBe(true);
  });
});

// ── POST payload validation (mirrors route.ts logic) ─────────────────────────

describe("POST /api/guides payload validation", () => {
  function validatePostPayload(body: unknown): { valid: true } | { valid: false; status: number } {
    if (
      !body ||
      !isNonEmptyString((body as Record<string, unknown>).title) ||
      !isNonEmptyString((body as Record<string, unknown>).category) ||
      !isNonEmptyString((body as Record<string, unknown>).content)
    ) {
      return { valid: false, status: 400 };
    }
    return { valid: true };
  }

  it("rejects null body", () => {
    expect(validatePostPayload(null).valid).toBe(false);
  });

  it("rejects missing title", () => {
    expect(validatePostPayload({ category: "IT", content: "c" }).valid).toBe(false);
  });

  it("rejects missing category", () => {
    expect(validatePostPayload({ title: "T", content: "c" }).valid).toBe(false);
  });

  it("rejects missing content", () => {
    expect(validatePostPayload({ title: "T", category: "IT" }).valid).toBe(false);
  });

  it("rejects empty string content", () => {
    expect(validatePostPayload({ title: "T", category: "IT", content: "" }).valid).toBe(false);
  });

  it("accepts minimal valid payload", () => {
    const result = validatePostPayload({ title: "T", category: "IT", content: "## Hi" });
    expect(result.valid).toBe(true);
  });

  it("accepts static-html payload with HTML content", () => {
    const result = validatePostPayload({
      title: "HTML Guide",
      category: "IT",
      content: "<h1>Hello</h1>",
      format: "static-html",
    });
    expect(result.valid).toBe(true);
  });
});

// ── PUT payload validation ────────────────────────────────────────────────────

describe("PUT /api/guides/:id payload validation — at least one field required", () => {
  function hasUpdatableField(body: Record<string, unknown>): boolean {
    const title = isNonEmptyString(body.title) ? body.title.trim() : undefined;
    const category = isNonEmptyString(body.category) ? body.category.trim() : undefined;
    const content = isNonEmptyString(body.content) ? body.content : undefined;
    const author = isNonEmptyString(body.author) ? body.author.trim() : undefined;
    const format = isValidFormat(body.format) ? body.format : undefined;
    return !(!title && !category && !content && !author && format === undefined);
  }

  it("rejects empty body object", () => {
    expect(hasUpdatableField({})).toBe(false);
  });

  it("rejects body with only whitespace strings", () => {
    expect(hasUpdatableField({ title: "   ", content: "\t" })).toBe(false);
  });

  it("accepts body with only title", () => {
    expect(hasUpdatableField({ title: "New Title" })).toBe(true);
  });

  it("accepts body with only format", () => {
    expect(hasUpdatableField({ format: "static-html" })).toBe(true);
  });

  it("accepts body with HTML content replacement", () => {
    expect(
      hasUpdatableField({ content: "<h1>Updated</h1>", format: "static-html" }),
    ).toBe(true);
  });
});
