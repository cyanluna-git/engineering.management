import { expect, test } from '@playwright/test';

async function mockSignedInProjectUser(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'user-1',
        email: 'gerald.park@edwardsvacuum.com',
        name: 'Gerald Park',
        korean_name: '박근윤',
        role: 'PM',
        is_active: true,
        department_id: 'dept-eci',
        sub_team_id: 'sub-is',
        seen_release_note_version: '2026-03-weekly-report-and-portal',
      }),
    });
  });
}

test.describe('Project Hierarchy Editor', () => {
  test.beforeEach(async ({ page }) => {
    await mockSignedInProjectUser(page);

    await page.goto('/login');
    await page.fill('input[type="email"]', 'gerald.park@edwardsvacuum.com');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(portal|dashboard)/, { timeout: 10000 });

    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
  });

  test('shows the current top-level project tabs', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Active Projects' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Functional' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'All Projects' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'IO Management' })).toBeVisible();
  });

  test('loads the Active Projects hierarchy by default', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Active Projects' })).toHaveAttribute('data-state', 'active');
    await expect(page.getByText('Product Hierarchy (Business Unit > Product Line > Project)')).toBeVisible();
  });

  test('switches to the Functional tab', async ({ page }) => {
    await page.getByRole('tab', { name: 'Functional' }).click();

    await expect(page.getByText('Functional Projects (Department > Project)')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Functional' })).toHaveAttribute('data-state', 'active');
  });

  test('shows the All Projects table and keeps it visible when sorting', async ({ page }) => {
    await page.getByRole('tab', { name: 'All Projects' }).click();

    await expect(page.getByText(/All Projects \(\d+ total\)/)).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Category' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();

    await page.getByRole('columnheader', { name: 'Name' }).click();
    await page.getByRole('columnheader', { name: 'Name' }).click();

    await expect(page.getByRole('table')).toBeVisible();
  });

  test('shows the IO management workspace', async ({ page }) => {
    await page.getByRole('tab', { name: 'IO Management' }).click();

    await expect(page.getByRole('tab', { name: /Internal IO/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Recharge IO/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ New Internal IO' })).toBeVisible();
  });

  test('shows project management actions for a PM user', async ({ page }) => {
    await expect(page.getByRole('button', { name: '+ New Business Unit' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ New Project' })).toBeVisible();
  });
});
