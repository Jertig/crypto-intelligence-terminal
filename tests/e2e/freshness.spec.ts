import { test, expect } from '@playwright/test';
import { fixtureInput } from '../fixtures/market-history';

test('a delayed query compares new evidence with the current clock', async ({
  page,
}) => {
  await page.route('**/api/markets', async (route) => {
    // Exceeds allowed future skew versus the initial clock, below request timeout.
    await new Promise((resolve) => setTimeout(resolve, 6000));
    const timestamp = new Date().toISOString();
    const row = fixtureInput('BTC').market;
    await route.fulfill({
      json: {
        state: 'READY',
        observedAt: timestamp,
        providers: [],
        rows: [
          {
            ...row,
            provenance: {
              ...row.provenance,
              sourceTimestamp: timestamp,
              ingestedAt: timestamp,
            },
          },
        ],
      },
    });
  });
  await page.goto('/markets');
  const table = page.getByRole('table', { name: 'Market scanner' });
  await expect(
    table.getByRole('cell', { name: 'BTC', exact: true }),
  ).toBeVisible({ timeout: 12000 });
  await expect(table.getByText('FRESH', { exact: true })).toBeVisible();
});
