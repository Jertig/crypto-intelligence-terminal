# Crypto Intelligence Terminal

An evidence-first crypto research workstation for market structure, narratives,
wallets, events, macro, and risk.

Phase 0 is the engineering foundation. Market providers and analysis are not yet
implemented. The approved reference is a design direction, not a market dataset.

## Development

Requires Node.js 24, pnpm 10, and Docker for the local database.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

## Verification

```sh
pnpm qa
```

The authoritative brief is preserved in `docs/specification`. See `PLAN.md`,
`STATUS.md`, and `BLOCKERS.md` for the current phase and verification limits.

No VPS deployment is authorized. Phase 1 requires explicit approval.
