import { expect, test } from "@playwright/test";

type Role = "PM" | "USER";

const hierarchyPayload = {
  product_projects: [
    {
      id: "bu-abate",
      name: "Abatement",
      code: "ABATE",
      type: "business_unit",
      children: [
        {
          id: "pl-proteus",
          name: "Proteus",
          code: "PROTEUS",
          type: "product_line",
          line_category: "PRODUCT",
          children: [
            {
              id: "proj-h2",
              name: "Proteus H2 Injection Kit",
              type: "project",
              status: "InProgress",
              internal_io: { io_number: "407112" },
            },
            {
              id: "proj-hvru",
              name: "Proteus Single HV WRU",
              type: "project",
              status: "Prospective",
              internal_io: { io_number: "407379" },
            },
          ],
        },
      ],
    },
  ],
  functional_projects: [],
  support_projects: [],
  ungrouped_projects: [
    {
      id: "proj-ungrouped",
      name: "Taylor 항 SAR",
      type: "project",
      status: "InProgress",
      internal_io: { io_number: "406428" },
    },
  ],
};

async function mockProjectHierarchyWorkspace(page: import("@playwright/test").Page, role: Role) {
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
          korean_name: "박근윤",
          role,
          is_active: true,
          department_id: "dept-eci",
          sub_team_id: "sub-is",
          seen_release_note_version: "2026-03-weekly-report-and-portal",
        }),
      });
      return;
    }

    if (url.pathname === "/api/projects/hierarchy") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(hierarchyPayload),
      });
      return;
    }

    if (url.pathname === "/api/departments/business-units") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ id: "bu-abate", name: "Abatement", code: "ABATE", is_active: true }]),
      });
      return;
    }

    if (url.pathname === "/api/projects") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "proj-h2",
            name: "Proteus H2 Injection Kit",
            status: "InProgress",
            category: "PRODUCT",
            product_line_id: "pl-proteus",
            internal_io: { io_number: "407112" },
          },
          {
            id: "proj-hvru",
            name: "Proteus Single HV WRU",
            status: "Prospective",
            category: "PRODUCT",
            product_line_id: "pl-proteus",
            internal_io: { io_number: "407379" },
          },
        ]),
      });
      return;
    }

    if (url.pathname === "/api/projects/meta/product-lines") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "pl-proteus",
            name: "Proteus",
            code: "PROTEUS",
            business_unit_id: "bu-abate",
          },
        ]),
      });
      return;
    }

    if (url.pathname === "/api/departments") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
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

    if (url.pathname.startsWith("/api/internal-ios")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (url.pathname.startsWith("/api/recharge-ios")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (url.pathname === "/api/projects/proj-h2") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "proj-h2",
          name: "Proteus H2 Injection Kit",
          status: "InProgress",
          category: "PRODUCT",
          product_line: { id: "pl-proteus", name: "Proteus" },
          internal_io: { io_number: "407112" },
          pm: null,
        }),
      });
      return;
    }

    if (url.pathname === "/api/projects/proj-h2/milestones") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (url.pathname === "/api/projects/proj-h2/stats") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (url.pathname === "/api/projects/proj-h2/dashboard") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          project: {
            id: "proj-h2",
            code: "407112",
            name: "Proteus H2 Injection Kit",
            status: "InProgress",
            category: "PRODUCT",
            scale: null,
            customer: null,
            product: null,
            start_month: null,
            end_month: null,
            pm: null,
            business_unit: "Abatement",
            product_line: "Proteus",
          },
          milestone_stats: {
            total: 0,
            completed: 0,
            delayed: 0,
            pending: 0,
            completion_rate: 0,
            upcoming: [],
            overdue: [],
          },
          resource_summary: [],
          worklog_trends: [],
          team_members: [],
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
}

test.describe("Simplified product hierarchy list view", () => {
  test("shows grouped project rows with slash-separated hierarchy paths and supports detail navigation", async ({ page }) => {
    await mockProjectHierarchyWorkspace(page, "PM");

    await page.goto("/projects");

    await expect(page.getByTestId("business-unit-group-bu-abate")).toBeVisible();
    await expect(page.getByTestId("product-line-group-pl-proteus")).toBeVisible();
    await expect(page.getByTestId("product-row-proj-h2")).toContainText("Abatement / Proteus");
    await expect(page.getByTestId("product-row-proj-h2")).toContainText("Proteus H2 Injection Kit");
    await expect(page.getByTestId("product-row-proj-h2")).toContainText("407112");

    await page.getByTestId("product-row-proj-h2").locator("button").first().click();
    await page.waitForURL(/\/projects\/proj-h2$/);
  });

  test("shows management actions for PM users and hides them for regular users", async ({ page }) => {
    await mockProjectHierarchyWorkspace(page, "PM");

    await page.goto("/projects");

    await expect(page.getByRole("button", { name: "+ New Business Unit" })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ New Project" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage product line Proteus" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage project Proteus H2 Injection Kit" })).toBeVisible();
  });

  test("keeps the simplified list readable for regular users without management menus", async ({ page }) => {
    await mockProjectHierarchyWorkspace(page, "USER");

    await page.goto("/projects");

    await expect(page.getByTestId("product-line-group-pl-proteus")).toBeVisible();
    await expect(page.getByTestId("product-row-proj-h2")).toContainText("Abatement / Proteus");
    await expect(page.getByRole("button", { name: "+ New Business Unit" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Manage product line Proteus" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Manage project Proteus H2 Injection Kit" })).toHaveCount(0);
  });
});
