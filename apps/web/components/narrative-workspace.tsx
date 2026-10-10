'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  intelligenceResponseSchema,
  type Feature,
  type NarrativeSnapshot,
} from '@terminal/domain/intelligence';
import { freshness } from '@terminal/domain/market';
import { formatNumber, useMarketData } from './market-data';
import { useMarketSelection } from './query-provider';
export function useIntelligenceData() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ['intelligence'],
    refetchInterval: 60000,
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/intelligence', {
        cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) throw new Error('Intelligence storage unavailable');
      return intelligenceResponseSchema.parse(await response.json());
    },
  });
  return { ...query, now: new Date(now) };
}
const timestamp = (value: string) =>
  new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Jakarta' }) +
  ' WIB';
const label = (name: string) => name.replaceAll('_', ' ');
const formula: Record<Feature['name'], string> = {
  return_5m: '100 × (last closed 5m close / previous close − 1)',
  return_1h: '100 × (last closed hourly close / previous close − 1)',
  return_24h: '100 × (last closed hourly close / close 24 hours earlier − 1)',
  return_7d: '100 × (last closed hourly close / close 168 hours earlier − 1)',
  relative_strength_btc:
    'Aligned 24H return − BTC 24H return, percentage points',
  relative_strength_sector:
    '24H return − weighted available peers sharing curated tags; excludes self',
  volume_zscore:
    '(Last closed hour base volume − previous 24-hour mean) / population deviation',
  volume_acceleration:
    'Last 24 closed hours base volume / preceding 24 hours base volume',
  oi_change_1h:
    '100 × (current base OI / OI one hour earlier − 1), matching units',
  oi_change_24h:
    '100 × (current base OI / OI 24 hours earlier − 1), matching units',
  funding_zscore:
    'Latest observed funding rate standardized against up to 95 preceding 5m observations; minimum 30 total',
  btc_corr_30d:
    'Pearson correlation of aligned daily log returns; 31 closed daily prices required',
  perp_basis: '100 × (perpetual mark price / fresh spot price − 1)',
  realized_volatility_24h:
    'Population deviation of last 24 hourly log returns × √24 × 100; descriptive realized volatility',
};
export function FeatureInspector({ marketId }: { marketId: string }) {
  const query = useIntelligenceData();
  const rows =
    query.data?.features.filter((feature) => feature.marketId === marketId) ??
    [];
  return (
    <div className="feature-inspector">
      <h3 className="inspector-subheading">Derived features · v1</h3>
      {query.isError && (
        <p role="alert">
          Derived query unavailable; stored timestamps retained.
        </p>
      )}
      {!rows.length ? (
        <p className="provenance-note">
          No feature observations yet. Closed history must warm before
          calculations become available.
        </p>
      ) : (
        <>
          <table aria-label="Selected asset derived features">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Value / state</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((feature) => {
                const stale =
                  freshness(feature.calculatedAt, query.now, 900000) ===
                  'STALE';
                return (
                  <tr key={feature.name}>
                    <td>
                      <details>
                        <summary>{label(feature.name)}</summary>
                        <p>{formula[feature.name]}</p>
                        <p>
                          {feature.provenance.quality} ·{' '}
                          {feature.provenance.methodologyVersion}
                        </p>
                        <p>
                          Source:{' '}
                          {timestamp(feature.provenance.sourceTimestamp)}
                          <br />
                          Calculated: {timestamp(feature.calculatedAt)}
                        </p>
                        {feature.inputs.map((input, index) => (
                          <p key={index}>
                            {input.providerId} · {input.marketId}
                            <br />
                            {input.source}
                            <br />
                            {input.samples} samples · {timestamp(input.from)} —{' '}
                            {timestamp(input.to)}
                          </p>
                        ))}
                      </details>
                    </td>
                    <td className={stale ? 'stale' : ''}>
                      {formatNumber(feature.value)}
                      <small>
                        {stale ? 'STALE CALCULATION' : feature.state} ·{' '}
                        {feature.unit}
                      </small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="provenance-note">
            DERIVED research metrics. Missing inputs remain unavailable; peer
            taxonomy is curated and correlation is descriptive.
          </p>
        </>
      )}
    </div>
  );
}
export function DerivedEvidence({
  marketId,
}: {
  marketId: string | undefined;
}) {
  const query = useIntelligenceData();
  const values =
    query.data?.features.filter(
      (feature) =>
        feature.marketId === marketId &&
        ['relative_strength_btc', 'volume_zscore', 'return_24h'].includes(
          feature.name,
        ),
    ) ?? [];
  return values.length ? (
    <ul className="derived-evidence">
      {values.map((feature) => (
        <li key={feature.name}>
          {label(feature.name)}: {formatNumber(feature.value)} ·{' '}
          {freshness(feature.calculatedAt, query.now, 900000) === 'STALE'
            ? 'STALE'
            : feature.state}
        </li>
      ))}
    </ul>
  ) : (
    <p>No derived observations available.</p>
  );
}
export function IntelligenceSummary() {
  const query = useIntelligenceData();
  const breadth = query.data?.signals.find(
    (signal) => signal.kind === 'BREADTH',
  );
  const rows = query.data?.narratives.filter((row) => row.assetCount > 0) ?? [];
  return (
    <div className="intelligence-summary">
      {query.isPending ? (
        <p role="status">Loading stored calculations…</p>
      ) : !rows.length ? (
        <p>No narrative observations yet.</p>
      ) : (
        <table aria-label="Narrative coverage summary">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Coverage</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 6).map((row) => (
              <tr key={row.narrativeId}>
                <td>
                  {
                    query.data?.taxonomy.find(
                      (item) => item.id === row.narrativeId,
                    )?.label
                  }
                </td>
                <td>{formatNumber(row.coverage * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p>
        Sampled breadth:{' '}
        {breadth?.value == null
          ? 'Unavailable'
          : `${formatNumber(breadth.value * 100)}% positive`}{' '}
        ·{' '}
        {breadth
          ? freshness(breadth.calculatedAt, query.now, 900000)
          : 'UNAVAILABLE'}
      </p>
      <Link href="/narratives">Inspect components ↗</Link>
    </div>
  );
}
export function NarrativeWorkspace() {
  const query = useIntelligenceData();
  const marketQuery = useMarketData();
  const { setSelected: selectAsset } = useMarketSelection();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [descending, setDescending] = useState(true);
  const data = query.data;
  const rows = [...(data?.narratives ?? [])]
    .filter((row) =>
      (
        data?.taxonomy.find((item) => item.id === row.narrativeId)?.label ??
        row.narrativeId
      )
        .toLowerCase()
        .includes(filter.toLowerCase()),
    )
    .sort(
      (a, b) =>
        ((a.partialScore ?? -1) - (b.partialScore ?? -1)) *
        (descending ? -1 : 1),
    );
  const chosen: NarrativeSnapshot | undefined =
    data?.narratives.find((row) => row.narrativeId === selected) ??
    rows.find((row) => row.assetCount > 0);
  const exposures =
    data?.exposures.filter(
      (item) => item.narrativeId === chosen?.narrativeId,
    ) ?? [];
  const regime = data?.signals.find((signal) => signal.kind === 'REGIME');
  return (
    <>
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">FEATURE + NARRATIVE INTELLIGENCE</span>
          <h1>Narratives</h1>
        </div>
        <span className="workspace-note">
          Versioned, descriptive research · bounded universe
        </span>
      </div>
      {query.isPending && (
        <p className="market-message" role="status">
          Loading stored narrative observations…
        </p>
      )}
      {query.isError && (
        <div className="market-message" role="alert">
          Intelligence storage unavailable{' '}
          <button className="text-button" onClick={() => void query.refetch()}>
            Retry intelligence query
          </button>
        </div>
      )}
      <section className="panel narrative-matrix">
        <div className="panel-heading">
          <h2>Narrative matrix</h2>
          <span>CURATED TAXONOMY · V1 · DERIVED</span>
        </div>
        <div className="scanner-toolbar">
          <input
            aria-label="Filter narratives"
            placeholder="Filter tags…"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <span>
            Uncalibrated research scores · incomplete evidence stays visible
          </span>
        </div>
        <div className="table-scroll">
          <table
            aria-label="Narrative matrix"
            tabIndex={0}
            onKeyDown={(event) => {
              if (!rows.length) return;
              const index = rows.findIndex(
                (row) => row.narrativeId === chosen?.narrativeId,
              );
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const row =
                  rows[
                    Math.max(
                      0,
                      Math.min(
                        rows.length - 1,
                        index + (event.key === 'ArrowDown' ? 1 : -1),
                      ),
                    )
                  ];
                if (row) setSelected(row.narrativeId);
              }
            }}
          >
            <thead>
              <tr>
                <th>Research tag</th>
                <th>
                  <button
                    className="text-button"
                    onClick={() => setDescending(!descending)}
                  >
                    Partial score {descending ? '↓' : '↑'}
                  </button>
                </th>
                <th>Full score</th>
                <th>Evidence coverage</th>
                <th>Assets</th>
                <th>Freshness</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.narrativeId}
                  aria-selected={chosen?.narrativeId === row.narrativeId}
                  onClick={() => setSelected(row.narrativeId)}
                >
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setSelected(row.narrativeId)}
                    >
                      {data?.taxonomy.find(
                        (item) => item.id === row.narrativeId,
                      )?.label ?? row.narrativeId}
                    </button>
                  </td>
                  <td>{formatNumber(row.partialScore)}</td>
                  <td>
                    {row.score == null
                      ? 'Unavailable'
                      : formatNumber(row.score)}
                  </td>
                  <td>{formatNumber(row.coverage * 100)}%</td>
                  <td>{row.assetCount}</td>
                  <td>{freshness(row.calculatedAt, query.now, 1800000)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <strong>No narrative calculations available</strong>
                      <p>
                        The bounded worker must observe closed history and
                        configured taxonomy members.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="provenance-note">
          Partial scores normalize only observed component weights. They cannot
          replace a complete score or imply validated predictive power. Unmapped
          assets are excluded from curated tags.
        </p>
      </section>
      {chosen && (
        <section className="panel narrative-detail">
          <div className="panel-heading">
            <h2>
              {
                data?.taxonomy.find((item) => item.id === chosen.narrativeId)
                  ?.label
              }{' '}
              · component explanation
            </h2>
            <span>{chosen.provenance.methodologyVersion}</span>
          </div>
          <div className="table-scroll">
            <table aria-label="Narrative score components">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Weight</th>
                  <th>Observed value / 100</th>
                  <th>Asset coverage</th>
                  <th>Weighted contribution</th>
                </tr>
              </thead>
              <tbody>
                {chosen.components.map((component) => (
                  <tr key={component.name}>
                    <td>{label(component.name)}</td>
                    <td>{formatNumber(component.weight * 100)}%</td>
                    <td>{formatNumber(component.value)}</td>
                    <td>
                      {formatNumber(component.availableAssetWeight * 100)}%
                    </td>
                    <td>
                      {component.value == null
                        ? 'Unavailable'
                        : formatNumber(
                            component.value *
                              component.weight *
                              component.availableAssetWeight,
                          )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="provenance-note">
            Full score:{' '}
            {chosen.score == null
              ? 'Unavailable · incomplete evidence'
              : formatNumber(chosen.score)}
            . Partial score = observed weighted contribution / covered weight.
            Coverage: {formatNumber(chosen.coverage * 100)}%. Source{' '}
            {timestamp(chosen.provenance.sourceTimestamp)}; calculated{' '}
            {timestamp(chosen.calculatedAt)}. {chosen.provenance.quality}.
          </p>
          <div className="narrative-members">
            <h3>Curated member allocations</h3>
            {exposures.map((exposure) => {
              const market = marketQuery.data?.rows.find(
                (row) => row.assetId === exposure.assetId,
              );
              return (
                <div key={exposure.assetId}>
                  <button
                    className="text-button"
                    disabled={!market}
                    onClick={() => market && selectAsset(market.id)}
                  >
                    {exposure.assetId}
                  </button>
                  <span>
                    {formatNumber(exposure.weight * 100)}% research allocation
                  </span>
                  <a href={exposure.source} target="_blank" rel="noreferrer">
                    Classification source ↗
                  </a>
                </div>
              );
            })}
            <p>
              Allocations are analyst-curated research labels, not measured
              revenue or token economic exposure.
            </p>
            <h3>Counter-evidence and limitations</h3>
            <p>
              Wallet inflow and protocol activity are unavailable. Derivatives
              may be missing. Small constituent counts, exchange selection and
              taxonomy choices can distort rankings. Correlation does not
              establish causation.
            </p>
          </div>
        </section>
      )}
      <section className="panel regime-panel">
        <div className="panel-heading">
          <h2>Sampled market regime</h2>
          <span>
            {regime?.state ?? 'UNAVAILABLE'} ·{' '}
            {regime
              ? freshness(regime.calculatedAt, query.now, 900000)
              : 'UNAVAILABLE'}
          </span>
        </div>
        {regime ? (
          <>
            <table aria-label="Market regime factors">
              <thead>
                <tr>
                  <th>Factor</th>
                  <th>Observed value</th>
                  <th>Unit</th>
                </tr>
              </thead>
              <tbody>
                {regime.factors.map((factor) => (
                  <tr key={factor.name}>
                    <td>
                      {factor.name}
                      <small>{factor.reason}</small>
                    </td>
                    <td>{formatNumber(factor.value)}</td>
                    <td>{factor.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="provenance-note">
              Factor coverage {formatNumber(regime.coverage * 100)}% ·{' '}
              {regime.provenance.methodologyVersion}. Classification requires
              all five inputs. Liquidity is a turnover proxy; macro/on-chain
              state and executable depth are not assessed.
            </p>
          </>
        ) : (
          <p className="market-message">No regime observations available.</p>
        )}
      </section>
    </>
  );
}
export function RegimeSummary() {
  const query = useIntelligenceData();
  const regime = query.data?.signals.find((signal) => signal.kind === 'REGIME');
  return (
    <div className="intelligence-summary">
      <h3>{regime?.state ?? 'UNAVAILABLE'}</h3>
      <p>
        {regime
          ? `${formatNumber(regime.coverage * 100)}% factor coverage · ${freshness(regime.calculatedAt, query.now, 900000)}`
          : 'No sampled regime observations yet.'}
      </p>
      {regime && (
        <table aria-label="Regime summary">
          <tbody>
            {regime.factors.slice(0, 3).map((factor) => (
              <tr key={factor.name}>
                <td>{factor.name}</td>
                <td>{formatNumber(factor.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p>
        Liquidity, macro and on-chain assessment is incomplete. Missing
        derivatives prevent classification.
      </p>
      <Link href="/narratives">Inspect factors ↗</Link>
    </div>
  );
}
