export interface Entry {
  sport:     string;
  gameType:  string;
  entryName: string;
  contestId: string;
  date:      Date | null;
  place:     number;
  entries:   number;   // field size
  pct:       number;   // place / field — lower is better
  fee:       number;
  winnings:  number;
  pool:      number;   // advertised prize pool
  maxSize:   number | null;
}

export type DateFilter = 'all' | '30' | '60' | '90' | 'custom';
