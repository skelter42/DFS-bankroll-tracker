import type { CSSProperties } from 'react';
import { T } from '../constants';
import type { MaxSize, FeeOption, DateFilter } from '../types';

interface Props {
  maxSizes: MaxSize[];
  maxFilter: number | null;
  onMaxFilter: (size: number) => void;
  feesForMax: FeeOption[];
  feeFilter: number | null;
  onFeeFilter: (fee: number | null) => void;
  dateFilter: DateFilter;
  onDateFilter: (d: DateFilter) => void;
}

function btn(active: boolean, accent = T.gold): CSSProperties {
  return {
    background: active ? accent : T.panel,
    color: active
      ? accent === T.blue ? T.textPrimary : '#0B0E13'
      : T.textPrimary,
    border: `1px solid ${active ? accent : T.border}`,
    borderRadius: 4,
    padding: '7px 12px',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
  };
}

const sectionLabel: CSSProperties = {
  fontSize: 11,
  color: T.textMuted,
  marginBottom: 8,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
};

const chipRow: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' };

const DATE_OPTIONS: [DateFilter, string][] = [
  ['all', 'All time'],
  ['30',  'Trailing 30d'],
  ['60',  'Trailing 60d'],
  ['90',  'Trailing 90d'],
];

export function FilterBar({
  maxSizes, maxFilter, onMaxFilter,
  feesForMax, feeFilter, onFeeFilter,
  dateFilter, onDateFilter,
}: Props) {
  return (
    <div style={{ marginBottom: 28 }}>
      {/* Contest max size */}
      <div style={{ marginBottom: 14 }}>
        <div style={sectionLabel}>Contest max size</div>
        <div style={chipRow}>
          {maxSizes.map(({ size, count }) => (
            <button key={size} onClick={() => onMaxFilter(size)} style={btn(maxFilter === size)}>
              {size}-max{' '}
              <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>({count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Entry fee — only shown once a max size is selected */}
      {maxFilter !== null && (
        <div style={{ marginBottom: 14 }}>
          <div style={sectionLabel}>Entry fee</div>
          <div style={chipRow}>
            <button onClick={() => onFeeFilter(null)} style={btn(feeFilter === null)}>
              All fees
            </button>
            {feesForMax.map(({ fee, count }) => (
              <button
                key={fee}
                onClick={() => onFeeFilter(fee)}
                style={btn(feeFilter === fee)}
                className="mono"
              >
                ${fee.toFixed(2)}{' '}
                <span style={{ fontSize: 11, opacity: 0.7 }}>({count})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Date window — only shown once a max size is selected */}
      {maxFilter !== null && (
        <div>
          <div style={sectionLabel}>Window</div>
          <div style={chipRow}>
            {DATE_OPTIONS.map(([key, label]) => (
              <button key={key} onClick={() => onDateFilter(key)} style={btn(dateFilter === key, T.blue)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
