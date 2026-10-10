import { test, expect } from '@playwright/test';
import {
  emptyResearch,
  type ResearchAction,
} from '../../packages/domain/src/research';
import { analystFixture } from '../fixtures/analyst';
const id = '63cf5404-dbf6-4fe2-8f38-42e034ee305d';
test('unconfigured research is honest and mutations reject foreign origins, oversized bodies and unsupported actions', async ({
  page,
}) => {
  await page.goto('/research');
  await expect(page.getByText(/Research storage NOT_CONFIGURED/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save note', exact: true }),
  ).toBeDisabled();
  const req = { action: 'CREATE_WATCHLIST', title: 'QA' };
  expect(
    (
      await page.request.post('/api/research', {
        headers: { Origin: 'https://evil.invalid' },
        data: req,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post('/api/research', {
        headers: { Origin: 'http://127.0.0.1:3100' },
        data: { action: 'EXECUTE_TRADE' },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post('/api/research', {
        headers: { Origin: 'http://127.0.0.1:3100' },
        data: { ...req, title: 'x'.repeat(20000) },
      })
    ).status(),
  ).toBe(400);
  expect(
    (await page.request.get('/api/research/report?id=../secret')).status(),
  ).toBe(400);
  expect(
    (await page.request.get('/api/research/view?id=../secret')).status(),
  ).toBe(400);
});
test('notes save by keyboard, render escaped text and surface edit conflicts without silently replacing records', async ({
  page,
}) => {
  const data = emptyResearch('READY'),
    actions: ResearchAction[] = [];
  let conflict = false;
  await page.route('**/api/research', async (r) => {
    if (r.request().method() === 'GET') return r.fulfill({ json: data });
    const a = r.request().postDataJSON() as ResearchAction;
    actions.push(a);
    if (a.action === 'SAVE_NOTE') {
      if (conflict)
        return r.fulfill({ status: 409, json: { error: 'RESEARCH_CONFLICT' } });
      data.notes = [
        {
          id,
          title: a.title,
          asset: a.asset,
          body: a.body,
          updatedAt: new Date().toISOString(),
        },
      ];
    }
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto('/research');
  await page.getByLabel('Note title').fill('SYNTHETIC QA NOTE');
  await page.getByLabel('Note asset').selectOption('BTC');
  await page
    .getByLabel('Note body')
    .fill('<script>window.QA_NOT_EXECUTED=1</script>');
  await page.getByRole('button', { name: 'Save note', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('cell', { name: 'SYNTHETIC QA NOTE', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => Object.hasOwn(window, 'QA_NOT_EXECUTED')),
  ).toBe(false);
  await page.getByRole('button', { name: 'Edit note', exact: true }).click();
  await page.getByLabel('Note body').fill('Revised synthetic note');
  conflict = true;
  await page.getByRole('button', { name: 'Update note', exact: true }).click();
  await expect(page.getByLabel('Research status')).toContainText(
    'Note changed',
  );
  expect(actions.at(-1)).toHaveProperty('expectedUpdatedAt');
  expect(actions[0]).toHaveProperty('asset', 'BTC');
  await expect(
    page.getByRole('cell', {
      name: '<script>window.QA_NOT_EXECUTED=1</script>',
      exact: true,
    }),
  ).toBeVisible();
});
test('saved scanner deep link applies filter, sort and hidden columns; unavailable views leave scanner usable', async ({
  page,
}) => {
  await page.route('**/api/research/view?**', (r) =>
    r.fulfill({
      json: { filter: 'SOL', sort: 'price', desc: false, hidden: ['funding'] },
    }),
  );
  await page.goto(`/screener?view=${id}`);
  await expect(page.getByLabel('Filter assets')).toHaveValue('SOL');
  await expect(
    page.getByText('Saved filter, sort and columns applied.'),
  ).toBeVisible();
  await page.getByText('Columns', { exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Last funding %' }),
  ).not.toBeChecked();
  await page.unroute('**/api/research/view?**');
  await page.route('**/api/research/view?**', (r) =>
    r.fulfill({ status: 503, json: { error: 'UNAVAILABLE' } }),
  );
  await page.goto(`/screener?view=${id}`);
  await expect(
    page.getByText(
      'Saved view unavailable. Default scanner remains available.',
    ),
  ).toBeVisible();
  await expect(page.getByLabel('Filter assets')).toBeEnabled();
});
test('frozen report reuses six analyst sections with timestamp, integrity and missing evidence on desktop/mobile', async ({
  page,
}) => {
  const now = new Date(),
    memo = analystFixture(now),
    data = emptyResearch('READY', now),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  data.reports = [
    {
      id,
      title: 'SYNTHETIC QA REPORT — NOT LIVE',
      asset: 'SOL',
      observedAt: now.toISOString(),
      createdAt: now.toISOString(),
      confidence: 'LIMITED',
      digest: '0'.repeat(64),
    },
  ];
  await page.route('**/api/research', (r) => r.fulfill({ json: data }));
  await page.route('**/api/research/report?**', (r) =>
    r.fulfill({
      json: {
        id,
        title: data.reports[0]!.title,
        digest: data.reports[0]!.digest,
        memo,
      },
    }),
  );
  await page.goto('/reports');
  await page.getByRole('button', { name: 'Open report', exact: true }).click();
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
    page.getByText(/Historical evidence states are frozen/),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test('watchlist shows untracked tickers unavailable and preserves bounded keyboard add/remove actions', async ({
  page,
}) => {
  const data = emptyResearch('READY');
  data.watchlists = [{ id, title: 'SYNTHETIC QA LIST', items: ['UNTRACKED'] }];
  const actions: ResearchAction[] = [];
  await page.route('**/api/research', async (r) => {
    if (r.request().method() === 'POST') {
      const a = r.request().postDataJSON() as ResearchAction;
      actions.push(a);
      if (a.action === 'WATCH_ITEM')
        data.watchlists[0]!.items = a.remove
          ? data.watchlists[0]!.items.filter((s) => s !== a.symbol)
          : [...data.watchlists[0]!.items, a.symbol];
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: data });
  });
  await page.goto('/watchlist');
  await expect(
    page.getByRole('cell', { name: 'No tracked market evidence' }),
  ).toBeVisible();
  await page.getByLabel('Watch ticker').fill('SOL');
  await page.getByRole('button', { name: 'Add ticker', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('cell', { name: 'SOL', exact: true }),
  ).toBeVisible();
  expect(actions[0]).toEqual({
    action: 'WATCH_ITEM',
    id,
    symbol: 'SOL',
    remove: false,
  });
  await page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'SOL', exact: true }) })
    .getByRole('button', { name: 'Remove ticker' })
    .click();
  await expect(
    page.getByRole('cell', { name: 'SOL', exact: true }),
  ).not.toBeVisible();
});
test('provider and stale evaluation alerts expose condition, provenance and transition history with accessible controls', async ({
  page,
}) => {
  const data = emptyResearch('READY'),
    observedAt = new Date(Date.now() - 300000).toISOString(),
    evaluation = {
      version: 'research-alerts:v1' as const,
      state: 'TRIGGERED' as const,
      reason:
        'SYNTHETIC QA: fred DOWN; credentials unavailable, not proof of remote outage.',
      observedAt,
      value: 'DOWN',
      sourceTimestamp: observedAt,
      evidence: ['fred'],
      unit: 'provider status',
    };
  data.alerts = [
    {
      id,
      title: 'SYNTHETIC QA provider alert',
      rule: { kind: 'PROVIDER_DOWN', provider: 'fred' },
      enabled: true,
      evaluation,
    },
  ];
  data.notifications = [
    { id, alertId: id, state: 'TRIGGERED', evaluation, createdAt: observedAt },
  ];
  await page.route('**/api/research', async (r) => {
    if (r.request().method() === 'POST') {
      const a = r.request().postDataJSON() as ResearchAction;
      if (a.action === 'TOGGLE_ALERT') data.alerts[0]!.enabled = a.enabled;
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: data });
  });
  await page.goto('/alerts');
  await expect(page.getByText(/STALE EVALUATION/)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Notification history', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('fred observed unhealthy status', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Disable', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Enable', exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
