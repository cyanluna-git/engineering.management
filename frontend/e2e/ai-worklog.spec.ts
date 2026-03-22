import { expect, test } from '@playwright/test';

type MockMode = {
  healthy?: boolean;
  parseSucceeds?: boolean;
};

async function installWorklogMocks(
  page: import('@playwright/test').Page,
  { healthy = true, parseSucceeds = true }: MockMode = {}
) {
  await page.addInitScript(() => {
    window.localStorage.setItem('authToken', 'test-token');
    window.localStorage.setItem('refreshToken', 'test-refresh-token');
  });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

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
          role: 'USER',
          is_active: true,
          department_id: 'dept-1',
          sub_team_id: 'sub-1',
          seen_release_note_version: '2026-03-weekly-report-and-portal',
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

    if (url.pathname === '/api/worklogs/completion/monthly') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          business_days: 22,
          entries: [
            {
              user_id: 'user-1',
              user_name: 'Gerald Park',
              user_korean_name: '박근윤',
              department_name: 'Control Engineering',
              sub_team_name: 'Electrical (IS)',
              business_days: 22,
              completed_days: 0,
              completion_rate: 0,
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname === '/api/projects') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'proj-1',
            code: 'QOC001',
            name: 'QOC Pilot',
            category: 'PRODUCT',
            status: 'InProgress',
          },
        ]),
      });
      return;
    }

    if (url.pathname === '/api/worklogs/frequent') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          work_types: [],
          projects: [],
        }),
      });
      return;
    }

    if (url.pathname === '/api/projects/hierarchy') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          product_projects: [
            {
              id: 'bu-1',
              code: 'BU1',
              name: 'Controls',
              type: 'business_unit',
              children: [
                {
                  id: 'pl-1',
                  code: 'PL1',
                  name: 'Pilot Line',
                  type: 'product_line',
                  children: [
                    {
                      id: 'proj-1',
                      code: 'QOC001',
                      name: 'QOC Pilot',
                      type: 'project',
                      status: 'InProgress',
                    },
                  ],
                },
              ],
            },
          ],
          functional_projects: [],
          support_projects: [],
          ungrouped_projects: [],
        }),
      });
      return;
    }

    if (url.pathname === '/api/projects/product-lines/hierarchy') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'bu-1',
            code: 'BU1',
            name: 'Controls',
            type: 'business_unit',
            children: [
              {
                id: 'pl-1',
                code: 'PL1',
                name: 'Pilot Line',
                type: 'product_line',
                children: [],
              },
            ],
          },
        ]),
      });
      return;
    }

    if (url.pathname === '/api/work-types/tree') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            code: 'ENG',
            name: 'Engineering',
            name_ko: '엔지니어링',
            children: [
              {
                id: 111,
                code: 'MEET',
                name: 'Meetings',
                name_ko: '회의',
                applicable_roles: null,
                children: [],
              },
            ],
          },
        ]),
      });
      return;
    }

    if (url.pathname === '/api/ai/ai-health') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          healthy
            ? { status: 'healthy', model: 'mock-gpt' }
            : { status: 'unhealthy', model: null }
        ),
      });
      return;
    }

    if (url.pathname === '/api/ai/ai-parse' && request.method() === 'POST') {
      if (!parseSucceeds) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'mock parse failure' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          entries: [
            {
              project_id: 'proj-1',
              project_name: 'QOC Pilot',
              work_type_category_id: 111,
              work_type_name: 'Meetings',
              hours: 2,
              description: 'Prepared kickoff meeting',
              confidence: 0.92,
            },
          ],
          warnings: [],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

async function openWorklogsPage(
  page: import('@playwright/test').Page,
  options?: MockMode
) {
  await installWorklogMocks(page, options);
  await page.goto('/worklogs');
  await page.waitForLoadState('networkidle');
}

test.describe('AI WorkLog Input', () => {
  test('shows the current WorkLogs tabs and AI day actions', async ({ page }) => {
    await openWorklogsPage(page);

    await expect(page.getByRole('tab', { name: /Entry|입력/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Monthly Rate|월간 입력률/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Table|테이블/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Advanced Table/ })).toBeVisible();

    await expect(page.getByRole('button', { name: /AI work entry|AI 업무 입력/ }).first()).toBeVisible();
  });

  test('opens the AI modal from a calendar day action', async ({ page }) => {
    await openWorklogsPage(page);

    await page.getByRole('button', { name: /AI work entry|AI 업무 입력/ }).first().click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/Natural language work input|자연어로 업무 입력/)).toBeVisible();
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.getByRole('button', { name: /AI Analyze|AI 분석/ })).toBeDisabled();
  });

  test('shows the preview after a successful AI parse', async ({ page }) => {
    await openWorklogsPage(page, { healthy: true, parseSucceeds: true });

    await page.getByRole('button', { name: /AI work entry|AI 업무 입력/ }).first().click();
    await page.locator('textarea').fill('Prepared OQC kickoff meeting for 2 hours');
    await page.getByRole('button', { name: /AI Analyze|AI 분석/ }).click();

    await expect(page.getByText(/AI Analysis Results|AI 분석 결과/)).toBeVisible();
    await expect(page.getByText(/Item 1|항목 1/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Save All|모두 저장/ })).toBeVisible();
  });

  test('shows a warning when AI parsing fails', async ({ page }) => {
    await openWorklogsPage(page, { healthy: true, parseSucceeds: false });

    await page.getByRole('button', { name: /AI work entry|AI 업무 입력/ }).first().click();
    await page.locator('textarea').fill('This should fail');
    await page.getByRole('button', { name: /AI Analyze|AI 분석/ }).click();

    await expect(page.getByText(/AI parsing failed|AI 파싱에 실패했습니다/)).toBeVisible();
  });
});
