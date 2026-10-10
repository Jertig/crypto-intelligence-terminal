import { test, expect } from '@playwright/test';
import {
  calculateTokenRisk,
  tokenId,
} from '../../packages/domain/src/token-risk';
import {
  fixturePair,
  fixtureSecurity,
  tokenNow,
  tokenRef,
} from '../fixtures/token-risk';

test('source status reports DEX and GoPlus independently of Binance', async ({
  page,
}) => {
  const stamp = tokenNow.toISOString();
  await page.route('**/api/markets', (route) =>
    route.fulfill({
      json: {
        state: 'EMPTY',
        observedAt: stamp,
        rows: [],
        providers: [
          {
            providerId: 'binance:spot',
            status: 'DOWN',
            lastSuccessAt: null,
            lastAttemptAt: stamp,
            updatedAt: stamp,
            errorCode: 'TIMEOUT',
          },
          {
            providerId: 'dexscreener',
            status: 'HEALTHY',
            lastSuccessAt: stamp,
            lastAttemptAt: stamp,
            updatedAt: stamp,
            errorCode: null,
          },
          {
            providerId: 'goplus',
            status: 'DEGRADED',
            lastSuccessAt: null,
            lastAttemptAt: stamp,
            updatedAt: stamp,
            errorCode: 'PARTIAL_COVERAGE',
          },
        ],
      },
    }),
  );
  await page.goto('/api-sources');
  const dex = page
    .locator('tr')
    .filter({ has: page.getByText('DEX Screener', { exact: true }) });
  const security = page
    .locator('tr')
    .filter({ has: page.getByText('GoPlus', { exact: true }) });
  await expect(dex).toContainText('STALE');
  await expect(dex).not.toContainText('Not connected');
  await expect(security).toContainText('DEGRADED');
  await expect(security).not.toContainText('spot:');
});
test('token scanner, separate risk evidence, keyboard selection and inspector survive navigation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const pair = { ...fixturePair(), fdvUsd: 1000 };
  await page.route('**/api/tokens', (route) =>
    route.fulfill({
      json: {
        state: 'READY',
        observedAt: tokenNow.toISOString(),
        tokens: [
          {
            ...tokenRef,
            id: tokenId(tokenRef),
            symbol: 'FIXTURE',
            name: 'Synthetic fixture only',
          },
        ],
        pairs: [pair],
        security: [fixtureSecurity()],
        risks: [
          calculateTokenRisk(
            tokenRef,
            [pair],
            [],
            fixtureSecurity(),
            [],
            tokenNow,
          ),
        ],
      },
    }),
  );
  await page.goto('/tokens');
  const table = page.getByRole('table', {
    name: 'Token liquidity scanner',
    exact: true,
  });
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await table.focus();
  await page.keyboard.press('ArrowDown');
  const inspector = page.getByRole('complementary', {
    name: 'Token evidence inspector',
  });
  await expect(inspector).toContainText(tokenRef.address);
  await expect(inspector).toContainText('Reported market cap exceeds FDV');
  await expect(
    page.getByRole('table', { name: 'OWNERSHIP risk components' }),
  ).toContainText('Connected-wallet concentration');
  await expect(table).toContainText('STALE');
  await expect(page.locator('.vacuum-panel')).toContainText('UNAVAILABLE');
  await page.getByRole('link', { name: 'Risk', exact: true }).click();
  await expect(page).toHaveURL('/risk');
  await expect(
    page.getByRole('heading', { name: 'Risk', exact: true }),
  ).toBeVisible();
  await expect(inspector).toContainText('FIXTURE');
  await page.getByLabel('Filter tokens').fill('unknown');
  await expect(table).toContainText('No token observations available');
  await page.getByLabel('Filter tokens').fill('FIXTURE');
  await table.getByRole('button', { name: /Liquidity/ }).click();
  await page.getByLabel('Clear token selection').click();
  await expect(inspector).toContainText('Select a token');
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
test('token storage error, empty evidence and retry are explicit', async ({
  page,
}) => {
  await page.route('**/api/tokens', (route) =>
    route.fulfill({ status: 503, json: { state: 'UNAVAILABLE' } }),
  );
  await page.goto('/risk');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Token storage unavailable' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Retry token query' }),
  ).toBeVisible();
  await expect(
    page.getByText('No token observations available', { exact: true }),
  ).toBeVisible();
});
