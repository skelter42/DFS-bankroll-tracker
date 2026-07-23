import type { Entry } from '../types';

export type Signal = 'keep' | 'watch' | 'remove' | 'low-n';

export const MIN_N       = 30;
export const CASH_KEEP   = 0.17;
export const CASH_WATCH  = 0.10;

export interface SportRow {
  sport:    string;
  n:        number;
  cashes:   number;
  cashRate: number;
  avgPct:   number;
  net:      number;
  roi:      number;
  signal:   Signal;
}

export interface ContestGroup {
  key:      string;
  fee:      number;
  maxSize:  number | null;
  label:    string;
  n:        number;
  cashes:   number;
  cashRate: number;
  avgPct:   number;
  net:      number;
  roi:      number;
  sports:   SportRow[];
  signal:   Signal;
}

function calcStats(es: Entry[]) {
  const n        = es.length;
  const cashes   = es.filter(e => e.winnings > 0).length;
  const cashRate = n > 0 ? cashes / n : 0;
  const avgPct   = n > 0 ? es.reduce((s, e) => s + e.pct, 0) / n : 0.5;
  const fees     = es.reduce((s, e) => s + e.fee, 0);
  const winnings = es.reduce((s, e) => s + e.winnings, 0);
  const net      = winnings - fees;
  const roi      = fees > 0 ? (net / fees) * 100 : 0;
  return { n, cashes, cashRate, avgPct, net, roi };
}

function toSignal(n: number, cashRate: number): Signal {
  if (n < MIN_N)              return 'low-n';
  if (cashRate >= CASH_KEEP)  return 'keep';
  if (cashRate >= CASH_WATCH) return 'watch';
  return 'remove';
}

function fmtLabel(fee: number, maxSize: number | null): string {
  const cents = Math.round(fee * 100);
  let feeStr: string;
  if (cents === 0)            feeStr = 'Free';
  else if (cents < 100)       feeStr = `${cents}¢`;
  else if (cents % 100 === 0) feeStr = `$${cents / 100}`;
  else                        feeStr = `$${fee.toFixed(2)}`;

  if (maxSize === null)   return `${feeStr} ·  ?-max`;
  if (maxSize === 1)      return `${feeStr} · single`;
  return `${feeStr} · ${maxSize}-max`;
}

export function buildContestGroups(entries: Entry[]): ContestGroup[] {
  const map = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = `${e.fee}|${e.maxSize ?? 'null'}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }

  const groups: ContestGroup[] = [];

  for (const [key, es] of map) {
    const fee     = es[0].fee;
    const maxSize = es[0].maxSize;
    const s       = calcStats(es);

    // sport breakdown
    const sportMap = new Map<string, Entry[]>();
    for (const e of es) {
      if (!sportMap.has(e.sport)) sportMap.set(e.sport, []);
      sportMap.get(e.sport)!.push(e);
    }
    const sports: SportRow[] = [];
    for (const [sport, ses] of sportMap) {
      const ss = calcStats(ses);
      sports.push({ sport, signal: toSignal(ss.n, ss.cashRate), ...ss });
    }
    sports.sort((a, b) => b.n - a.n);

    groups.push({
      key,
      fee,
      maxSize,
      label: fmtLabel(fee, maxSize),
      ...s,
      sports,
      signal: toSignal(s.n, s.cashRate),
    });
  }

  const ORDER: Signal[] = ['remove', 'watch', 'keep', 'low-n'];
  groups.sort((a, b) => {
    const d = ORDER.indexOf(a.signal) - ORDER.indexOf(b.signal);
    return d !== 0 ? d : b.n - a.n;
  });

  return groups;
}
