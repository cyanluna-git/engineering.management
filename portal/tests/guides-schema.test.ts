/**
 * Unit tests for guides-schema.ts
 * Verifies the Guide schema types and format field constraints.
 */
import { describe, it, expect } from "vitest";
import {
  GUIDE_CATEGORY_OPTIONS,
  type Guide,
  type GuideCreateInput,
  type GuideUpdateInput,
} from "@/lib/guides-schema";

describe("GUIDE_CATEGORY_OPTIONS", () => {
  it("contains at least one category", () => {
    expect(GUIDE_CATEGORY_OPTIONS.length).toBeGreaterThan(0);
  });

  it("contains expected default categories", () => {
    const categories = GUIDE_CATEGORY_OPTIONS as readonly string[];
    expect(categories).toContain("IT");
    expect(categories).toContain("HR");
    expect(categories).toContain("Finance");
    expect(categories).toContain("General");
  });
});

describe("Guide interface type compatibility", () => {
  it("accepts format=markdown", () => {
    const guide: Guide = {
      id: "1",
      title: "Test",
      category: "IT",
      content: "## Hello",
      author: "admin",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      format: "markdown",
    };
    expect(guide.format).toBe("markdown");
  });

  it("accepts format=static-html", () => {
    const guide: Guide = {
      id: "2",
      title: "HTML Guide",
      category: "IT",
      content: "<h1>Hello</h1>",
      author: "admin",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      format: "static-html",
    };
    expect(guide.format).toBe("static-html");
  });

  it("allows omitting optional format field", () => {
    const guide: Guide = {
      id: "3",
      title: "No Format",
      category: "General",
      content: "content",
      author: "admin",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    expect(guide.format).toBeUndefined();
  });
});

describe("GuideCreateInput interface type compatibility", () => {
  it("accepts format=static-html", () => {
    const input: GuideCreateInput = {
      title: "HTML Guide",
      category: "IT",
      content: "<h1>Hello</h1>",
      author: "admin",
      format: "static-html",
    };
    expect(input.format).toBe("static-html");
  });

  it("allows omitting optional format", () => {
    const input: GuideCreateInput = {
      title: "Markdown Guide",
      category: "IT",
      content: "## Heading",
      author: "admin",
    };
    expect(input.format).toBeUndefined();
  });
});

describe("GuideUpdateInput interface type compatibility", () => {
  it("allows partial updates with format only", () => {
    const input: GuideUpdateInput = {
      format: "static-html",
    };
    expect(input.format).toBe("static-html");
  });

  it("allows empty object (all fields optional)", () => {
    const input: GuideUpdateInput = {};
    expect(Object.keys(input).length).toBe(0);
  });
});
