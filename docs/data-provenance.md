# Data provenance

Every observation carries its source, provider identifier, source timestamp,
ingestion timestamp and quality class. Values also need units; calculations need
input references and a method version. Missing data is absence of evidence, not zero.

| Quality             | Meaning                                                |
| ------------------- | ------------------------------------------------------ |
| `DIRECT`            | A normalized provider observation                      |
| `AGGREGATED`        | A provider aggregate or parsed summary                 |
| `DERIVED`           | A calculation from identified observations             |
| `ESTIMATED`         | An estimate with a stated method and assumptions       |
| `AI_INTERPRETATION` | An interpretation grounded in eligible source evidence |

Derived and estimated values require a methodology version. The class does not
replace source-specific caveats: an aggregate is not necessarily a direct
measurement, and a derived indicator is not a calibrated probability.

## Time and freshness

Source time and collection time are separate. Updating a calculated row must not
make its underlying inputs fresh. Data is stored in UTC and displayed in WIB.

Market quote freshness allows five seconds of clock skew and a 90-second age.
The analyst applies a stricter as-of rule and excludes future observations.
Other sources have their own freshness windows; see [market data](market-core.md),
[token risk](token-risk.md), [wallets](wallet-intelligence.md) and
[events/macro](events-macro.md). Old values remain inspectable with their age.

DEX Screener and GoPlus do not provide a uniform upstream observation timestamp.
Their aggregate provenance uses collection time and labels it accordingly; it
does not claim the aggregate was measured at that instant. Liquidity comparisons
use current and prior collection times for the same pool.

Macro observation periods, FRED realtime ranges and the terminal's first-observed
revision times are distinct. Locally collected revisions do not reconstruct what
a researcher knew at an earlier release time.

## Availability and interpretation

Provider configuration is different from provider health. A missing credential is
a configuration failure, not evidence of an upstream outage. Stored provider state
and its error code must be read together; a successful poll does not prove that
every requested field is available.

Conflicting units, unresolved identity, missing inputs and incomplete history
remain visible. Wallet relationships do not prove common ownership. Statistical
associations do not establish causes. See [methodologies](methodologies.md) and
[AI evidence policy](ai-analyst.md) for the eligibility rules.

Production data comes from provider observations or explicitly sourced manual
events. Synthetic observations belong only in tests. Research notes are operator
opinion; saved reports preserve the source state at capture time and verify a
content digest on read.
