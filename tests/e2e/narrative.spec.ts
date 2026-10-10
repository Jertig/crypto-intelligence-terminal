import { test, expect } from '@playwright/test';
import {
  calculateFeatures,
  taxonomy,
  initialExposures,
  scoreNarrative,
} from '../../packages/domain/src/intelligence';
import { calculateSignals } from '../../packages/domain/src/signals';
import { fixtureInput, fixtureNow } from '../fixtures/market-history';
test('narrative matrix exposes coverage, methodology, missing factors and selected feature evidence', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const inputs = ['BTC', 'ETH', 'AAVE'].map((base) => {
    const input = fixtureInput(base);
    input.funding = [];
    input.oi = [];
    input.market.funding = null;
    return input;
  });
  const members = inputs.map((input) => ({
    assetId: input.market.assetId,
    marketId: input.market.id,
    features: calculateFeatures(input, fixtureNow),
  }));
  await page.route('**/api/markets', (route) =>
    route.fulfill({
      json: {
        state: 'READY',
        observedAt: fixtureNow.toISOString(),
        providers: [],
        rows: inputs.map((input) => input.market),
      },
    }),
  );
  await page.route('**/api/intelligence', (route) =>
    route.fulfill({
      json: {
        state: 'READY',
        observedAt: fixtureNow.toISOString(),
        taxonomy,
        exposures: initialExposures,
        features: members.flatMap((member) => member.features),
        narratives: taxonomy.map((item) =>
          scoreNarrative(item.id, members, initialExposures, fixtureNow),
        ),
        signals: calculateSignals(members, fixtureNow),
      },
    }),
  );
  await page.goto('/narratives');
  const table = page.getByRole('table', { name: 'Narrative matrix' });
  await expect(table.locator('tbody tr')).toHaveCount(15);
  await table.getByRole('button', { name: 'DeFi', exact: true }).click();
  await expect(
    page.getByRole('table', { name: 'Narrative score components' }),
  ).toContainText('wallet inflow');
  await expect(page.locator('.narrative-detail')).toContainText(
    'Unavailable · incomplete evidence',
  );
  await expect(page.locator('.narrative-detail')).toContainText(
    'narrative-rotation:v1',
  );
  await expect(page.locator('.narrative-detail')).toContainText(
    'Coverage: 50%',
  );
  await expect(table).toContainText('STALE');
  await expect(page.locator('.regime-panel')).toContainText('UNAVAILABLE');
  await page
    .locator('.narrative-members')
    .getByRole('button', { name: 'binance:ETH', exact: true })
    .click();
  const inspector = page.getByRole('complementary');
  await expect(inspector).toContainText('ETH');
  const features = inspector.getByRole('table', {
    name: 'Selected asset derived features',
  });
  await expect(features.locator('tbody tr')).toHaveCount(14);
  await features.getByText('return 24h', { exact: true }).click();
  await expect(features).toContainText('market-features:v1');
  await expect(features).toContainText('test-fixture');
  await page.getByLabel('Filter narratives').fill('Oracle');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test('narrative storage errors and absent evidence are explicit and recoverable', async ({
  page,
}) => {
  await page.route('**/api/intelligence', (route) =>
    route.fulfill({ status: 503, json: { state: 'UNAVAILABLE' } }),
  );
  await page.goto('/narratives');
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Intelligence storage unavailable' }),
  ).toContainText('Intelligence storage unavailable');
  await expect(
    page.getByRole('button', { name: 'Retry intelligence query' }),
  ).toBeVisible();
  await expect(
    page.getByText('No narrative calculations available', { exact: true }),
  ).toBeVisible();
});
