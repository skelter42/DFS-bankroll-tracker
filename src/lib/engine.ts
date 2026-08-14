import type { Entry } from '../types';

// ═══════════════════════════════════════════════════════════
//  Signal engine
//
//  Core insight from 157k-entry analysis: cash rate is NOT a
//  useful signal for GPP play. It sits near 27% across nearly
//  every slice while ROI swings from +32% to -35%. Money is
//  won in the tail, so signals are ROI-based and we track the
//  top-0.1% rate separately from the top-1% rate.
// ═══════════════════════════════════════════════════════════

export type Signal = 'keep' | 'watch' | 'remove' | 'low-n';

/** ROI needs a much larger sample than cash rate to be trusted. */
export const MIN_N     = 150;
export const ROI_KEEP  = 5;    // ROI% at or above this → press it
export const ROI_WATCH = -10;  // between WATCH and KEEP → monitor

/** Finish tiers. pct = place/field, so lower is better. */
export const T20 = 0.20;
export const T10 = 0.10;
export const T1  = 0.01;
export const T01 = 0.001;

export function toSignal(n: number, roi: number): Signal {
  if (n < MIN_N)          return 'low-n';
  if (roi >= ROI_KEEP)    return 'keep';
  if (roi >= ROI_WATCH)   return 'watch';
  return 'remove';
}

export interface Stats {
  n:         number;
  fees:      number;
  winnings:  number;
  net:       number;
  roi:       number;   // percent
  cashRate:  number;
  top20:     number;
  top10:     number;
  top1:      number;
  top01:     number;
  /** Share of this slice's winnings that came from top-0.1% finishes. */
  tailShare: number;
  signal:    Signal;
}

export function calc(es: Entry[]): Stats {
  const n = es.length;
  if (n === 0) {
    return { n: 0, fees: 0, winnings: 0, net: 0, roi: 0, cashRate: 0,
             top20: 0, top10: 0, top1: 0, top01: 0, tailShare: 0, signal: 'low-n' };
  }
  let fees = 0, winnings = 0, cashes = 0, t20 = 0, t10 = 0, t1 = 0, t01 = 0, tailWin = 0;
  for (const e of es) {
    fees     += e.fee;
    winnings += e.winnings;
    if (e.winnings > 0) cashes++;
    if (e.pct <= T20) t20++;
    if (e.pct <= T10) t10++;
    if (e.pct <= T1)  t1++;
    if (e.pct <= T01) { t01++; tailWin += e.winnings; }
  }
  const net = winnings - fees;
  const roi = fees > 0 ? (net / fees) * 100 : 0;
  return {
    n, fees, winnings, net, roi,
    cashRate:  cashes / n,
    top20:     t20 / n,
    top10:     t10 / n,
    top1:      t1  / n,
    top01:     t01 / n,
    tailShare: winnings > 0 ? tailWin / winnings : 0,
    signal:    toSignal(n, roi),
  };
}

// ── Formatting ────────────────────────────────────────────

export function fmtFee(fee: number): string {
  const c = Math.round(fee * 100);
  if (c === 0)       return 'Free';
  if (c < 100)       return `${c}¢`;
  if (c % 100 === 0) return `$${c / 100}`;
  return `$${fee.toFixed(2)}`;
}

export function fmtSize(m: number | null): string {
  if (m === null) return 'no cap';
  if (m === 1)    return 'single';
  return `${m}-max`;
}

export function fmtNet(n: number): string {
  const a = Math.abs(n), s = n >= 0 ? '+$' : '-$';
  return a >= 1000 ? `${s}${(a / 1000).toFixed(1)}k` : `${s}${a.toFixed(0)}`;
}

export function fmtRoi(r: number): string {
  return `${r >= 0 ? '+' : ''}${r.toFixed(1)}%`;
}

/** Unsigned money, for when the sentence already carries the direction. */
export function fmtMoney(n: number): string {
  const a = Math.abs(n);
  return a >= 1000 ? `$${(a / 1000).toFixed(1)}k` : `$${a.toFixed(0)}`;
}

export function fmtPct(v: number, d = 1): string {
  return `${(v * 100).toFixed(d)}%`;
}

// ── Field-size buckets ────────────────────────────────────
// A top-0.1% finish is impossible below a ~1000-entry field
// (it rounds to 1st place), so field size caps your tail ceiling.

export interface FieldBucket { key: string; label: string; lo: number; hi: number; }

export const FIELDS: FieldBucket[] = [
  { key: 'micro', label: 'Under 500',   lo: 0,     hi: 500   },
  { key: 'small', label: '500 – 2K',    lo: 500,   hi: 2000  },
  { key: 'mid',   label: '2K – 5K',     lo: 2000,  hi: 5000  },
  { key: 'large', label: '5K – 15K',    lo: 5000,  hi: 15000 },
  { key: 'mega',  label: '15K+',        lo: 15000, hi: Infinity },
];

export function fieldBucket(n: number): FieldBucket {
  return FIELDS.find(f => n >= f.lo && n < f.hi) ?? FIELDS[FIELDS.length - 1];
}

// ── Generic slicing ───────────────────────────────────────

export type Dim = 'sport' | 'format' | 'fee' | 'field' | 'combo';

export interface Slice extends Stats {
  key:   string;
  label: string;
  dim:   Dim;
  /** Longer descriptor used by the agent, e.g. "$0.50 entries in NFL Classic". */
  detail: string;
}

function sliceBy(
  entries: Entry[],
  dim: Dim,
  keyOf: (e: Entry) => string | null,
  labelOf: (es: Entry[]) => string,
  detailOf?: (es: Entry[]) => string,
): Slice[] {
  const map = new Map<string, Entry[]>();
  for (const e of entries) {
    const k = keyOf(e);
    if (k === null) continue;
    const bucket = map.get(k);
    if (bucket) bucket.push(e);
    else map.set(k, [e]);
  }
  const out: Slice[] = [];
  for (const [key, es] of map) {
    const label = labelOf(es);
    out.push({ key, label, dim, detail: detailOf ? detailOf(es) : label, ...calc(es) });
  }
  return out.sort((a, b) => b.n - a.n);
}

export function bySport(entries: Entry[]): Slice[] {
  return sliceBy(entries, 'sport', e => e.sport, es => es[0].sport);
}

export function byFormat(entries: Entry[]): Slice[] {
  return sliceBy(entries, 'format',
    e => e.gameType || null,
    es => es[0].gameType,
  );
}

export function byFee(entries: Entry[]): Slice[] {
  return sliceBy(entries, 'fee',
    e => String(e.fee),
    es => `${fmtFee(es[0].fee)} entries`,
  );
}

export function byField(entries: Entry[]): Slice[] {
  return sliceBy(entries, 'field',
    e => fieldBucket(e.entries).key,
    es => `${fieldBucket(es[0].entries).label} fields`,
  ).sort((a, b) => {
    const oi = (s: Slice) => FIELDS.findIndex(f => f.key === s.key);
    return oi(a) - oi(b);
  });
}

/** Sport × format — the split that separates NBA Classic from NBA Showdown. */
export function bySportFormat(entries: Entry[]): Slice[] {
  return sliceBy(entries, 'combo',
    e => e.gameType ? `${e.sport}|${e.gameType}` : null,
    es => `${es[0].sport} ${es[0].gameType}`,
  );
}

// ── Leak finder ───────────────────────────────────────────
// Scans several cross-sections and ranks by dollars actually
// lost, so the biggest bleed surfaces first regardless of
// which dimension it lives in.

export interface Leak {
  label:  string;
  detail: string;
  dim:    Dim;
  n:      number;
  net:    number;
  roi:    number;
  /** Fees you would stop spending by cutting this. */
  fees:   number;
}

export function findLeaks(entries: Entry[], limit = 8): Leak[] {
  // Group along several cross-sections at once, keeping the member
  // entries so overlapping candidates can be de-duplicated for real.
  const groups = new Map<string, { label: string; dim: Dim; es: Entry[] }>();
  const add = (key: string, label: string, dim: Dim, e: Entry) => {
    const g = groups.get(key);
    if (g) g.es.push(e);
    else groups.set(key, { label, dim, es: [e] });
  };
  for (const e of entries) {
    add(`s|${e.sport}`, e.sport, 'sport', e);
    add(`f|${e.fee}`, `${fmtFee(e.fee)} entries`, 'fee', e);
    if (e.gameType) {
      add(`sf|${e.sport}|${e.gameType}`, `${e.sport} ${e.gameType}`, 'combo', e);
      add(`sff|${e.sport}|${e.gameType}|${e.fee}`, `${fmtFee(e.fee)} · ${e.sport} ${e.gameType}`, 'combo', e);
    }
  }

  const cands = [...groups.values()]
    .map(g => ({ ...g, stats: calc(g.es) }))
    .filter(g => g.stats.signal === 'remove' && g.stats.net < 0)
    .sort((a, b) => a.stats.net - b.stats.net);

  // Once a leak is listed, a narrower slice sitting mostly inside it adds
  // nothing — "$0.50 NFL Classic" under "$0.50 entries" is the same money.
  const claimed = new Set<Entry>();
  const kept: Leak[] = [];
  for (const c of cands) {
    const overlap = c.es.reduce((n, e) => n + (claimed.has(e) ? 1 : 0), 0) / c.es.length;
    if (overlap > 0.5) continue;
    for (const e of c.es) claimed.add(e);
    kept.push({
      label: c.label, detail: c.label, dim: c.dim,
      n: c.stats.n, net: c.stats.net, roi: c.stats.roi, fees: c.stats.fees,
    });
    if (kept.length >= limit) break;
  }
  return kept;
}

export function findEdges(entries: Entry[], limit = 6): Slice[] {
  return [...bySportFormat(entries), ...byFee(entries)]
    .filter(s => s.signal === 'keep' && s.net > 0)
    .sort((a, b) => b.net - a.net)
    .slice(0, limit);
}

// ── Core profile (the counterfactual) ─────────────────────
// "What if you only played the slices that make money?"
// Derives the profile from the data rather than hardcoding it,
// then reports the split so the cost of the rest is visible.

export interface CoreProfile {
  /** Winning sport × format pairs, e.g. ["NFL Classic", "NBA Classic"]. */
  combos:        string[];
  /** Fee tiers that lose money even inside those combos. */
  excludeFees:   number[];
  /** Field-size buckets that lose money even inside those combos. */
  excludeFields: string[];
  core:          Stats;
  rest:          Stats;
  coverage:      number;  // share of total entries the core represents
  hasCore:       boolean;
}

/**
 * Derives the profitable profile from the data rather than assuming one.
 *
 * Works from sport × format pairs rather than intersecting sports and formats
 * independently: a format can be unprofitable overall while being strong in
 * one sport, so judging the two dimensions separately hides the real edge.
 */
export function buildCore(entries: Entry[]): CoreProfile {
  const none: CoreProfile = {
    combos: [], excludeFees: [], excludeFields: [],
    core: calc([]), rest: calc(entries), coverage: 0, hasCore: false,
  };
  if (entries.length < MIN_N) return none;

  const winners = bySportFormat(entries).filter(s => s.signal === 'keep');
  if (winners.length === 0) return none;

  const comboKeys = new Set(winners.map(s => s.key));
  const inCombo   = entries.filter(e => comboKeys.has(`${e.sport}|${e.gameType}`));
  if (inCombo.length < MIN_N) return none;

  // Prune the tiers and field sizes that still lose money inside those combos.
  const excludeFees = byFee(inCombo)
    .filter(s => s.n >= MIN_N && s.roi < ROI_WATCH)
    .map(s => parseFloat(s.key));
  const excludeFields = byField(inCombo)
    .filter(s => s.n >= MIN_N && s.roi < ROI_WATCH)
    .map(s => s.key);
  const badFields = new Set(excludeFields);

  const inCore = (e: Entry) =>
    comboKeys.has(`${e.sport}|${e.gameType}`) &&
    !excludeFees.some(f => Math.abs(e.fee - f) < 0.001) &&
    !badFields.has(fieldBucket(e.entries).key);

  const core: Entry[] = [], rest: Entry[] = [];
  for (const e of entries) (inCore(e) ? core : rest).push(e);
  if (core.length < MIN_N) return none;

  return {
    combos: winners.map(s => s.label),
    excludeFees, excludeFields,
    core: calc(core), rest: calc(rest),
    coverage: core.length / entries.length,
    hasCore: true,
  };
}

// ── Tail analysis ─────────────────────────────────────────
// How your finish rates compare to a random player, and where
// your winnings actually came from.

export interface TailReport {
  overall:    Stats;
  /** Actual rate ÷ random baseline. Above 1.0 = beating the field at that tier. */
  edge20:     number;
  edge10:     number;
  edge1:      number;
  edge01:     number;
  /** Average dollars from one finish in each tier. */
  valueTop01: number;
  valueTop1:  number;
  /** How many top-1% finishes one top-0.1% finish is worth. */
  tailRatio:  number;
  /** Share of all winnings from each cumulative tier. */
  shareTop01: number;
  shareTop1:  number;
  shareTop10: number;
}

export function buildTail(entries: Entry[]): TailReport {
  const overall = calc(entries);
  const totalWin = overall.winnings;

  const t01 = entries.filter(e => e.pct <= T01);
  const t1band = entries.filter(e => e.pct > T01 && e.pct <= T1);
  const t1all = entries.filter(e => e.pct <= T1);
  const t10all = entries.filter(e => e.pct <= T10);

  const sum = (es: Entry[]) => es.reduce((s, e) => s + e.winnings, 0);
  const valueTop01 = t01.length    ? sum(t01)    / t01.length    : 0;
  const valueTop1  = t1band.length ? sum(t1band) / t1band.length : 0;

  return {
    overall,
    edge20:     overall.top20 / T20,
    edge10:     overall.top10 / T10,
    edge1:      overall.top1  / T1,
    edge01:     overall.top01 / T01,
    valueTop01,
    valueTop1,
    tailRatio:  valueTop1 > 0 ? valueTop01 / valueTop1 : 0,
    shareTop01: totalWin > 0 ? sum(t01)    / totalWin : 0,
    shareTop1:  totalWin > 0 ? sum(t1all)  / totalWin : 0,
    shareTop10: totalWin > 0 ? sum(t10all) / totalWin : 0,
  };
}

// ── Recency ───────────────────────────────────────────────
// A slice can be lifetime-positive but currently bleeding.
// Comparing recent ROI to lifetime ROI catches that.

export interface FormRow {
  sport:      string;
  recentN:    number;
  recentRoi:  number;
  lifeRoi:    number;
  delta:      number;
  cooling:    boolean;
}

export function buildForm(entries: Entry[], days = 90): FormRow[] {
  let maxDate: Date | null = null;
  for (const e of entries) if (e.date && (!maxDate || e.date > maxDate)) maxDate = e.date;
  if (!maxDate) return [];
  const cutoff = new Date(maxDate.getTime() - days * 86_400_000);

  const life = new Map(bySport(entries).map(s => [s.label, s]));
  const recent = entries.filter(e => e.date && e.date >= cutoff);

  return bySport(recent)
    .filter(s => s.n >= 30)
    .map(s => {
      const l = life.get(s.label);
      const lifeRoi = l ? l.roi : 0;
      return {
        sport:     s.label,
        recentN:   s.n,
        recentRoi: s.roi,
        lifeRoi,
        delta:     s.roi - lifeRoi,
        cooling:   s.roi < ROI_WATCH && s.roi < lifeRoi,
      };
    })
    .sort((a, b) => a.recentRoi - b.recentRoi);
}
