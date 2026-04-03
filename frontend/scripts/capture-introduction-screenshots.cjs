const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.EOB_BASE_URL || 'http://127.0.0.1:3004';
const API_URL = process.env.EOB_API_URL || 'http://127.0.0.1:8004';
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'introduction', 'screens');
const VIEWPORT = { width: 1600, height: 1000 };
const EXECUTABLE_PATH =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const SHOTS = [
  { key: 'dashboard', route: '/dashboard' },
  { key: 'worklogs', route: '/worklogs' },
  { key: 'teamCapacity', route: '/team-capacity' },
  { key: 'projects', route: '/projects' },
  { key: 'reports', route: '/reports' },
];

async function login() {
  const body = new URLSearchParams({
    username: process.env.EOB_DEMO_EMAIL || 'admin@edwards.com',
    password: process.env.EOB_DEMO_PASSWORD || 'password',
  });

  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (response.ok === false) {
    throw new Error(`Login failed with ${response.status}`);
  }

  return response.json();
}

async function dismissReleaseNotes(page) {
  const confirm = page.getByRole('button', { name: /확인했어요|got it/i });
  if ((await confirm.count()) === 0) {
    return;
  }

  try {
    await confirm.first().click({ timeout: 1500 });
    await page.waitForTimeout(300);
  } catch {
    // Non-blocking for screenshot generation.
  }
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log('output dir:', OUTPUT_DIR);

  console.log('logging in...');
  const auth = await login();
  console.log('login ok');
  console.log('launching browser...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: EXECUTABLE_PATH,
  });
  console.log('browser launched');
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  console.log('login page opened');
  await page.evaluate(
    ({ accessToken, refreshToken }) => {
      localStorage.setItem('authToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('i18nextLng', 'ko');
    },
    {
      accessToken: auth.access_token,
      refreshToken: auth.refresh_token,
    },
  );

  for (const shot of SHOTS) {
    console.log('capturing:', shot.key, shot.route);
    await page.goto(`${BASE_URL}${shot.route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await dismissReleaseNotes(page);
    await page.waitForTimeout(1800);

    const target = path.join(OUTPUT_DIR, `${shot.key}.png`);
    await page.screenshot({ path: target });
    console.log(`saved ${shot.key} -> ${target}`);
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
