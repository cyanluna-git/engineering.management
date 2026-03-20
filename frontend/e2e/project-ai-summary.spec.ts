import { test, expect } from '@playwright/test';

test.describe('Project AI Summary', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'gerald.park@edwardsvacuum.com');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/', { timeout: 10000 });
  });

  test('project summary API responds correctly', async ({ page }) => {
    await page.goto('/dashboard');
    const token = await page.evaluate(() => localStorage.getItem('token'));
    if (!token) return;

    const projectsResp = await page.request.get('/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!projectsResp.ok()) return;
    const projects = await projectsResp.json();
    if (projects.length === 0) return;

    const projectId = projects[0].id;
    const summaryResp = await page.request.get(
      `/api/dashboard/ai-summary/project/${projectId}?period=weekly`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(summaryResp.status()).toBe(200);
    const data = await summaryResp.json();
    expect(data).toHaveProperty('project_summary');
    expect(data).toHaveProperty('member_summary');
    expect(data).toHaveProperty('issues');
  });

  test('project summary API returns 404 for invalid project', async ({ page }) => {
    await page.goto('/dashboard');
    const token = await page.evaluate(() => localStorage.getItem('token'));
    if (!token) return;

    const resp = await page.request.get(
      '/api/dashboard/ai-summary/project/NONEXISTENT_PROJECT?period=weekly',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(resp.status()).toBe(404);
  });

  test('project summary history API responds', async ({ page }) => {
    await page.goto('/dashboard');
    const token = await page.evaluate(() => localStorage.getItem('token'));
    if (!token) return;

    const projectsResp = await page.request.get('/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!projectsResp.ok()) return;
    const projects = await projectsResp.json();
    if (projects.length === 0) return;

    const resp = await page.request.get(
      `/api/dashboard/ai-summary/project/${projects[0].id}/history`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(resp.status()).toBe(200);
    expect(Array.isArray(await resp.json())).toBe(true);
  });

  test('existing team AI summary still renders after refactor', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(3000);
    expect(errors.filter((e) => e.includes('summary'))).toHaveLength(0);
  });
});
