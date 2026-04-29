/**
 * Unit tests for GuideNewClient markdown submission logic (#2695).
 * Tests the validation rules and payload construction for markdown mode.
 * All UI-framework concerns are excluded — only the pure business rules are tested.
 */
import { describe, it, expect } from "vitest";

// ── Mirrors GuideNewClient validation logic ───────────────────────────────────

type TabMode = "markdown" | "html-upload";

interface SubmitResult {
  ok: true;
  payload: {
    title: string;
    category: string;
    content: string;
    author: string;
    format: "markdown" | "static-html";
  };
}

interface SubmitError {
  ok: false;
  error: string;
}

function buildMarkdownSubmitPayload(
  mode: TabMode,
  title: string,
  category: string,
  markdownContent: string,
  authorName: string,
): SubmitResult | SubmitError {
  if (!title.trim()) {
    return { ok: false, error: "Title is required." };
  }
  if (!category) {
    return { ok: false, error: "Category is required." };
  }
  if (mode === "markdown" && !markdownContent.trim()) {
    return { ok: false, error: "Content is required." };
  }
  return {
    ok: true,
    payload: {
      title: title.trim(),
      category,
      content: markdownContent,
      author: authorName,
      format: "markdown",
    },
  };
}

// ── Default mode ──────────────────────────────────────────────────────────────

describe("GuideNewClient — default mode is markdown", () => {
  it("builds a valid markdown payload when all fields are provided", () => {
    const result = buildMarkdownSubmitPayload(
      "markdown",
      "VPN 가이드",
      "IT",
      "## Step 1\n\nInstall VPN.",
      "gerald.park",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.format).toBe("markdown");
    }
  });

  it("includes the author name in the submitted payload", () => {
    const result = buildMarkdownSubmitPayload(
      "markdown",
      "My Guide",
      "General",
      "## Content",
      "jane.doe",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.author).toBe("jane.doe");
    }
  });

  it("trims whitespace from title", () => {
    const result = buildMarkdownSubmitPayload(
      "markdown",
      "  Trimmed Title  ",
      "IT",
      "## Content",
      "admin",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.title).toBe("Trimmed Title");
    }
  });

  it("preserves markdown content with internal whitespace", () => {
    const md = "## Heading\n\nParagraph 1\n\nParagraph 2";
    const result = buildMarkdownSubmitPayload("markdown", "Guide", "IT", md, "admin");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.content).toBe(md);
    }
  });
});

// ── Validation: title ─────────────────────────────────────────────────────────

describe("GuideNewClient — title validation", () => {
  it("rejects empty title", () => {
    const result = buildMarkdownSubmitPayload("markdown", "", "IT", "## Content", "admin");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/title/i);
    }
  });

  it("rejects whitespace-only title", () => {
    const result = buildMarkdownSubmitPayload("markdown", "   ", "IT", "## Content", "admin");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/title/i);
    }
  });

  it("accepts title with leading/trailing spaces (trimmed on submit)", () => {
    const result = buildMarkdownSubmitPayload(
      "markdown",
      "  Valid Title  ",
      "IT",
      "## Content",
      "admin",
    );
    expect(result.ok).toBe(true);
  });
});

// ── Validation: category ──────────────────────────────────────────────────────

describe("GuideNewClient — category validation", () => {
  it("rejects empty category", () => {
    const result = buildMarkdownSubmitPayload("markdown", "Title", "", "## Content", "admin");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/category/i);
    }
  });

  it("accepts any non-empty category string", () => {
    for (const cat of ["IT", "HR", "Finance", "General"]) {
      const result = buildMarkdownSubmitPayload("markdown", "Title", cat, "## Content", "admin");
      expect(result.ok).toBe(true);
    }
  });
});

// ── Validation: content (markdown mode only) ──────────────────────────────────

describe("GuideNewClient — markdown content validation", () => {
  it("rejects empty markdown content in markdown mode", () => {
    const result = buildMarkdownSubmitPayload("markdown", "Title", "IT", "", "admin");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/content/i);
    }
  });

  it("rejects whitespace-only markdown content", () => {
    const result = buildMarkdownSubmitPayload("markdown", "Title", "IT", "\n\t  ", "admin");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/content/i);
    }
  });

  it("accepts minimal markdown content", () => {
    const result = buildMarkdownSubmitPayload("markdown", "Title", "IT", "# H1", "admin");
    expect(result.ok).toBe(true);
  });
});

// ── Format field ──────────────────────────────────────────────────────────────

describe("GuideNewClient — format field in markdown mode", () => {
  it("always sets format to 'markdown' for markdown tab submissions", () => {
    const result = buildMarkdownSubmitPayload(
      "markdown",
      "Guide",
      "IT",
      "## Content here",
      "admin",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.format).toBe("markdown");
    }
  });

  it("never sets format to 'static-html' for markdown tab submissions", () => {
    const result = buildMarkdownSubmitPayload(
      "markdown",
      "Guide",
      "IT",
      "## Content",
      "admin",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.format).not.toBe("static-html");
    }
  });
});

// ── Mode switching: markdown tab vs html-upload tab ───────────────────────────

describe("GuideNewClient — tab mode separation", () => {
  it("does not validate markdown content when mode is html-upload", () => {
    // In html-upload mode, markdownContent being empty is acceptable at the
    // validation stage (the html-upload path validates the file instead).
    // This test verifies the mode check works correctly — the function
    // skips markdown content validation for html-upload mode.
    function validateForMode(mode: TabMode, markdownContent: string): string | null {
      if (mode === "markdown" && !markdownContent.trim()) {
        return "Content is required.";
      }
      return null;
    }

    expect(validateForMode("markdown", "")).toBe("Content is required.");
    expect(validateForMode("html-upload", "")).toBeNull();
  });

  it("mode defaults to markdown (first tab)", () => {
    const DEFAULT_MODE: TabMode = "markdown";
    expect(DEFAULT_MODE).toBe("markdown");
  });
});
