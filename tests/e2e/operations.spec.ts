import { test, expect } from '@playwright/test';
test('storage thresholds, unavailable backups and stale protective observation remain explicit', async ({
  page,
}) => {
  await page.route('**/api/operations', (route) =>
    route.fulfill({
      json: {
        state: 'OBSERVED',
        observation: {
          enabled: true,
          observedAt: '2026-01-01T00:00:00Z',
          databaseBytes: 6 * 1024 ** 3,
          disks: [
            {
              name: 'database',
              totalBytes: 1000000000,
              availableBytes: 190000000,
            },
            {
              name: 'backups',
              totalBytes: 1000000000,
              availableBytes: 800000000,
            },
          ],
          state: 'URGENT',
          reasons: ['SYNTHETIC TEST ONLY'],
          backup: null,
        },
      },
    }),
  );
  await page.goto('/data-status');
  await expect(
    page.getByRole('heading', { name: 'Storage and backups' }),
  ).toBeVisible();
  await expect(
    page.getByText('STALE OBSERVATION', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('81.0% used', { exact: true })).toBeVisible();
  await expect(
    page.getByText('No verified successful backup recorded.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText('Local backups require an off-host copy', { exact: false }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('operations API failure recovers with keyboard retry without inventing capacity', async ({
  page,
  request,
}) => {
  await page.route('**/api/operations', (route) =>
    route.fulfill({
      status: 503,
      json: { state: 'UNAVAILABLE', observation: null },
    }),
  );
  await page.goto('/data-status');
  await expect(
    page.getByText('Operations status unavailable.', { exact: false }),
  ).toBeVisible();
  await page.route('**/api/operations', (route) =>
    route.fulfill({ json: { state: 'NOT_CONFIGURED', observation: null } }),
  );
  const retry = page.getByRole('button', { name: 'Retry operations' });
  await retry.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText(
      'Operations observation unavailable; no storage capacity is assumed.',
    ),
  ).toBeVisible();
  const response = await request.get('/api/operations');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
});
