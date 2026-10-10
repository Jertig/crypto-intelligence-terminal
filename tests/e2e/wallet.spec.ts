import { test, expect } from '@playwright/test';
import { analyzeWallet } from '../../packages/domain/src/wallets';
import { walletTx, walletNow, walletAddress } from '../fixtures/wallets';
const history = Array.from({ length: 6 }, (_, i) => walletTx(i));
const response = {
  state: 'READY',
  observedAt: walletNow.toISOString(),
  provider: {
    status: 'DEGRADED',
    lastSuccessAt: walletNow.toISOString(),
    errorCode: 'PARTIAL_COVERAGE',
  },
  wallets: [
    {
      address: walletAddress,
      label: 'Synthetic fixture only',
      labelSource: 'Browser fixture, not live',
      firstObservedAt: walletTx(5).timestamp,
      lastPolledAt: walletNow.toISOString(),
      coverage: 'TRUNCATED',
      transactions: history,
      analysis: analyzeWallet(walletAddress, history, walletNow),
      compactedCount: 7,
    },
  ],
};
test('wallet evidence supports keyboard selection, transfer inspection and methodology disclosure', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/wallets', (r) => r.fulfill({ json: response }));
  await page.goto('/wallets');
  await expect(
    page.getByRole('heading', { name: 'Wallets', exact: true }),
  ).toBeVisible();
  const table = page.getByLabel('Wallet table');
  await table.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByLabel('Wallet evidence inspector')).toContainText(
    'Browser fixture, not live',
  );
  await expect(page.getByLabel('Wallet evidence inspector')).toContainText(
    'TRUNCATED',
  );
  await expect(
    page.getByRole('heading', { name: 'Relationship evidence' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Reputation methodology · v1' }),
  ).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'TRANSFER_ACTIVE', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('0%', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Open public address explorer ↗' }),
  ).toHaveAttribute('href', `https://solscan.io/account/${walletAddress}`);
  await page.getByPlaceholder('Label or address').fill('no-match');
  await expect(page.getByText('No wallets match this filter')).toBeVisible();
  await page.getByPlaceholder('Label or address').fill('');
  await page.getByLabel('Clear wallet selection').click();
  await expect(page.getByText('Select a wallet for activity')).toBeVisible();
  expect(errors).toEqual([]);
});
test('missing configuration and failed storage remain honest', async ({
  page,
}) => {
  await page.route('**/api/wallets', (r) =>
    r.fulfill({ json: { ...response, state: 'NOT_CONFIGURED', wallets: [] } }),
  );
  await page.goto('/wallets');
  await expect(page.getByText('No tracked wallets configured')).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'Realized performance', exact: true }),
  ).toBeVisible();
  await page.unroute('**/api/wallets');
  await page.route('**/api/wallets', (r) =>
    r.fulfill({ status: 503, json: { state: 'UNAVAILABLE' } }),
  );
  await page.reload();
  await expect(page.locator('main [role="alert"]')).toContainText(
    'Wallet storage unavailable',
  );
});
test('mobile wallet tables keep overflow internal and retain evidence', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/wallets', (r) => r.fulfill({ json: response }));
  await page.goto('/wallets');
  await page
    .getByRole('button', { name: 'Synthetic fixture only', exact: true })
    .click();
  await expect(page.getByLabel('Wallet evidence inspector')).toContainText(
    'UNCALIBRATED',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
