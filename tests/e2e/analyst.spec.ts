import { test, expect } from '@playwright/test';
import { analystFixture } from '../fixtures/analyst';
test('analyst memo renders distinct evidence, counter-evidence, confidence and sources without a giant chat panel', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/analyst', (r) =>
    r.fulfill({ json: analystFixture(new Date()) }),
  );
  await page.goto('/ai-analyst');
  await page.getByRole('button', { name: 'Build analyst memo' }).click();
  for (const name of [
    'Facts',
    'Derived Signals',
    'Interpretation',
    'Counter-evidence',
    'Confidence',
    'Sources',
  ])
    await expect(
      page.getByRole('heading', { name, exact: true }),
    ).toBeVisible();
  await expect(
    page.getByText(/Recorded relative strength exceeds BTC/),
  ).toBeVisible();
  await expect(page.getByText(/No calibrated forecast/)).toBeVisible();
  await expect(page.getByLabel('Analyst evidence policy')).toContainText(
    'READ-ONLY',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test('missing database/model and API validation preserve honest evidence brief; cross-origin and unsupported tools are rejected', async ({
  page,
}) => {
  await page.goto('/ai-analyst');
  await page.getByRole('button', { name: 'Build analyst memo' }).click();
  await expect(
    page.getByText(
      'AI interpretation unavailable or insufficient eligible evidence.',
      { exact: false },
    ),
  ).toBeVisible();
  await expect(page.getByText('INSUFFICIENT', { exact: true })).toBeVisible();
  await expect(page.getByText(/MODEL NOT_CONFIGURED/)).toBeVisible();
  const denied = await page.request.post('/api/analyst', {
    headers: { Origin: 'https://untrusted.invalid' },
    data: { asset: 'SOL', question: 'test', tools: ['market'] },
  });
  expect(denied.status()).toBe(403);
  const invalid = await page.request.post('/api/analyst', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: { asset: 'SOL', question: 'test', tools: ['execute_trade'] },
  });
  expect(invalid.status()).toBe(400);
  const oversized = await page.request.post('/api/analyst', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: { asset: 'SOL', question: 'x'.repeat(5000), tools: ['market'] },
  });
  expect(oversized.status()).toBe(400);
});
test('analyst failure, retry and bounded scope remain keyboard accessible', async ({
  page,
}) => {
  let fail = true;
  await page.route('**/api/analyst', (r) =>
    r.fulfill({
      status: fail ? 503 : 200,
      json: fail ? { error: 'UNAVAILABLE' } : analystFixture(new Date()),
    }),
  );
  await page.goto('/ai-analyst');
  await page.getByRole('button', { name: 'Build analyst memo' }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('alert', { name: 'Analyst status' }),
  ).toContainText('not replaced with estimates');
  fail = false;
  await page.getByRole('button', { name: 'Build analyst memo' }).click();
  await expect(
    page.getByRole('heading', { name: 'Sources', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('alert', { name: 'Analyst status' }),
  ).not.toBeVisible();
});
