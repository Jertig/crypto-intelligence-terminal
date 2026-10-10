'use client';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo, useEffect } from 'react';
import {
  eventsResponseSchema,
  macroResponseSchema,
  alignedChanges,
  regression,
  rollingCorrelation,
  leadLag,
} from '@terminal/domain/events';
import { useEventSelection } from './query-provider';
const number = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v) ? 'Unavailable' : v.toFixed(digits);
const stamp = (v: string | null) =>
  v
    ? new Date(v).toLocaleString('en-GB', { timeZone: 'Asia/Jakarta' }) + ' WIB'
    : 'Unavailable';
function useEvents() {
  return useQuery({
    queryKey: ['events'],
    refetchInterval: 60000,
    queryFn: async ({ signal }) => {
      const r = await fetch('/api/events', {
        cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });
      if (!r.ok) throw new Error('Event storage unavailable');
      return eventsResponseSchema.parse(await r.json());
    },
  });
}
function useMacro() {
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ['macro'],
    refetchInterval: 60000,
    queryFn: async ({ signal }) => {
      const r = await fetch('/api/macro', {
        cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });
      if (!r.ok) throw new Error('Macro storage unavailable');
      return macroResponseSchema.parse(await r.json());
    },
  });
  const time = query.data?.provider.lastSuccessAt,
    age = time
      ? Math.max(clock, query.dataUpdatedAt) - Date.parse(time)
      : Infinity;
  return {
    ...query,
    providerStatus:
      time && (age < 0 || age > 7200000)
        ? 'STALE'
        : (query.data?.provider.status ?? 'NOT_CONFIGURED'),
  };
}
export function EventsWorkspace() {
  const query = useEvents(),
    { selectedEvent, setSelectedEvent } = useEventSelection();
  const [filter, setFilter] = useState(''),
    [order, setOrder] = useState('newest'),
    [asset, setAsset] = useState('BTC');
  const events = (query.data?.events ?? [])
    .filter((e) =>
      `${e.title} ${e.category}`.toLowerCase().includes(filter.toLowerCase()),
    )
    .sort((a, b) =>
      order === 'oldest'
        ? a.timestamp.localeCompare(b.timestamp)
        : b.timestamp.localeCompare(a.timestamp),
    );
  const selected = query.data?.events.find((e) => e.id === selectedEvent),
    impacts =
      query.data?.impacts.filter(
        (i) => i.eventId === selectedEvent && i.asset === asset,
      ) ?? [];
  const study =
    query.data?.impacts.filter(
      (i) =>
        i.asset === asset &&
        i.windowMinutes === 60 &&
        i.returnPct !== null &&
        query.data.events.some(
          (e) =>
            e.id === i.eventId &&
            selected &&
            e.title === selected.title &&
            e.category === selected.category &&
            e.unit === selected.unit,
        ),
    ) ?? [];
  const cohorts = ['upside', 'downside', 'no-surprise'].map((direction) => {
    const rows = study.filter((i) => {
      const e = query.data?.events.find((e) => e.id === i.eventId);
      if (!e || e.actual === null || e.expected === null) return false;
      const s = e.actual - e.expected;
      return direction === 'upside'
        ? s > 0
        : direction === 'downside'
          ? s < 0
          : s === 0;
    });
    return {
      direction,
      n: rows.length,
      mean: rows.length
        ? rows.reduce((s, r) => s + r.returnPct!, 0) / rows.length
        : null,
    };
  });
  return (
    <div className="token-workspace events-workspace">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">SOURCED EVENTS · DESCRIPTIVE RESEARCH</span>
          <h1>Events & event study</h1>
        </div>
        <span className="workspace-note">event-impact:v1</span>
      </div>
      {query.isError && (
        <p role="alert" aria-label="Event storage status">
          Event storage unavailable. Previously loaded evidence may be stale.{' '}
          <button onClick={() => void query.refetch()}>Retry events</button>
        </p>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Event database</h2>
          <span>MANUAL SOURCED · NO INVENTED RELEASES</span>
        </div>
        <div className="scanner-toolbar">
          <label>
            Filter events{' '}
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Title or category"
            />
          </label>
          <label>
            Sort events{' '}
            <select value={order} onChange={(e) => setOrder(e.target.value)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table className="market-table">
            <thead>
              <tr>
                <th>Event / source</th>
                <th>Observed release time</th>
                <th>Expected</th>
                <th>Actual</th>
                <th>Surprise</th>
                <th>Affected assets</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr
                  key={e.id}
                  aria-selected={e.id === selectedEvent}
                  data-selected={e.id === selectedEvent}
                >
                  <td>
                    <button
                      className="asset-button"
                      onClick={() => setSelectedEvent(e.id)}
                      onKeyDown={(k) => {
                        if (k.key === 'ArrowDown' || k.key === 'ArrowUp') {
                          k.preventDefault();
                          const nextIndex =
                            (i +
                              (k.key === 'ArrowDown' ? 1 : -1) +
                              events.length) %
                            events.length;
                          setSelectedEvent(events[nextIndex]!.id);
                          k.currentTarget
                            .closest('tbody')
                            ?.querySelectorAll<HTMLButtonElement>(
                              '.asset-button',
                            )
                            [nextIndex]?.focus();
                        }
                      }}
                    >
                      {e.title}
                    </button>
                    <small>{e.category} · operator transcription</small>
                  </td>
                  <td>{stamp(e.timestamp)}</td>
                  <td>
                    {number(e.expected)} {e.unit}
                  </td>
                  <td>
                    {number(e.actual)} {e.unit}
                  </td>
                  <td>
                    {number(
                      e.expected === null || e.actual === null
                        ? null
                        : e.actual - e.expected,
                    )}{' '}
                    {e.unit}
                  </td>
                  <td>{e.affectedAssets.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!events.length && (
          <div className="scanner-empty">
            <strong>
              {query.isPending
                ? 'Loading sourced events'
                : 'No sourced events stored'}
            </strong>
            <p>
              Import documented official-source event records. FRED period dates
              are never substituted for release timestamps.
            </p>
          </div>
        )}
        <p className="panel-foot">
          Surprise = actual − expected in the recorded unit; unavailable when
          either input is absent. Event IDs and sourced observations are
          immutable.
        </p>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Selected event windows</h2>
          <span>{selected?.title ?? 'SELECT AN EVENT'}</span>
        </div>
        <div className="scanner-toolbar">
          <label>
            Study asset{' '}
            <select value={asset} onChange={(e) => setAsset(e.target.value)}>
              {['BTC', 'ETH', 'SOL'].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table className="market-table">
            <thead>
              <tr>
                <th>Window</th>
                <th>Return %</th>
                <th>Volume abnormality %</th>
                <th>OI change %</th>
                <th>Funding Δ bps</th>
                <th>Evidence limitations</th>
              </tr>
            </thead>
            <tbody>
              {impacts
                .sort((a, b) => a.windowMinutes - b.windowMinutes)
                .map((i) => (
                  <tr key={i.windowMinutes}>
                    <td>+{i.windowMinutes}m</td>
                    <td>{number(i.returnPct)}</td>
                    <td>{number(i.volumeAbnormalityPct)}</td>
                    <td>{number(i.oiChangePct)}</td>
                    <td>{number(i.fundingChangeBps)}</td>
                    <td>
                      {i.reasons.join('; ') || 'Observed window'}
                      <small>
                        Actual boundaries: {stamp(i.anchorAt)} →{' '}
                        {stamp(i.endAt)}
                      </small>
                      <small>
                        {i.provenance.quality} ·{' '}
                        {i.provenance.methodologyVersion} · calculated{' '}
                        {stamp(i.provenance.sourceTimestamp)}
                      </small>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!impacts.length && (
          <div className="scanner-empty">
            <strong>No computed event window</strong>
            <p>
              +5m, +1h, +4h and +24h require retained observations. Missing
              windows remain unavailable.
            </p>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Historical surprise cohorts · +1h</h2>
          <span>DESCRIPTIVE · CAUSATION NOT ESTABLISHED</span>
        </div>
        <div className="table-scroll">
          <table className="market-table">
            <thead>
              <tr>
                <th>Recorded surprise</th>
                <th>Usable event windows</th>
                <th>Mean return %</th>
                <th>Interpretation</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.direction}>
                  <td>{c.direction}</td>
                  <td>{c.n}</td>
                  <td>{number(c.mean)}</td>
                  <td>
                    {c.n < 20
                      ? 'Small or absent sample; no probability claim'
                      : 'Historical sample only; overlapping events/confounders remain'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="panel-foot">
          Only events matching the selected title, category and unit are
          grouped. These are descriptive summaries, not independent causal
          experiments. Inspect underlying events and missing-window coverage. No
          p-values or predictive probabilities are asserted.
        </p>
      </section>
    </div>
  );
}
export function EventInspector() {
  const query = useEvents(),
    { selectedEvent, setSelectedEvent } = useEventSelection(),
    e = query.data?.events.find((e) => e.id === selectedEvent);
  return (
    <aside className="inspector" aria-label="Event inspector">
      <div className="panel-heading">
        <h2>Event inspector</h2>
        <button
          aria-label="Clear selected event"
          onClick={() => setSelectedEvent(null)}
        >
          ×
        </button>
      </div>
      <div className="inspector-body">
        {e ? (
          <>
            <h3>{e.title}</h3>
            <p>{stamp(e.timestamp)}</p>
            <p>
              Source: manual transcription of a public cited release; not an
              automatically verified release.
            </p>
            <p>Collected: {stamp(e.collectedAt)}</p>
            <a href={e.source} target="_blank" rel="noreferrer">
              Open cited release ↗
            </a>
            <h3>Evidence limits</h3>
            <p>
              Observation periods differ from release times. Missing
              expectations or actual values stay unavailable.
            </p>
            <p>
              Closed one-minute bars anchor windows within one minute.
              Historical bars may have been collected after the event: this is
              retrospective research, not a point-in-time trading backtest.
            </p>
            <p>
              Return and volume require uninterrupted retained bars. Derivative
              boundaries have separate tolerances. Association does not
              establish causation.
            </p>
          </>
        ) : (
          <>
            <h3>Select a sourced event</h3>
            <p>
              Review release time, collection time, public citation and
              impact-window coverage.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
export function MacroWorkspace() {
  const query = useMacro(),
    [seriesId, setSeriesId] = useState('SP500'),
    [asset, setAsset] = useState('BTC');
  const definition = query.data?.series.find((s) => s.id === seriesId);
  const pairs = useMemo(
    () =>
      alignedChanges(
        definition?.frequency === 'daily'
          ? definition.observations.map((o) => ({
              date: o.date,
              value: o.value,
            }))
          : [],
        query.data?.crypto.find((c) => c.asset === asset)?.points ?? [],
        definition?.transform,
      ),
    [definition, query.data, asset],
  );
  const stats = regression(pairs.slice(-240)),
    rolling = rollingCorrelation(pairs),
    lags = leadLag(pairs);
  return (
    <div className="token-workspace events-workspace">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">FRED · PERIODS & OBSERVED REVISIONS</span>
          <h1>Macro & cross-market research</h1>
        </div>
        <span className="workspace-note">FRED · {query.providerStatus}</span>
      </div>
      {query.isError && (
        <p role="alert" aria-label="Macro storage status">
          Macro storage unavailable. Cached observations may be stale.{' '}
          <button onClick={() => void query.refetch()}>Retry macro</button>
        </p>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Macro observations</h2>
          <span>12 SERIES MAX · HOURLY COLLECTION</span>
        </div>
        <div className="scanner-toolbar">
          <label>
            Macro series{' '}
            <select
              value={seriesId}
              onChange={(e) => setSeriesId(e.target.value)}
            >
              {(query.data?.series ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Comparison asset{' '}
            <select value={asset} onChange={(e) => setAsset(e.target.value)}>
              {['BTC', 'ETH', 'SOL'].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table className="market-table">
            <thead>
              <tr>
                <th>Period date</th>
                <th>Value / unit</th>
                <th>FRED realtime range</th>
                <th>First observed version</th>
                <th>Source / quality</th>
              </tr>
            </thead>
            <tbody>
              {definition?.observations
                .slice(-30)
                .reverse()
                .map((o) => (
                  <tr key={o.date}>
                    <td>{o.date}</td>
                    <td>
                      {number(o.value, 4)} {definition.unit}
                    </td>
                    <td>
                      {o.realtimeStart} → {o.realtimeEnd}
                    </td>
                    <td>{stamp(o.provenance.ingestedAt)}</td>
                    <td>
                      {o.provenance.providerId} · {o.provenance.quality}
                      <small>{o.provenance.source}</small>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!definition?.observations.length && (
          <div className="scanner-empty">
            <strong>
              {query.isPending
                ? 'Loading macro observations'
                : 'Macro observations unavailable'}
            </strong>
            <p>
              Configure a server-side FRED key. No synthetic series or
              zero-valued missing observations are shown.
            </p>
          </div>
        )}
        <p className="panel-foot">
          Last successful provider collection:{' '}
          {stamp(query.data?.provider.lastSuccessAt ?? null)}.{' '}
          {query.data?.provider.errorCode ?? ''} Period date is not publication
          time. Changed values preserve observed revisions; polling does not
          create duplicate unchanged vintages.
        </p>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>
            Matched daily intervals · {definition?.label ?? seriesId} / {asset}
          </h2>
          <span>cross-market:v1 · RETROSPECTIVE</span>
        </div>
        <div className="table-scroll">
          <table className="market-table">
            <thead>
              <tr>
                <th>Intervals</th>
                <th>Pearson correlation</th>
                <th>OLS beta</th>
                <th>OLS alpha</th>
                <th>R²</th>
                <th>Residual std</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{stats?.n ?? pairs.length}</td>
                <td>{number(stats?.correlation, 4)}</td>
                <td>{number(stats?.beta, 4)}</td>
                <td>{number(stats?.alpha, 6)}</td>
                <td>{number(stats?.rSquared, 4)}</td>
                <td>{number(stats?.residualStd, 6)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="panel-foot">
          At least 20 valid varying intervals are required.{' '}
          {definition?.transform === 'difference'
            ? 'Predictor uses changes in recorded units; beta is not a conventional return beta.'
            : 'Predictor and crypto use log returns.'}{' '}
          No forward fill; matched observation dates, maximum seven-day gap.
          Crypto daily UTC closes and macro local-market closes differ.
          SP500/Nasdaq, broad USD proxy, Treasury yields and oil are sourced as
          labeled; TOTAL3, exact DXY and gold remain unavailable.
        </p>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Rolling correlation · 60 matched intervals</h2>
          <span>NO CAUSAL CLAIM</span>
        </div>
        <div className="table-scroll">
          <table className="market-table">
            <thead>
              <tr>
                <th>End period</th>
                <th>Usable intervals</th>
                <th>Correlation</th>
              </tr>
            </thead>
            <tbody>
              {rolling
                .slice(-12)
                .reverse()
                .map((r) => (
                  <tr key={r.date}>
                    <td>{r.date}</td>
                    <td>{r.statistics?.n ?? 'Below 20'}</td>
                    <td>{number(r.statistics?.correlation, 4)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!rolling.length && (
          <p className="panel-foot">
            Insufficient overlapping daily observations.
          </p>
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Lead / lag exploration</h2>
          <span>−5 TO +5 MATCHED INTERVALS</span>
        </div>
        <div className="table-scroll">
          <table className="market-table">
            <thead>
              <tr>
                <th>Lag</th>
                <th>Usable pairs</th>
                <th>Cross-correlation</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              {lags.map((l) => (
                <tr key={l.lag}>
                  <td>{l.lag}</td>
                  <td>{l.statistics?.n ?? 'Below 20'}</td>
                  <td>{number(l.statistics?.correlation, 4)}</td>
                  <td>
                    {l.lag > 0
                      ? 'Predictor precedes crypto'
                      : l.lag < 0
                        ? 'Crypto precedes predictor'
                        : 'Contemporaneous association'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="panel-foot">
          Lags count matched intervals, not fixed calendar days. Eleven
          exploratory comparisons invite selection bias. Serial dependence,
          revisions, timing mismatches and confounders remain. No significance,
          causation, forecasting probability or Granger claim. Historical
          final/observed vintages are not a release-time simulation.
        </p>
      </section>
    </div>
  );
}
export function MacroInspector() {
  const query = useMacro();
  return (
    <aside className="inspector" aria-label="Macro inspector">
      <div className="panel-heading">
        <h2>Macro evidence</h2>
        <span>FRED</span>
      </div>
      <div className="inspector-body">
        <h3>Observed versions</h3>
        <p>Status: {query.providerStatus}</p>
        <p>Last poll: {stamp(query.data?.provider.lastSuccessAt ?? null)}</p>
        <p>
          Inputs queried at: {stamp(query.data?.observedAt ?? null)}.
          Statistical outputs are DERIVED · cross-market:v1.
        </p>
        <p>
          Collection time records when this terminal learned a value. The
          economic period and FRED realtime range remain separate.
        </p>
        <p>
          Original release timestamps, market expectations, complete ALFRED
          vintages and an independently validated causal identification strategy
          are unavailable.
        </p>
        <h3>Research limits</h3>
        <p>
          Twenty intervals is a calculation gate, not statistical confidence.
          Rolling/lag relationships and OLS are descriptive. No causation from
          correlation.
        </p>
        <a
          href="https://fred.stlouisfed.org/docs/api/fred/series_observations.html"
          target="_blank"
          rel="noreferrer"
        >
          FRED source documentation ↗
        </a>
      </div>
    </aside>
  );
}
