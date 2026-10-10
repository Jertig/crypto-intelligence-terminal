# Events and macro methodology

Phase 5 reuses PostgreSQL and the existing single worker. No news crawler,
whole-market index or additional service is introduced.

## FRED observations and observed revisions

The fixed-origin adapter calls the [official observations endpoint](https://fred.stlouisfed.org/docs/api/fred/series_observations.html).
Twelve curated series cover Fed policy, Treasury yields, CPI/PCE, unemployment,
financial conditions, Fed assets, SP500, Nasdaq, broad trade-weighted USD and WTI.
The broad USD index is labeled as its own series; it is not fabricated DXY.
TOTAL3, exact DXY and gold are unavailable without an appropriate source.

An optional worker-only FRED key enables hourly serial collection: at most twelve
requests per cycle, one-second pauses, eight-second deadlines, no redirects,
two-MiB bodies, 2,000 observations per series and five years of observation dates.
A rate limit ends the batch; missing credentials record an independent unavailable
provider state without blocking market ingestion. Empty valid responses are
observed successes, not invented zero values. FRED `.` values stay null; legitimate
zero/negative values are preserved. No keys appear in stored source paths or errors.
Source-specific availability, licensing and upstream quotas still apply.

Observation **period date**, FRED **realtime start/end dates**, and the terminal's
**collection timestamp** are separate. Collection time is used for source freshness
because this endpoint does not establish an exact publication timestamp. The
adapter requests the collection-day realtime range explicitly. Dates cannot be
used as minute-level release times.

The database preserves first-observed versions. Unchanged polls do not create new
vintages or reset their first-observed time; changed values append observations.
Concurrent ingestion is serialized per series. Queries choose the latest value
known by their collection as-of time. These are locally observed revisions, not a
complete ALFRED release-vintage history. Earlier historical facts are not claimed
to have been known when their observation period occurred.
Hourly pruning runs even without credentials, keeping five years of period dates
and twelve latest observed versions per date. Ingestion atomically enforces the
twelve-version cap for every changed date. Per-series locks prevent concurrent
ingestion/pruning races; at most 1,000 expired rows per series per cycle are removed.
An old collection as-of query can be unavailable after its version expires.

## Sourced event ingestion

Events are operator transcriptions with an explicit public HTTPS citation. No
automatic release calendar or news feed is claimed. The bounded import accepts
at most fifty events per file (128 KiB), up to 2,000 stored records, immutable IDs
and observations, UTC release timestamps, category, title, expected/actual values,
unit, affected BTC/ETH/SOL assets and collection time. Duplicate identical imports
are idempotent; a conflicting immutable ID rejects the entire batch. Verify each
release timestamp, expectation source, actual value and unit before importing.

Run from the repository using a sourced JSON array stored outside Git:

```sh
node --env-file-if-exists=.env --import tsx apps/worker/scripts/import-events.mjs /absolute/path/events.json
```

Each record follows `eventSchema` in `packages/domain/src/events.ts`:
`id`, `timestamp`, `category` (economic/policy/protocol/market), `title`, `expected`
and `actual` (number or null), `unit`, `affectedAssets`, `source`,
`ingestion: "MANUAL_SOURCED"`, `collectedAt`. No illustrative event records are
seeded into production. Source citations are links, never arbitrary fetch targets.
Surprise is actual minus expected in the recorded unit, unavailable if either is
missing. It is not standardized or a probability.

## Event-impact v1

The worker refreshes the fifty latest events in the retained thirty-day minute-bar
window each hour, independently of FRED credentials. Older events retain their
last computed evidence; events outside this bounded refresh scope do not imply
complete historical coverage. A manual import also refreshes eligible windows.

BTC/ETH/SOL spot windows are +5m, +1h, +4h and +24h. The anchor is the last closed
one-minute bar at/before the event, within sixty seconds. The endpoint follows the
same rule at the target time. Actual anchor/end times are exposed. Events between
minute boundaries are approximated at this disclosed bar resolution; no tick
precision is claimed. The endpoint must be observed and the entire minute path
contiguous, with no future source/collection timestamps relative to calculation.

Return = `(end close / anchor close − 1) × 100`.
Volume abnormality = `(post-window base-asset volume / equal-length preceding
base-asset volume − 1) × 100`; the preceding path must also be contiguous and its
total positive. No units are combined across assets. OI change uses distinct
same-unit observations within five minutes before each boundary, with a positive
baseline. Funding change uses distinct observations within thirty minutes before
each boundary, `(end rate − baseline rate) × 10,000` basis points. Missing inputs
remain null with machine-readable reasons; stale reused derivatives cannot imply
zero change. Every stored result is DERIVED, version `event-impact:v1`, with
calculation time, event identity and actual market boundaries.

This is **retrospective descriptive research**, not a release-time executable
backtest: historical bars can be collected after the event. Historical +1h surprise
cohorts match the selected title, category, unit and asset. All usable counts are
shown; small samples, missing windows, overlapping releases and confounders limit
interpretation. No p-values, calibrated probabilities or causation are claimed.

## Cross-market v1

Crypto daily UTC closed bars are aligned with daily macro observation dates.
Use unique common dates, no forward fill, at most seven calendar days between
paired endpoints; both legs use the same matched interval. Positive price/index
series and crypto use log changes `ln(end / start)`. Yields, financial conditions
and oil use differences in recorded units (oil can be zero/negative); these betas
are dimensioned sensitivities rather than a conventional return beta. Monthly/
weekly macro indicators remain inspectable but are not interpolated into daily
comparisons. Data timing differs across markets and is disclosed.

At least twenty finite, varying matched intervals are required. On the last 240
intervals, centered OLS computes `beta = covariance / predictor variance`,
`alpha = mean(response) − beta × mean(predictor)`, Pearson correlation, R² and
residual standard deviation with n−2 degrees of freedom. Degenerate/nonfinite
calculations stay unavailable. Rolling correlation uses sixty trailing matched
intervals with a twenty-interval minimum. Lead/lag compares −5…+5 matched
intervals; positive lag means the predictor precedes the crypto response.

Lags are sample intervals, not fixed calendar days. Eleven exploratory comparisons
invite selection bias; serial dependence, revisions, timing mismatch and omitted
variables remain. Twenty points is a calculation gate, not confidence. No
significance, causality, forecasting probability or unvalidated Granger test is
asserted. The UI labels relationships as historical association.

## Local status and operational bounds

FRED credentials are absent locally. Live FRED ingestion and official event
transcription are unverified; the actual application displays unavailable/empty
states. Synthetic provider, event and statistical fixtures exist only in tests.
Existing Binance/DEX/GoPlus evidence remains independent. Three additive tables
and one migration bring the database to 28 tables/ten migrations. Responses cap
events at 100, impacts at 1,200, macro series at twelve × 2,000 dates and daily
crypto at three × 2,000 points. Raw minute-history retention limits event studies.
Observed revisions are bounded as above; operational disk protection is Phase 8.
No VPS deployment, paid acquisition, trading or signing is performed.
