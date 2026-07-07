import type { CSSProperties } from 'react';
import { T } from '../constants';
import type { MaxSize, FeeOption, DateFilter } from '../types';

interface Props {
  sports: string[];
  sportFilter: string[];
  onSportFilter: (s: string[]) => void;
  maxSizes: MaxSize[];
  maxFilter: number[];
  onMaxFilter: (m: number[]) => void;
  allFees: FeeOption[];
  feeFilter: number[];
  onFeeFilter: (f: number[]) => void;
  dateFilter: DateFilter;
  onDateFilter: (d: DateFilter) => void;
  customFrom: string;
  customTo: string;
  onCustomFrom: (s: string) => void;
  onCustomTo: (s: string) => void;
}

function toggle<T>(arr: T[], item: T): T[] {
  const idx = arr.indexOf(item);
  return idx >= 0 ? [...arr.slice(0, idx), ...arr.slice(idx + 1)] : [...arr, item];
}

function btn(active: boolean, accent: string = T.gold): CSSProperties {
  return {
    background:   active ? accent : T.panel,
    color:        active ? (accent === T.blue ? T.textPrimary : '#0B0E13') : T.textPrimary,
    border:       `1px solid ${active ? accent : T.border}`,
    borderRadius: 4,
    padding:      '7px 12px',
    fontSize:     13,
    fontWeight:   active ? 600 : 400,
    cursor:       'pointer',
    transition:   'background 150ms, color 150ms, border-color 150ms, opacity 120ms, transform 80ms',
  };
}

const dateInput: CSSProperties = {
  background:   T.panel,
  border:       `1px solid ${T.border}`,
  borderRadius: 4,
  padding:      '7px 10px',
  fontSize:     12,
  color:        T.textPrimary,
  cursor:       'pointer',
  outline:      'none',
  transition:   'border-color 150ms',
  colorScheme:  'dark',
};

const sectionLabel: CSSProperties = {
  fontSize: 11, color: T.textMuted, marginBottom: 8,
  letterSpacing: '0.05em', textTransform: 'uppercase',
};

const chipRow: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' };

const DATE_OPTIONS: [DateFilter, string][] = [
  ['all', 'All time'], ['30', '30d'], ['60', '60d'], ['90', '90d'], ['custom', 'Custom'],
];

export function FilterBar({
  sports, sportFilter, onSportFilter,
  maxSizes, maxFilter, onMaxFilter,
  allFees, feeFilter, onFeeFilter,
  dateFilter, onDateFilter,
  customFrom, customTo, onCustomFrom, onCustomTo,
}: Props) {
  return (
    <div style={{ marginBottom: 28 }}>

      {/* Sport */}
      {sports.length > 1 && (
        <div style={{ marginBottom: 14 }}>
          <div style={sectionLabel}>Sport</div>
          <div style={chipRow}>
            <button onClick={() => onSportFilter([])} style={btn(sportFilter.length === 0)}>
              All
            </button>
            {sports.map(sport => (
              <button key={sport} onClick={() => onSportFilter(toggle(sportFilter, sport))} style={btn(sportFilter.includes(sport))}>
                {sport}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Contest max size */}
      <div style={{ marginBottom: 14 }}>
        <div style={sectionLabel}>Contest max size</div>
        <div style={chipRow}>
          <button onClick={() => onMaxFilter([])} style={btn(maxFilter.length === 0)}>
            All
          </button>
          {maxSizes.map(({ size, count }) => (
            <button key={size} onClick={() => onMaxFilter(toggle(maxFilter, size))} style={btn(maxFilter.includes(size))}>
              {size}-max{' '}
              <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>({count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Entry fee */}
      <div style={{ marginBottom: 14 }}>
        <div style={sectionLabel}>Entry fee</div>
        <div style={chipRow}>
          <button onClick={() => onFeeFilter([])} style={btn(feeFilter.length === 0)}>
            All
          </button>
          {allFees.map(({ fee, count }) => (
            <button key={fee} onClick={() => onFeeFilter(toggle(feeFilter, fee))} style={btn(feeFilter.some(f => Math.abs(f - fee) < 0.001))} className="mono">
              ${fee.toFixed(2)}{' '}
              <span style={{ fontSize: 11, opacity: 0.7 }}>({count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Date window */}
      <div>
        <div style={sectionLabel}>Window</div>
        <div style={chipRow}>
          {DATE_OPTIONS.map(([key, label]) => (
            <button key={key} onClick={() => onDateFilter(key)} style={btn(dateFilter === key, T.blue)}>
              {label}
            </button>
          ))}
          {dateFilter === 'custom' && (
            <>
              <input
                type="date" value={customFrom} onChange={e => onCustomFrom(e.target.value)}
                style={dateInput}
              />
              <span style={{ color: T.textMuted, fontSize: 12 }}>→</span>
              <input
                type="date" value={customTo} onChange={e => onCustomTo(e.target.value)}
                style={dateInput}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
