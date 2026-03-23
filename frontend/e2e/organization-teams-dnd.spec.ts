import { expect, test } from '@playwright/test';

type Role = 'ADMIN' | 'USER';

const divisions = [
  { id: 'div-eng', name: 'Engineering', code: 'ENG', is_active: true },
];

const departments = [
  {
    id: 'dept-eci',
    name: 'Electrical, Controls & Instrumentation',
    code: 'ECI',
    business_unit_id: null,
    division_id: 'div-eng',
    is_active: true,
  },
  {
    id: 'dept-is',
    name: 'Integrated System',
    code: 'IS',
    business_unit_id: null,
    division_id: 'div-eng',
    is_active: true,
  },
];

const subTeamsByDepartment: Record<string, Array<{ id: string; name: string; code: string; department_id: string; is_active: boolean }>> = {
  'dept-eci': [
    { id: 'sub-soft', name: 'Software', code: 'SOFT', department_id: 'dept-eci', is_active: true },
    { id: 'sub-hw', name: 'Hardware', code: 'HARD', department_id: 'dept-eci', is_active: true },
  ],
  'dept-is': [
    { id: 'sub-systems', name: 'Systems', code: 'SYS', department_id: 'dept-is', is_active: true },
  ],
};

const jobPositions = [
  { id: 'pos-eng', name: 'Engineer', code: 'ENG', is_active: true },
  { id: 'pos-pm', name: 'Project Manager', code: 'PM', is_active: true },
];

async function mockOrganizationWorkspace(page: import('@playwright/test').Page, role: Role) {
  let usersState = [
    {
      id: 'user-raj',
      name: 'Rajashri Ghatge',
      korean_name: null,
      email: 'rajashri@edwards.com',
      division_id: 'div-eng',
      department_id: 'dept-eci',
      sub_team_id: 'sub-soft',
      position_id: 'pos-pm',
      primary_business_unit_id: null,
      role: 'USER',
      is_active: true,
    },
    {
      id: 'user-prakash',
      name: 'Prakash Koladiya',
      korean_name: null,
      email: 'prakash@edwards.com',
      division_id: 'div-eng',
      department_id: 'dept-eci',
      sub_team_id: 'sub-soft',
      position_id: 'pos-eng',
      primary_business_unit_id: null,
      role: 'USER',
      is_active: true,
    },
    {
      id: 'user-tim',
      name: 'Tim Hanson',
      korean_name: null,
      email: 'tim@edwards.com',
      division_id: 'div-eng',
      department_id: 'dept-is',
      sub_team_id: null,
      position_id: 'pos-pm',
      primary_business_unit_id: null,
      role: 'USER',
      is_active: true,
    },
  ];

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
          id: 'admin-1',
          email: 'admin@edwards.com',
          name: 'System Admin',
          korean_name: '시스템관리자',
          role,
          is_active: true,
          department_id: 'dept-eci',
          sub_team_id: 'sub-soft',
          seen_release_note_version: '2026-03-weekly-report-and-portal',
        }),
      });
      return;
    }

    if (url.pathname === '/api/divisions') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(divisions),
      });
      return;
    }

    if (url.pathname === '/api/departments') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(departments),
      });
      return;
    }

    if (url.pathname === '/api/users' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(usersState),
      });
      return;
    }

    if (url.pathname.startsWith('/api/users/') && request.method() === 'PUT') {
      const userId = url.pathname.split('/').pop()!;
      const payload = request.postDataJSON() as {
        division_id?: string | null;
        department_id?: string | null;
        sub_team_id?: string | null;
      };

      usersState = usersState.map((user) =>
        user.id === userId
          ? {
              ...user,
              division_id: payload.division_id ?? user.division_id,
              department_id: payload.department_id ?? user.department_id,
              sub_team_id: payload.sub_team_id ?? user.sub_team_id,
            }
          : user
      );

      const updatedUser = usersState.find((user) => user.id === userId);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updatedUser),
      });
      return;
    }

    if (url.pathname.startsWith('/api/departments/') && url.pathname.endsWith('/sub-teams')) {
      const departmentId = url.pathname.split('/')[3];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(subTeamsByDepartment[departmentId] ?? []),
      });
      return;
    }

    if (url.pathname === '/api/job-positions') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(jobPositions),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `Unhandled route: ${url.pathname}` }),
    });
  });
}

test.describe('Organization teams drag-and-drop management', () => {
  test('shows simplified team cards and moves a member with drag and drop for admins', async ({ page }) => {
    await mockOrganizationWorkspace(page, 'ADMIN');

    await page.goto('/organization');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('division-section-div-eng')).toBeVisible();
    await expect(page.getByTestId('department-card-dept-eci')).toBeVisible();
    await expect(page.getByTestId('department-card-dept-is')).toBeVisible();
    await expect(page.getByTestId('subteam-zone-sub-soft')).toContainText('Rajashri Ghatge');

    await page.getByTestId('member-card-user-raj').dragTo(page.getByTestId('subteam-zone-sub-hw'));

    await expect(page.getByTestId('subteam-zone-sub-hw')).toContainText('Rajashri Ghatge');
    await expect(page.getByTestId('subteam-zone-sub-soft')).not.toContainText('Rajashri Ghatge');
  });

  test('keeps organization cards readable for regular users without move controls', async ({ page }) => {
    await mockOrganizationWorkspace(page, 'USER');

    await page.goto('/organization');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('division-section-div-eng')).toBeVisible();
    await expect(page.getByTestId('department-card-dept-eci')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Division' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit member Rajashri Ghatge' })).toHaveCount(0);
    await expect(page.getByTestId('member-card-user-raj')).toHaveAttribute('draggable', 'false');
  });
});
