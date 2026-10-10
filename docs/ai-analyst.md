# Evidence analyst v1

Phase 6 is a read-only research layer over this terminal's own retained evidence.
It permits no arbitrary SQL, URLs, files, commands, signing, keys or execution.
Missing model credentials preserve the deterministic evidence brief.

## Query contract and bounds

The operator selects BTC/ETH/SOL, a question up to 500 characters and one to seven
unique evidence families. POST /api/analyst requires same-origin strict JSON up
to 4 KiB. One analysis runs per web process; at most six submissions/minute. It
is on demand, never automatic model polling. Local access is loopback-only;
production authentication is Phase 8.

| Tool      | Fixed parameterized SELECT projection                                           |
| --------- | ------------------------------------------------------------------------------- |
| market    | Four matching USDT spot snapshots, three values each                            |
| features  | Latest active method snapshot, six metrics and lineage                          |
| risk      | Canonical wrapped-SOL mint only; four categories and same-pool liquidity change |
| wallet    | Eight configured Solana addresses, retained-record counts only                  |
| events    | Six affected-asset cited releases from the last seven days                      |
| macro     | Latest observed period each for SP500, DGS10, DTWEXBGS                          |
| providers | Twelve stored provider states with observation/collection times                 |

Tools cannot widen the selected asset or scope. Each returns at most 24 validated
observations, cached within the analysis. No giant DB dump, raw transaction
history or wallet label is sent to the model. Wallet counts describe retained
observed records; asset flow, balance, valuation, profitability and ownership are
unavailable. Existing four risk categories and DEX-pool proxy limits are preserved.
BTC/ETH token-risk mapping is explicitly unavailable; a reported ticker symbol
cannot establish on-chain identity. Origin validation compares the browser-facing
Host rather than Next's internal URL and rejects foreign or rebound hosts. The
local default accepts HTTP loopback origins only; production origin/access is
configured in Phase 8.
Risk-category freshness conservatively uses its oldest contributing input time,
with actual input sources, rather than the unrelated latest DEX observation or
calculation time. Historical inputs can therefore make this compact brief stale;
the Risk workspace retains the complete component/input explanation. Future
category inputs are excluded. The liquidity-change proxy keeps its pool timing.

## Grounding

Facts and Derived Signals are formatted only from evidence values with units,
source, provider, input/collection time and methodology. Missing values remain
unavailable; zero remains zero. Future observations are excluded. Freshness is
assessed at the frozen snapshot's as-of time; rebuild for current evidence.
Latest-only spot snapshots overwritten after that instant can become unavailable
to the frozen query; later observations are never substituted into an earlier
memo. Rebuild to query the current snapshot.
Disagreeing fresh providers for the same subject/metric/unit flag every cohort
member as CONFLICTING and ineligible for interpretation.

Optional AI calls read_terminal_evidence then returns strict JSON selecting up
to six evidence IDs. It cannot supply factual prose, new numbers, citations,
probabilities or causes. The server renders versioned interpretation templates
for returns, BTC relative strength, volume/funding z-scores and the existing
same-pool liquidity proxy. Unknown, duplicate, missing, stale or conflicting IDs
reject the whole selection. This constrained vocabulary is intentional; it is
not a general conversational analyst or causal inference engine.

Counter-evidence and missing-tool states cannot be hidden. Confidence is
INSUFFICIENT with no fresh evidence, otherwise LIMITED. Coverage is qualitative,
not predictive confidence. Sources retain canonical credential-free lineage.
Descriptive associations do not establish causes, pump probabilities, wallet
ownership or insider status. No calibrated forecasting model is claimed.

## Optional model and privacy

AI_ANALYST_ENABLED defaults false. Explicit server-side OPENAI_API_KEY,
OPENAI_MODEL and opt-in are required. No model is silently selected, no paid
service purchased and no live test call performed. Credentials are absent; live
access, model-specific schema support and latency are unverified. Missing keys
return MODEL NOT_CONFIGURED with interpretation unavailable. Provider failure
retains evidence with sanitized UNAVAILABLE; rejected IDs return
REJECTED_UNGROUNDED_OUTPUT.

When enabled, questions and selected projected evidence, including selected public
wallet addresses, leave the server for api.openai.com. Never enter secrets.
Requests use store:false, fixed HTTPS, no redirects, 30-second total deadline,
256 KiB response cap, seven reads plus one final call maximum and 1,500 output
tokens/call. No automatic retries. Set provider-account spend limits too: local
process limits reset on restart and are not a billing guarantee.

The adapter follows official [function calling](https://developers.openai.com/api/docs/guides/function-calling)
and [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
Parameters disallow additional properties and parallel tool calls. Every call
and final ID selection is validated locally.

## Storage and verification

No table, migration, runtime service or third-party dependency added. Memos stay
in browser memory until Phase 7 report snapshots. Logs omit questions, evidence,
credentials and provider response bodies. Deterministic unit/provider fixtures
cover missing/stale/future/conflicting data, injection, malformed/oversized/
incomplete/HTTP/network/rate-limit responses, forged IDs and cancellation. Real
PostgreSQL tests verify read-only counts, small source/period projections, scoped
wallet counts and future collection exclusion. Browser tests cover all six memo
sections, missing credentials, retry, origin/body validation and mobile layout.
