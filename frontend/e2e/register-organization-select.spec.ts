import { expect, test } from "@playwright/test";

function buildRegistrationToken() {
  const payload = Buffer.from(
    JSON.stringify({
      email: "new.user@edwards.com",
      name: "System Admin",
    })
  ).toString("base64url");

  return `header.${payload}.signature`;
}

test.describe("First-login organization selection", () => {
  test("allows selecting a department from the hierarchical organization tree", async ({ page }) => {
    let submittedDepartmentId: string | null = null;

    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (!url.pathname.startsWith("/api/")) {
        await route.fallback();
        return;
      }

      if (url.pathname === "/api/divisions") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            { id: "div-eng", name: "Engineering", code: "ENG", is_active: true },
          ]),
        });
        return;
      }

      if (url.pathname === "/api/departments") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "dept-npi-is",
              name: "NPI, Integrated System",
              code: "NPI_IS",
              business_unit_id: null,
              division_id: "div-eng",
              is_active: true,
            },
          ]),
        });
        return;
      }

      if (url.pathname === "/api/departments/dept-npi-is/sub-teams") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
        return;
      }

      if (url.pathname === "/api/job-positions") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            { id: "pos-1", name: "Engineer", is_active: true },
          ]),
        });
        return;
      }

      if (url.pathname === "/api/auth/sso/register" && request.method() === "POST") {
        const body = request.postDataJSON() as { department_id: string };
        submittedDepartmentId = body.department_id;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            access_token: "access-token",
            refresh_token: "refresh-token",
            token_type: "bearer",
          }),
        });
        return;
      }

      if (url.pathname === "/api/auth/me") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "user-1",
            email: "new.user@edwards.com",
            name: "System Admin",
            korean_name: "시스템관리자",
            role: "USER",
            is_active: true,
            position_id: "pos-1",
            department_id: "dept-npi-is",
            sub_team_id: null,
            seen_release_note_version: "2026-03-weekly-report-and-portal",
          }),
        });
        return;
      }

      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: `Unhandled route: ${url.pathname}` }),
      });
    });

    await page.goto(`/register?token=${buildRegistrationToken()}`);

    await page.getByTestId("register-organization-select").click();
    await page.getByRole("button", { name: "Expand Engineering" }).click();
    await page.getByRole("button", { name: "NPI, Integrated System", exact: true }).click();

    await expect(page.getByTestId("register-organization-select")).toContainText(
      "Engineering > NPI, Integrated System"
    );

    await page.getByPlaceholder(/예: 홍길동|e\.g\. 홍길동/).fill("시스템관리자");
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Engineer" }).click();
    await page.getByRole("button", { name: /계정 생성|Create Account/ }).click();

    await page.waitForFunction(() => localStorage.getItem("authToken") === "access-token");

    expect(submittedDepartmentId).toBe("dept-npi-is");
  });
});
