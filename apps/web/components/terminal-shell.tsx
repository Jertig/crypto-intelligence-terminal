'use client';

import Link from 'next/link';
import { TokenWorkspace, TokenInspector } from './token-workspace';
import { WalletWorkspace, WalletInspector } from './wallet-workspace';
import {
  MarketScanner,
  MarketInspector,
  PriceHistory,
  useMarketData,
  formatNumber,
} from './market-workspace';
import type { MarketRow } from '@terminal/domain/market';
import { useMarketSelection } from './query-provider';
import {
  NarrativeWorkspace,
  IntelligenceSummary,
  DerivedEvidence,
  RegimeSummary,
} from './narrative-workspace';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  destinations,
  filterDestinations,
  findWorkspace,
  navigation,
  plannedProviders,
  workspaceHref,
} from '../lib/navigation';

const paths: Record<string, string> = {
  dashboard: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  chart: 'M3 3v18h18M6 16l4-6 4 3 6-8',
  layers: 'm12 3 9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5',
  diamond: 'm12 3 9 9-9 9-9-9 9-9zM12 3v18M3 12h18',
  wallet: 'M4 6h16v14H4zM4 6V4h13M15 11h5v5h-5z',
  calendar: 'M4 5h16v16H4zM8 3v4M16 3v4M4 10h16',
  globe:
    'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18z',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3z',
  spark: 'm12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3 3-6z',
  book: 'M12 5v16M12 5C8 3 4 3 3 4v15c3-1 6-1 9 2 3-3 6-3 9-2V4c-1-1-5-1-9 1z',
  filter: 'M3 4h18l-7 8v7l-4 2v-9L3 4z',
  star: 'm12 3 3 6 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1 3-6z',
  bell: 'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3zM10 21h4',
  document: 'M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h8',
  flow: 'M3 7h16l-4-4M21 17H5l4 4M19 7l-4 4M5 17l4-4',
  pulse: 'M2 12h5l3-7 4 14 3-7h5',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  search: 'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0z',
};

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <svg
      className={className}
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name] ?? paths.document} />
    </svg>
  );
}

function Panel({
  title,
  detail,
  children,
  className = '',
}: {
  title: string;
  detail?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <h2>{title}</h2>
        {detail && <span>{detail}</span>}
      </div>
      {children}
    </section>
  );
}

function Empty({
  title,
  children,
  icon = 'chart',
}: {
  title: string;
  children: React.ReactNode;
  icon?: string;
}) {
  return (
    <div className="empty-state">
      <Icon name={icon} className="empty-icon" />
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  const options = { timeZone: 'Asia/Jakarta' };
  return (
    <div className="clock">
      <span>
        {now
          ? new Intl.DateTimeFormat('en-GB', {
              ...options,
              weekday: 'short',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            }).format(now)
          : '—'}
      </span>
      <strong>
        {now
          ? new Intl.DateTimeFormat('en-GB', {
              ...options,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            }).format(now)
          : '—'}{' '}
        <small>WIB</small>
      </strong>
    </div>
  );
}

function CommandPalette({
  dialog,
  close,
}: {
  dialog: React.RefObject<HTMLDialogElement | null>;
  close: () => void;
}) {
  const router = useRouter();
  const marketQuery = useMarketData();
  const { setSelected: selectAsset } = useMarketSelection();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = [
    ...filterDestinations(query),
    ...(query.trim()
      ? (marketQuery.data?.rows ?? [])
          .filter((row) =>
            row.base.toLowerCase().includes(query.trim().toLowerCase()),
          )
          .map((row) => ({
            id: row.id,
            label: `${row.base} · Binance spot · ${row.freshness}`,
            icon: 'chart',
          }))
      : []),
  ];
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const reset = () => {
      setQuery('');
      setSelected(0);
    };
    node.addEventListener('close', reset);
    return () => node.removeEventListener('close', reset);
  }, [dialog]);
  function go(id: string) {
    close();
    if (id.startsWith('binance:')) {
      selectAsset(id);
      router.push('/markets');
      return;
    }
    router.push(workspaceHref(id));
  }
  return (
    <dialog
      className="command-dialog"
      ref={dialog}
      aria-labelledby="command-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="command-heading">
        <h2 id="command-title">Go to workspace</h2>
        <button onClick={close} aria-label="Close command palette">
          Esc
        </button>
      </div>
      <div className="command-search">
        <Icon name="search" />
        <input
          ref={input}
          autoFocus
          aria-label="Search workspaces"
          placeholder="Search workspaces, tools, or data…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setSelected((value) => Math.min(value + 1, results.length - 1));
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setSelected((value) => Math.max(0, value - 1));
            }
            if (event.key === 'Enter' && results[selected]) {
              event.preventDefault();
              go(results[selected].id);
            }
          }}
        />
      </div>
      <div className="command-results">
        {results.map((item, index) => (
          <button
            className={index === selected ? 'command-selected' : ''}
            key={item.id}
            onClick={() => go(item.id)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
            <small>
              {'phase' in item &&
              typeof item.phase === 'number' &&
              item.phase > 4
                ? 'Not available yet'
                : 'Open'}
            </small>
          </button>
        ))}
        {!results.length && (
          <p className="command-none">
            No matching workspace. Asset commands require connected data.
          </p>
        )}
      </div>
      <div className="command-footer">
        <span>↑ ↓ navigate</span>
        <span>Enter open</span>
        <span>Esc close</span>
      </div>
    </dialog>
  );
}

function Dashboard({
  selected,
  onSelect,
  market,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
  market: MarketRow | null;
}) {
  return (
    <>
      <div className="workspace-tabs">
        <span className="active-tab">Global view</span>
        <Link href="/narratives">Narrative rotation</Link>
        <Link href="/event-study">Event study</Link>
        <Link href="/risk">Risk monitor</Link>
      </div>
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">RESEARCH OVERVIEW</span>
          <h1>Dashboard</h1>
        </div>
        <span className="workspace-note">
          Source-stamped research observations
        </span>
      </div>
      <div className="research-grid">
        <MarketScanner selected={selected} onSelect={onSelect} />
        <Panel title="Narrative coverage" detail="V1" className="sector">
          <IntelligenceSummary />
        </Panel>
        <Panel title="Market regime" detail="V1 · DERIVED" className="rotation">
          <RegimeSummary />
        </Panel>
        <PriceHistory market={market} />
        <Panel
          title="Upcoming & recent events"
          detail="SOURCE REQUIRED"
          className="events-panel"
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Time · WIB</th>
                  <th>Event</th>
                  <th>Category</th>
                  <th>Asset</th>
                  <th>Source</th>
                </tr>
              </thead>
            </table>
          </div>
          <Empty title="No verified events" icon="calendar">
            Event timing and impact will be shown with an attributable source.
          </Empty>
        </Panel>
      </div>
    </>
  );
}

function SystemWorkspace({ workspace }: { workspace: string }) {
  const marketQuery = useMarketData();
  const [state, setState] = useState<{
    kind: 'loading' | 'ready' | 'error';
    database?: string;
    worker?: string;
  }>({ kind: 'loading' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (workspace !== 'data-status') return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    let disposed = false;
    fetch('/health', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unavailable');
        const data: unknown = await response.json();
        if (
          typeof data !== 'object' ||
          data === null ||
          !('dependencies' in data)
        )
          throw new Error('Invalid response');
        const deps = data.dependencies;
        if (
          typeof deps !== 'object' ||
          deps === null ||
          !('database' in deps) ||
          !('worker' in deps) ||
          typeof deps.database !== 'string' ||
          typeof deps.worker !== 'string'
        )
          throw new Error('Invalid response');
        if (!disposed)
          setState({
            kind: 'ready',
            database: deps.database,
            worker: deps.worker,
          });
      })
      .catch(() => {
        if (!disposed) setState({ kind: 'error' });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [workspace, retry]);
  const entry = findWorkspace(workspace);
  return (
    <>
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">SYSTEM & EVIDENCE</span>
          <h1>{entry?.label}</h1>
        </div>
        <span className="workspace-note">
          {marketQuery.data?.providers.length
            ? 'Provider capabilities reported independently'
            : 'No external providers connected'}
        </span>
      </div>
      {workspace === 'data-status' && (
        <Panel title="Runtime health" detail="LOCAL FOUNDATION">
          <div className="system-health" aria-live="polite">
            {state.kind === 'loading' ? (
              <p role="status">Checking runtime health…</p>
            ) : state.kind === 'error' ? (
              <div>
                <strong role="alert">Runtime health unavailable</strong>
                <p>
                  The health endpoint could not be reached. Market data remains
                  disconnected.
                </p>
                <button
                  className="text-button"
                  onClick={() => {
                    setState({ kind: 'loading' });
                    setRetry((value) => value + 1);
                  }}
                >
                  Retry health check
                </button>
              </div>
            ) : (
              <>
                <div>
                  <span>Database</span>
                  <strong>{state.database?.replaceAll('_', ' ')}</strong>
                </div>
                <div>
                  <span>Worker</span>
                  <strong>{state.worker?.replaceAll('_', ' ')}</strong>
                </div>
                <div>
                  <span>Market ingestion</span>
                  <strong>
                    {marketQuery.data?.rows.length
                      ? 'OBSERVED'
                      : 'WAITING / DISABLED'}
                  </strong>
                </div>
              </>
            )}
          </div>
        </Panel>
      )}
      {workspace !== 'settings' ? (
        <Panel title="API sources" detail="CAPABILITY HEALTH">
          <div className="table-scroll">
            <table className="provider-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Purpose</th>
                  <th>Configuration</th>
                  <th>Last observation</th>
                </tr>
              </thead>
              <tbody>
                {plannedProviders.map((provider) => {
                  const prefix =
                    provider.name === 'DEX Screener'
                      ? 'dexscreener'
                      : provider.name.toLowerCase();
                  const capabilities =
                    marketQuery.data?.providers.filter(
                      (item) =>
                        item.providerId === prefix ||
                        item.providerId.startsWith(prefix + ':'),
                    ) ?? [];
                  const latest = capabilities
                    .map((item) => item.lastSuccessAt)
                    .filter((time): time is string => time !== null)
                    .sort()
                    .at(-1);
                  return (
                    <tr key={provider.name}>
                      <td>{provider.name}</td>
                      <td>{provider.purpose}</td>
                      <td>
                        <span className="quality-label">
                          {capabilities.length
                            ? capabilities
                                .map(
                                  (item) =>
                                    `${item.providerId.replace(prefix + ':', '')}: ${item.status}`,
                                )
                                .join(' · ')
                            : 'Not connected'}
                        </span>
                      </td>
                      <td>
                        {latest
                          ? new Date(latest).toLocaleTimeString('en-GB', {
                              timeZone: 'Asia/Jakarta',
                            }) + ' WIB'
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="panel-foot">
            A planned source is not an active data connection.
          </div>
        </Panel>
      ) : (
        <Panel title="Terminal preferences" detail="CURRENT CONFIGURATION">
          <dl className="preferences">
            <div>
              <dt>Appearance</dt>
              <dd>Ivory research terminal</dd>
            </div>
            <div>
              <dt>Clock</dt>
              <dd>Asia/Jakarta · WIB</dd>
            </div>
            <div>
              <dt>Primary shortcut</dt>
              <dd>Ctrl / Cmd + K</dd>
            </div>
            <div>
              <dt>External data</dt>
              <dd>Not connected</dd>
            </div>
          </dl>
        </Panel>
      )}
    </>
  );
}

function Inspector({
  market,
  clear,
}: {
  market: MarketRow | null;
  clear: () => void;
}) {
  return (
    <aside className="inspector" aria-label="Asset inspector" tabIndex={-1}>
      {market ? (
        <MarketInspector market={market} clear={clear} />
      ) : (
        <Panel title="Asset inspector" detail="NO SELECTION">
          <div className="inspector-intro">
            <span className="entity-placeholder">
              <Icon name="diamond" />
            </span>
            <div>
              <h3>Select an asset</h3>
              <p>A verified record is required</p>
            </div>
          </div>
          <div className="inspector-tabs">
            <span>Overview</span>
            <span>On-chain</span>
            <span>Derivatives</span>
          </div>
          <dl className="asset-metrics">
            {[
              'Price · USD',
              'Market cap',
              '24H volume',
              'Open interest',
              'Funding rate',
            ].map((metric) => (
              <div key={metric}>
                <dt>{metric}</dt>
                <dd>—</dd>
              </div>
            ))}
          </dl>
          <div className="inspector-message">
            The scanner will populate this inspector when market data is
            connected.
          </div>
          <h3 className="inspector-subheading">Data provenance</h3>
          <div className="provenance-empty">
            <span>Source</span>
            <b>Unavailable</b>
            <span>Quality</span>
            <b>Unclassified</b>
            <span>Source timestamp</span>
            <b>—</b>
            <span>Ingested at</span>
            <b>—</b>
            <span>Methodology</span>
            <b>—</b>
          </div>
          <p className="provenance-note">
            No value is treated as a fact without attribution.
          </p>
        </Panel>
      )}
      <Panel title="Analyst memo" detail="AI NOT CONNECTED">
        <div className="analyst-memo">
          <h3>Facts</h3>
          <p>
            {market
              ? `${market.base} has a timestamped spot price of ${formatNumber(market.price)} ${market.quote}.`
              : 'No market observations are available.'}
          </p>
          <h3>Derived signals</h3>
          <DerivedEvidence marketId={market?.id} />
          <h3>Interpretation</h3>
          <p>Analysis is unavailable until verified evidence is connected.</p>
          <h3>Counter-evidence</h3>
          <p>Coverage cannot yet be assessed.</p>
          <h3>Sources</h3>
          <p>
            {market ? market.provenance.providerId : 'None connected'}. No AI
            response generated.
          </p>
        </div>
      </Panel>
      <div className="inspector-footer">
        <Icon name="shield" />
        <span>Evidence before interpretation</span>
      </div>
    </aside>
  );
}

export function TerminalShell({
  workspace = 'dashboard',
}: {
  workspace?: string;
}) {
  const query = useMarketData();
  const { selected, setSelected } = useMarketSelection();
  const market = query.data?.rows.find((row) => row.id === selected) ?? null;
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [offline, setOffline] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const open = useCallback(() => {
    dialog.current?.showModal();
  }, []);
  const close = useCallback(() => {
    dialog.current?.close();
    trigger.current?.focus();
  }, []);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const editing =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (!dialog.current?.open) open();
      }
      if (event.key === '/' && !editing && !dialog.current?.open) {
        event.preventDefault();
        open();
      }
    };
    const online = () => {
      setOffline(!navigator.onLine);
      setInteractive(true);
    };
    window.addEventListener('keydown', keyboard);
    window.addEventListener('online', online);
    window.addEventListener('offline', online);
    online();
    return () => {
      window.removeEventListener('keydown', keyboard);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', online);
    };
  }, [open]);
  const entry = findWorkspace(workspace) ?? destinations[0];
  return (
    <div className="terminal">
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <header className="terminal-header">
        <Link href="/" className="brand">
          <strong>Crypto Intelligence Terminal</strong>
          <span>CRYPTO MARKETS · RESEARCH WORKSTATION</span>
        </Link>
        <button
          className="command-trigger"
          ref={trigger}
          disabled={!interactive}
          onClick={open}
          aria-label="Open command palette"
        >
          <Icon name="search" />
          <span>Search workspaces, tools, data…</span>
          <kbd>Ctrl K</kbd>
        </button>
        <Clock />
        <div className="header-status">
          <span className="status-dot" />
          <div>
            <strong>DATA</strong>
            <small>
              {query.data?.rows.length
                ? query.data.rows.some((row) => row.freshness === 'STALE')
                  ? 'STALE / PARTIAL'
                  : 'OBSERVED'
                : 'NOT CONNECTED'}
            </small>
          </div>
        </div>
        <div className="header-status ai-status">
          <Icon name="spark" />
          <div>
            <strong>AI ANALYST</strong>
            <small>AWAITING EVIDENCE</small>
          </div>
        </div>
      </header>
      <div className="market-tape" aria-label="Market tape">
        {[
          'BTC',
          'ETH',
          'SOL',
          'TOTAL',
          'BTC.D',
          'FUNDING',
          'OPEN INTEREST',
        ].map((asset) => {
          const observation = query.data?.rows.find(
            (row) => row.base === asset,
          );
          return (
            <div key={asset}>
              <strong>{asset}</strong>
              <span>
                {observation
                  ? `${formatNumber(observation.price)} USDT · ${observation.freshness}`
                  : '—'}
              </span>
            </div>
          );
        })}
        <span className="tape-state">
          {query.data?.rows.length
            ? 'Source timestamps in inspector'
            : 'No live feed'}
        </span>
      </div>
      <div className="terminal-body">
        <nav className="sidebar" aria-label="Terminal navigation">
          {navigation.map((group) => (
            <div className="nav-group" key={group.group}>
              <h2>{group.group}</h2>
              {group.items.map((item) => (
                <Link
                  key={item.id}
                  href={workspaceHref(item.id)}
                  aria-current={workspace === item.id ? 'page' : undefined}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
          <div className="sidebar-footer">
            <span className="status-dot" />
            Solana wallet intelligence · Phase 4
          </div>
        </nav>
        <main id="workspace" className="workspace" tabIndex={-1}>
          {offline && (
            <div role="status" className="offline-banner">
              Offline · connections and evidence cannot be refreshed.
            </div>
          )}
          {workspace === 'dashboard' ? (
            <Dashboard
              selected={selected}
              onSelect={setSelected}
              market={market}
            />
          ) : ['markets', 'screener', 'derivatives'].includes(workspace) ? (
            <>
              <div className="workspace-heading">
                <div>
                  <span className="eyebrow">MARKET RESEARCH</span>
                  <h1>{entry?.label}</h1>
                </div>
                <span className="workspace-note">
                  Database observations · source timestamps preserved
                </span>
              </div>
              <MarketScanner selected={selected} onSelect={setSelected} />
              <PriceHistory market={market} />
            </>
          ) : workspace === 'narratives' ? (
            <NarrativeWorkspace />
          ) : ['tokens', 'risk'].includes(workspace) ? (
            <TokenWorkspace riskView={workspace === 'risk'} />
          ) : ['wallets', 'on-chain'].includes(workspace) ? (
            <WalletWorkspace />
          ) : ['data-status', 'api-sources', 'settings'].includes(workspace) ? (
            <SystemWorkspace key={workspace} workspace={workspace} />
          ) : (
            <>
              <div className="workspace-heading">
                <div>
                  <span className="eyebrow">RESEARCH WORKSPACE</span>
                  <h1>{entry?.label}</h1>
                </div>
                <span className="workspace-note">Awaiting verified data</span>
              </div>
              <Panel
                title={entry?.label ?? 'Workspace'}
                detail="NOT AVAILABLE YET"
              >
                <Empty
                  title="This workspace is not available yet"
                  icon={entry?.icon ?? 'document'}
                >
                  {entry?.label} requires the data and research capabilities
                  planned for Phase {entry?.phase}. No placeholder observations
                  are shown.
                </Empty>
                <div className="panel-foot">
                  <Link href="/data-status">Inspect connected sources ↗</Link>
                </div>
              </Panel>
            </>
          )}
        </main>
        {['tokens', 'risk'].includes(workspace) ? (
          <TokenInspector />
        ) : ['wallets', 'on-chain'].includes(workspace) ? (
          <WalletInspector />
        ) : (
          <Inspector market={market} clear={() => setSelected(null)} />
        )}
      </div>
      <footer className="terminal-footer">
        <span>
          <i className="status-dot" />
          {query.data?.rows.length
            ? 'Observed market data · freshness visible'
            : 'External sources disconnected'}
        </span>
        <span>All timestamps · WIB</span>
        <span>
          Ctrl / Cmd K <b>Command palette</b>
        </span>
      </footer>
      <CommandPalette dialog={dialog} close={close} />
    </div>
  );
}
