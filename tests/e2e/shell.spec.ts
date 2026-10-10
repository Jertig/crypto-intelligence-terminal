import { expect, test } from '@playwright/test';

test('ivory shell renders honest empty states without browser errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page).toHaveTitle('Crypto Intelligence Terminal');
  await expect(
    page.getByRole('heading', { name: 'Dashboard', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Market feeds are not connected', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Asset inspector' }),
  ).toContainText('Select an asset');
  await expect(page.locator('.market-tape')).toContainText('No live feed');
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(241, 238, 230)',
  );
  await expect(
    page.getByRole('link', { name: 'Dashboard', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  expect(errors).toEqual([]);
});

test('workspace navigation opens the market core and discloses later planned functionality', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Markets', exact: true })
    .click();
  await expect(page).toHaveURL('/markets');
  await expect(
    page.getByRole('heading', { name: 'Markets', exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('Market feeds are not connected', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Wallets', exact: true })
    .click();
  await expect(page).toHaveURL('/wallets');
  await expect(page.getByText('No tracked wallets configured')).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Wallet evidence inspector' }),
  ).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'AI Analyst', exact: true })
    .click();
  await expect(page).toHaveURL('/ai-analyst');
  await expect(
    page.getByRole('heading', { name: 'AI analyst memo', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Analyst evidence policy' }),
  ).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Research', exact: true })
    .click();
  await expect(page).toHaveURL('/research');
  await expect(
    page.getByRole('heading', { name: 'Research notebook', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Research policy' }),
  ).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'CEX Flows', exact: true })
    .click();
  await expect(page).toHaveURL('/cex-flows');
  await expect(
    page.getByText('This workspace is not available yet', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Asset inspector' }),
  ).toBeVisible();
});

test('command palette supports filtering, arrow keys, Enter and Escape', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Open command palette' }),
  ).toBeEnabled();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox')).toBeFocused();
  await dialog.getByRole('textbox').fill('data');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/data-status');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Open command palette' }).click();
  await dialog.getByRole('textbox').fill('unsupported asset command');
  await expect(dialog.getByText(/No matching workspace/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open command palette' }),
  ).toBeFocused();
  await page.keyboard.press('/');
  await expect(dialog).toBeVisible();
});

test('data status handles a loading response and absent configuration', async ({
  page,
}) => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/health', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/data-status');
  await expect(page.getByRole('status')).toHaveText('Checking runtime health…');
  release?.();
  await expect(page.locator('.system-health')).toContainText('NOT CONFIGURED');
  await expect(page.locator('.provider-table tbody tr')).toHaveCount(7);
  await expect(page.locator('.provider-table')).toContainText('Not connected');
});

test('API errors and offline state remain explicit and recoverable', async ({
  page,
  context,
}) => {
  await page.route('**/health', (route) =>
    route.fulfill({ status: 503, body: '{}' }),
  );
  await page.goto('/data-status');
  await expect(page.locator('.system-health').getByRole('alert')).toHaveText(
    'Runtime health unavailable',
  );
  await page.unroute('**/health');
  await page.getByRole('button', { name: 'Retry health check' }).click();
  await expect(page.locator('.system-health')).toContainText('NOT CONFIGURED');
  await context.setOffline(true);
  await expect(
    page.getByText('Offline · connections and evidence cannot be refreshed.'),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(
    page.getByText('Offline · connections and evidence cannot be refreshed.'),
  ).not.toBeVisible();
});

test('stale worker and unavailable database are displayed without claiming live data', async ({
  page,
}) => {
  await page.route('**/health', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        dependencies: { database: 'UNAVAILABLE', worker: 'STALE' },
      }),
    }),
  );
  await page.goto('/data-status');
  await expect(page.locator('.system-health')).toContainText('UNAVAILABLE');
  await expect(page.locator('.system-health')).toContainText('STALE');
  await expect(page.locator('.market-tape')).toContainText('No live feed');
});

test('readiness remains false without configured dependencies', async ({
  request,
}) => {
  const live = await request.get('/health');
  expect(live.status()).toBe(200);
  expect(await live.json()).toMatchObject({
    ready: false,
    providers: { configured: 0 },
  });
  const ready = await request.get('/health?ready=1');
  expect(ready.status()).toBe(503);
});

test('1366px and ultrawide layouts avoid horizontal page overflow', async ({
  page,
}) => {
  for (const width of [1366, 2560]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole('complementary', { name: 'Asset inspector' }),
    ).toBeVisible();
  }
});

test('mobile emphasizes selected asset and analyst memo without a desktop table', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(
    page.getByText('Select an asset', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Analyst memo' }),
  ).toBeVisible();
  await expect(page.locator('.scanner table')).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('unknown workspace returns a useful 404', async ({ page }) => {
  const response = await page.goto('/unknown-workspace');
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { name: 'Workspace not found' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Return to Dashboard' }).click();
  await expect(page).toHaveURL('/');
});
