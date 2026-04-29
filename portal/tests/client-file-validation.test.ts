/**
 * Unit tests for client-side file validation logic.
 * Mirrors the handleFileChange logic in GuideNewClient.tsx and
 * GuideAdminPage's handleHtmlFileChange.
 * Tests run in Node (no DOM) by testing the pure validation rules.
 */
import { describe, it, expect } from "vitest";

const HTML_MAX_BYTES = 1_048_576; // 1 MiB

// Replicated from GuideNewClient / GuideAdminPage
function validateHtmlFile(file: { name: string; size: number }):
  | { ok: true }
  | { ok: false; error: string } {
  if (!file.name.endsWith(".html") && !file.name.endsWith(".htm")) {
    return { ok: false, error: "Only .html files are accepted." };
  }
  if (file.size > HTML_MAX_BYTES) {
    return {
      ok: false,
      error: `File exceeds 1 MiB limit (${(file.size / 1024).toFixed(0)} KB).`,
    };
  }
  return { ok: true };
}

// ── Extension validation ──────────────────────────────────────────────────────

describe("validateHtmlFile — extension check", () => {
  it("accepts .html extension", () => {
    expect(validateHtmlFile({ name: "guide.html", size: 100 }).ok).toBe(true);
  });

  it("accepts .htm extension", () => {
    expect(validateHtmlFile({ name: "guide.htm", size: 100 }).ok).toBe(true);
  });

  it("rejects .pdf extension", () => {
    const result = validateHtmlFile({ name: "document.pdf", size: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/\.html/);
  });

  it("rejects .txt extension", () => {
    expect(validateHtmlFile({ name: "notes.txt", size: 100 }).ok).toBe(false);
  });

  it("rejects .md extension", () => {
    expect(validateHtmlFile({ name: "readme.md", size: 100 }).ok).toBe(false);
  });

  it("rejects file with no extension", () => {
    expect(validateHtmlFile({ name: "myfile", size: 100 }).ok).toBe(false);
  });

  it("rejects .HTML uppercase extension (case-sensitive match)", () => {
    // The implementation uses endsWith which is case-sensitive
    expect(validateHtmlFile({ name: "guide.HTML", size: 100 }).ok).toBe(false);
  });
});

// ── Size validation ───────────────────────────────────────────────────────────

describe("validateHtmlFile — size limit", () => {
  it("accepts file exactly at 1 MiB (1048576 bytes)", () => {
    expect(validateHtmlFile({ name: "at-limit.html", size: HTML_MAX_BYTES }).ok).toBe(
      true,
    );
  });

  it("rejects file 1 byte over 1 MiB", () => {
    const result = validateHtmlFile({ name: "over.html", size: HTML_MAX_BYTES + 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/1 MiB/);
    }
  });

  it("accepts typical 60 KB AI-generated HTML", () => {
    const size60KB = 60 * 1024;
    expect(validateHtmlFile({ name: "field-demo.html", size: size60KB }).ok).toBe(
      true,
    );
  });

  it("rejects 2 MiB file", () => {
    expect(
      validateHtmlFile({ name: "huge.html", size: 2 * HTML_MAX_BYTES }).ok,
    ).toBe(false);
  });

  it("error message includes file size in KB", () => {
    const size = 1_200_000; // ~1.14 MiB
    const result = validateHtmlFile({ name: "big.html", size });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/\d+ KB/);
    }
  });
});

// ── Empty file check (handled in handleSubmit after reading text) ─────────────

describe("empty HTML file content check", () => {
  function isEmptyContent(content: string): boolean {
    return !content.trim();
  }

  it("detects empty string as empty", () => {
    expect(isEmptyContent("")).toBe(true);
  });

  it("detects whitespace-only content as empty", () => {
    expect(isEmptyContent("   \n\t  ")).toBe(true);
  });

  it("accepts minimal HTML as non-empty", () => {
    expect(isEmptyContent("<html></html>")).toBe(false);
  });

  it("accepts content with only whitespace around HTML", () => {
    expect(isEmptyContent("  <p>hi</p>  ")).toBe(false);
  });
});

// ── toExcerpt function (from guides/page.tsx) ─────────────────────────────────

describe("toExcerpt for static-html cards", () => {
  function toExcerpt(content: string, format?: string): string {
    if (format === "static-html") {
      return content
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 140);
    }
    return content
      .replace(/[`#>*_-]/g, " ")
      .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
  }

  it("strips HTML tags for static-html format", () => {
    const html = "<h1>Title</h1><p>Some content here.</p>";
    const result = toExcerpt(html, "static-html");
    expect(result).not.toContain("<h1>");
    expect(result).toContain("Title");
    expect(result).toContain("Some content here.");
  });

  it("truncates long HTML content to 140 chars", () => {
    const html = `<p>${"a".repeat(200)}</p>`;
    const result = toExcerpt(html, "static-html");
    expect(result.length).toBeLessThanOrEqual(140);
  });

  it("does not strip HTML tags for markdown format", () => {
    const md = "## Heading\n\nSome *bold* text";
    const result = toExcerpt(md, "markdown");
    expect(result).not.toContain("##");
    expect(result).toContain("Heading");
  });

  it("handles empty HTML content gracefully", () => {
    const result = toExcerpt("", "static-html");
    expect(result).toBe("");
  });

  it("handles deeply nested HTML tags", () => {
    const html = "<div><section><article><p>Nested text</p></article></section></div>";
    const result = toExcerpt(html, "static-html");
    expect(result).not.toMatch(/<[a-z]/);
    expect(result).toContain("Nested text");
  });

  it("collapses multiple whitespace into single space", () => {
    const html = "<p>Hello</p>  <p>World</p>";
    const result = toExcerpt(html, "static-html");
    expect(result).not.toMatch(/\s{2}/);
    expect(result).toMatch(/Hello\s+World/);
  });
});
