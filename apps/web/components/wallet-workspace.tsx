'use client';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import {
  walletResponseSchema,
  reputationWeights,
  walletRelationshipGroups,
} from '@terminal/domain/wallets';
import { useWalletSelection } from './query-provider';
import { freshness } from '@terminal/domain/market';
const stamp = (v: string | null) =>
  v
    ? new Date(v).toLocaleString('en-GB', { timeZone: 'Asia/Jakarta' }) + ' WIB'
    : 'Unavailable';
function useWalletData() {
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ['wallets'],
    refetchInterval: 60000,
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/wallets', {
        cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) throw new Error('Wallet storage unavailable');
      return walletResponseSchema.parse(await response.json());
    },
  });
  return { ...query, now: new Date(Math.max(clock, query.dataUpdatedAt)) };
}
export function WalletWorkspace() {
  const query = useWalletData(),
    { selectedWallet, setSelectedWallet } = useWalletSelection();
  const [filter, setFilter] = useState(''),
    [order, setOrder] = useState('label');
  const wallets = (query.data?.wallets ?? [])
    .filter((w) =>
      `${w.label} ${w.address}`.toLowerCase().includes(filter.toLowerCase()),
    )
    .sort((a, b) =>
      order === 'activity'
        ? b.analysis.sampleSize - a.analysis.sampleSize
        : a.label.localeCompare(b.label) || a.address.localeCompare(b.address),
    );
  const selected = wallets.find((w) => w.address === selectedWallet);
  const groups = walletRelationshipGroups(query.data?.wallets ?? []);
  return (
    <div className="token-workspace wallet-workspace">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">SOLANA · BOUNDED ADDRESS RESEARCH</span>
          <h1>Wallets</h1>
        </div>
        <span className="workspace-note">
          Helius · {query.data?.provider.status ?? 'NOT_CONFIGURED'}
        </span>
      </div>
      {query.isError && (
        <p role="alert">
          Wallet storage unavailable. Previously loaded evidence may be stale.
        </p>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Tracked wallets</h2>
          <span>8 ADDRESSES MAX · FINALIZED SAMPLE</span>
        </div>
        <div className="scanner-toolbar">
          <label>
            Filter wallets{' '}
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Label or address"
            />
          </label>
          <label>
            Sort{' '}
            <select
              aria-label="Wallet sort"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            >
              <option value="label">Label</option>
              <option value="activity">Observed activity</option>
            </select>
          </label>
        </div>
        <div
          className="table-scroll"
          tabIndex={0}
          aria-label="Wallet table"
          onKeyDown={(e) => {
            if (!['ArrowUp', 'ArrowDown'].includes(e.key) || !wallets.length)
              return;
            e.preventDefault();
            const current = wallets.findIndex(
              (w) => w.address === selectedWallet,
            );
            const index =
              current < 0
                ? 0
                : Math.max(
                    0,
                    Math.min(
                      wallets.length - 1,
                      current + (e.key === 'ArrowDown' ? 1 : -1),
                    ),
                  );
            setSelectedWallet(wallets[index]?.address ?? null);
          }}
        >
          <table className="market-table">
            <thead>
              <tr>
                <th>Wallet / operator label</th>
                <th>30d sample</th>
                <th>Behavior inference</th>
                <th>Reputation</th>
                <th>Coverage</th>
                <th>Last successful poll</th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((w) => (
                <tr
                  key={w.address}
                  aria-selected={selected?.address === w.address}
                  onClick={() => setSelectedWallet(w.address)}
                >
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setSelectedWallet(w.address)}
                    >
                      {w.label}
                    </button>
                    <small>
                      {w.address.slice(0, 8)}…{w.address.slice(-6)}
                    </small>
                  </td>
                  <td>{w.analysis.sampleSize}</td>
                  <td>{w.analysis.behavior}</td>
                  <td>UNCALIBRATED · —</td>
                  <td>{w.coverage}</td>
                  <td>
                    {w.lastPolledAt
                      ? `${freshness(w.lastPolledAt, query.now, 1800000)} · ${stamp(w.lastPolledAt)}`
                      : 'UNAVAILABLE'}
                  </td>
                </tr>
              ))}
              {!wallets.length && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <strong>
                        {query.isPending
                          ? 'Loading wallet evidence'
                          : filter
                            ? 'No wallets match this filter'
                            : 'No tracked wallets configured'}
                      </strong>
                      <p>
                        Configure up to eight Solana addresses and a server-side
                        Helius credential. No example wallets or synthetic
                        activity are presented as live.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="provenance-note">
          Scheduler checks every 15 minutes; four requests per UTC day, oldest
          attempt first. At most two pages per wallet. History can be
          incomplete; 500 retained transactions per address, 90 days maximum.
          Operator labels are unverified annotations. Relationships do not
          establish ownership.
        </p>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Activity & transfers</h2>
          <span>PROVIDER-PARSED · AGGREGATED</span>
        </div>
        <div className="table-scroll">
          <table className="market-table">
            <thead>
              <tr>
                <th>Observed block time</th>
                <th>Type / protocol</th>
                <th>Outcome</th>
                <th>Positive transfers</th>
                <th>Transaction evidence</th>
              </tr>
            </thead>
            <tbody>
              {selected?.transactions.map((t) => (
                <tr key={t.signature}>
                  <td>{stamp(t.timestamp)}</td>
                  <td>
                    {t.type}
                    <small>{t.source}</small>
                  </td>
                  <td>
                    {t.failed ? 'FAILED · excluded from behavior' : 'SUCCESS'}
                  </td>
                  <td>
                    {t.transfers
                      .filter(
                        (x) =>
                          x.amount > 0 &&
                          (x.from === selected.address ||
                            x.to === selected.address),
                      )
                      .map((x, i) => (
                        <small key={i}>
                          {x.from === selected.address ? 'OUT' : 'IN'} ·{' '}
                          {x.amount} {x.unit} ·{' '}
                          {x.asset === 'SOL'
                            ? 'SOL'
                            : x.asset.slice(0, 8) + '…'}
                        </small>
                      ))}
                  </td>
                  <td>
                    <a
                      href={`https://solscan.io/tx/${t.signature}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t.signature.slice(0, 12)}… ↗
                    </a>
                    <small>
                      {t.provenance.providerId} ·{' '}
                      {stamp(t.provenance.ingestedAt)}
                    </small>
                  </td>
                </tr>
              ))}
              {!selected?.transactions.length && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <strong>
                        {selected
                          ? 'No retained activity available'
                          : 'Select a wallet for activity'}
                      </strong>
                      <p>
                        Token amounts are reported token units; native transfers
                        use lamports. USD values, PnL, and buy/sell directions
                        are unavailable.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Relationship evidence</h2>
          <span>OBSERVED TRANSFERS · NO COMMON-OWNER CLAIM</span>
        </div>
        <div className="table-scroll">
          <table className="market-table">
            <thead>
              <tr>
                <th>Counterparty</th>
                <th>Relationship</th>
                <th>Distinct transactions</th>
                <th>Supporting evidence</th>
              </tr>
            </thead>
            <tbody>
              {selected?.analysis.relationships.map((r) => (
                <tr key={r.counterparty}>
                  <td className="token-address">{r.counterparty}</td>
                  <td>
                    {r.kind}
                    <small>{r.reason}</small>
                  </td>
                  <td>{r.count}</td>
                  <td>
                    {r.signatures.map((s) => (
                      <small key={s}>
                        <a
                          href={`https://solscan.io/tx/${s}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {s.slice(0, 12)}… ↗
                        </a>
                      </small>
                    ))}
                  </td>
                </tr>
              ))}
              {!selected?.analysis.relationships.length && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">
                      <strong>Insufficient relationship evidence</strong>
                      <p>
                        At least three distinct successful transactions with
                        positive direct transfers are required. Shared
                        counterparties may be routers or services.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Observed relationship groups</h2>
          <span>SHARED COUNTERPARTY · OWNERSHIP UNPROVEN</span>
        </div>
        <div className="table-scroll">
          <table className="market-table">
            <thead>
              <tr>
                <th>Shared frequent counterparty</th>
                <th>Tracked members</th>
                <th>Interpretation limit</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.id}>
                  <td>{group.counterparty.slice(0, 12)}…</td>
                  <td>
                    {group.members.map((address) => (
                      <small key={address}>
                        <button
                          className="text-button"
                          onClick={() => setSelectedWallet(address)}
                        >
                          {address.slice(0, 12)}…
                        </button>
                      </small>
                    ))}
                  </td>
                  <td>{group.reason}</td>
                </tr>
              ))}
              {!groups.length && (
                <tr>
                  <td colSpan={3}>
                    <div className="empty-state">
                      <strong>No supported relationship groups</strong>
                      <p>
                        At least two tracked wallets must share a frequent
                        counterparty supported by transaction evidence.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Reputation methodology · v1</h2>
          <span>UNCALIBRATED · SCORE WITHHELD</span>
        </div>
        <div className="table-scroll">
          <table className="market-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Weight</th>
                <th>Value</th>
                <th>Missing evidence</th>
              </tr>
            </thead>
            <tbody>
              {(
                selected?.analysis.reputation.components ??
                query.data?.wallets[0]?.analysis.reputation.components ??
                reputationWeights.map(([name, weight, reason]) => ({
                  name,
                  weight,
                  reason,
                }))
              ).map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td>{c.weight * 100}%</td>
                  <td>Unavailable</td>
                  <td>{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="provenance-note">
          Conceptual specification weights require outcome backtesting and
          calibration before any meaningful score. No profitability, win-rate,
          early-entry, or insider claims are made.
        </p>
      </section>
    </div>
  );
}
export function WalletInspector() {
  const query = useWalletData(),
    { selectedWallet, setSelectedWallet } = useWalletSelection();
  const wallet = query.data?.wallets.find((w) => w.address === selectedWallet);
  return (
    <aside
      className="inspector token-inspector"
      aria-label="Wallet evidence inspector"
    >
      <section className="panel">
        <div className="panel-heading">
          <h2>Wallet inspector</h2>
          <button
            className="square-button"
            aria-label="Clear wallet selection"
            onClick={() => setSelectedWallet(null)}
          >
            ×
          </button>
        </div>
        <div className="inspector-content">
          <h3>{wallet?.label ?? 'Select a tracked wallet'}</h3>
          {wallet ? (
            <>
              <p className="token-address">{wallet.address}</p>
              <p>Label source: {wallet.labelSource}</p>
              <h3 className="inspector-subheading">Observed history</h3>
              <p>
                First observed: {stamp(wallet.firstObservedAt)}. This is not
                account creation time.
              </p>
              <p>
                Compacted observed transactions: {wallet.compactedCount}.
                Monthly counts preserve only observed coverage.
              </p>
              <p>
                Sample: {wallet.analysis.sampleSize} successful transactions in
                retained 30 days.
              </p>
              <h3 className="inspector-subheading">
                Behavior · {wallet.analysis.behavior}
              </h3>
              <p>{wallet.analysis.behaviorReason}</p>
              <p>
                Quality: DERIVED. Latest eligible input:{' '}
                {stamp(wallet.analysis.inputEndAt)}. Calculation source:{' '}
                {wallet.analysis.provenance.source}.
              </p>
              <h3 className="inspector-subheading">
                Reputation · UNCALIBRATED
              </h3>
              <p>{wallet.analysis.reputation.confidence}</p>
              <p>
                Coverage: {wallet.coverage}. Latest poll:{' '}
                {stamp(wallet.lastPolledAt)}
              </p>
              <p>
                Last attempt: {stamp(wallet.lastAttemptAt)}. Failed attempts do
                not refresh successful evidence.
              </p>
              <p>
                Provider: {query.data?.provider.status} ·{' '}
                {query.data?.provider.errorCode ?? 'No reported error'}
              </p>
              <p>
                Method: {wallet.analysis.methodologyVersion} ·{' '}
                {stamp(wallet.analysis.calculatedAt)}
              </p>
              <a
                href={`https://solscan.io/account/${wallet.address}`}
                target="_blank"
                rel="noreferrer"
              >
                Open public address explorer ↗
              </a>
            </>
          ) : (
            <p>
              Public address research requires configured addresses and provider
              evidence. No signing or private keys.
            </p>
          )}
        </div>
      </section>
    </aside>
  );
}
