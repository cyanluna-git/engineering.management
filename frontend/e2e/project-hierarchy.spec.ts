import { expect, test } from "@playwright/test";

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
              category: "PRODUCT",
              internal_io: { io_number: "407112" },
            },
          ],
        },
      ],
    },
  ],
  functional_projects: [
    {
      id: "dept-eci",
      name: "Electrical, Controls & Instrumentation",
      type: "department",
      children: [
        {
          id: "func-1",
          name: "Team Support",
          type: "project",
          status: "InProgress",
          internal_io: { io_number: "500001" },
        },
      ],
    },
  ],
  support_projects: [],
  ungrouped_projects: [],
};

async function mockProjectHierarchyApis(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("authToken", "test-token");
    window.localStorage.setItem("refreshToken", "test-refresh-token");
  });

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());

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
          role: "PM",
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
            id: "func-1",
            name: "Team Support",
            status: "InProgress",
            category: "FUNCTIONAL",
            owner_department_id: "dept-eci",
            internal_io: { io_number: "500001" },
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
        body: JSON.stringify([
          {
            id: "dept-eci",
            name: "Electrical, Controls & Instrumentation",
            code: "ECI",
            business_unit_id: null,
            division_id: null,
            is_active: true,
          },
        ]),
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

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: `Unhandled route: ${url.pathname}` }),
    });
  });
}

test.describe("Project Hierarchy Editor", () => {
  test.beforeEach(async ({ page }) => {
    await mockProjectHierarchyApis(page);
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
  });

  test("shows the current top-level project tabs", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Active Projects" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Functional" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "All Projects" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "IO Management" })).toBeVisible();
  });

  test("loads the Active Projects hierarchy by default", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Active Projects" })).toHaveAttribute("data-state", "active");
    await expect(page.getByText("Product Hierarchy (Business Unit > Product Line > Project)")).toBeVisible();
    await expect(page.getByText("Browse active product projects by Product Line without expanding a deep tree.")).toBeVisible();
    await expect(page.getByTestId("product-line-group-pl-proteus")).toBeVisible();
  });

  test("switches to the Functional tab", async ({ page }) => {
    await page.getByRole("tab", { name: "Functional" }).click();

    await expect(page.getByText("Functional Projects (Department > Project)")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Functional" })).toHaveAttribute("data-state", "active");
  });

  test("shows the All Projects table and keeps it visible when sorting", async ({ page }) => {
    await page.getByRole("tab", { name: "All Projects" }).click();

    await expect(page.getByText(/All Projects \(\d+ total\)/)).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Category" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();

    await page.getByRole("columnheader", { name: "Name" }).click();
    await page.getByRole("columnheader", { name: "Name" }).click();

    await expect(page.getByRole("table")).toBeVisible();
  });

  test("shows the IO management workspace", async ({ page }) => {
    await page.getByRole("tab", { name: "IO Management" }).click();

    await expect(page.getByRole("tab", { name: /Internal IO/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Recharge IO/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ New Internal IO" })).toBeVisible();
  });

  test("shows project management actions for a PM user", async ({ page }) => {
    await expect(page.getByRole("button", { name: "+ New Business Unit" })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ New Project" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage product line Proteus" })).toBeVisible();
  });
});
