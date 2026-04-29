/**
 * Unit tests for guide-write-guard.ts
 * Covers: getGuideWritePolicy, requireGuideWriteAccess (admin token path + OIDC path + no auth).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

// ── getGuideWritePolicy ───────────────────────────────────────────────────────

describe("getGuideWritePolicy", () => {
  it("returns disabled policy when PORTAL_GUIDE_WRITE_TOKEN is not set", async () => {
    delete process.env.PORTAL_GUIDE_WRITE_TOKEN;
    vi.doMock("@/lib/portal-auth", () => ({
      getPortalSessionFromRequest: vi.fn().mockResolvedValue(null),
    }));
    const { getGuideWritePolicy } = await import("@/lib/guide-write-guard");
    const policy = getGuideWritePolicy();
    expect(policy.enabled).toBe(false);
    expect(policy.mode).toBe("disabled");
  });

  it("returns token policy when PORTAL_GUIDE_WRITE_TOKEN is configured", async () => {
    process.env.PORTAL_GUIDE_WRITE_TOKEN = "secret-token";
    vi.doMock("@/lib/portal-auth", () => ({
      getPortalSessionFromRequest: vi.fn().mockResolvedValue(null),
    }));
    const { getGuideWritePolicy } = await import("@/lib/guide-write-guard");
    const policy = getGuideWritePolicy();
    expect(policy.enabled).toBe(true);
    expect(policy.mode).toBe("token");
  });

  it("returns disabled when token is only whitespace", async () => {
    process.env.PORTAL_GUIDE_WRITE_TOKEN = "   ";
    vi.doMock("@/lib/portal-auth", () => ({
      getPortalSessionFromRequest: vi.fn().mockResolvedValue(null),
    }));
    const { getGuideWritePolicy } = await import("@/lib/guide-write-guard");
    const policy = getGuideWritePolicy();
    expect(policy.enabled).toBe(false);
  });
});

// ── requireGuideWriteAccess ───────────────────────────────────────────────────

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/guides", {
    method: "POST",
    headers,
  });
}

describe("requireGuideWriteAccess — admin token path", () => {
  it("allows access when valid admin token is provided", async () => {
    process.env.PORTAL_GUIDE_WRITE_TOKEN = "mysecret";
    vi.doMock("@/lib/portal-auth", () => ({
      getPortalSessionFromRequest: vi.fn().mockResolvedValue(null),
    }));
    const { requireGuideWriteAccess } = await import("@/lib/guide-write-guard");
    const req = makeRequest({ "x-portal-admin-token": "mysecret" });
    const result = await requireGuideWriteAccess(req as Parameters<typeof requireGuideWriteAccess>[0]);
    expect(result).toBeNull();
  });

  it("denies access when wrong admin token is provided and no session", async () => {
    process.env.PORTAL_GUIDE_WRITE_TOKEN = "mysecret";
    vi.doMock("@/lib/portal-auth", () => ({
      getPortalSessionFromRequest: vi.fn().mockResolvedValue(null),
    }));
    const { requireGuideWriteAccess } = await import("@/lib/guide-write-guard");
    const req = makeRequest({ "x-portal-admin-token": "wrong-token" });
    const result = await requireGuideWriteAccess(req as Parameters<typeof requireGuideWriteAccess>[0]);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(401);
  });

  it("denies access when no token header and no session", async () => {
    delete process.env.PORTAL_GUIDE_WRITE_TOKEN;
    vi.doMock("@/lib/portal-auth", () => ({
      getPortalSessionFromRequest: vi.fn().mockResolvedValue(null),
    }));
    const { requireGuideWriteAccess } = await import("@/lib/guide-write-guard");
    const req = makeRequest();
    const result = await requireGuideWriteAccess(req as Parameters<typeof requireGuideWriteAccess>[0]);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(401);
  });
});

describe("requireGuideWriteAccess — OIDC session path", () => {
  it("allows access when valid OIDC session exists (no admin token)", async () => {
    delete process.env.PORTAL_GUIDE_WRITE_TOKEN;
    vi.doMock("@/lib/portal-auth", () => ({
      getPortalSessionFromRequest: vi.fn().mockResolvedValue({
        sub: "user-123",
        email: "user@example.com",
        name: "Test User",
      }),
    }));
    const { requireGuideWriteAccess } = await import("@/lib/guide-write-guard");
    const req = makeRequest();
    const result = await requireGuideWriteAccess(req as Parameters<typeof requireGuideWriteAccess>[0]);
    expect(result).toBeNull();
  });

  it("allows access when both admin token and session exist (session wins)", async () => {
    process.env.PORTAL_GUIDE_WRITE_TOKEN = "correcttoken";
    vi.doMock("@/lib/portal-auth", () => ({
      getPortalSessionFromRequest: vi.fn().mockResolvedValue({ sub: "user-1" }),
    }));
    const { requireGuideWriteAccess } = await import("@/lib/guide-write-guard");
    // Token also matches — should pass regardless
    const req = makeRequest({ "x-portal-admin-token": "correcttoken" });
    const result = await requireGuideWriteAccess(req as Parameters<typeof requireGuideWriteAccess>[0]);
    expect(result).toBeNull();
  });
});

describe("requireGuideWriteAccess — 401 response body", () => {
  it("includes policy and error in response body", async () => {
    delete process.env.PORTAL_GUIDE_WRITE_TOKEN;
    vi.doMock("@/lib/portal-auth", () => ({
      getPortalSessionFromRequest: vi.fn().mockResolvedValue(null),
    }));
    const { requireGuideWriteAccess } = await import("@/lib/guide-write-guard");
    const req = makeRequest();
    const result = await requireGuideWriteAccess(req as Parameters<typeof requireGuideWriteAccess>[0]);
    expect(result).not.toBeNull();

    const body = await result!.json();
    expect(body).toHaveProperty("error");
    expect(typeof body.error).toBe("string");
    expect(body).toHaveProperty("policy");
    expect(body.policy).toHaveProperty("mode");
    expect(body.policy).toHaveProperty("enabled");
  });
});
