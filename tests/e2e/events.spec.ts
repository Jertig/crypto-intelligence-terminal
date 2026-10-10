import { test, expect } from '@playwright/test';
import { eventResponse, macroResponse } from '../fixtures/events';

test('repeated event arrow navigation moves focus and preserves filtered selection evidence', async ({
  page,
}) => {
  const response = eventResponse();
  response.events = Array.from({ length: 3 }, (_, index) => ({
    ...response.events[0]!,
    id: `synthetic-event-${index}`,
    title: `SYNTHETIC EVENT ${index} — NOT LIVE`,
    timestamp: new Date(
      Date.parse(response.events[0]!.timestamp) + index * 60000,
    ).toISOString(),
    collectedAt: response.observedAt,
  }));
  response.impacts = [];
  await page.route('**/api/events', (r) => r.fulfill({ json: response }));
  await page.goto('/events');
  await page
    .getByRole('button', { name: 'SYNTHETIC EVENT 2 — NOT LIVE' })
    .focus();
  await page.keyboard.press('ArrowDown');
  await expect(
    page.getByRole('button', { name: 'SYNTHETIC EVENT 1 — NOT LIVE' }),
  ).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(
    page.getByRole('button', { name: 'SYNTHETIC EVENT 0 — NOT LIVE' }),
  ).toBeFocused();
  await page.getByPlaceholder('Title or category').fill('no event matches');
  await expect(page.getByLabel('Event inspector')).toContainText(
    'SYNTHETIC EVENT 0 — NOT LIVE',
  );
  await expect(
    page.getByRole('heading', { name: /SYNTHETIC EVENT 0/ }).first(),
  ).toBeVisible();
});
test('event selection, release evidence and missing impact components remain explainable', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/events', (r) =>
    r.fulfill({ json: eventResponse() }),
  );
  await page.goto('/events');
  const row = page.getByRole('button', {
    name: 'SYNTHETIC QA EVENT — NOT LIVE',
  });
  await row.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByLabel('Event inspector')).toContainText(
    'retrospective research',
  );
  await expect(
    page
      .getByLabel('Event inspector')
      .getByRole('link', { name: 'Open cited release' }),
  ).toHaveAttribute('href', 'https://www.bls.gov/cpi/');
  await expect(
    page.getByText('MISSING_MATCHED_OI_BOUNDARIES', { exact: false }),
  ).toBeVisible();
  await page.getByPlaceholder('Title or category').fill('no event matches');
  await expect(page.getByText('No sourced events stored')).toBeVisible();
  await page.getByPlaceholder('Title or category').fill('synthetic');
  await expect(row).toBeVisible();
  expect(errors).toEqual([]);
});
test('macro tables expose observed vintages, descriptive statistics and stale provider status', async ({
  page,
}) => {
  await page.route('**/api/macro', (r) => r.fulfill({ json: macroResponse() }));
  await page.goto('/macro');
  await expect(
    page.getByRole('heading', {
      name: 'Macro & cross-market research',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText('FRED · STALE', { exact: true })).toBeVisible();
  await expect(page.getByText('cross-market:v1 · RETROSPECTIVE')).toBeVisible();
  await expect(
    page.getByText('First observed version', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Macro series').selectOption('CPIAUCSL');
  await expect(
    page.getByText('Macro observations unavailable', { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Macro inspector')).toContainText(
    'No causation from correlation',
  );
});
test('event/macro error recovery and mobile layout preserve honest unavailable states', async ({
  page,
}) => {
  let fail = true;
  await page.route('**/api/events', (r) =>
    r.fulfill({
      status: fail ? 503 : 200,
      json: fail
        ? { state: 'UNAVAILABLE' }
        : {
            state: 'EMPTY',
            observedAt: new Date().toISOString(),
            events: [],
            impacts: [],
          },
    }),
  );
  await page.goto('/event-study');
  await expect(
    page.getByRole('alert', { name: 'Event storage status' }),
  ).toContainText('Event storage unavailable');
  fail = false;
  await page.getByRole('button', { name: 'Retry events' }).click();
  await expect(
    page.getByRole('alert', { name: 'Event storage status' }),
  ).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/macro', (r) => r.fulfill({ json: macroResponse() }));
  await page.goto('/macro');
  await expect(page.getByLabel('Macro inspector')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const response = await page.request.get('/api/events');
  expect(response.status()).toBe(200);
  expect((await response.json()).state).toBe('NOT_CONFIGURED');
});
