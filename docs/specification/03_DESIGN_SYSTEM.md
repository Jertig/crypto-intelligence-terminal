# DESIGN SYSTEM — APPROVED IVORY TERMINAL

## Reference

Primary reference image:

`design/approved-ivory-terminal-reference.png`

The reference is directionally approved.

Do not redesign the product into a dark cyberpunk UI unless explicitly requested later.

---

# 1. Visual identity

Desired feeling:

- institutional
- editorial
- analytical
- calm
- precise
- research-oriented
- premium without luxury decoration
- dense without being chaotic

Think:

research desk + financial publication + market workstation

Not:

crypto casino + AI SaaS + gaming HUD

---

# 2. Color palette

Initial tokens:

```css
--bg: #F1EEE6;
--surface: #E7E2D8;
--surface-elevated: #F7F4ED;

--text: #202523;
--text-muted: #6D716C;

--green: #137D70;
--green-soft: #4F9A86;

--gold: #A67829;
--gold-soft: #C7A45C;

--negative: #B94A48;
--warning: #B97A38;

--border: rgba(40,45,40,0.12);
--border-strong: rgba(40,45,40,0.22);
```

Adjust for accessibility where needed.

Do not introduce purple as the dominant accent.

---

# 3. Typography

UI/data:

- Inter, Geist, or similarly clean sans-serif

Dense numeric values:

- optional JetBrains Mono / Geist Mono

Editorial headings only:

- restrained serif such as Georgia-style fallback

Do not use decorative display fonts.

Use tabular numbers where possible.

---

# 4. Layout

Persistent shell:

Top:
- product title
- search/command bar
- market tape
- provider/data/AI status
- clock

Left:
- workspace navigation
- tool navigation
- data navigation
- system navigation

Center:
- primary research workspace

Right:
- selected asset/entity inspector

The right inspector is a functional research surface, not a generic info card.

---

# 5. Radius and borders

Preferred radius:

0–4 px

Use lines and section separators more often than floating rounded cards.

Avoid:
- pill overload
- 16px radius everywhere
- floating glass panels

---

# 6. Spacing

Compact and consistent.

Suggested base spacing scale:

4 / 8 / 12 / 16 / 24 / 32

Tables should prioritize information density.

Avoid giant empty margins.

---

# 7. Tables

Tables are first-class UI.

Required behaviors:

- sortable columns
- keyboard navigation
- sticky headers where useful
- selected row state
- column customization
- filter/search
- virtualized rendering when needed
- proper numeric alignment

Color should supplement values, not replace them.

---

# 8. Charts

Use charts only when the chart answers a research question.

Good:

- price/volume
- relative-performance comparison
- narrative rotation over time
- event impact
- OI/funding history
- cross-market comparison
- wallet-flow history

Avoid:

- arbitrary radar charts
- meaningless decorative sparklines
- chart clutter in every table row

Mini sparklines are acceptable only when they materially improve scanning.

---

# 9. Data provenance UI

Selected asset inspector should show provenance such as:

| Metric | Quality | Source | Updated |
|---|---|---|---|
| Price | DIRECT | Binance | 2s ago |
| Open Interest | DIRECT | Binance | 1m ago |
| Wallet Flow | DERIVED | Helius | 5m ago |
| Narrative Score | DERIVED | Internal v1 | 15m ago |

Quality labels must be subtle but visible.

---

# 10. AI analyst UI

Do not use a huge chat bubble interface.

Prefer an analyst memo section.

Structure:

- Facts
- Derived Signals
- Interpretation
- Counter-evidence
- Sources

Allow a small input area or command invocation.

AI must visually look like part of the research workflow rather than a separate chatbot product.

---

# 11. Interaction

Keyboard-first.

Important shortcuts:

- Ctrl/Cmd + K command palette
- / focus search
- arrow keys for table selection
- Enter open inspector/detail
- Esc close detail/modal
- optional number shortcuts for workspaces

---

# 12. States

Implement:

- loading
- empty
- stale
- degraded provider
- error
- offline
- partial data
- no historical coverage

Never leave blank cards with no explanation.

---

# 13. Prohibited AI-slop patterns

Do not create:

- gradients everywhere
- glowing cards
- glassmorphism
- oversized metric cards
- random floating blobs
- AI robot face
- fake world map
- cyber globe
- decorative network graphs
- enormous "Welcome back" headers
- giant logo area
- random pastel gradients
- excessive animations
- excessive pills
- emoji-based UI
- marketing copy inside the research terminal

---

# 14. Responsive behavior

Primary target:

desktop workstation

Support:
- 1366px wide minimum gracefully
- 1440p and ultrawide layouts

Mobile is secondary.

For mobile:
- prioritize watchlist
- selected asset
- alerts
- AI memo
- major market state

Do not squeeze full desktop tables into mobile.
