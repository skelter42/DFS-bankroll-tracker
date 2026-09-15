import type { Entry } from '../types';

// ═══════════════════════════════════════════════════════════
//  Decision engine
//
//  Built around three findings from a 157k-entry study:
//
//  1. ROI is unusable at the slice level. Deleting a single
//     winning entry moved slices by up to 36 points. Top-1%
//     rate moved by 0.06.
//  2. Top-1% rate is what tracks money (r = +0.51 with ROI
//     across slices; the tail-conversion ratio managed +0.09).
//  3. Entries inside one contest share a slate, so they are
//     not independent. Confidence intervals cluster by contest
//     or they lie by roughly a factor of four.
// ═══════════════════════════════════════════════════════════

export type Verdict = 'play' | 'cut' | 'watch' | 'unknown';

/**
 * Where the money and the rate disagree.
 *
 * 'mirage'  — profitable, but finishing top 1% less often than you usually do.
 *             The profit is variance sitting on top of a worse process.
 * 'unlucky' — losing, but finishing top 1% more often than you usually do.
 *             Cutting this is cutting a winner during a cold run.
 *
 * Only set where the interval is readable, and only past a margin wide
 * enough that it is not rounding.
 */
export type Divergence = 'mirage' | 'unlucky' | null;

/** How far rel must sit from 1.0 before a divergence is worth naming. */
export const DIVERGE_MARGIN = 0.05;

/** A top-1% finish is the break-even line: blocks peaking at 0.5–1% ran +2.9%; at 1–3%, −28%. */
export const T1  = 0.01;
export const T01 = 0.001;

/** Below this the interval is too wide to mean anything, whatever the point estimate says. */
export const MAX_CI_WIDTH = 0.60;
/** Floor for showing a slice at all. */
export const MIN_N = 300;

export interface Slice {
  key:      string;
  label:    string;
  dim:      string;
  n:        number;
  contests: number;

  /** Top-1% rate as a multiple of the 1% random baseline — context, not the decision. */
  rate:     number;
  lo:       number;
  hi:       number;

  /**
   * The decision metric: this slice's top-1% rate relative to YOUR OWN overall
   * rate. Beating a coin flip is not the bar — rake takes ~15%, so an absolute
   * rate above 1.0x can still lose money. What matters for contest selection is
   * whether a slice is better or worse than your own average.
   */
  rel:      number;
  relLo:    number;
  relHi:    number;

  /** Secondary: ROI + rake. Zero means you're exactly average against the humans. */
  edge:     number;
  rake:     number;

  /** Reported, never decided on. */
  roi:      number;
  roiExTop: number;   // ROI with the single biggest win removed
  net:      number;
  fees:     number;

  tailRate: number;   // top-0.1% as a multiple of its baseline
  verdict:  Verdict;
  diverge:  Divergence;
  /** Entries whose field was large enough for a top-1% finish to exist. */
  rateable: number;
  /** Extra entries needed before the interval would be readable. */
  needMore: number;
}

/**
 * Can this entry's field even produce a finish at the threshold?
 * First place is percentile 1/entries, so a top-1% finish needs a field of
 * 100 or more, and a top-0.1% finish a field of 1,000.
 */
export const canReach = (e: Entry, threshold: number) =>
  e.entries > 0 && 1 / e.entries <= threshold;

// ── Cluster-robust rate estimate ──────────────────────────

/**
 * Ratio estimator with contest-level clustering.
 *
 * Treating 20 entries in one contest as 20 independent samples
 * understates the variance badly — they share a slate, so they
 * hit or miss together. Clustering on contest fixes that.
 */
function clusteredRate(es: Entry[], threshold: number): { rate: number; lo: number; hi: number; clusters: number; eligible: number } {
  const by = new Map<string, { hits: number; n: number }>();
  for (const e of es) {
    // In a field of 80, first place is the 1.25th percentile — the top 1% is
    // not a place anyone can finish in. Counting those entries as misses
    // scores a whole bucket at 0.00x and cuts it, however much it earns.
    if (!canReach(e, threshold)) continue;
    const k = e.contestId || `${e.sport}|${e.date?.toDateString() ?? ''}`;
    const c = by.get(k) ?? { hits: 0, n: 0 };
    c.n++;
    if (e.pct <= threshold) c.hits++;
    by.set(k, c);
  }
  const cl = [...by.values()];
  const K  = cl.length;
  const N  = es.length;
  const H  = cl.reduce((s, c) => s + c.hits, 0);
  const rate = N > 0 ? H / N : 0;
  if (K < 2 || N === 0) return { rate, lo: 0, hi: 1, clusters: K, eligible: N };

  // Var(ratio) with cluster-robust residuals.
  const ss = cl.reduce((s, c) => { const r = c.hits - rate * c.n; return s + r * r; }, 0);
  const se = Math.sqrt((K / (K - 1)) * ss) / N;
  return { rate, lo: Math.max(0, rate - 1.96 * se), hi: rate + 1.96 * se, clusters: K, eligible: N };
}

// ── Formatting ────────────────────────────────────────────

export const fmtX    = (v: number) => `${v.toFixed(2)}x`;
export const fmtPct  = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
export const fmtSign = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
export function fmtNet(n: number): string {
  const a = Math.abs(n), s = n >= 0 ? '+$' : '-$';
  return a >= 1000 ? `${s}${(a / 1000).toFixed(1)}k` : `${s}${a.toFixed(0)}`;
}
export function fmtFee(fee: number): string {
  const c = Math.round(fee * 100);
  if (c === 0)       return 'Free';
  if (c < 100)       return `${c}¢`;
  if (c % 100 === 0) return `$${c / 100}`;
  return `$${fee.toFixed(2)}`;
}

// ── Slice builder ─────────────────────────────────────────

export function analyse(es: Entry[], key: string, label: string, dim: string, baseline = 1): Slice {
  const n     = es.length;
  const fees  = es.reduce((s, e) => s + e.fee, 0);
  const won   = es.reduce((s, e) => s + e.winnings, 0);
  const net   = won - fees;
  const roi   = fees > 0 ? (net / fees) * 100 : 0;

  // fragility: same number with the single biggest win taken out
  let best = -1, bi = -1;
  es.forEach((e, i) => { if (e.winnings > best) { best = e.winnings; bi = i; } });
  const rest    = bi >= 0 ? es.filter((_, i) => i !== bi) : es;
  const rFees   = rest.reduce((s, e) => s + e.fee, 0);
  const rNet    = rest.reduce((s, e) => s + e.winnings, 0) - rFees;
  const roiExTop = rFees > 0 ? (rNet / rFees) * 100 : 0;

  // rake, averaged over contests we can compute it for
  const seen = new Set<string>();
  let rakeSum = 0, rakeN = 0;
  for (const e of es) {
    if (!e.contestId || seen.has(e.contestId)) continue;
    seen.add(e.contestId);
    if (e.fee > 0 && e.entries > 0 && e.pool > 0) {
      rakeSum += 1 - e.pool / (e.entries * e.fee);
      rakeN++;
    }
  }
  const rake = rakeN > 0 ? (rakeSum / rakeN) * 100 : 0;

  const a  = clusteredRate(es, T1);
  const b  = clusteredRate(es, T01);
  const x  = a.rate / T1;
  const lo = a.lo / T1, hi = a.hi / T1;
  const width = hi - lo;

  const base  = baseline > 0 ? baseline : 1;
  const rel   = x / base, relLo = lo / base, relHi = hi / base;
  const losing = roi < 0 && roiExTop < 0;   // not one bad break

  let verdict: Verdict;
  // a.eligible, not n: entries in fields too small to contain a top-1% finish
  // carry no information about the rate, so they cannot license a verdict.
  if (a.eligible < MIN_N || width > MAX_CI_WIDTH) verdict = 'unknown';
  else if (relLo > 1.0 && net > 0)         verdict = 'play';
  else if (relHi < 1.0 || (losing && rel < 1)) verdict = 'cut';
  else                                     verdict = 'watch';

  // ROI and the rate pointing opposite ways is the case where reading the
  // bankroll gets you the wrong answer, so name it rather than leaving the
  // slice in 'watch' with no explanation.
  let diverge: Divergence = null;
  if (verdict !== 'unknown') {
    if (roi > 0 && rel < 1 - DIVERGE_MARGIN)      diverge = 'mirage';
    else if (roi < 0 && rel > 1 + DIVERGE_MARGIN) diverge = 'unlucky';
  }

  // entries needed to shrink the interval to MAX_CI_WIDTH (scales as 1/sqrt(n))
  const needMore = width > MAX_CI_WIDTH
    ? Math.max(0, Math.ceil(a.eligible * Math.pow(width / MAX_CI_WIDTH, 2)) - a.eligible)
    : 0;

  return {
    key, label, dim, n, contests: a.clusters,
    rate: x, lo, hi,
    rel, relLo, relHi,
    edge: roi + rake, rake,
    roi, roiExTop, net, fees,
    tailRate: b.rate / T01,
    verdict, diverge, rateable: a.eligible, needMore,
  };
}

// ── Dimensions ────────────────────────────────────────────

function group(
  es: Entry[], dim: string,
  keyOf: (e: Entry) => string | null,
  labelOf: (g: Entry[]) => string,
  baseline = 1,
): Slice[] {
  const m = new Map<string, Entry[]>();
  for (const e of es) {
    const k = keyOf(e);
    if (k === null) continue;
    const g = m.get(k);
    if (g) g.push(e); else m.set(k, [e]);
  }
  return [...m.entries()]
    .filter(([, g]) => g.length >= MIN_N)
    .map(([k, g]) => analyse(g, k, labelOf(g), dim, baseline))
    .sort((a, b) => b.n - a.n);
}

const FIELDS: [number, number, string][] = [
  [0, 1500, 'under 1.5K'], [1500, 2500, '1.5K–2.5K'], [2500, 6000, '2.5K–6K'],
  [6000, 15000, '6K–15K'], [15000, Infinity, '15K+'],
];
export const fieldLabel = (n: number) => (FIELDS.find(f => n >= f[0] && n < f[1]) ?? FIELDS[4])[2];

/** Slate size proxy — DK tags the short slates in the contest name. */
export function slateLabel(entryName: string): string {
  if (/\b[A-Z]{2,3}\s*@\s*[A-Z]{2,3}\b/.test(entryName)) return 'single game';
  const tags = entryName.match(/\(([^)0-9/][^)]*)\)/g) ?? [];
  const known = ['All Day', 'After Hours', 'Late Night', 'Afternoon', 'Primetime',
                 'Express', 'Turbo', 'Early', 'Night', 'Late'];
  for (const t of tags) for (const k of known) {
    if (t.toLowerCase().includes(k.toLowerCase())) return k;
  }
  return 'main slate';
}

/** Your own overall top-1% rate — the yardstick every slice is measured against. */
export function baselineRate(es: Entry[]): number {
  return analyse(es, 'all', 'all', 'all').rate;
}

export interface Season { year: number; rate: number; net: number; n: number }
export interface Track  { sport: string; seasons: Season[]; drop: number }

/**
 * Rate by sport by season.
 *
 * Every other view here is relative to the current window, so a player whose
 * whole game is sliding looks level — each slice is measured against a
 * baseline that slid with it. This is the one view that holds the yardstick
 * still, which is the only way a year-over-year decline shows up at all.
 *
 * `drop` is the newest season against the best earlier one; negative means
 * this year is worse.
 */
export function trajectory(es: Entry[], minPerSeason = MIN_N): Track[] {
  const bySport = new Map<string, Map<number, Entry[]>>();
  for (const e of es) {
    if (!e.date || !canReach(e, T1)) continue;
    const years = bySport.get(e.sport) ?? new Map<number, Entry[]>();
    const y = e.date.getFullYear();
    years.set(y, [...(years.get(y) ?? []), e]);
    bySport.set(e.sport, years);
  }

  const out: Track[] = [];
  for (const [sport, years] of bySport) {
    const seasons: Season[] = [];
    for (const [year, list] of [...years].sort((a, b) => a[0] - b[0])) {
      if (list.length < minPerSeason) continue;
      const fees = list.reduce((t, e) => t + e.fee, 0);
      const won  = list.reduce((t, e) => t + e.winnings, 0);
      seasons.push({
        year,
        rate: clusteredRate(list, T1).rate / T1,
        net: won - fees,
        n: list.length,
      });
    }
    if (seasons.length < 2) continue;
    const last = seasons[seasons.length - 1];
    const best = Math.max(...seasons.slice(0, -1).map(x => x.rate));
    out.push({ sport, seasons, drop: last.rate - best });
  }
  return out.sort((a, b) => a.drop - b.drop);
}

export function dimensions(es: Entry[]) {
  const b = baselineRate(es);
  return {
    sport:  group(es, 'sport',  e => e.sport, g => g[0].sport, b),
    format: group(es, 'format', e => e.gameType ? `${e.sport}|${e.gameType}` : null,
                                g => `${g[0].sport} ${g[0].gameType}`, b),
    fee:    group(es, 'fee',    e => String(e.fee), g => `${fmtFee(g[0].fee)} entries`, b),
    field:  group(es, 'field',  e => fieldLabel(e.entries), g => `${fieldLabel(g[0].entries)} field`, b),
    slate:  group(es, 'slate',  e => slateLabel(e.entryName), g => slateLabel(g[0].entryName), b),
  };
}

export function allSlices(es: Entry[]): Slice[] {
  const d = dimensions(es);
  return [...d.sport, ...d.format, ...d.fee, ...d.field, ...d.slate];
}

// ── Decision lists ────────────────────────────────────────

/**
 * Cuts, de-duplicated on actual entry overlap. Listing "$0.50 NFL Classic"
 * under "$0.50 entries" is the same money counted twice.
 */
export function cutList(es: Entry[], limit = 6): Slice[] {
  const cands = allSlices(es)
    .filter(s => s.verdict === 'cut')
    .sort((a, b) => a.net - b.net);

  const members = new Map<string, Set<Entry>>();
  for (const s of cands) members.set(s.key + s.dim, new Set(sliceMembers(es, s)));

  const claimed = new Set<Entry>();
  const kept: Slice[] = [];
  for (const s of cands) {
    const mem = members.get(s.key + s.dim)!;
    let overlap = 0;
    for (const e of mem) if (claimed.has(e)) overlap++;
    if (mem.size > 0 && overlap / mem.size > 0.5) continue;
    for (const e of mem) claimed.add(e);
    kept.push(s);
    if (kept.length >= limit) break;
  }
  return kept;
}

export function playList(es: Entry[], limit = 6): Slice[] {
  return allSlices(es)
    .filter(s => s.verdict === 'play')
    .sort((a, b) => b.rel - a.rel)
    .slice(0, limit);
}

/**
 * Slices where the money says one thing and the rate says another, worst
 * disagreement first. Mirages rank ahead of cold runs: being wrong about
 * something you are actively funding costs more than being wrong about
 * something you already suspect.
 */
export function divergeList(es: Entry[], limit = 5): Slice[] {
  return allSlices(es)
    .filter(s => s.diverge !== null)
    .sort((a, b) => {
      if (a.diverge !== b.diverge) return a.diverge === 'mirage' ? -1 : 1;
      return Math.abs(a.rel - 1) > Math.abs(b.rel - 1) ? -1 : 1;
    })
    .slice(0, limit);
}

export function unknownList(es: Entry[], limit = 5): Slice[] {
  return allSlices(es)
    .filter(s => s.verdict === 'unknown' && s.n >= MIN_N)
    .sort((a, b) => a.needMore - b.needMore)
    .slice(0, limit);
}

function sliceMembers(es: Entry[], s: Slice): Entry[] {
  switch (s.dim) {
    case 'sport':  return es.filter(e => e.sport === s.key);
    case 'format': return es.filter(e => `${e.sport}|${e.gameType}` === s.key);
    case 'fee':    return es.filter(e => String(e.fee) === s.key);
    case 'field':  return es.filter(e => fieldLabel(e.entries) === s.key);
    case 'slate':  return es.filter(e => slateLabel(e.entryName) === s.key);
    default:       return [];
  }
}

// ── Block reality ─────────────────────────────────────────
// Where the money actually turns: you need a top-1% finish
// somewhere in a block just to break even.

export interface BlockBand {
  label: string;
  blocks: number;
  profitable: number;   // share of blocks that turned a profit
  roi: number;
  net: number;
}

export function blockBands(es: Entry[]): BlockBand[] {
  const by = new Map<string, Entry[]>();
  for (const e of es) {
    if (!e.contestId) continue;
    const g = by.get(e.contestId);
    if (g) g.push(e); else by.set(e.contestId, [e]);
  }
  const blocks = [...by.values()].filter(b => b.length >= 5);
  const BANDS: [number, number, string][] = [
    [0, 0.001, 'top 0.1%'], [0.001, 0.005, '0.1–0.5%'], [0.005, 0.01, '0.5–1%'],
    [0.01, 0.03, '1–3%'], [0.03, 0.10, '3–10%'], [0.10, 1.01, 'worse than 10%'],
  ];
  return BANDS.map(([lo, hi, label]) => {
    const bl = blocks.filter(b => { const m = Math.min(...b.map(x => x.pct)); return m >= lo && m < hi; });
    const fees = bl.reduce((s, b) => s + b.reduce((t, e) => t + e.fee, 0), 0);
    const won  = bl.reduce((s, b) => s + b.reduce((t, e) => t + e.winnings, 0), 0);
    const prof = bl.filter(b => b.reduce((t, e) => t + e.winnings - e.fee, 0) > 0).length;
    return {
      label, blocks: bl.length,
      profitable: bl.length ? prof / bl.length : 0,
      roi: fees > 0 ? ((won - fees) / fees) * 100 : 0,
      net: won - fees,
    };
  }).filter(b => b.blocks > 0);
}

// ── Headline ──────────────────────────────────────────────

export interface Headline {
  n: number;
  contests: number;
  rate: number;
  lo: number;
  hi: number;
  readable: boolean;
  net: number;
  roi: number;
  edge: number;
  needMore: number;
}

export function headline(es: Entry[]): Headline {
  const s = analyse(es, 'all', 'All entries', 'all');
  return {
    n: s.n, contests: s.contests, rate: s.rate, lo: s.lo, hi: s.hi,
    readable: (s.hi - s.lo) <= MAX_CI_WIDTH,
    net: s.net, roi: s.roi, edge: s.edge, needMore: s.needMore,
  };
}
