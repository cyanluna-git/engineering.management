import { test, expect } from '@playwright/test';

test.describe('Project Weekly Report Hierarchy', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'gerald.park@edwardsvacuum.com');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/', { timeout: 10000 });
  });

  test('should show Team and Project tabs on weekly reports page', async ({ page }) => {
    await page.goto('/reports/weekly');
    await page.waitForLoadState('networkidle');

    // Both tabs should be visible
    const teamTab = page.getByRole('tab', { name: /팀/ });
    const projectTab = page.getByRole('tab', { name: /프로젝트/ });
    await expect(teamTab).toBeVisible();
    await expect(projectTab).toBeVisible();
  });

  test('should switch to project tab and show selector', async ({ page }) => {
    await page.goto('/reports/weekly');
    await page.waitForLoadState('networkidle');

    const projectTab = page.getByRole('tab', { name: /프로젝트/ });
    await projectTab.click();

    // Should show project selector or placeholder
    const content = page.locator('text=/프로젝트를 선택|프로젝트 선택/');
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  test('project hierarchy API responds correctly', async ({ page }) => {
    await page.goto('/reports/weekly');
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
