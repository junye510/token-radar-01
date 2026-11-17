// The token radar's model v2: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and ranks every
// other protocol that passes the same pre-token screen, with no TVL cut: the candidate pool is defined
// by a rule, not by a hand-picked size. A protocol is pre-token when its index entry records no token
// (no market cap, no CoinGecko id, no symbol); the snapshot's live-token protocols are kept apart and
// shown as the market's own values, never mixed into the ranked board.
//
// Implied value is built only from the snapshot's own figures, in three explainable factors:
//
//   multiple   the category's comparable value: the median market-cap / TVL ratio of the category's
//              token-bearing protocols, each ratio winsorized to [MULTIPLE_FLOOR, MULTIPLE_CAP] so one
//              speculative outlier cannot price a whole category, then shrunk toward the global median
//              by the category's sample size: shrunk = (n x catMedian + K x globalMedian) / (n + K).
//              Shrinkage alone still lets a single extreme comparable move its category: with one
//              comparable at ~2.9x against a global median of ~0.18x, the shrunk multiple lands near
//              0.33x — an 84% premium over the global median, resting on one observation. So the
//              multiple the board actually uses is credibility-weighted (phase 2): only the fraction
//              credibility = n / (n + CREDIBILITY_K) of the gap between the shrunk multiple and the
//              global median is trusted, and the rest is priced at the global median:
//              multiple = globalMedian + credibility x (shrunk - globalMedian). One comparable earns
//              1/9 of its deviation; sixteen earn 2/3; ninety earn ~92%. The rule is a function of
//              the comparable count alone — no category is named, and a below-global thin category
//              is pulled up toward the global median by exactly the same weight it would be pulled
//              down. Categories with at most THIN_SAMPLE_MAX comparables are flagged thin_sample on
//              every row, and the dashboard discloses the count wherever such a row is opened.
//   growthMult 1 + clamp(change_7d, -30, 50) / 100 x 0.30: a week's momentum, deliberately weak
//   discount   a launch-and-quality discount in [0.40, 0.95]: 0.40 + 0.55 x score, where the score is
//              0.35 x TVL scale (log scale) + 0.25 x age profile + 0.25 x the category's own launch
//              share (how many of its protocols already have a token) + 0.15 x chain breadth
//   implied    = max(1, round(tvl_usd x multiple x growthMult x discount))
//
// Every factor of every row is written onto the row itself (row.factors, row.reason), so the dashboard
// shows the arithmetic instead of asking to be trusted. No protocol name is ever special-cased: the
// same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  multiple_cap: number;
  multiple_floor: number;
  shrinkage_k: number;
  credibility_k: number;
  thin_sample_max: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  discount_floor: number;
  discount_range: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  multiple_cap: 5,
  multiple_floor: 0.01,
  shrinkage_k: 16,
  credibility_k: 8,
  thin_sample_max: 4,
  growth_weight: 0.3,
  growth_floor: -30,
  growth_cap: 50,
  discount_floor: 0.4,
  discount_range: 0.55,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** The per-row factor breakdown: every number the implied value is built from. */
export interface RowFactors {
  category_multiple: number;
  category_median: number;
  shrunk_multiple: number;
  credibility: number;
  thin_sample: boolean;
  comparables_n: number;
  growth_multiplier: number;
  launch_discount: number;
  scale_score: number;
  age_score: number;
  category_propensity: number;
  chain_score: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  factors: RowFactors;
  reason: string;
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  category_multiple: number;
  category_median: number;
  credibility: number;
  thin_sample: boolean;
  watchlist: boolean;
  comparables_n: number;
  launch_discount: number;
  category_propensity: number;
  reason: string;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories whose products are, by the watchlist's own definition, another protocol's wrapped,
 * staked or bridged form (or an exchange's own venue), not a launch waiting to happen. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Names that mark a wrapped or staked product of a token that already trades. */
const WRAPPED_NAME = /\b(wrapped|staked|staking)\b/i;

/** Exchange names a product may not begin with and still be an independent launch candidate. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol records a token in any form (used for category launch shares). */
function hasToken(p: SnapshotProtocol): boolean {
  return !isPreToken(p);
}

/**
 * Whether a protocol is one the board may rank: pre-token, and not a versioned pool, a wrapped,
 * staked or bridged product, or an exchange product — the watchlist definition's exclusions, applied
 * at every TVL, not only above its floor.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_NAME.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

// ------------------------------------------------------------ comparables

/** One category's comparable set: its winsorized multiples and its launch share. */
interface CategoryStats {
  multiples: number[];
  total: number;
  tokenBearing: number;
}

/** One category's pricing: its raw median, its shrunk multiple, the credibility the sample size
 * earns, the effective multiple the board prices with, and its launch share. */
export interface CategoryPricing {
  multiple: number;
  median: number;
  shrunk: number;
  credibility: number;
  n: number;
  propensity: number;
}

/** The comparable-pricing context one snapshot implies: global and per-category medians and shares. */
export interface ScoreContext {
  globalMultiple: number;
  globalPropensity: number;
  categories: Map<string, CategoryPricing>;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Build the context: winsorized mcap/TVL multiples and launch shares, global and per category. */
export function scoreContext(snapshot: Snapshot, model: ModelConstants = MODEL): ScoreContext {
  const stats = new Map<string, CategoryStats>();
  const allMultiples: number[] = [];
  let totalAll = 0;
  let tokenAll = 0;
  for (const p of snapshot.protocols) {
    const key = p.category ?? '';
    const s = stats.get(key) ?? { multiples: [], total: 0, tokenBearing: 0 };
    s.total += 1;
    totalAll += 1;
    if (hasToken(p)) {
      s.tokenBearing += 1;
      tokenAll += 1;
    }
    if (p.mcap_usd !== null && p.tvl_usd > 0) {
      const ratio = clamp(p.mcap_usd / p.tvl_usd, model.multiple_floor, model.multiple_cap);
      s.multiples.push(ratio);
      allMultiples.push(ratio);
    }
    stats.set(key, s);
  }
  const globalMultiple = allMultiples.length > 0 ? median(allMultiples) : model.multiple_floor;
  const globalPropensity = totalAll > 0 ? tokenAll / totalAll : 0;
  const categories = new Map<string, CategoryPricing>();
  for (const [key, s] of stats) {
    const n = s.multiples.length;
    const catMedian = n > 0 ? median(s.multiples) : globalMultiple;
    // Shrink small samples toward the global median, hard: with K = 16 a category needs sixteen
    // comparables before its own median counts for half, so one hot comparable (a lone protocol
    // trading near 3x TVL) nudges its category instead of pricing it.
    const shrunk = n > 0 ? (n * catMedian + model.shrinkage_k * globalMultiple) / (n + model.shrinkage_k) : globalMultiple;
    // Credibility (phase 2): shrinkage averages the category median with the global one, but the
    // result still leans on the thin sample for the whole of its remaining deviation. Trust only
    // the fraction n / (n + credibility_k) of that deviation and price the rest at the global
    // median. With no comparables the category is the global median, exactly.
    const credibility = n > 0 ? n / (n + model.credibility_k) : 0;
    const multiple = globalMultiple + credibility * (shrunk - globalMultiple);
    categories.set(key, {
      multiple,
      median: catMedian,
      shrunk,
      credibility,
      n,
      propensity: s.total > 0 ? s.tokenBearing / s.total : globalPropensity,
    });
  }
  return { globalMultiple, globalPropensity, categories };
}

// ------------------------------------------------------------ scoring

const LOG_TVL_MIN = Math.log10(5_000_000); // the snapshot's own TVL floor
const LOG_TVL_MAX = Math.log10(50_000_000_000); // past this, scale stops adding information

/** TVL scale on a log axis: 0 at the snapshot floor, 1 at $50B. */
function scaleScore(tvl: number): number {
  return clamp((Math.log10(Math.max(tvl, 1)) - LOG_TVL_MIN) / (LOG_TVL_MAX - LOG_TVL_MIN), 0, 1);
}

/** Age profile: ramps up over two years of operating tokenless, then eases off — a protocol that has
 * run five years with no token is telling you something different from one at two years. */
function ageScore(age: number | null, model: ModelConstants): number {
  const days = age ?? model.unknown_age_days;
  const ramp = 0.35 + 0.65 * Math.min(days / 730, 1);
  const stale = days > 1825 ? Math.max(0.55, 1 - ((days - 1825) / 1825) * 0.45) : 1;
  return ramp * stale;
}

/** Chain breadth: one chain is a start, four or more is a distribution footprint. */
function chainScore(chains: string[]): number {
  return 0.6 + 0.4 * (Math.min(Math.max(chains.length - 1, 0), 3) / 3);
}

/** The full factor breakdown and implied value one protocol gets. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  ctx: ScoreContext,
): { implied: number; growthPct: number; age: number | null; factors: RowFactors } {
  const age = ageDays(asOf, protocol.listed_at);
  const cat = ctx.categories.get(protocol.category ?? '') ?? {
    multiple: ctx.globalMultiple,
    median: ctx.globalMultiple,
    shrunk: ctx.globalMultiple,
    credibility: 0,
    n: 0,
    propensity: ctx.globalPropensity,
  };
  const growthPct = clamp(finite(protocol.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const scale = scaleScore(protocol.tvl_usd);
  const ageS = ageScore(age, model);
  const chainS = chainScore(protocol.chains);
  const score = 0.35 * scale + 0.25 * ageS + 0.25 * cat.propensity + 0.15 * chainS;
  const discount = model.discount_floor + model.discount_range * score;
  // The implied value is computed from the rounded factors the row carries, so the dashboard —
  // which only ever sees those rounded factors — recomputes the identical number, to the dollar.
  const implied = Math.max(1, Math.round(protocol.tvl_usd * round4(cat.multiple) * growthMult * round4(discount)));
  return {
    implied,
    growthPct,
    age,
    factors: {
      category_multiple: round4(cat.multiple),
      category_median: round4(cat.median),
      shrunk_multiple: round4(cat.shrunk),
      credibility: round4(cat.credibility),
      thin_sample: cat.n <= model.thin_sample_max,
      comparables_n: cat.n,
      growth_multiplier: round4(growthMult),
      launch_discount: round4(discount),
      scale_score: round4(scale),
      age_score: round4(ageS),
      category_propensity: round4(cat.propensity),
      chain_score: round4(chainS),
    },
  };
}

/** The model's reasoning for one row, in the dashboard's words: the same numbers, as a sentence. */
export function reasonFor(p: SnapshotProtocol, factors: RowFactors): string {
  const cat = p.category ?? 'Uncategorized';
  const base =
    factors.comparables_n > 0
      ? `${cat} protocols that already trade price at a median ${factors.category_median}x TVL (${factors.comparables_n} comparable${factors.comparables_n === 1 ? '' : 's'}); credibility ${factors.credibility} pulls that toward the global median, for an effective multiple of ${factors.category_multiple}x`
      : `no ${cat} protocol trades yet, so the global comparable median ${factors.category_multiple}x TVL prices it`;
  const launch = `${Math.round(factors.category_propensity * 100)}% of ${cat} protocols in the snapshot already have a token`;
  const scale = `its TVL scale score is ${factors.scale_score} on the snapshot's log range`;
  const thin = factors.thin_sample
    ? ` Low confidence: only ${factors.comparables_n} comparable${factors.comparables_n === 1 ? '' : 's'} price this category, so most of its value rests on the global median, not on category evidence.`
    : '';
  return `Priced from comparables: ${base}; ${launch}; ${scale}; the launch discount is ${factors.launch_discount}.${thin}`;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug is ranked even if the screen below would pass it by (on
  // this snapshot the screen passes them all, but coverage is the gate's row and is never gambled).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The radar proper: every other protocol that passes the pre-token screen, at any TVL. There is no
  // top-N cut — a small protocol with a strong category multiple outranks a large one without one.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const ctx = scoreContext(snapshot, model);
  const scored = [...chosen.values()].map((p) => {
    const { implied, growthPct, age, factors } = impliedValue(p, snapshot.as_of, model, ctx);
    return { p, implied, growthPct, age, factors };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: s.factors.category_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: s.factors.growth_multiplier,
      maturity_multiplier: s.factors.launch_discount,
      age_days: s.age,
    },
    factors: s.factors,
    reason: reasonFor(s.p, s.factors),
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The second chain a protocol names, when it has one. */
function secondChainOf(p: SnapshotProtocol): string | null {
  return p.chains.length > 1 ? p.chains[1]! : null;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's primary action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the supply position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain}, split across the pool's two assets.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade.`;
  if (c.includes('prediction')) return `Fund $${capital} and take one position in ${name}'s most liquid market.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into the largest ${name} vault on ${chain} and keep the vault shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield asset on ${chain} and hold it in the farming wallet.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('privacy')) return `Deposit $${capital} through ${name}'s shielded pool on ${chain} and keep the note.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second, different action: the step that separates a farmer from a depositor. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const second = secondChainOf(p);
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow a small amount against the supply (under 40% of its value), swap it once inside ${name}, and repay within the week, so the wallet shows both sides of the market.`;
  if (c.includes('dex')) return `Make at least two swaps through ${name}'s own interface on ${chain}, on different days, so the wallet is a user and not only a liquidity deposit.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the first hedge and open a second, smaller one a week later, keeping total margin under $${capital}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Move a quarter of the position into a second ${name} vault with a different strategy, so the wallet holds two distinct vault positions.`;
  if (second !== null) return `Repeat the primary action with $${Math.max(25, Math.floor(capital / 2))} on ${second}, ${name}'s second chain, from the same wallet.`;
  return `Increase the ${name} position by a quarter after two weeks, in a separate transaction, so the history shows sustained use rather than one deposit.`;
}

/** The weekly qualifying action for the category. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp')) return `Repay or top up once, and check ${name}'s points or rewards page for the balance it credits.`;
  if (c.includes('dex')) return `Make one swap and re-check the liquidity position's range and fees.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Adjust or roll the hedge once, keeping the trade small and hedged.`;
  if (c.includes('prediction')) return `Take one new market position or settle an open one.`;
  return `Make one qualifying action, such as a deposit, a swap, a claim of accrued rewards or a governance vote.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm ${p.name} with, keep its seed phrase offline, and reach ${p.name} only through the link on its official site or docs.`,
      cost: 'under $3 of gas for the first transaction',
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital, chain),
      cost: 'about $3 of gas, inside the same capital',
      time: '15 minutes, in the first week',
    },
    {
      text: `Each week, ${weeklyFor(p)}`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and review it once at the halfway mark instead of withdrawing early.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Keep a farm log of the wallet, dates and transaction hashes; before any withdrawal, claim only from the points or rewards page ${p.name} itself publishes, and never pay a fee to claim.`,
      cost: 'nothing but the log',
      time: '5 minutes a week',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, watchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    category_multiple: row.factors.category_multiple,
    category_median: row.factors.category_median,
    credibility: row.factors.credibility,
    thin_sample: row.factors.thin_sample,
    watchlist,
    comparables_n: row.factors.comparables_n,
    launch_discount: row.factors.launch_discount,
    category_propensity: row.factors.category_propensity,
    reason: row.reason,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, snapshot.watchlist.includes(r.slug))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
