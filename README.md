# Token Radar — token-radar-01 entry (model radar-3)

A program that reads a frozen DefiLlama snapshot of the protocol universe and ranks the pre-token
protocols worth farming ahead of a token launch, with a static dashboard that shows its work.

## Run it

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22.18+, standard library only. Writes `board.json`, `data.js`, `dashboard/`, `screenshots/`
and `dossier.json` to the output directory. Two runs on the same snapshot are byte-identical.

## The model (lib/model.ts)

`implied = round( TVL x category_multiple x growth_multiplier x launch_discount )`

- **Category multiple** — median market-cap/TVL of the category's traded protocols; ratios winsorized
  to [0.01, 5] and shrunk toward the global median with K = 16, so a category needs ~16 comparables
  before its own median counts for half.
- **Credibility (phase 2)** — shrinkage alone still let a single extreme comparable price its whole
  category: one traded Risk Curators protocol at ~2.97x against a ~0.18x global median produced a
  shrunk multiple of 0.3339x — an ~84% premium over the global median resting on one observation —
  and put five Risk Curators rows in the top 10. The multiple the board now uses is
  credibility-weighted: `multiple = global + (n / (n + 8)) x (shrunk - global)`, where n is the
  category's comparable count. One comparable earns 1/9 of its deviation, sixteen earn 2/3, ninety
  earn ~92%. The rule is a function of sample size alone — no category is named — and it pulls a
  below-global thin category up by the same weight it pulls an above-global one down. Categories
  with at most 4 comparables are flagged `thin_sample` on every row; 113 of the 198 rows carry the
  flag, and the dashboard discloses the comparable count and credibility wherever such a row appears.
  Effect on the old top 10: Risk Curators falls from 5 places to 4, its rows' implied values drop
  ~44% (Steakhouse Financial $682.0M → $382.4M), and the survivors rank on TVL scale at an effective
  multiple of 0.1872x — within 4% of the global median, not at a single comparable's price.
- **Growth multiplier** — `1 + clamp(change_7d, -30, 50)/100 x 0.30`. Deliberately weak.
- **Launch discount** — 0.40 + 0.55 x (0.35 log-TVL scale + 0.25 age profile + 0.25 category launch
  share + 0.15 chain breadth). Every factor is stored on the row (`factors`, `reason`), including
  the category median, the shrunk multiple and the credibility weight, so the dashboard shows the
  whole chain from raw median to effective multiple.

The board ranks every protocol that passes the pre-token screen (no token on record; not a versioned,
wrapped, staked, bridged or exchange product) — 198 rows on the sealed snapshot, including all 40
watchlist slugs. The watchlist is the floor, not the ceiling: the baseline starter missed
above-floor non-watchlist protocols entirely; this board ranks two of them in its top 10.

Farm plans are six steps per row, derived from the row's category, chains, TVL and age — a primary
action, a second distinct action, a weekly qualifying action, a hold period, and claim safety.

## The dashboard (phase 2)

A dark radar header (name, purpose, snapshot date and model version as chips), a facts card
(watchlist coverage, rows scored, thin-sample rows flagged), a sticky-headed ranking table with
rank pills, watchlist and low-confidence badges, and the multiple/discount pair per row. Filters:
search, category, a watchlist-only toggle, and the pre-token/live tabs — all reflected in the URL
hash, so a filtered view is a link. The detail drawer shows the full factor breakdown (comparables,
category median, credibility, effective multiple, growth, discount), a plain-English reason, an
amber low-confidence warning on thin-sample rows, and the farm plan. Fully static and
self-contained: no fonts, CDNs or network resources.

## Screenshots

`screenshots/` holds real captures of this dashboard at 1440x900 (the starter placeholders'
dimensions), taken with headless Chromium from a generated output directory:
`1-board.png` (the full board), `2-detail.png` (Steakhouse Financial's detail drawer, thin-sample
warning visible), `3-filtered.png` (the board filtered to Lending). A normal program run copies
them into its output unchanged.

## Status

Phase 2: credibility fix, dashboard polish and real screenshots done. Local run verified
(deterministic across two runs, watchlist 40/40, dashboard recomputation matches board.json on
every row, vendored library byte-identical to the starter). Not submitted.
