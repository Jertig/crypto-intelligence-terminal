'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  researchResponseSchema,
  reportSchema,
  scannerColumns,
  type ResearchAction,
  type AlertRule,
  type SavedView,
} from '@terminal/domain/research';
import {
  analystTools,
  analystMemoSchema,
  type AnalystMemo,
  type AnalystRequest,
} from '@terminal/domain/analyst';
import { taxonomy } from '@terminal/domain/intelligence';
import { MemoEvidence } from './analyst-workspace';
import { useMarketData, formatNumber } from './market-data';
const stamp = (s: string) =>
  new Date(s).toLocaleString('en-GB', { timeZone: 'Asia/Jakarta' }) + ' WIB';
const names: Record<string, string> = {
  research: 'Research notebook',
  watchlist: 'Watchlists',
  alerts: 'Research alerts',
  reports: 'Report snapshots',
};
function condition(rule: AlertRule) {
  switch (rule.kind) {
    case 'THRESHOLD':
      return `${rule.asset} ${rule.metric} ${rule.operator.toLowerCase()} ${rule.threshold}`;
    case 'DATA_RISK':
      return `${rule.asset} ${rule.tool} coverage missing or stale`;
    case 'PROVIDER_DOWN':
      return `${rule.provider} observed unhealthy status`;
    case 'NARRATIVE_CHANGE':
      return `${rule.narrative} absolute score change ≥ ${rule.threshold} points`;
    case 'RISK':
      return `${rule.asset} ${rule.category} score ≥ ${rule.threshold}`;
    case 'LIQUIDITY':
      return `SOL same-pool USD liquidity decline ≥ ${rule.declinePercent}%`;
  }
}
async function readResearch() {
  const r = await fetch('/api/research', {
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  return researchResponseSchema.parse(await r.json());
}
export function ResearchWorkspace({ workspace }: { workspace: string }) {
  const [clock, setClock] = useState(0);
  const [queryOpen, setQueryOpen] = useState(false);
  useEffect(() => {
    const tick = () => setClock(Date.now());
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ['research'],
    queryFn: readResearch,
    refetchInterval: workspace === 'alerts' ? 60000 : false,
    retry: false,
  });
  const qc = useQueryClient(),
    markets = useMarketData();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [title, setTitle] = useState(''),
    [noteTitle, setNoteTitle] = useState(''),
    [noteAsset, setNoteAsset] = useState<AnalystRequest['asset']>('SOL'),
    [viewTitle, setViewTitle] = useState(''),
    [asset, setAsset] = useState<AnalystRequest['asset']>('SOL'),
    [body, setBody] = useState(''),
    [note, setNote] = useState<{ id: string; updatedAt: string } | null>(null);
  const [question, setQuestion] = useState(
      'What evidence supports or contradicts the performance thesis?',
    ),
    [tools, setTools] = useState<AnalystRequest['tools']>([
      'market',
      'features',
      'risk',
      'providers',
    ]);
  const [view, setView] = useState<SavedView>({
    filter: '',
    sort: 'quoteVolume24h',
    desc: true,
    hidden: [],
  });
  const [kind, setKind] = useState<AlertRule['kind']>('THRESHOLD'),
    [metric, setMetric] = useState<'price' | 'change_24h' | 'return_1h'>(
      'price',
    ),
    [operator, setOperator] = useState<'ABOVE' | 'BELOW'>('ABOVE'),
    [threshold, setThreshold] = useState(1),
    [provider, setProvider] = useState('fred'),
    [narrative, setNarrative] = useState('l1'),
    [category, setCategory] = useState<
      'contract' | 'ownership' | 'liquidity' | 'market_structure'
    >('contract');
  const [listId, setListId] = useState(''),
    [symbol, setSymbol] = useState(''),
    [memo, setMemo] = useState<AnalystMemo | null>(null),
    [reportTitle, setReportTitle] = useState(''),
    [digest, setDigest] = useState('');
  const data = query.data,
    ready = data?.state === 'READY',
    request: AnalystRequest = { asset, question, tools };
  async function mutate(action: ResearchAction) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) {
        const e = (await r.json()) as { error: string };
        throw new Error(
          e.error === 'RESEARCH_CONFLICT'
            ? 'Note changed since it was opened. Reload before editing.'
            : e.error === 'RESEARCH_CAPACITY'
              ? 'Storage limit reached. Delete an existing record before adding another.'
              : 'Research storage unavailable. No change confirmed.',
        );
      }
      await qc.invalidateQueries({ queryKey: ['research'] });
      if (
        [
          'CREATE_WATCHLIST',
          'SAVE_QUERY',
          'CAPTURE_REPORT',
          'CREATE_ALERT',
        ].includes(action.action)
      )
        setTitle('');
      if (action.action === 'SAVE_QUERY') setQueryOpen(false);
      if (action.action === 'SAVE_NOTE') {
        setNoteTitle('');
        setBody('');
        setNote(null);
      }
      if (action.action === 'SAVE_VIEW') setViewTitle('');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Research storage unavailable.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function openReport(id: string) {
    setBusy(true);
    setError('');
    setMemo(null);
    try {
      const r = await fetch(`/api/research/report?id=${id}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw new Error();
      const x = reportSchema.parse(await r.json());
      setMemo(x.memo);
      setReportTitle(x.title);
      setDigest(x.digest);
    } catch {
      setError(
        'Report unavailable or failed its integrity check. No replacement report supplied.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function analyze() {
    setBusy(true);
    setError('');
    setMemo(null);
    setDigest('');
    setReportTitle('Unsaved analyst memo');
    try {
      const r = await fetch('/api/analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(35000),
      });
      if (!r.ok) throw new Error();
      setMemo(analystMemoSchema.parse(await r.json()));
    } catch {
      setError(
        'Analyst unavailable or rate limited. Evidence was not replaced with estimates.',
      );
    } finally {
      setBusy(false);
    }
  }
  const remove = (
    table: Extract<ResearchAction, { action: 'DELETE' }>['table'],
    id: string,
  ) => void mutate({ action: 'DELETE', table, id });
  const list = data?.watchlists.find(
    (l) => l.id === (listId || data.watchlists[0]?.id),
  );
  const rule = (): AlertRule =>
    kind === 'THRESHOLD'
      ? { kind, asset, metric, operator, threshold }
      : kind === 'DATA_RISK'
        ? { kind, asset, tool: tools[0] ?? 'market' }
        : kind === 'RISK'
          ? { kind, asset, category, threshold }
          : kind === 'LIQUIDITY'
            ? { kind, asset: 'SOL', declinePercent: threshold }
            : kind === 'PROVIDER_DOWN'
              ? {
                  kind,
                  provider: provider as Extract<
                    AlertRule,
                    { kind: 'PROVIDER_DOWN' }
                  >['provider'],
                }
              : { kind: 'NARRATIVE_CHANGE', narrative, threshold };
  return (
    <div className="token-workspace analyst-workspace research-workspace">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">RESEARCH · EVIDENCE · RETAINED WORK</span>
          <h1>{names[workspace]}</h1>
        </div>
        <span className="workspace-note">Single operator · no execution</span>
      </div>
      <p className="panel-foot">
        {query.isPending
          ? 'Loading research records…'
          : ready
            ? 'Stored in PostgreSQL. Notes are operator opinions; saved reports are frozen evidence snapshots.'
            : `Research storage ${data?.state ?? 'UNAVAILABLE'}. No seeded or fabricated records.`}
      </p>
      <button
        disabled={query.isFetching || busy}
        onClick={() => void query.refetch()}
      >
        Refresh records
      </button>
      {error && (
        <p role="alert" aria-label="Research status">
          {error}
        </p>
      )}
      {(workspace === 'research' || workspace === 'reports') && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>Saved research queries</h2>
              <span>STRUCTURED TOOLS · NO SQL</span>
            </div>
            <details open={!data?.queries.length || queryOpen}>
              <summary>New query / capture report</summary>
              <form
                className="analyst-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutate({ action: 'SAVE_QUERY', title, query: request });
                }}
              >
                <label>
                  Record title
                  <input
                    aria-label="Record title"
                    value={title}
                    maxLength={60}
                    required
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label>
                  Asset
                  <select
                    aria-label="Research asset"
                    value={asset}
                    onChange={(e) => setAsset(e.target.value as typeof asset)}
                  >
                    {['BTC', 'ETH', 'SOL'].map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Question
                  <textarea
                    aria-label="Saved question"
                    value={question}
                    maxLength={500}
                    required
                    onChange={(e) => setQuestion(e.target.value)}
                  />
                </label>
                <fieldset>
                  <legend>Evidence scope</legend>
                  {analystTools.map((t) => (
                    <label key={t}>
                      <input
                        type="checkbox"
                        checked={tools.includes(t)}
                        onChange={(e) =>
                          setTools(
                            e.target.checked
                              ? [...tools, t]
                              : tools.filter((x) => x !== t),
                          )
                        }
                      />
                      {t}
                    </label>
                  ))}
                </fieldset>
                <div className="research-actions">
                  <button
                    disabled={busy || !ready || !tools.length}
                    type="submit"
                  >
                    Save query
                  </button>
                  <button
                    type="button"
                    disabled={busy || !tools.length}
                    onClick={() => void analyze()}
                  >
                    Run analyst query
                  </button>
                  <button
                    type="button"
                    disabled={busy || !ready || !title.trim() || !tools.length}
                    onClick={() =>
                      void mutate({
                        action: 'CAPTURE_REPORT',
                        title,
                        query: request,
                      })
                    }
                  >
                    Capture evidence report
                  </button>
                </div>
              </form>
            </details>
            <p className="panel-foot">
              Capture retrieves fresh bounded evidence and stores it without a
              model call. Run analyst explicitly invokes the optional configured
              model; no automatic calls. Reports keep the six evidence sections
              and source times.
            </p>
            <div className="table-scroll">
              <table className="market-table">
                <thead>
                  <tr>
                    <th>Saved query</th>
                    <th>Scope</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.queries.map((q) => (
                    <tr key={q.id}>
                      <td>
                        {q.title}
                        <small>{q.query.question}</small>
                      </td>
                      <td>
                        {q.query.asset} · {q.query.tools.join(', ')}
                      </td>
                      <td>
                        <button
                          disabled={busy}
                          onClick={() => {
                            setAsset(q.query.asset);
                            setQuestion(q.query.question);
                            setTools(q.query.tools);
                            setTitle(q.title);
                            setQueryOpen(true);
                          }}
                        >
                          Load query
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => remove('queries', q.id)}
                        >
                          Delete query
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Report archive</h2>
              <span>50 SNAPSHOTS · 90 DAYS</span>
            </div>
            <div className="table-scroll">
              <table className="market-table">
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>As of / confidence</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.reports.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.title}
                        <small>{r.asset} · Immutable snapshot</small>
                      </td>
                      <td>
                        {stamp(r.observedAt)}
                        <small>{r.confidence} · historical, not live</small>
                      </td>
                      <td>
                        <button
                          disabled={busy}
                          onClick={() => void openReport(r.id)}
                        >
                          Open report
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => remove('reports', r.id)}
                        >
                          Delete report
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data?.reports.length && (
              <p className="panel-foot">No report snapshots retained.</p>
            )}
          </section>
        </>
      )}
      {workspace === 'research' && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>Research notes</h2>
              <span>OPERATOR NOTES · NOT VERIFIED FACTS</span>
            </div>
            <details open={!data?.notes.length || !!note}>
              <summary>New note / edit note</summary>
              <form
                className="analyst-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutate({
                    action: 'SAVE_NOTE',
                    title: noteTitle,
                    asset: noteAsset,
                    body,
                    ...(note
                      ? { id: note.id, expectedUpdatedAt: note.updatedAt }
                      : {}),
                  });
                }}
              >
                <label>
                  Note title
                  <input
                    aria-label="Note title"
                    value={noteTitle}
                    required
                    maxLength={60}
                    onChange={(e) => setNoteTitle(e.target.value)}
                  />
                </label>
                <label>
                  Asset
                  <select
                    aria-label="Note asset"
                    value={noteAsset}
                    onChange={(e) =>
                      setNoteAsset(e.target.value as typeof noteAsset)
                    }
                  >
                    {['BTC', 'ETH', 'SOL'].map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Note
                  <textarea
                    aria-label="Note body"
                    value={body}
                    required
                    maxLength={3000}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </label>
                <div className="research-actions">
                  <button disabled={busy || !ready}>
                    {' '}
                    {note ? 'Update note' : 'Save note'}
                  </button>
                  {note && (
                    <button
                      type="button"
                      onClick={() => {
                        setNote(null);
                        setBody('');
                        setNoteTitle('');
                      }}
                    >
                      Cancel editing
                    </button>
                  )}
                </div>
              </form>
            </details>
            <div className="table-scroll">
              <table className="market-table">
                <thead>
                  <tr>
                    <th>Note</th>
                    <th>Asset / updated</th>
                    <th>Operator text</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.notes.map((n) => (
                    <tr key={n.id}>
                      <td>{n.title}</td>
                      <td>
                        {n.asset}
                        <small>{stamp(n.updatedAt)}</small>
                      </td>
                      <td className="note-text">{n.body}</td>
                      <td>
                        <button
                          disabled={busy}
                          onClick={() => {
                            setNote(n);
                            setNoteTitle(n.title);
                            setBody(n.body);
                            setNoteAsset(n.asset);
                          }}
                        >
                          Edit note
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => remove('notes', n.id)}
                        >
                          Delete note
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Saved scanner views</h2>
              <span>FILTER · SORT · COLUMNS</span>
            </div>
            <details open={!data?.views.length}>
              <summary>New scanner view</summary>
              <form
                className="analyst-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutate({ action: 'SAVE_VIEW', title: viewTitle, view });
                }}
              >
                <label>
                  View title
                  <input
                    aria-label="View title"
                    value={viewTitle}
                    maxLength={60}
                    required
                    onChange={(e) => setViewTitle(e.target.value)}
                  />
                </label>
                <label>
                  Asset filter
                  <input
                    aria-label="View filter"
                    pattern="[A-Za-z0-9]*"
                    maxLength={24}
                    value={view.filter}
                    onChange={(e) =>
                      setView({ ...view, filter: e.target.value })
                    }
                  />
                </label>
                <label>
                  Sort
                  <select
                    aria-label="View sort"
                    value={view.sort}
                    onChange={(e) =>
                      setView({
                        ...view,
                        sort: e.target.value as SavedView['sort'],
                      })
                    }
                  >
                    {scannerColumns.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={view.desc}
                    onChange={(e) =>
                      setView({ ...view, desc: e.target.checked })
                    }
                  />
                  Descending
                </label>
                <fieldset>
                  <legend>Hidden columns</legend>
                  {scannerColumns
                    .filter((c) => c !== 'base')
                    .map((c) => (
                      <label key={c}>
                        <input
                          type="checkbox"
                          checked={view.hidden.includes(c)}
                          onChange={(e) =>
                            setView({
                              ...view,
                              hidden: e.target.checked
                                ? [...view.hidden, c]
                                : view.hidden.filter((x) => x !== c),
                            })
                          }
                        />
                        {c}
                      </label>
                    ))}
                </fieldset>
                <button disabled={busy || !ready}>Save view</button>
              </form>
            </details>
            <div className="table-scroll">
              <table className="market-table">
                <thead>
                  <tr>
                    <th>View</th>
                    <th>Filter / sort</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.views.map((v) => (
                    <tr key={v.id}>
                      <td>{v.title}</td>
                      <td>
                        {v.view.filter || 'All assets'} · {v.view.sort}{' '}
                        {v.view.desc ? 'descending' : 'ascending'}
                      </td>
                      <td>
                        <Link href={`/screener?view=${v.id}`}>
                          Open scanner view ↗
                        </Link>
                        <button
                          disabled={busy}
                          onClick={() => remove('views', v.id)}
                        >
                          Delete view
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {workspace === 'watchlist' && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>Tracked research lists</h2>
              <span>20 LISTS · 30 TICKERS EACH</span>
            </div>
            <details open={!data?.watchlists.length}>
              <summary>New watchlist</summary>
              <form
                className="analyst-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutate({ action: 'CREATE_WATCHLIST', title });
                }}
              >
                <label>
                  List title
                  <input
                    aria-label="List title"
                    value={title}
                    required
                    maxLength={60}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <button disabled={busy || !ready}>Create watchlist</button>
              </form>
            </details>
            {data?.watchlists.length ? (
              <form
                className="analyst-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (list)
                    void mutate({
                      action: 'WATCH_ITEM',
                      id: list.id,
                      symbol,
                      remove: false,
                    });
                }}
              >
                <label>
                  Watchlist
                  <select
                    aria-label="Selected watchlist"
                    value={list?.id ?? ''}
                    onChange={(e) => setListId(e.target.value)}
                  >
                    {data.watchlists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ticker
                  <input
                    aria-label="Watch ticker"
                    value={symbol}
                    required
                    pattern="[A-Z0-9]{1,24}"
                    maxLength={24}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  />
                </label>
                <div className="research-actions">
                  <button disabled={busy || !ready}>Add ticker</button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => list && remove('watchlists', list.id)}
                  >
                    Delete selected list
                  </button>
                </div>
              </form>
            ) : (
              <p className="panel-foot">No watchlists retained.</p>
            )}
            <div className="table-scroll">
              <table className="market-table">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Spot / USDT</th>
                    <th>Freshness / source</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list?.items.map((s) => {
                    const m = markets.data?.rows.find((r) => r.base === s);
                    return (
                      <tr key={s}>
                        <td>{s}</td>
                        <td>{m ? formatNumber(m.price) : 'Unavailable'}</td>
                        <td>
                          {m
                            ? `${m.freshness} · ${m.provenance.providerId}`
                            : 'No tracked market evidence'}
                          {m && (
                            <small>{stamp(m.provenance.sourceTimestamp)}</small>
                          )}
                        </td>
                        <td>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void mutate({
                                action: 'WATCH_ITEM',
                                id: list.id,
                                symbol: s,
                                remove: true,
                              })
                            }
                          >
                            Remove ticker
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="panel-foot">
              Ticker labels use retained Binance spot markets, not on-chain
              identity. Adding a ticker does not expand ingestion or imply
              ownership.
            </p>
          </section>
        </>
      )}
      {workspace === 'alerts' && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>Explainable alert rules</h2>
              <span>IN-APP · 60 SECOND EVALUATION</span>
            </div>
            <details open={!data?.alerts.length}>
              <summary>New alert rule</summary>
              <form
                className="analyst-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutate({ action: 'CREATE_ALERT', title, rule: rule() });
                }}
              >
                <label>
                  Alert title
                  <input
                    aria-label="Alert title"
                    value={title}
                    required
                    maxLength={60}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label>
                  Rule
                  <select
                    aria-label="Alert kind"
                    value={kind}
                    onChange={(e) => setKind(e.target.value as typeof kind)}
                  >
                    {[
                      'THRESHOLD',
                      'DATA_RISK',
                      'PROVIDER_DOWN',
                      'NARRATIVE_CHANGE',
                      'RISK',
                      'LIQUIDITY',
                    ].map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
                {!['PROVIDER_DOWN', 'NARRATIVE_CHANGE', 'LIQUIDITY'].includes(
                  kind,
                ) && (
                  <label>
                    Asset
                    <select
                      aria-label="Alert asset"
                      value={asset}
                      onChange={(e) => setAsset(e.target.value as typeof asset)}
                    >
                      {['BTC', 'ETH', 'SOL'].map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                  </label>
                )}
                {kind === 'THRESHOLD' && (
                  <>
                    <label>
                      Metric
                      <select
                        value={metric}
                        onChange={(e) =>
                          setMetric(e.target.value as typeof metric)
                        }
                      >
                        {['price', 'change_24h', 'return_1h'].map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Operator
                      <select
                        value={operator}
                        onChange={(e) =>
                          setOperator(e.target.value as typeof operator)
                        }
                      >
                        <option>ABOVE</option>
                        <option>BELOW</option>
                      </select>
                    </label>
                  </>
                )}
                {kind === 'DATA_RISK' && (
                  <label>
                    Evidence family
                    <select
                      value={tools[0] ?? 'market'}
                      onChange={(e) =>
                        setTools([
                          e.target.value as AnalystRequest['tools'][number],
                        ])
                      }
                    >
                      {analystTools.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                )}
                {kind === 'PROVIDER_DOWN' && (
                  <label>
                    Provider
                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                    >
                      {[
                        'binance:spot',
                        'binance:spot:stream',
                        'binance:perpetual',
                        'dexscreener',
                        'goplus',
                        'helius',
                        'fred',
                      ].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                )}
                {kind === 'NARRATIVE_CHANGE' && (
                  <label>
                    Narrative
                    <select
                      value={narrative}
                      onChange={(e) => setNarrative(e.target.value)}
                    >
                      {taxonomy.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {kind === 'RISK' && (
                  <label>
                    Category
                    <select
                      value={category}
                      onChange={(e) =>
                        setCategory(e.target.value as typeof category)
                      }
                    >
                      {[
                        'contract',
                        'ownership',
                        'liquidity',
                        'market_structure',
                      ].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                )}
                {!['DATA_RISK', 'PROVIDER_DOWN'].includes(kind) && (
                  <label>
                    {kind === 'LIQUIDITY'
                      ? 'SOL same-pool decline percent'
                      : kind === 'NARRATIVE_CHANGE'
                        ? 'Absolute score change points'
                        : 'Threshold (metric units)'}
                    <input
                      aria-label="Alert threshold"
                      type="number"
                      required
                      step="any"
                      min={
                        kind === 'THRESHOLD'
                          ? -1e12
                          : kind === 'RISK'
                            ? 0
                            : 0.000001
                      }
                      max={kind === 'THRESHOLD' ? 1e12 : 100}
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                    />
                  </label>
                )}
                <button disabled={busy || !ready}>Create alert</button>
              </form>
            </details>
            <p className="panel-foot">
              No forecast, causal claim or automated action. Missing threshold
              evidence is UNKNOWN; data-risk rules monitor the absence itself.
              Liquidity means a USD DEX-pool proxy, not executable depth.
            </p>
            <div className="table-scroll">
              <table className="market-table">
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>Condition</th>
                    <th>Evaluation / evidence</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.alerts.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {a.title}
                        <small>{a.enabled ? 'Enabled' : 'Disabled'}</small>
                      </td>
                      <td>
                        {a.rule.kind}
                        <small>{condition(a.rule)}</small>
                      </td>
                      <td>
                        {a.evaluation?.state ?? 'UNKNOWN'}
                        {a.evaluation &&
                          clock - Date.parse(a.evaluation.observedAt) >
                            120000 && (
                            <small>
                              STALE EVALUATION · worker may be unavailable
                            </small>
                          )}
                        <small>
                          {a.evaluation?.reason ?? 'Not evaluated yet.'}
                        </small>
                        {a.evaluation && (
                          <small>
                            Evaluated {stamp(a.evaluation.observedAt)} · source{' '}
                            {a.evaluation.sourceTimestamp
                              ? stamp(a.evaluation.sourceTimestamp)
                              : 'unavailable'}
                          </small>
                        )}
                      </td>
                      <td>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void mutate({
                              action: 'TOGGLE_ALERT',
                              id: a.id,
                              enabled: !a.enabled,
                            })
                          }
                        >
                          {a.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => remove('alerts', a.id)}
                        >
                          Delete alert
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Notification history</h2>
              <span>STATE TRANSITIONS · 30 DAYS</span>
            </div>
            <div className="table-scroll">
              <table className="market-table">
                <thead>
                  <tr>
                    <th>Rule / transition</th>
                    <th>Observed</th>
                    <th>Explanation / sources</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.notifications.map((n) => (
                    <tr key={n.id}>
                      <td>
                        {data.alerts.find((a) => a.id === n.alertId)?.title ??
                          'Removed rule'}
                        <small>{n.state}</small>
                      </td>
                      <td>{stamp(n.createdAt)}</td>
                      <td>
                        {n.evaluation.reason}
                        <small>{n.evaluation.evidence.join(' · ')}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data?.notifications.length && (
              <p className="panel-foot">
                No alert transitions retained. UNKNOWN never generates a
                recovery.
              </p>
            )}
          </section>
        </>
      )}
      {memo && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>{reportTitle}</h2>
              <span>FROZEN AS OF {stamp(memo.observedAt)}</span>
            </div>
            {digest && (
              <p className="panel-foot">
                Integrity checked · SHA-256 {digest}. Historical evidence states
                are frozen at capture time, not current freshness.
              </p>
            )}
          </section>
          <MemoEvidence memo={memo} />
        </>
      )}
    </div>
  );
}
export function ResearchInspector() {
  return (
    <aside className="inspector" aria-label="Research policy">
      <div className="panel-heading">
        <h2>Research policy</h2>
        <span>RETAINED · EXPLAINABLE</span>
      </div>
      <div className="inspector-body">
        <h3>Evidence and opinion</h3>
        <p>
          Operator notes are escaped plain text, not verified market facts.
          Saved queries select structured tools, never SQL.
        </p>
        <h3>Frozen reports</h3>
        <p>
          Immutable evidence and counter-evidence, with source times and digest
          verification. Maximum 50 reports retained for 90 days; export or
          backup for longer retention.
        </p>
        <h3>Deterministic alerts</h3>
        <p>
          Thresholds use fresh complete evidence. Unknown inputs do not imply
          zero or recovery. Only state transitions create in-app notifications;
          no email, trading, signing or private keys.
        </p>
        <p>
          Shared single-operator records. Public access requires the production
          access controls documented in Phase 8.
        </p>
      </div>
    </aside>
  );
}
