import { test, expect } from '@playwright/test';

test.describe('Project Weekly Report Hierarchy', () => {
  async function dismissBlockingModalIfVisible(page: import('@playwright/test').Page) {
    const releaseDialog = page.getByRole('dialog', { name: /(What's New|새로 업데이트된 기능)/i });
    if (await releaseDialog.isVisible().catch(() => false)) {
      const confirmButton = page.getByRole('button', { name: /^(Got it|확인했어요)$/ });
      if (await confirmButton.isVisible().catch(() => false)) {
        await confirmButton.click({ force: true });
      } else {
        await page.keyboard.press('Escape');
      }
      await expect(releaseDialog).toBeHidden();
    }
  }

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'user-1',
          email: 'gerald.park@edwardsvacuum.com',
          name: 'Gerald Park',
          korean_name: '박근윤',
          role: 'USER',
          is_active: true,
          department_id: 'dept-eci',
          sub_team_id: 'sub-is',
          seen_release_note_version: '2026-03-weekly-report-and-portal',
        }),
      });
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', 'gerald.park@edwardsvacuum.com');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(portal|dashboard)/, { timeout: 10000 });
  });

  test('should show Team and Project tabs on weekly reports page', async ({ page }) => {
    await page.goto('/reports/weekly');
    await dismissBlockingModalIfVisible(page);
    await page.waitForLoadState('networkidle');

    // Both tabs should be visible
    const teamTab = page.getByText(/팀 주간 보고|Team Weekly Report/);
    const projectTab = page.getByText(/프로젝트 주간 보고|Project Weekly Report/);
    await expect(teamTab).toBeVisible();
    await expect(projectTab).toBeVisible();
  });

  test('should switch to project tab and show selector', async ({ page }) => {
    await page.goto('/reports/weekly');
    await dismissBlockingModalIfVisible(page);
    await page.waitForLoadState('networkidle');

    const projectTab = page.getByText(/프로젝트 주간 보고|Project Weekly Report/);
    await dismissBlockingModalIfVisible(page);
    await projectTab.click();

    await expect(page.getByRole('combobox')).toBeVisible({ timeout: 5000 });
  });

  test('project hierarchy API responds correctly', async ({ page }) => {
    await page.goto('/reports/weekly');
    await dismissBlockingModalIfVisible(page);
    const token = await page.evaluate(() => localStorage.getItem('token'));
    if (!token) return;

    const projectsResp = await page.request.get('/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!projectsResp.ok()) return;
    const projects = await projectsResp.json();
    if (projects.length === 0) return;

    const resp = await page.request.get(
      `/api/weekly-reports/hierarchy/project?project_id=${projects[0].id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(resp.status()).toBe(200);
    const data = await resp.json();
    expect(data).toHaveProperty('project');
    expect(data).toHaveProperty('members');
    expect(data).toHaveProperty('submitted_count');
  });
});
