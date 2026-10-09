# TESTING, QA, AUDIT, AND REVIEW PROMPT

Use this file as the authoritative QA instruction after every meaningful phase.

---

You are now acting as the senior reviewer and test engineer for the Crypto Intelligence Terminal.

Do not add new product features unless required to fix defects discovered during review.

Your task is to aggressively audit the current implementation.

## 1. Repository health

Inspect:

- Git status
- changed files
- dependency changes
- scripts
- environment handling
- migrations
- Docker files
- CI workflow

Confirm no secret values are committed.

Search for:

- API keys
- bearer tokens
- private keys
- passwords
- hard-coded credentials
- production URLs containing credentials

If any secret is found, stop and report it before proceeding.

---

# 2. Static checks

Run:

- formatter check
- ESLint
- TypeScript typecheck
- dependency consistency checks

Fix actual problems.

Do not silence errors with `any`, `@ts-ignore`, disabled lint rules, or broad exception swallowing unless technically justified and documented.

---

# 3. Unit tests

Unit-test deterministic logic.

Examples:

- normalization
- indicator calculations
- scoring components
- narrative methodology
- stale-data detection
- provider status transitions
- retention date calculation
- event return-window calculation
- wallet classification helpers

Use fixtures.

Tests must be deterministic.

Do not depend on live APIs for unit tests.

---

# 4. Provider tests

Provider adapters should test:

- valid response parsing
- malformed response
- empty response
- rate-limit response
- timeout
- stale data
- provider error
- reconnect behavior where applicable

Use mocked/recorded fixtures where legally and technically appropriate.

---

# 5. Database tests

Test:

- migrations from empty DB
- schema constraints
- uniqueness rules
- idempotent ingestion
- upserts
- retention deletion
- provenance fields
- duplicate provider records
- transaction safety

Do not allow duplicate ingestion to inflate historical data.

---

# 6. Integration tests

Where practical, run a local PostgreSQL test database.

Test flows such as:

Provider fixture
→ normalization
→ persistence
→ feature calculation
→ API response

Verify provenance survives the whole path.

---

# 7. Frontend tests

Check:

- loading state
- empty state
- API error
- provider stale state
- partial provider degradation
- keyboard navigation
- table sorting
- filtering
- selected row
- inspector updates
- command palette

Do not assume perfect data.

---

# 8. Playwright smoke tests

Minimum eventual browser coverage:

- homepage renders
- navigation works
- market scanner loads
- asset row can be selected
- inspector opens/updates
- command palette opens
- no uncaught console errors
- degraded data state renders correctly

Do not build huge E2E suites early.

Focus on critical paths.

---

# 9. Production build

Run a clean production build.

No feature is complete if production build fails.

---

# 10. Docker audit

Run/build Docker Compose locally where possible.

Check:

- services boot
- healthchecks
- restart policies
- log rotation
- database persistence
- DB not publicly exposed
- worker starts only after dependencies are ready
- graceful shutdown

Avoid unbounded Docker logs.

Recommended logging concept:

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

---

# 11. Resource audit

Because production VPS is only:

- 2 vCPU
- 2 GB RAM
- 40 GB disk

Review:

- memory growth
- unbounded arrays
- excessive polling
- high-frequency REST fan-out
- unbounded DB tables
- unnecessary image sizes
- duplicate dependencies
- too many worker processes

Reject architecture that assumes enterprise-scale resources.

---

# 12. Data correctness

For every important metric ask:

- Where did this come from?
- Is it DIRECT or DERIVED?
- What timestamp does it represent?
- What unit is it?
- Is the formula versioned?
- Can stale data be mistaken for live data?
- Can a provider discrepancy be detected?

Do not approve misleading data presentation.

---

# 13. Methodology review

For every score:

- document formula
- document inputs
- document weights
- version it
- test edge cases
- expose components in UI

Reject opaque:

`score = 87`

without explainability.

---

# 14. AI grounding audit

The AI analyst must not fabricate market facts.

Test:

- missing data
- conflicting providers
- stale data
- no event data
- no wallet data
- unavailable provider

The model should explicitly say when evidence is unavailable.

AI output must distinguish:

- facts
- derived calculations
- interpretation
- counter-evidence

---

# 15. Security audit

Check:

- auth/session handling
- API keys server-side only
- no `NEXT_PUBLIC_` secrets
- SQL parameterization
- input validation
- SSRF exposure
- unsafe URL fetching
- command execution
- file traversal
- rate limiting where relevant
- error detail leakage

No trading credentials or wallet signing should exist.

---

# 16. UX audit

Compare against:

`design/approved-ivory-terminal-reference.png`

Reject regressions into generic AI-SaaS styling.

Check:

- dense information hierarchy
- table readability
- inspector consistency
- numeric alignment
- restrained color
- no excessive cards
- no giant empty areas
- no meaningless decorative charting

---

# 17. Final QA report format

Output:

## Status
PASS / FAIL

## Checks
- lint
- typecheck
- unit
- integration
- build
- Docker
- E2E

## Defects
Prioritized:
- Critical
- High
- Medium
- Low

## Security findings

## Data-quality findings

## Resource concerns

## Design deviations

## Fixed during review

## Remaining limitations

## Recommendation
READY TO COMMIT / NOT READY TO COMMIT

Do not commit until recommendation is READY TO COMMIT.

After green checks, create a meaningful commit and push the feature branch.
