# Resource and storage review

Measurements are from local Docker Desktop on 11 October 2026 (Jakarta), not a
2 vCPU/2 GB VPS benchmark or a sustained maximum-universe load test. Production
uses the same four services with immutable prebuilt images. No extra persistent
worker, queue, cache, analytics database or monitoring server was introduced.

## Isolated secured production gate

The final operational verifier used no market/provider/model credentials or live
ingestion. All 49 checks passed, including a real dump/disposable restore. Startup
took 24.91 seconds; worker shutdown took 0.69 seconds, exit zero, no OOM. Twelve
warm serial authenticated API samples across health, markets, research and
operations took 6–60 ms. These are observations, not percentile/SLA claims.

| Service    | Observed idle sample | Memory cap | CPU cap   |
| ---------- | -------------------- | ---------- | --------- |
| Caddy      | 15.54 MiB            | 100 MiB    | 0.25 core |
| PostgreSQL | 43.21 MiB            | 500 MiB    | 0.75 core |
| Web        | 51.32 MiB            | 400 MiB    | 0.50 core |
| Worker     | 29.90 MiB            | 300 MiB    | 0.50 core |

Total sample: 139.97 MiB; aggregate cap: 1,300 MiB. Approximately 748 MiB remains
on a 2 GiB machine for its OS/Docker. Connection/work/V8/temp limits are documented
in [operations](production-operations.md). Short idle samples do not prove absence
of long-term growth or sufficient headroom under all optional providers.

Two additional actual-provider preview samples taken during the 48-image browser
sweep totaled 179.65 and 194.68 MiB across the four services. Combined instantaneous
CPU readings were approximately 0.87 and 0.32 core. These include startup/visual
requests and bounded Binance/DEX/GoPlus work, with missing optional credentials;
two snapshots are not sustained-load averages or memory-growth certification.

Effective runtime image sizes reported by Docker: web 77,268,470 bytes, worker
62,063,545, PostgreSQL 116,984,050 and Caddy 44,974,197: about 287 MiB total before
shared-layer savings. Build tools/caches stay on the workstation/CI, not the VPS.

## Retained local data and growth

The real provider-history database measured 32,971,799 bytes during review; this
is separate from the 9,395,223-byte isolated QA database. Its OHLCV relation,
including indexes, measured 17,694,720 bytes for 50,618 actual retained rows:
29,128 minute, 6,334 five-minute, 12,276 hourly and 2,880 daily bars. These are
retained observations, not a claim of complete historical coverage.

For planning only, continuous coverage of the default twelve markets and the
specified 30/180/730-day minute/five-minute/hour retention implies
518,400 + 622,080 + 210,240 = 1,350,720 rows. Scaling the measured indexed relation
bytes/row gives roughly 450 MiB for those bars; thirty markets multiply this
component by 2.5. Row/index occupancy and numeric widths can change. This is a
storage estimate, not invented market evidence or a complete database forecast.

Features, narratives, risks, provider histories, indexes, dead tuples and WAL need
additional space. Retention and row/cardinality caps are independently tested.
Daily bars are permanent per the specification; they grow slowly but are still
subject to the database budget. The database warns at 6 GiB and protects ingestion
at 8 GiB; this is a control boundary, not a guarantee against batch overshoot.
Hourly cleanup is bounded, independent of credentials and continues under
protection. Deletes permit page reuse but do not automatically shrink relation
files. Inspect actual relation growth/autovacuum on the VPS before expanding scope.

Plan a 40 GB disk around the 8 GiB database control boundary, 8 GiB backup archive
budget, OS/images, bounded logs, WAL/temp files and substantial free recovery
space. Four Docker log streams are capped at 10 MB × three files each. Bound host
journald separately. PostgreSQL's 512 MiB WAL setting is a target, not an absolute
cap; monitor actual filesystem use. At 70/80/90% warn/escalate/protect, respectively.

The local backup filesystem genuinely measured an urgent 80–90% use range during
QA, reflecting the workstation's existing disk use, not project database growth.
Protection tests inject only a labeled operational-state fixture and restore real
measurements afterward; no disk-filling or unrelated cleanup was performed.

The verified isolated dump was 77,435 bytes and restored twelve migrations, two
reports, one note and one watchlist. Small fixture-free QA archives do not establish
production backup size. Seven daily/four weekly/three monthly buckets overlap and
must fit the archive budget. Independent off-host transfer and clean-host recovery
remain unverified; see [recovery](disaster-recovery.md). Benchmark actual CPU,
memory, query latency, growth and recovery on the authorized VPS before go-live.
