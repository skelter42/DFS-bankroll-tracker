export interface Entry {
  sport: string;
  gameType: string;
  entryName: string;
  date: Date | null;
  place: number;
  entries: number;
  pct: number;
  fee: number;
  winnings: number;
  maxSize: number | null;
}

export interface Band {
  label: string;
  baseline: number;
  actual: number;
  hits: number;
}

export interface SportStat {
  sport: string;
  n: number;
  bands: Band[];
  roi: number;
  fees: number;
  winnings: number;
}

export interface OverallStat {
  n: number;
  bands: Band[];
  roi: number;
  fees: number;
  winnings: number;
}

export interface MaxSize {
  size: number;
  count: number;
}

export interface FeeOption {
  fee: number;
  count: number;
}

export type DateFilter = 'all' | '30' | '60' | '90' | 'custom';
