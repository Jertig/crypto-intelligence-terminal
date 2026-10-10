'use client';
import { useState } from 'react';
import {
  analystMemoSchema,
  analystTools,
  type AnalystMemo,
  type AnalystTool,
} from '@terminal/domain/analyst';
const stamp = (value: string) =>
  new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Jakarta' }) +
  ' WIB';

export function AnalystWorkspace() {
  const [asset, setAsset] = useState<'BTC' | 'ETH' | 'SOL'>('SOL');
  const [question, setQuestion] = useState(
    'What evidence supports or contradicts the current performance narrative?',
  );
  const [tools, setTools] = useState<AnalystTool[]>([
    'market',
    'features',
    'risk',
    'events',
    'providers',
  ]);
  const [memo, setMemo] = useState<AnalystMemo | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  async function analyze() {
    setPending(true);
    setError('');
    setMemo(null);
    try {
      const response = await fetch('/api/analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset, question, tools }),
        signal: AbortSignal.timeout(35000),
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? 'Analyst busy or rate limited. Retry after one minute.'
            : 'Analyst unavailable. Evidence was not replaced with estimates.',
        );
      setMemo(analystMemoSchema.parse(await response.json()));
    } catch (e) {
      setError(
        e instanceof Error && e.message.startsWith('Analyst')
          ? e.message
          : 'Analyst unavailable. Evidence was not replaced with estimates.',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="token-workspace analyst-workspace">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">
            READ-ONLY · EVIDENCE BEFORE INTERPRETATION
          </span>
          <h1>AI analyst memo</h1>
        </div>
        <span className="workspace-note">evidence-analyst:v1</span>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Research question</h2>
          <span>BOUNDED TERMINAL TOOLS</span>
        </div>
        <form
          className="analyst-form"
          onSubmit={(e) => {
            e.preventDefault();
            void analyze();
          }}
        >
          <label>
            Asset{' '}
            <select
              aria-label="Analyst asset"
              value={asset}
              onChange={(e) => setAsset(e.target.value as typeof asset)}
            >
              {['BTC', 'ETH', 'SOL'].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label>
            Question{' '}
            <textarea
              aria-label="Research question"
              required
              maxLength={500}
              value={question}
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
                        : tools.filter((v) => v !== t),
                    )
                  }
                />{' '}
                {t}
              </label>
            ))}
          </fieldset>
          <button
            disabled={pending || !tools.length || !question.trim()}
            type="submit"
          >
            {pending ? 'Retrieving evidence…' : 'Build analyst memo'}
          </button>
        </form>
        <p className="panel-foot">
          Only selected structured terminal evidence is retrieved. No execution,
          signing or data writes. AI is optional and disabled until an operator
          configures a model and server-side key; an evidence brief remains
          available.
        </p>
      </section>
      {error && (
        <p role="alert" aria-label="Analyst status">
          {error}
        </p>
      )}
      {memo && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>Retrieval audit</h2>
              <span>
                AS OF {stamp(memo.observedAt)} · MODEL {memo.providerState}
              </span>
            </div>
            <p className="panel-foot">
              Snapshot query: {memo.request.asset} · {memo.request.question}.
              Freshness states are assessed at the recorded as-of time; rebuild
              the memo for current evidence.
            </p>
            <div className="table-scroll">
              <table className="market-table">
                <thead>
                  <tr>
                    <th>Tool</th>
                    <th>Status</th>
                    <th>Rows</th>
                    <th>Limits</th>
                  </tr>
                </thead>
                <tbody>
                  {memo.toolResults.map((t) => (
                    <tr key={t.tool}>
                      <td>{t.tool}</td>
                      <td>{t.state}</td>
                      <td>{t.rows}</td>
                      <td>{t.limitation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {(['Facts', 'Derived Signals'] as const).map((section) => {
            const items =
              section === 'Facts' ? memo.facts : memo.derivedSignals;
            return (
              <section className="panel" key={section}>
                <div className="panel-heading">
                  <h2>{section}</h2>
                  <span>{items.length} OBSERVATIONS · NO AI VALUES</span>
                </div>
                <div className="table-scroll">
                  <table className="market-table">
                    <thead>
                      <tr>
                        <th>Subject / metric</th>
                        <th>Value / unit</th>
                        <th>Evidence state</th>
                        <th>Source / input time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((e) => (
                        <tr key={e.id}>
                          <td>
                            {e.subject} / {e.label}
                            <small>{e.id}</small>
                          </td>
                          <td>
                            {e.value === null
                              ? 'Unavailable'
                              : typeof e.value === 'number'
                                ? e.value.toLocaleString('en-GB', {
                                    maximumFractionDigits: 6,
                                  })
                                : e.value}{' '}
                            {e.unit}
                          </td>
                          <td>
                            {e.state}
                            <small>{e.limitation}</small>
                          </td>
                          <td>
                            {e.provenance.providerId} · {e.provenance.quality}
                            <small>{stamp(e.provenance.sourceTimestamp)}</small>
                            <small>{e.provenance.methodologyVersion}</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!items.length && (
                  <p className="panel-foot">
                    Evidence unavailable. No factual value supplied.
                  </p>
                )}
              </section>
            );
          })}
          <section className="panel">
            <div className="panel-heading">
              <h2>Interpretation</h2>
              <span>AI INTERPRETATION · CONSTRAINED & CITED</span>
            </div>
            {memo.interpretations.length ? (
              memo.interpretations.map((i) => (
                <p className="panel-foot" key={i.evidenceId}>
                  {i.text} [{i.evidenceId}]
                </p>
              ))
            ) : (
              <p className="panel-foot">
                AI interpretation unavailable or insufficient eligible evidence.
                The evidence brief above is deterministic, not an AI-generated
                market conclusion.
              </p>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Counter-evidence</h2>
              <span>MISSING · STALE · CONFLICTING</span>
            </div>
            {memo.counterEvidence.map((c, i) => (
              <p className="panel-foot" key={i}>
                {c}
              </p>
            ))}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Confidence</h2>
              <span>{memo.confidence}</span>
            </div>
            <p className="panel-foot">{memo.confidenceReason}</p>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Sources</h2>
              <span>TRACE EVERY CLAIM</span>
            </div>
            <div className="table-scroll">
              <table className="market-table">
                <thead>
                  <tr>
                    <th>Evidence</th>
                    <th>Canonical source</th>
                    <th>Collection time</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {memo.sources.map((s) => (
                    <tr key={s.evidenceId}>
                      <td>{s.evidenceId}</td>
                      <td>{s.provenance.source}</td>
                      <td>{stamp(s.provenance.ingestedAt)}</td>
                      <td>{s.state}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
export function AnalystInspector() {
  return (
    <aside className="inspector" aria-label="Analyst evidence policy">
      <div className="panel-heading">
        <h2>Evidence policy</h2>
        <span>READ-ONLY</span>
      </div>
      <div className="inspector-body">
        <h3>Research, not execution</h3>
        <p>
          The analyst queries explicitly selected data families. No arbitrary
          SQL, URLs, files, private keys or trade tools exist.
        </p>
        <h3>Evidence gates</h3>
        <p>
          Facts and derived values retain source, unit, input time, collection
          time and methodology. Future observations are excluded; missing, stale
          and conflicting evidence cannot support interpretation.
        </p>
        <p>
          Model emphasis selects from deterministic, cited statements. Free-form
          factual claims, predictive probabilities and causal attribution are
          withheld.
        </p>
        <p>
          Wallet counts are a bounded observed sample, not asset flow, lifetime
          performance, common ownership or insider evidence. Liquidity is a
          DEX-pool proxy, not executable depth.
        </p>
        <p>
          Confidence is qualitative and limited; no calibrated forecasting model
          is available. Optional credentials are server-side. No automatic model
          calls or paid acquisition.
        </p>
      </div>
    </aside>
  );
}
