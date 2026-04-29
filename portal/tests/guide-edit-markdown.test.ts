/**
 * Unit tests for GuideEditClient markdown submission logic (#2695).
 * Covers: field validation, format always "markdown", author/updated_at
 * recording on edit, and partial-update scenarios.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// ── Mirrors GuideEditClient submit logic ──────────────────────────────────────

interface EditSubmitResult {
  ok: true;
  payload: {
    title: string;
    category: string;
    content: string;
    author: string;
    format: "markdown";
  };
}

interface EditSubmitError {
  ok: false;
  error: string;
}

function buildEditSubmitPayload(
  title: string,
  category: string,
  content: string,
  authorName: string,
): EditSubmitResult | EditSubmitError {
  if (!title.trim()) {
    return { ok: false, error: "Title is required." };
  }
  if (!content.trim()) {
    return { ok: false, error: "Content is required." };
  }
  return {
    ok: true,
    payload: {
      title: title.trim(),
      category,
      content,
      author: authorName,
      format: "markdown",
    },
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

describe("GuideEditClient — validation", () => {
  it("rejects empty title", () => {
    const result = buildEditSubmitPayload("", "IT", "## Content", "admin");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/title/i);
    }
  });

  it("rejects whitespace-only title", () => {
    const result = buildEditSubmitPayload("   ", "IT", "## Content", "admin");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/title/i);
    }
  });

  it("rejects empty content", () => {
    const result = buildEditSubmitPayload("Title", "IT", "", "admin");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/content/i);
    }
  });

  it("rejects whitespace-only content", () => {
    const result = buildEditSubmitPayload("Title", "IT", "\n\t  ", "admin");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/content/i);
    }
  });

  it("accepts a valid full payload", () => {
    const result = buildEditSubmitPayload("Updated Title", "HR", "## Body", "gerald.park");
    expect(result.ok).toBe(true);
  });
});

// ── Format field ──────────────────────────────────────────────────────────────

describe("GuideEditClient — format is always 'markdown'", () => {
  it("always sends format=markdown regardless of original guide format", () => {
    const result = buildEditSubmitPayload("Guide", "IT", "## Content", "admin");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.format).toBe("markdown");
    }
  });

  it("never sends format='static-html' from edit form", () => {
    const result = buildEditSubmitPayload("Guide", "IT", "## Content", "admin");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.format).not.toBe("static-html");
    }
  });
});

// ── Title trimming ────────────────────────────────────────────────────────────

describe("GuideEditClient — title trimming", () => {
  it("trims leading and trailing whitespace from title", () => {
    const result = buildEditSubmitPayload("  My Guide  ", "IT", "## Content", "admin");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.title).toBe("My Guide");
    }
  });

  it("preserves internal spaces in title", () => {
    const result = buildEditSubmitPayload("Multi Word Title", "IT", "## Content", "admin");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.title).toBe("Multi Word Title");
    }
  });
});

// ── Author recording ──────────────────────────────────────────────────────────

describe("GuideEditClient — author is recorded on edit", () => {
  it("includes the authenticated user's name as author", () => {
    const result = buildEditSubmitPayload("Guide", "IT", "## Content", "gerald.park");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.author).toBe("gerald.park");
    }
  });

  it("does not override author with empty string on submit", () => {
    const result = buildEditSubmitPayload("Guide", "IT", "## Content", "alice.jones");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.author).toBe("alice.jones");
    }
  });
});

// ── Store: updated_at auto-recording on markdown update ──────────────────────

let tmpDir: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tmpDir = path.join(
    os.tmpdir(),
    `portal-edit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(path.join(tmpDir, "data"), { recursive: true });
  process.chdir(tmpDir);
  vi.resetModules();
});

afterEach(async () => {
  process.chdir(originalCwd);
  vi.resetModules();
  await rm(tmpDir, { recursive: true, force: true });
});

describe("FileGuideStore — updated_at auto-recording on markdown update", () => {
  it("updates updated_at when markdown content changes", async () => {
    const { createGuide, updateGuide, getGuide } = await import("@/lib/guides-store");

    const created = await createGuide({
      title: "Original",
      category: "IT",
      content: "## Original Content",
      author: "admin",
      format: "markdown",
    });

    const beforeUpdate = created.updated_at;

    // Ensure at least 1 ms passes
    await new Promise((r) => setTimeout(r, 2));

    const updated = await updateGuide(created.id, {
      content: "## Revised Content",
      author: "gerald.park",
      format: "markdown",
    });

    expect(updated).toBeDefined();
    expect(updated?.updated_at).not.toBe(beforeUpdate);
    expect(new Date(updated!.updated_at).getTime()).toBeGreaterThan(
      new Date(beforeUpdate).getTime(),
    );
  });

  it("records the new author when updated via edit form", async () => {
    const { createGuide, updateGuide } = await import("@/lib/guides-store");

    const created = await createGuide({
      title: "Guide",
      category: "IT",
      content: "## Content",
      author: "original.author",
      format: "markdown",
    });

    const updated = await updateGuide(created.id, {
      author: "new.author",
      format: "markdown",
    });

    expect(updated?.author).toBe("new.author");
  });

  it("persists format=markdown after updating content", async () => {
    const { createGuide, updateGuide, getGuide } = await import("@/lib/guides-store");

    const created = await createGuide({
      title: "Guide",
      category: "IT",
      content: "## Original",
      author: "admin",
      format: "markdown",
    });

    await updateGuide(created.id, {
      content: "## Updated via MD editor",
      format: "markdown",
    });

    const fetched = await getGuide(created.id);
    expect(fetched?.format).toBe("markdown");
  });

  it("created_at is unchanged after markdown content update", async () => {
    const { createGuide, updateGuide } = await import("@/lib/guides-store");

    const created = await createGuide({
      title: "Guide",
      category: "IT",
      content: "## Content",
      author: "admin",
    });

    await new Promise((r) => setTimeout(r, 2));

    const updated = await updateGuide(created.id, {
      content: "## New Content",
    });

    expect(updated?.created_at).toBe(created.created_at);
  });
});

// ── Load existing guide content into edit form ────────────────────────────────

describe("GuideEditClient — loading existing markdown content", () => {
  it("initial values are loaded from the persisted guide", async () => {
    await writeFile(
      path.join(tmpDir, "data", "guides.json"),
      JSON.stringify([
        {
          id: "guide-abc",
          title: "Existing Guide",
          category: "HR",
          content: "## Pre-existing content",
          author: "original.author",
          format: "markdown",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ]),
      "utf8",
    );
    vi.resetModules();

    const { getGuide } = await import("@/lib/guides-store");
    const guide = await getGuide("guide-abc");

    expect(guide).toBeDefined();
    expect(guide?.title).toBe("Existing Guide");
    expect(guide?.content).toBe("## Pre-existing content");
    expect(guide?.format).toBe("markdown");
    expect(guide?.category).toBe("HR");
  });

  it("returns undefined for an id that does not exist (redirect to 404)", async () => {
    const { getGuide } = await import("@/lib/guides-store");
    const guide = await getGuide("does-not-exist");
    expect(guide).toBeUndefined();
  });
});
