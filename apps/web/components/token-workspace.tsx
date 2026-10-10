'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  tokenResponseSchema,
  type RiskSnapshot,
} from '@terminal/domain/token-risk';
import { freshness } from '@terminal/domain/market';
import { formatNumber } from './market-data';
import { useTokenSelection } from './query-provider';
const stamp = (value: string) =>
  new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Jakarta' }) +
  ' WIB';
export function useTokenData() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ['tokens'],
    refetchInterval: 60000,
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/tokens', {
        cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) throw new Error('Token storage unavailable');
      return tokenResponseSchema.parse(await response.json());
    },
  });
  return { ...query, now: new Date(Math.max(now, query.dataUpdatedAt)) };
}
function RiskComponents({ risk, now }: { risk: RiskSnapshot; now: Date }) {
  const stale = freshness(risk.calculatedAt, now, 1800000) === 'STALE';
  return (
    <div className="risk-components">
      <section className="panel vacuum-panel">
        <div className="panel-heading">
          <h2>Liquidity vacuum · v1</h2>
          <span>DEX POOL PROXY · {stale ? 'STALE' : 'RECENT CALCULATION'}</span>
        </div>
        <div className="risk-explanation">
          <strong className={risk.vacuum === 'CRITICAL' ? 'negative' : ''}>
            {risk.vacuum}
          </strong>
          <dl className="risk-factors">
            <div>
              <dt>Same-pool liquidity change · 1h</dt>
              <dd>
                {formatNumber(risk.liquidityChange1h)}
                {risk.liquidityChange1h !== null ? '%' : ''}
              </dd>
            </div>
            <div>
              <dt>24h volume / current liquidity</dt>
              <dd>
                {formatNumber(risk.volumeLiquidityRatio)}
                {risk.volumeLiquidityRatio !== null ? '×' : ''}
              </dd>
            </div>
          </dl>
          <p>{risk.vacuumReason}</p>
          <p>
            Pool: {risk.pairId ?? 'Unavailable'}. Source:{' '}
            {stamp(risk.provenance.sourceTimestamp)}. Calculated:{' '}
            {stamp(risk.calculatedAt)}.
          </p>
        </div>
      </section>
      {risk.categories.map((category) => (
        <section className="panel risk-category" key={category.name}>
          <div className="panel-heading">
            <h2>{category.name.replaceAll('_', ' ')} · indicators</h2>
            <span>{Math.round(category.coverage * 100)}% COVERAGE</span>
          </div>
          <p className="risk-score-line">
            Full indicator: {formatNumber(category.score)} · partial indicator:{' '}
            {formatNumber(category.partialScore)} / 100 ·{' '}
            {stale ? 'STALE' : 'DERIVED'} · {risk.provenance.methodologyVersion}
          </p>
          <div className="table-scroll">
            <table aria-label={category.name + ' risk components'}>
              <thead>
                <tr>
                  <th>Component / evidence</th>
                  <th>Observed</th>
                  <th>Unit</th>
                  <th>Weight</th>
                  <th>Indicator</th>
                  <th>Availability</th>
                </tr>
              </thead>
              <tbody>
                {category.components.map((component) => (
                  <tr key={component.name}>
                    <td>
                      <details>
                        <summary>{component.name.replaceAll('_', ' ')}</summary>
                        <p>{component.reason}</p>
                        {component.inputs.map((input, index) => (
                          <p key={index}>
                            {input.providerId} · {input.quality} ·{' '}
                            {input.source}
                            <br />
                            Source: {stamp(input.sourceTimestamp)} ·{' '}
                            {input.methodologyVersion ?? 'provider evidence'}
                          </p>
                        ))}
                      </details>
                    </td>
                    <td>
                      {component.unit === 'BOOLEAN'
                        ? component.value === null
                          ? '—'
                          : component.value
                            ? 'True (provider)'
                            : 'False (provider)'
                        : formatNumber(component.value)}
                    </td>
                    <td>{component.unit}</td>
                    <td>{Math.round(component.weight * 100)}%</td>
                    <td>{formatNumber(component.score)}</td>
                    <td>{stale ? 'STALE CALCULATION' : component.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <p className="provenance-note">
        No composite overall risk number. Indicators are descriptive and
        uncalibrated. Capabilities can be legitimate issuer controls; flags are
        not allegations. Missing contract/ownership/LP/depth evidence is not
        proof of safety.
      </p>
    </div>
  );
}
export function TokenWorkspace({ riskView = false }: { riskView?: boolean }) {
  const query = useTokenData();
  const { selectedToken, setSelectedToken } = useTokenSelection();
  const [filter, setFilter] = useState(''),
    [descending, setDescending] = useState(true);
  const rows = (query.data?.tokens ?? [])
    .filter((t) =>
      (t.symbol + ' ' + t.name + ' ' + t.address + ' ' + t.chain)
        .toLowerCase()
        .includes(filter.toLowerCase()),
    )
    .map((t) => {
      const pairs =
        query.data?.pairs
          .filter((p) => p.tokenId === t.id)
          .sort((a, b) => (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1)) ??
        [];
      return {
        ...t,
        pair: pairs[0],
        poolCount: pairs.length,
        risk: query.data?.risks.find((r) => r.tokenId === t.id),
      };
    })
    .sort((a, b) =>
      descending
        ? (b.pair?.liquidityUsd ?? -1) - (a.pair?.liquidityUsd ?? -1)
        : (a.pair?.liquidityUsd ?? -1) - (b.pair?.liquidityUsd ?? -1),
    );
  const chosenId = selectedToken;
  const risk = query.data?.risks.find((r) => r.tokenId === chosenId);
  return (
    <div className="token-workspace">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">TOKEN & LIQUIDITY RESEARCH</span>
          <h1>{riskView ? 'Risk' : 'Tokens'}</h1>
        </div>
        <span className="workspace-note">
          Bounded configured tokens · USD provider aggregates
        </span>
      </div>
      {query.isError && (
        <div className="market-message" role="alert">
          Token storage unavailable · cached timestamps retained.{' '}
          <button className="text-button" onClick={() => void query.refetch()}>
            Retry token query
          </button>
        </div>
      )}
      <section className="panel token-scanner">
        <div className="panel-heading">
          <h2>Token liquidity scanner</h2>
          <span>
            {query.isPending ? 'LOADING' : (query.data?.state ?? 'UNAVAILABLE')}
          </span>
        </div>
        <div className="scanner-toolbar">
          <input
            aria-label="Filter tokens"
            placeholder="Filter symbol, chain or address…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <span>Maximum 8 tokens · 3 pools each · no full-chain index</span>
        </div>
        <div className="table-scroll">
          <table
            aria-label="Token liquidity scanner"
            tabIndex={0}
            onKeyDown={(event) => {
              if (!rows.length) return;
              const index = rows.findIndex((r) => r.id === chosenId);
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
                if (row) setSelectedToken(row.id);
              }
            }}
          >
            <thead>
              <tr>
                <th>Token / chain</th>
                <th>Price · USD</th>
                <th>
                  <button
                    className="text-button"
                    onClick={() => setDescending(!descending)}
                  >
                    Liquidity · USD {descending ? '↓' : '↑'}
                  </button>
                </th>
                <th>24h volume · USD</th>
                <th>Pools observed</th>
                <th>Vacuum proxy</th>
                <th>Collection age</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  aria-selected={chosenId === row.id}
                  onClick={() => setSelectedToken(row.id)}
                >
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setSelectedToken(row.id)}
                    >
                      {row.symbol}
                    </button>
                    <small>
                      {row.chain} · {row.address.slice(0, 8)}…
                    </small>
                  </td>
                  <td>{formatNumber(row.pair?.priceUsd)}</td>
                  <td>{formatNumber(row.pair?.liquidityUsd, true)}</td>
                  <td>{formatNumber(row.pair?.volume24hUsd, true)}</td>
                  <td>{row.poolCount}</td>
                  <td>
                    {row.risk
                      ? `${freshness(row.risk.calculatedAt, query.now, 1800000) === 'STALE' ? 'STALE · ' : ''}${row.risk.vacuum}`
                      : 'UNAVAILABLE'}
                  </td>
                  <td>
                    {row.pair
                      ? freshness(
                          row.pair.provenance.sourceTimestamp,
                          query.now,
                          1800000,
                        )
                      : 'UNAVAILABLE'}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <strong>
                        {query.isPending
                          ? 'Loading token observations'
                          : 'No token observations available'}
                      </strong>
                      <p>
                        Configure the bounded token universe and enable the
                        worker. No synthetic live rows are shown.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="provenance-note">
          Only base-token prices are used. USD liquidity aggregates are not
          order-book depth or guaranteed executable liquidity. Polling time is
          known; upstream observation time is not supplied.
        </p>
      </section>
      {risk ? (
        <RiskComponents risk={risk} now={query.now} />
      ) : (
        <section className="panel">
          <div className="panel-heading">
            <h2>Risk evidence</h2>
            <span>UNAVAILABLE</span>
          </div>
          <div className="empty-state">
            <strong>
              {selectedToken
                ? 'No risk calculations available'
                : 'Select a token for risk evidence'}
            </strong>
            <p>
              Provider and historical evidence must be persisted before a
              component can be evaluated.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
export function TokenInspector() {
  const query = useTokenData(),
    { selectedToken, setSelectedToken } = useTokenSelection();
  const token = query.data?.tokens.find((t) => t.id === selectedToken);
  const pairs =
    query.data?.pairs
      .filter((p) => p.tokenId === token?.id)
      .sort((a, b) => (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1)) ?? [];
  const security = query.data?.security.find((s) => s.tokenId === token?.id);
  const risk = query.data?.risks.find((r) => r.tokenId === token?.id);
  return (
    <aside
      className="inspector token-inspector"
      aria-label="Token evidence inspector"
    >
      <section className="panel">
        <div className="panel-heading">
          <h2>Token inspector</h2>
          <button
            className="square-button"
            aria-label="Clear token selection"
            onClick={() => setSelectedToken(null)}
          >
            ×
          </button>
        </div>
        <div className="inspector-content">
          <h3>{token?.symbol ?? 'Select a token'}</h3>
          <p>{token?.name ?? 'Verified provider observations required'}</p>
          {token && (
            <>
              <p className="token-address">
                {token.chain} · {token.address}
              </p>
              <h3 className="inspector-subheading">Observed pools</h3>
              {pairs.length ? (
                pairs.map((pair) => (
                  <div className="token-pool" key={pair.id}>
                    <strong>
                      {pair.dex} · {pair.symbol}/{pair.quoteSymbol}
                    </strong>
                    <p className="token-address">{pair.address}</p>
                    <dl className="risk-factors">
                      <div>
                        <dt>Liquidity · USD</dt>
                        <dd>{formatNumber(pair.liquidityUsd, true)}</dd>
                      </div>
                      <div>
                        <dt>Reported market cap · USD</dt>
                        <dd>{formatNumber(pair.marketCapUsd, true)}</dd>
                      </div>
                      <div>
                        <dt>FDV · USD</dt>
                        <dd>{formatNumber(pair.fdvUsd, true)}</dd>
                      </div>
                      <div>
                        <dt>Pair created</dt>
                        <dd>
                          {pair.createdAt
                            ? stamp(pair.createdAt)
                            : 'Unavailable'}
                        </dd>
                      </div>
                    </dl>
                    {pair.marketCapUsd !== null &&
                      pair.fdvUsd !== null &&
                      pair.marketCapUsd > pair.fdvUsd && (
                        <p>
                          Reported market cap exceeds FDV. Supply/scope
                          discrepancy: both provider values are retained; the
                          liquidity/market-cap indicator is unavailable.
                        </p>
                      )}
                    <p>
                      {pair.provenance.providerId} · {pair.provenance.quality} ·{' '}
                      {freshness(
                        pair.provenance.sourceTimestamp,
                        query.now,
                        1800000,
                      )}
                      <br />
                      Collected: {stamp(pair.provenance.sourceTimestamp)}
                      <br />
                      Ingested: {stamp(pair.provenance.ingestedAt)}
                    </p>
                    <details>
                      <summary>Endpoint & methodology</summary>
                      <p className="token-address">{pair.provenance.source}</p>
                      <p>{pair.provenance.methodologyVersion}</p>
                    </details>
                  </div>
                ))
              ) : (
                <p>No DEX evidence.</p>
              )}
              <h3 className="inspector-subheading">
                Security-provider coverage
              </h3>
              {security ? (
                <>
                  <p>
                    {security.provenance.providerId} ·{' '}
                    {security.provenance.quality} ·{' '}
                    {freshness(
                      security.provenance.sourceTimestamp,
                      query.now,
                      7200000,
                    )}
                  </p>
                  <dl className="risk-factors">
                    <div>
                      <dt>Reported holder count</dt>
                      <dd>{formatNumber(security.holderCount, true)}</dd>
                    </div>
                    <div>
                      <dt>Reported top-10 supply share</dt>
                      <dd>
                        {security.top10HolderShare === null
                          ? 'Unavailable'
                          : formatNumber(security.top10HolderShare * 100) + '%'}
                      </dd>
                    </div>
                  </dl>
                  <p>Collected: {stamp(security.provenance.sourceTimestamp)}</p>
                  <p>
                    Provider recognition:{' '}
                    {security.trustedToken === null
                      ? 'Unavailable'
                      : security.trustedToken
                        ? 'Recognized token'
                        : 'No recognition reported'}
                    . This is not a safety guarantee.
                  </p>
                </>
              ) : (
                <p>
                  Security provider unavailable. Contract or ownership safety
                  cannot be inferred.
                </p>
              )}
              <h3 className="inspector-subheading">
                Separate indicator coverage
              </h3>
              <table aria-label="Selected token risk coverage">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {risk?.categories.map((c) => (
                    <tr key={c.name}>
                      <td>{c.name.replaceAll('_', ' ')}</td>
                      <td>{Math.round(c.coverage * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Research limitations</h2>
          <span>EVIDENCE FIRST</span>
        </div>
        <div className="memo-content">
          <p>
            No overall opaque risk score. Missing ownership links, LP
            attribution, executable depth and wallet distribution remain
            unavailable. Provider flags are observations, not allegations. No
            trading or signing.
          </p>
        </div>
      </section>
    </aside>
  );
}
