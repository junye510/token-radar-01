# Token Radar — token-radar-01 entry (prototype v1, model radar-2)

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
- **Growth multiplier** — `1 + clamp(change_7d, -30, 50)/100 x 0.30`. Deliberately weak.
- **Launch discount** — 0.40 + 0.55 x (0.35 log-TVL scale + 0.25 age profile + 0.25 category launch
  share + 0.15 chain breadth). Every factor is stored on the row (`factors`, `reason`).

The board ranks every protocol that passes the pre-token screen (no token on record; not a versioned,
wrapped, staked, bridged or exchange product) — 198 rows on the sealed snapshot, including all 40
watchlist slugs. The watchlist is the floor, not the ceiling: the baseline starter missed
above-floor non-watchlist protocols entirely; this board ranks two of them in its top 10.

Farm plans are six steps per row, derived from the row's category, chains, TVL and age — a primary
action, a second distinct action, a weekly qualifying action, a hold period, and claim safety.

## Status

Prototype v1: local run verified (deterministic, watchlist 40/40, dashboard recomputation matches
board.json on every row). Screenshots in `screenshots/` are the starter's placeholders; final
screenshots of the radar-2 dashboard are a later phase. Not submitted.
