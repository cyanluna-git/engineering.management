import { test, expect, Page } from '@playwright/test';

async function openAppPage(
  page: Page,
  path: string,
  role: 'PM' | 'ADMIN' = 'PM'
) {
  await page.addInitScript(() => {
    window.localStorage.setItem('authToken', 'test-token');
    window.localStorage.setItem('refreshToken', 'test-refresh-token');
  });

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());

    if (!url.pathname.startsWith('/api/')) {
      await route.fallback();
      return;
    }

    if (url.pathname === '/api/auth/me') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'user-1',
          email: 'gerald.park@edwardsvacuum.com',
          name: 'Gerald Park',
          korean_name: '박근윤',
          role,
          is_active: true,
          department_id: 'dept-eci',
          sub_team_id: 'sub-is',
          seen_release_note_version: '2026-03-weekly-report-and-portal',
        }),
      });
      return;
    }

    if (url.pathname === '/api/dashboard/my-summary') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          resource_allocation: { total_fte: 3.5, active_projects: 2, current_month: '2026-03' },
          worklogs: [],
        }),
      });
      return;
    }

    if (url.pathname === '/api/dashboard/ai-summary/user') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          generated_at: '2026-03-22T09:00:00Z',
          period_start: '2026-03-16',
          period_end: '2026-03-22',
          summary: 'Weekly summary',
          highlights: [],
          risks: [],
          next_steps: [],
        }),
      });
      return;
    }

    if (url.pathname === '/api/dashboard/ai-summary/user/history') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
      return;
    }

    if (url.pathname === '/api/dashboard/my-fte') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          monthly_capacity: [],
          current_fte: 1,
          available_fte: 1,
          planned_allocation: 1,
        }),
      });
      return;
    }

    if (url.pathname === '/api/worklogs/table') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (url.pathname === '/api/worklogs/completion/monthly') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          business_days: 22,
          entries: [],
        }),
      });
      return;
    }

    if (url.pathname === '/api/worklogs') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (url.pathname === '/api/work-types/tree') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (url.pathname === '/api/projects') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (url.pathname === '/api/ai/ai-health') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'healthy', model: 'mock-gpt' }),
      });
      return;
    }

    if (url.pathname === '/api/users') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (url.pathname === '/api/departments/business-units') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (url.pathname === '/api/departments') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (/^\/api\/departments\/[^/]+\/sub-teams$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.goto(path);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('nav')).toBeVisible();
}

test.describe('Sidebar Navigation', () => {
  test.describe('Menu Structure', () => {
    test('shows Overview section with the expected items', async ({ page }) => {
      await openAppPage(page, '/dashboard', 'PM');
      const sidebar = page.locator('nav');

      await expect(sidebar.getByText(/overview|개요/i).first()).toBeVisible();
      await expect(sidebar.locator('a[href="/dashboard"]')).toBeVisible();
      await expect(sidebar.locator('a[href="/resource-matrix"]')).toBeVisible();
      await expect(sidebar.locator('a[href="/team-capacity"]')).toBeVisible();
      await expect(sidebar.locator('a[href="/reports"]')).toBeVisible();
      await expect(sidebar.locator('a[href="/reports/weekly"]')).toBeVisible();
    });

    test('shows Work Management section with the expected items', async ({ page }) => {
      await openAppPage(page, '/dashboard', 'PM');
      const sidebar = page.locator('nav');

      await expect(sidebar.getByText(/work management|업무 관리/i).first()).toBeVisible();
      await expect(sidebar.locator('a[href="/worklogs"]')).toBeVisible();
      await expect(sidebar.locator('a[href="/resource-plans"]')).toBeVisible();
    });

    test('shows Projects section for a PM user and hides Administration', async ({ page }) => {
      await openAppPage(page, '/dashboard', 'PM');
      const sidebar = page.locator('nav');
      const navSections = sidebar.locator('.text-xs.uppercase');

      await expect(sidebar.getByText(/projects|프로젝트/i).first()).toBeVisible();
      await expect(sidebar.locator('a[href="/projects"]')).toBeVisible();
      await expect(sidebar.locator('a[href="/organization"]')).toHaveCount(0);
      await expect(sidebar.locator('a[href="/requests"]')).toHaveCount(0);
      await expect(navSections).toHaveCount(3);
    });

    test('shows Administration links for an admin user', async ({ page }) => {
      await openAppPage(page, '/dashboard', 'ADMIN');
      const sidebar = page.locator('nav');
      const navSections = sidebar.locator('.text-xs.uppercase');

      await expect(sidebar.locator('a[href="/organization"]')).toBeVisible();
      await expect(sidebar.locator('a[href="/requests"]')).toBeVisible();
      await expect(navSections).toHaveCount(4);
    });
  });

  test('does not show the dead Settings menu item', async ({ page }) => {
    await openAppPage(page, '/dashboard', 'PM');
    await expect(page.locator('a[href="/settings"]')).toHaveCount(0);
  });

  test.describe('Active State', () => {
    test('highlights Dashboard on /dashboard', async ({ page }) => {
      await openAppPage(page, '/dashboard', 'PM');
      await expect(page.locator('nav a[href="/dashboard"]')).toHaveClass(/bg-blue-600/);
    });

    test('highlights Reports on /reports', async ({ page }) => {
      await openAppPage(page, '/reports', 'PM');
      await expect(page.locator('nav a[href="/reports"]').first()).toHaveClass(/bg-blue-600/);
    });

    test('highlights WorkLogs on /worklogs-table', async ({ page }) => {
      await openAppPage(page, '/worklogs-table', 'PM');
      await expect(page.locator('nav a[href="/worklogs"]')).toHaveClass(/bg-blue-600/);
    });
  });

  test.describe('Footer Links', () => {
    test('shows Portal and Update History links in the footer', async ({ page }) => {
      await openAppPage(page, '/dashboard', 'PM');
      await expect(page.locator('a[href="/portal"]')).toBeVisible();
      await expect(page.locator('a[href="/updates"]')).toBeVisible();
    });
  });

  test.describe('WorkLogs Advanced Table Link', () => {
    test('shows the Advanced Table link and navigates to /worklogs-table', async ({ page }) => {
      await openAppPage(page, '/worklogs', 'PM');

      const advancedLink = page.locator('a[href="/worklogs-table"]');
      await expect(advancedLink).toBeVisible();

      await advancedLink.click();
      await expect(page).toHaveURL(/\/worklogs-table/);
    });

    test('shows the back link on the WorkLogTable page', async ({ page }) => {
      await openAppPage(page, '/worklogs-table', 'PM');

      const backLink = page.locator('a[href="/worklogs"]').first();
      await expect(backLink).toBeVisible();

      await backLink.click();
      await expect(page).toHaveURL(/\/worklogs$/);
    });
  });

  test('collapses and expands the sidebar', async ({ page }) => {
    await openAppPage(page, '/dashboard', 'PM');

    const sidebar = page.locator('nav');
    await page.getByRole('button', { name: /collapse sidebar|사이드바 접기/i }).click();
    await page.waitForTimeout(300);

    await expect(sidebar.locator('.text-xs.uppercase')).toHaveCount(0);
    expect(await sidebar.locator('a').count()).toBeGreaterThan(0);

    await page.getByRole('button', { name: /expand sidebar|사이드바 펼치기/i }).click();
    await page.waitForTimeout(300);

    await expect(sidebar.locator('.text-xs.uppercase').first()).toBeVisible();
  });
});
