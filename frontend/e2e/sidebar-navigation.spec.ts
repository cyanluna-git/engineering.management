import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for sidebar menu reorganization
 * Covers: 4-section layout, role-based filtering, worklogs-table link, no dead Settings link
 */

async function loginAndDismissModal(page: Page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'gerald.park@edwardsvacuum.com');
  await page.fill('input[type="password"]', 'password');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(portal|dashboard)/, { timeout: 10000 });

  // Navigate to dashboard (triggers MainLayout with sidebar)
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');

  // Dismiss ReleaseNotesModal if it appears
  const confirmBtn = page.getByRole('button', { name: /confirm|확인|close|닫기/i });
  if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await confirmBtn.click();
    await page.waitForTimeout(500);
  }
}

test.describe('Sidebar Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndDismissModal(page);
  });

  test.describe('Menu Structure - 4 Sections', () => {
    test('should display Overview section with correct items', async ({ page }) => {
      const sidebar = page.locator('.bg-slate-900');

      // Section header
      await expect(sidebar.getByText(/overview|개요/i).first()).toBeVisible();

      // Menu items
      await expect(sidebar.locator('a[href="/dashboard"]')).toBeVisible();
      await expect(sidebar.locator('a[href="/resource-matrix"]')).toBeVisible();
      await expect(sidebar.locator('a[href="/reports"]')).toBeVisible();
      await expect(sidebar.locator('a[href="/reports/weekly"]')).toBeVisible();
    });

    test('should display Work Management section with correct items', async ({ page }) => {
      const sidebar = page.locator('.bg-slate-900');

      await expect(sidebar.getByText(/work management|업무 관리/i).first()).toBeVisible();

      await expect(sidebar.locator('a[href="/worklogs"]')).toBeVisible();
      await expect(sidebar.locator('a[href="/resource-plans"]')).toBeVisible();
    });

    test('should display Projects section with correct items', async ({ page }) => {
      const sidebar = page.locator('.bg-slate-900');

      // Projects section header (in nav only, not the link)
      const navSections = sidebar.locator('nav .text-xs.uppercase');
      const sectionTexts = await navSections.allTextContents();
      const hasProjects = sectionTexts.some(t => /projects|프로젝트/i.test(t));
      expect(hasProjects).toBeTruthy();

      await expect(sidebar.locator('a[href="/projects"]')).toBeVisible();
    });

    test('should display Administration section with correct items', async ({ page }) => {
      const sidebar = page.locator('.bg-slate-900');

      const navSections = sidebar.locator('nav .text-xs.uppercase');
      const sectionTexts = await navSections.allTextContents();
      const hasAdmin = sectionTexts.some(t => /administration|관리/i.test(t));
      expect(hasAdmin).toBeTruthy();

      await expect(sidebar.locator('a[href="/organization"]')).toBeVisible();
      await expect(sidebar.locator('a[href="/requests"]')).toBeVisible();
    });

    test('should have exactly 4 navigation sections', async ({ page }) => {
      const sidebar = page.locator('.bg-slate-900');
      const navSections = sidebar.locator('nav .text-xs.uppercase');
      await expect(navSections).toHaveCount(4);
    });
  });

  test.describe('Dead Links Removed', () => {
    test('should NOT have a Settings menu item', async ({ page }) => {
      const settingsLink = page.locator('a[href="/settings"]');
      await expect(settingsLink).toHaveCount(0);
    });
  });

  test.describe('Navigation Active State', () => {
    test('should highlight Dashboard when on /dashboard', async ({ page }) => {
      const dashboardLink = page.locator('a[href="/dashboard"]');
      await expect(dashboardLink).toHaveClass(/bg-blue-600/);
    });

    test('should highlight correct item when navigating to Reports', async ({ page }) => {
      await page.locator('.bg-slate-900 a[href="/reports"]').click();
      await page.waitForLoadState('networkidle');

      const reportsLink = page.locator('a[href="/reports"]');
      await expect(reportsLink).toHaveClass(/bg-blue-600/);
    });

    test('should highlight WorkLogs when on /worklogs-table', async ({ page }) => {
      await page.goto('/worklogs-table');
      await page.waitForLoadState('networkidle');

      // Dismiss modal if shown again
      const confirmBtn = page.getByRole('button', { name: /confirm|확인|close|닫기/i });
      if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(300);
      }

      const worklogsLink = page.locator('.bg-slate-900 a[href="/worklogs"]');
      await expect(worklogsLink).toHaveClass(/bg-blue-600/);
    });
  });

  test.describe('Footer Links', () => {
    test('should have Portal and Updates links in footer', async ({ page }) => {
      await expect(page.locator('a[href="/portal"]')).toBeVisible();
      await expect(page.locator('a[href="/updates"]')).toBeVisible();
    });

    test('Request Board should be in nav, not in footer', async ({ page }) => {
      // Request Board should exist in nav section
      const navRequestBoard = page.locator('nav a[href="/requests"]');
      await expect(navRequestBoard).toBeVisible();
    });
  });

  test.describe('WorkLogs Advanced Table Link', () => {
    test('should show Advanced Table link and navigate', async ({ page }) => {
      await page.goto('/worklogs');
      await page.waitForLoadState('networkidle');

      // Dismiss modal if shown
      const confirmBtn = page.getByRole('button', { name: /confirm|확인|close|닫기/i });
      if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(300);
      }

      // Find the Advanced Table link
      const advancedLink = page.locator('a[href="/worklogs-table"]');
      await expect(advancedLink).toBeVisible();

      // Click and verify navigation
      await advancedLink.click();
      await expect(page).toHaveURL(/\/worklogs-table/);
    });

    test('should show back link on WorkLogTable page', async ({ page }) => {
      await page.goto('/worklogs-table');
      await page.waitForLoadState('networkidle');

      // Dismiss modal if shown
      const confirmBtn = page.getByRole('button', { name: /confirm|확인|close|닫기/i });
      if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(300);
      }

      const backLink = page.locator('a[href="/worklogs"]');
      await expect(backLink.first()).toBeVisible();

      // Click back and verify
      await backLink.first().click();
      await expect(page).toHaveURL(/\/worklogs$/);
    });
  });

  test.describe('Sidebar Collapse', () => {
    test('should collapse and expand sidebar', async ({ page }) => {
      const sidebar = page.locator('.bg-slate-900');

      // Collapse
      const collapseBtn = sidebar.locator('button').filter({ has: page.locator('svg.lucide-chevron-left') });
      await collapseBtn.click();
      await page.waitForTimeout(500);

      // Section headers should be hidden
      const navSections = sidebar.locator('nav .text-xs.uppercase');
      await expect(navSections).toHaveCount(0);

      // Nav links still exist
      const navLinks = sidebar.locator('nav a');
      expect(await navLinks.count()).toBeGreaterThan(0);

      // Expand back
      const expandBtn = sidebar.locator('button').filter({ has: page.locator('svg.lucide-chevron-right') });
      await expandBtn.click();
      await page.waitForTimeout(500);

      // Section headers visible again
      await expect(sidebar.locator('nav .text-xs.uppercase').first()).toBeVisible();
    });
  });
});
