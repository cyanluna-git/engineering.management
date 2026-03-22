import { expect, test } from "@playwright/test";

function buildCurrentReport(markdownBody: string) {
  return {
    id: "report-current",
    scope: "user",
    team_scope_type: null,
    scope_id: "user-1",
    target_key: "user:user-1",
    week_start: "2026-03-16",
    week_end: "2026-03-22",
    week_key: "2026-W12",
    is_in_progress: true,
    status: "published",
    title: null,
    markdown_body: markdownBody,
    source_metadata: null,
    owner_user_id: "user-1",
    created_by_user_id: "user-1",
    updated_by_user_id: "user-1",
    published_by_user_id: "user-1",
    published_at: "2026-03-22T08:00:00Z",
    created_at: "2026-03-22T08:00:00Z",
    updated_at: "2026-03-22T08:00:00Z",
  };
}

test.describe("Weekly self report editing", () => {
  async function dismissBlockingModalIfVisible(page: import("@playwright/test").Page) {
    const releaseDialog = page.getByRole("dialog", { name: /(What's New|새로 업데이트된 기능)/i });
    if (await releaseDialog.isVisible().catch(() => false)) {
      const confirmButton = page.getByRole("button", { name: /^(Got it|확인했어요)$/ });
      if (await confirmButton.isVisible().catch(() => false)) {
        await confirmButton.click({ force: true });
      } else {
        await page.keyboard.press("Escape");
      }
      await expect(releaseDialog).toBeHidden();
    }

    const modalOverlay = page.locator('div[data-state="open"][data-aria-hidden="true"]').last();
    if (await modalOverlay.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await expect(modalOverlay).toBeHidden();
    }
  }

  test.beforeEach(async ({ page }) => {
    let savedBody = "## Existing Weekly Report";

    await page.addInitScript(() => {
      window.localStorage.setItem("authToken", "test-token");
      window.localStorage.setItem("refreshToken", "test-refresh-token");
    });

    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (!url.pathname.startsWith("/api/")) {
        await route.fallback();
        return;
      }

      if (url.pathname === "/api/auth/me") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "user-1",
            email: "gerald.park@edwardsvacuum.com",
            name: "Gerald Park",
            korean_name: "박은우",
            role: "USER",
            is_active: true,
            position_id: "pos-1",
            department_id: "dept-eci",
            sub_team_id: "sub-is",
            seen_release_note_version: "2026-03-weekly-report-and-portal",
          }),
        });
        return;
      }

      if (url.pathname === "/api/weekly-reports/hierarchy") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            department: { id: "dept-eci", name: "Electrical, Controls & Instrumentation", code: "ECI" },
            week_start: "2026-03-16",
            week_end: "2026-03-22",
            week_key: "2026-W12",
            department_report: null,
            sub_teams: [
              {
                id: "sub-is",
                name: "Electrical (IS)",
                report: null,
                submitted_count: 1,
                total_count: 2,
                members: [
                  {
                    user_id: "user-1",
                    name: "Gerald Park",
                    korean_name: "박은우",
                    report: buildCurrentReport(savedBody),
                  },
                  {
                    user_id: "user-2",
                    name: "Rachel",
                    korean_name: null,
                    report: null,
                  },
                ],
              },
            ],
          }),
        });
        return;
      }

      if (url.pathname === "/api/projects") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "proj-1",
              name: "QOC Pilot",
              status: "InProgress",
              category: "PRODUCT",
            },
          ]),
        });
        return;
      }

      if (url.pathname === "/api/weekly-reports/hierarchy/project") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            project: {
              id: "proj-1",
              name: "QOC Pilot",
              category: "PRODUCT",
              pm: { id: "pm-1", name: "PM User", korean_name: null },
            },
            week_start: "2026-03-16",
            week_end: "2026-03-22",
            week_key: "2026-W12",
            project_report: null,
            submitted_count: 1,
            total_count: 1,
            members: [
              {
                user_id: "user-1",
                name: "Gerald Park",
                korean_name: "박은우",
                source: "planned",
                report: buildCurrentReport(savedBody),
              },
            ],
          }),
        });
        return;
      }

      if (url.pathname === "/api/weekly-reports/current") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            scope: "user",
            team_scope_type: null,
            scope_id: "user-1",
            target_key: "user:user-1",
            week_start: "2026-03-16",
            week_end: "2026-03-22",
            week_key: "2026-W12",
            is_in_progress: true,
            report: buildCurrentReport(savedBody),
          }),
        });
        return;
      }

      if (url.pathname === "/api/weekly-reports/history") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [
              {
                ...buildCurrentReport("## Previous Weekly Report"),
                id: "report-prev",
                week_start: "2026-03-09",
                week_end: "2026-03-15",
                week_key: "2026-W11",
              },
            ],
          }),
        });
        return;
      }

      if (url.pathname === "/api/weekly-reports" && request.method() === "PUT") {
        const body = request.postDataJSON() as { markdown_body: string };
        savedBody = body.markdown_body;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(buildCurrentReport(savedBody)),
        });
        return;
      }

      if (url.pathname === "/api/dashboard/my-summary") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            resource_allocation: { total_fte: 3.5, active_projects: 2, current_month: "2026-03" },
            worklogs: [],
          }),
        });
        return;
      }

      if (url.pathname === "/api/worklogs/table") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
        return;
      }

      if (url.pathname === "/api/work-types/tree") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
        return;
      }

      if (url.pathname === "/api/dashboard/ai-summary/user") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            generated_at: "2026-03-22T09:00:00Z",
            period_start: "2026-03-16",
            period_end: "2026-03-22",
            summary: "Weekly summary",
            highlights: [],
            risks: [],
            next_steps: [],
          }),
        });
        return;
      }

      if (url.pathname === "/api/dashboard/ai-summary/user/history") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [] }),
        });
        return;
      }

      if (url.pathname === "/api/dashboard/my-fte") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            monthly_capacity: [],
            current_fte: 1,
            available_fte: 1,
            planned_allocation: 1,
          }),
        });
        return;
      }

      if (url.pathname === "/api/users") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });
  });

  test("edits the current user's weekly report from the team hierarchy row and removes the dashboard entry point", async ({
    page,
  }) => {
    await page.goto("/reports/weekly");
    await dismissBlockingModalIfVisible(page);

    const selfAction = page.locator('[data-testid="self-weekly-report-action"]:visible');
    await expect(selfAction).toHaveText(/(Edit report|보고서 수정)/);
    await dismissBlockingModalIfVisible(page);
    await selfAction.click();

    const editor = page.locator("textarea#weekly-report-body");
    await expect(editor).toHaveValue("## Existing Weekly Report");
    await editor.fill("## Updated From Weekly");
    await page.getByRole("button", { name: /^(Save|저장)$/ }).click();

    await expect(page.getByText(/(Edit Weekly Report|주간 보고서 편집)/)).toBeHidden();

    await dismissBlockingModalIfVisible(page);
    await selfAction.click();
    await expect(page.locator("textarea#weekly-report-body")).toHaveValue("## Updated From Weekly");
    await page.getByRole("button", { name: /^(Cancel|취소)$/ }).click();

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /(Weekly Report|주간 보고서)/ })).toHaveCount(0);
  });

  test("shows the same self-report editing entry from the project hierarchy row", async ({ page }) => {
    await page.goto("/reports/weekly");
    await dismissBlockingModalIfVisible(page);
    await page.getByRole("tab", { name: /(Project|프로젝트)/ }).click();
    await page.getByRole("combobox").selectOption("proj-1");

    await expect(page.getByRole("heading", { name: /QOC Pilot/ })).toBeVisible();
    const selfAction = page.locator('[data-testid="self-weekly-report-action"]:visible');
    await expect(selfAction).toHaveText(/(Edit report|보고서 수정)/);

    await dismissBlockingModalIfVisible(page);
    await selfAction.click();
    await expect(page.locator("textarea#weekly-report-body")).toHaveValue("## Existing Weekly Report");
  });
});
