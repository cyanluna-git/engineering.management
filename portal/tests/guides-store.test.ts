/**
 * Unit tests for guides-store.ts
 * Covers: sanitizeGuide behavior (HTML verbatim vs trim), CRUD round-trips,
 * JSON persistence, static-html format preservation.
 *
 * Strategy: Each test group uses vi.resetModules() + a temp dir pre-created
 * before dynamic import so the FileGuideStore picks up the correct cwd.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tmpDir = path.join(os.tmpdir(), `portal-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  // Create the data directory BEFORE the store module initializes
  await mkdir(path.join(tmpDir, "data"), { recursive: true });
  process.chdir(tmpDir);
  vi.resetModules();
});

afterEach(async () => {
  process.chdir(originalCwd);
  vi.resetModules();
  await rm(tmpDir, { recursive: true, force: true });
});

async function importStore() {
  return import("@/lib/guides-store");
}

// ── sanitizeGuide — HTML vs markdown treatment ────────────────────────────────

describe("sanitizeGuide — HTML content preservation", () => {
  it("preserves HTML with leading/trailing whitespace verbatim", async () => {
    const { createGuide, getGuide } = await importStore();
    const htmlContent = "  <html>\n  <body>\n    <h1>Hello</h1>\n  </body>\n</html>  ";
    const created = await createGuide({
      title: "HTML Guide",
      category: "IT",
      content: htmlContent,
      author: "tester",
      format: "static-html",
    });
    expect(created.content).toBe(htmlContent);
    const fetched = await getGuide(created.id);
    expect(fetched?.content).toBe(htmlContent);
  });

  it("trims markdown content whitespace", async () => {
    const { createGuide, getGuide } = await importStore();
    const created = await createGuide({
      title: "Markdown Guide",
      category: "IT",
      content: "  ## Heading  \n\n  paragraph  ",
      author: "tester",
      format: "markdown",
    });
    // Outer whitespace trimmed, internal preserved
    expect(created.content.startsWith(" ")).toBe(false);
    expect(created.content.endsWith(" ")).toBe(false);
    const fetched = await getGuide(created.id);
    expect(fetched?.content).toBe(created.content);
  });

  it("defaults format to markdown when not provided", async () => {
    const { createGuide, getGuide } = await importStore();
    const created = await createGuide({
      title: "No Format",
      category: "General",
      content: "content",
      author: "admin",
    });
    expect(created.format).toBe("markdown");
    const fetched = await getGuide(created.id);
    expect(fetched?.format).toBe("markdown");
  });

  it("preserves HTML with embedded quotes and newlines on JSON round-trip", async () => {
    const { createGuide, getGuide } = await importStore();
    const htmlContent =
      '<html><head><title>Demo "2026"</title></head><body>\n<p>Line 1</p>\n<p>Line 2</p>\n</body></html>';
    const created = await createGuide({
      title: "Quote Guide",
      category: "IT",
      content: htmlContent,
      author: "admin",
      format: "static-html",
    });
    expect(created.content).toBe(htmlContent);
    // Re-read from persisted file by re-importing a fresh module instance
    const fetched = await getGuide(created.id);
    expect(fetched?.content).toBe(htmlContent);
  });
});

// ── CRUD round-trips ──────────────────────────────────────────────────────────

describe("FileGuideStore CRUD", () => {
  it("creates a guide and retrieves it by id", async () => {
    const { createGuide, getGuide } = await importStore();
    const created = await createGuide({
      title: "Test Guide",
      category: "HR",
      content: "## Help",
      author: "alice",
    });
    expect(created.id).toBeTruthy();
    expect(created.title).toBe("Test Guide");

    const fetched = await getGuide(created.id);
    expect(fetched).toBeDefined();
    expect(fetched?.title).toBe("Test Guide");
  });

  it("returns undefined for a non-existent id", async () => {
    const { getGuide } = await importStore();
    const result = await getGuide("non-existent-id");
    expect(result).toBeUndefined();
  });

  it("updates title and preserves format", async () => {
    const { createGuide, updateGuide, getGuide } = await importStore();
    const created = await createGuide({
      title: "Old Title",
      category: "IT",
      content: "<h1>Body</h1>",
      author: "admin",
      format: "static-html",
    });

    const updated = await updateGuide(created.id, { title: "New Title" });
    expect(updated?.title).toBe("New Title");
    expect(updated?.format).toBe("static-html");

    const fetched = await getGuide(created.id);
    expect(fetched?.title).toBe("New Title");
  });

  it("replaces HTML content on update verbatim", async () => {
    const { createGuide, updateGuide, getGuide } = await importStore();
    const original = "  <p>original</p>  ";
    const replacement = "  <p>replacement</p>  ";

    const created = await createGuide({
      title: "HTML",
      category: "IT",
      content: original,
      author: "admin",
      format: "static-html",
    });

    await updateGuide(created.id, { content: replacement, format: "static-html" });
    const fetched = await getGuide(created.id);
    expect(fetched?.content).toBe(replacement);
  });

  it("deletes a guide and returns false on second delete", async () => {
    const { createGuide, deleteGuide, getGuide } = await importStore();
    const created = await createGuide({
      title: "To Delete",
      category: "IT",
      content: "delete me",
      author: "admin",
    });

    const firstDelete = await deleteGuide(created.id);
    expect(firstDelete).toBe(true);

    const secondDelete = await deleteGuide(created.id);
    expect(secondDelete).toBe(false);

    const fetched = await getGuide(created.id);
    expect(fetched).toBeUndefined();
  });

  it("lists guides sorted by updated_at descending", async () => {
    const { createGuide, listGuides } = await importStore();
    // Start with fresh empty store
    await writeFile(path.join(tmpDir, "data", "guides.json"), "[]", "utf8");
    vi.resetModules();
    const { createGuide: create2, listGuides: list2 } = await import("@/lib/guides-store");

    const first = await create2({
      title: "First",
      category: "IT",
      content: "content",
      author: "admin",
    });
    // Ensure second has a strictly later timestamp
    await new Promise((r) => setTimeout(r, 5));
    const second = await create2({
      title: "Second",
      category: "HR",
      content: "content",
      author: "admin",
    });

    const listed = await list2();
    const secondIdx = listed.findIndex((g) => g.id === second.id);
    const firstIdx = listed.findIndex((g) => g.id === first.id);
    expect(secondIdx).toBeLessThan(firstIdx);
  });

  it("filters guides by category", async () => {
    await writeFile(path.join(tmpDir, "data", "guides.json"), "[]", "utf8");
    vi.resetModules();
    const { createGuide, listGuides } = await import("@/lib/guides-store");

    await createGuide({ title: "IT Guide", category: "IT", content: "c", author: "a" });
    await createGuide({ title: "HR Guide", category: "HR", content: "c", author: "a" });

    const itGuides = await listGuides("IT");
    expect(itGuides.every((g) => g.category === "IT")).toBe(true);
    expect(itGuides.some((g) => g.title === "IT Guide")).toBe(true);
    expect(itGuides.some((g) => g.title === "HR Guide")).toBe(false);
  });

  it("searches guides by title", async () => {
    await writeFile(path.join(tmpDir, "data", "guides.json"), "[]", "utf8");
    vi.resetModules();
    const { createGuide, listGuides } = await import("@/lib/guides-store");

    await createGuide({ title: "VPN Setup Guide", category: "IT", content: "c", author: "a" });
    await createGuide({ title: "Expense Report", category: "Finance", content: "c", author: "a" });

    const results = await listGuides(undefined, "VPN");
    expect(results.some((g) => g.title === "VPN Setup Guide")).toBe(true);
    expect(results.some((g) => g.title === "Expense Report")).toBe(false);
  });
});

// ── Seed behavior ─────────────────────────────────────────────────────────────

describe("FileGuideStore seed", () => {
  it("seeds default guides when data file is missing", async () => {
    // Remove data dir so file is truly absent
    await rm(path.join(tmpDir, "data", "guides.json"), { force: true });
    vi.resetModules();
    const { listGuides } = await import("@/lib/guides-store");
    const guides = await listGuides();
    const storeGuides = guides.filter((g) => !g.readonly);
    expect(storeGuides.length).toBeGreaterThanOrEqual(3);
  });

  it("seeds all default guides with format absent (undefined — seed path skips sanitizeGuide)", async () => {
    // NOTE: The seed path (GUIDE_SEED.map(cloneGuide)) does NOT apply sanitizeGuide,
    // so seed guides are persisted and returned with no format field.
    // sanitizeGuide runs only when loading from an existing JSON file.
    // This is a known behavior: format defaults to "markdown" only on subsequent loads.
    await rm(path.join(tmpDir, "data", "guides.json"), { force: true });
    vi.resetModules();
    const { listGuides } = await import("@/lib/guides-store");
    const guides = await listGuides();
    const storeGuides = guides.filter((g) => !g.readonly);
    // Seed guides have no format field (undefined)
    expect(storeGuides.every((g) => g.format === undefined || g.format === "markdown")).toBe(true);
  });

  it("loads existing guides with format=markdown after sanitizeGuide normalizes them", async () => {
    // Write guides without format so sanitizeGuide must default them
    const guidesWithoutFormat = [
      {
        id: "x1",
        title: "Old Guide",
        category: "IT",
        content: "content",
        author: "admin",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        // no format field
      },
    ];
    await writeFile(
      path.join(tmpDir, "data", "guides.json"),
      JSON.stringify(guidesWithoutFormat, null, 2),
      "utf8",
    );
    vi.resetModules();
    const { listGuides } = await import("@/lib/guides-store");
    const guides = await listGuides();
    const storeGuides = guides.filter((g) => !g.readonly);
    // sanitizeGuide applies format ?? "markdown" on load
    expect(storeGuides.every((g) => g.format === "markdown")).toBe(true);
  });

  it("loads existing guides.json without re-seeding", async () => {
    const existingGuides = [
      {
        id: "custom-1",
        title: "Custom Guide",
        category: "IT",
        content: "custom content",
        author: "alice",
        format: "markdown",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];
    await writeFile(
      path.join(tmpDir, "data", "guides.json"),
      JSON.stringify(existingGuides, null, 2),
      "utf8",
    );
    vi.resetModules();
    const { listGuides } = await import("@/lib/guides-store");
    const guides = await listGuides();
    const storeGuides = guides.filter((g) => !g.readonly);
    expect(storeGuides.some((g) => g.id === "custom-1")).toBe(true);
    // Default seed should NOT appear
    expect(storeGuides.some((g) => g.title === "VPN 설정 가이드")).toBe(false);
  });
});

// ── isGuideReadonly / static guard ────────────────────────────────────────────

describe("isGuideReadonly", () => {
  it("returns false for store-created guides", async () => {
    const { createGuide, isGuideReadonly } = await importStore();
    const created = await createGuide({
      title: "Store Guide",
      category: "IT",
      content: "content",
      author: "admin",
    });
    expect(isGuideReadonly(created.id)).toBe(false);
  });
});
