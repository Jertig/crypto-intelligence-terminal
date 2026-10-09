import { test, expect } from '@playwright/test';

// Explicit route fixtures exercise failure/selection paths; never production seeds.
const stamp = '2026-01-01T00:10:00.000Z';
const fixtureRow = (base: string, price: number, volume: number) => ({
  id: `binance:spot:${base}USDT`,
  marketId: `binance:spot:${base}USDT`,
  assetId: `binance:${base}`,
  venueId: 'binance',
  symbol: `${base}USDT`,
  base,
  quote: 'USDT',
  kind: 'SPOT',
  price,
  change24h: 2,
  quoteVolume24h: volume,
  freshness: 'STALE',
  funding: null,
  openInterest: null,
  provenance: {
    providerId: 'test-fixture',
    source: 'fixture-only',
    sourceTimestamp: stamp,
    ingestedAt: stamp,
    quality: 'DIRECT',
  },
});
const fixtures = [
  fixtureRow('FIXTUREONE', 10, 100),
  fixtureRow('FIXTURETWO', 20, 200),
];
test('scanner sorts, filters, hides columns, selects by keyboard and updates provenance', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/markets', (route) =>
    route.fulfill({
      json: {
        state: 'READY',
        observedAt: stamp,
        rows: fixtures,
        providers: [
          {
            providerId: 'test-fixture',
            status: 'DEGRADED',
            lastSuccessAt: stamp,
            errorCode: 'TIMEOUT',
          },
        ],
      },
    }),
  );
  await page.route('**/api/candles?**', (route) =>
    route.fulfill({
      json: {
        state: 'READY',
        rows: [0, 1, 2].map((index) => ({
          marketId: fixtures[0]!.id,
          timeframe: '1h',
          openTime: new Date(
            Date.parse(stamp) - (3 - index) * 3600000,
          ).toISOString(),
          closeTime: new Date(
            Date.parse(stamp) - (2 - index) * 3600000 - 1,
          ).toISOString(),
          open: 10,
          high: 12,
          low: 9,
          close: 11,
          volume: 100,
          provenance: fixtures[0]!.provenance,
        })),
      },
    }),
  );
  await page.goto('/markets');
  const table = page.getByRole('table', { name: 'Market scanner' });
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await table.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('complementary')).toContainText('FIXTURETWO');
  await expect(page.getByRole('complementary')).toContainText('test-fixture');
  await expect(page.getByRole('complementary')).toContainText(
    'Unavailable · derivatives',
  );
  await expect(page.getByRole('complementary')).toContainText('STALE');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary')).toBeFocused();
  await page.getByRole('button', { name: 'Price · USDT', exact: true }).click();
  await page.getByLabel('Filter assets').fill('FIXTUREONE');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await table.locator('tbody tr').click();
  await expect(page.getByRole('complementary')).toContainText('FIXTUREONE');
  await expect(
    page.getByLabel('FIXTUREONE closed price history'),
  ).toBeVisible();
  await page.getByText('Columns', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Last funding %' }).uncheck();
  await expect(
    table.getByRole('columnheader', { name: 'Last funding %' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear selected asset' }).click();
  await expect(page.getByRole('complementary')).toContainText(
    'Select an asset',
  );
  await page.keyboard.press('Control+k');
  await page.getByLabel('Search workspaces').fill('FIXTUREONE');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary')).toContainText('FIXTUREONE');
  expect(errors).toEqual([]);
});
test('query failure is explicit and unsafe candle inputs are rejected', async ({
  page,
  request,
}) => {
  await page.route('**/api/markets', (route) =>
    route.fulfill({ status: 503, json: { error: 'UNAVAILABLE' } }),
  );
  await page.goto('/markets');
  await expect(page.locator('.live-scanner').getByRole('alert')).toContainText(
    'Market storage unavailable',
  );
  expect((await request.get('/api/candles?market=../../.env')).status()).toBe(
    400,
  );
  expect(
    (
      await request.get(
        '/api/candles?market=binance:spot:FIXTUREUSDT&timeframe=invalid',
      )
    ).status(),
  ).toBe(400);
});

test('populated mobile tape stays bounded and selected evidence precedes the scanner', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/markets', (route) =>
    route.fulfill({
      json: {
        state: 'READY',
        observedAt: stamp,
        providers: [],
        rows: [fixtureRow('BTC', 80000, 100), fixtureRow('ETH', 2000, 200)],
      },
    }),
  );
  await page.goto('/markets');
  await page
    .locator('.mobile-assets button')
    .filter({ hasText: 'BTC' })
    .click();
  await expect(page.getByRole('complementary')).toContainText('BTC');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator('.live-scanner')
      .evaluate((node) => getComputedStyle(node, '::after').content),
  ).toBe('none');
  const inspector = await page.getByRole('complementary').boundingBox();
  const scanner = await page.locator('.live-scanner').boundingBox();
  expect(inspector?.y).toBeLessThan(scanner?.y ?? 0);
});
