import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
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

function toggleFee(arr: number[], fee: number): number[] {
  const idx = arr.findIndex(f => Math.abs(f - fee) < 0.001);
  return idx >= 0 ? [...arr.slice(0, idx), ...arr.slice(idx + 1)] : [...arr, fee];
}

function hexAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  return `rgba(${r},${g},${b},${a})`;
}

const DATE_OPTS: [DateFilter, string][] = [
  ['all', 'All time'], ['30', 'Last 30d'], ['60', 'Last 60d'], ['90', 'Last 90d'], ['custom', 'Custom range'],
];

const DATE_LABEL: Record<DateFilter, string> = Object.fromEntries(DATE_OPTS) as Record<DateFilter, string>;

const dateInputStyle: CSSProperties = {
  background:   T.panel,
  border:       `1px solid ${T.border}`,
  borderRadius: 5,
  padding:      '10px 10px',
  fontSize:     13,
  color:        T.textPrimary,
  outline:      'none',
  colorScheme:  'dark',
  transition:   'border-color 150ms',
  flex:         '1',
  minWidth:     120,
};

const divider = <div style={{ height: 1, background: '#2A3040', margin: '4px 0' }} />;

// ── Pill ──────────────────────────────────────────────

function Pill({
  label, active, isOpen, onToggle, accent = T.gold, align = 'left', children,
}: {
  label: string;
  active: boolean;
  isOpen: boolean;
  onToggle: () => void;
  accent?: string;
  align?: 'left' | 'right';
  children: ReactNode;
}) {
  const lit = active || isOpen;
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onToggle}
        style={{
          display:      'inline-flex',
          alignItems:   'center',
          gap:          6,
          background:   lit ? hexAlpha(accent, 0.09) : T.panel,
          border:       `1px solid ${lit ? accent : T.border}`,
          borderRadius: 6,
          color:        lit ? T.textPrimary : T.textMuted,
          padding:      '10px 14px',
          fontSize:     13,
          cursor:       'pointer',
          transition:   'background 150ms, border-color 150ms, color 150ms, opacity 120ms',
          whiteSpace:   'nowrap',
          userSelect:   'none',
          minHeight:    44,
        }}
      >
        {label}
        <svg
          width="8" height="5" viewBox="0 0 8 5" fill="none"
          style={{ transition: 'transform 150ms', transform: isOpen ? 'rotate(180deg)' : 'none', opacity: 0.55, flexShrink: 0 }}
        >
          <path d="M1 1L4 4L7 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <div className="fd-panel" style={{
          position:     'absolute',
          top:          'calc(100% + 6px)',
          ...(align === 'right' ? { right: 0 } : { left: 0 }),
          background:   '#161B26',
          border:       '1px solid #2A3040',
          borderRadius: 8,
          boxShadow:    '0 16px 48px rgba(0,0,0,0.65), inset 0 0 0 1px rgba(255,255,255,0.03)',
          minWidth:     190,
          maxWidth:     'min(260px, calc(100vw - 32px))',
          maxHeight:    280,
          overflowY:    'auto',
          zIndex:       10,
          padding:      '5px 0',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Dropdown item ─────────────────────────────────────

function DropItem({
  label, checked, onClick, count, mono = false, radio = false,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
  count?: number;
  mono?: boolean;
  radio?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        width:          '100%',
        padding:        '11px 14px',
        minHeight:      44,
        background:     hov ? 'rgba(255,255,255,0.04)' : 'transparent',
        border:         'none',
        color:          checked ? T.gold : T.textPrimary,
        fontSize:       13,
        cursor:         'pointer',
        gap:            10,
        textAlign:      'left',
        transition:     'background 80ms, color 100ms',
        fontFamily:     mono ? "'IBM Plex Mono', monospace" : 'inherit',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        <span style={{
          width: 14, flexShrink: 0, fontSize: 11, color: T.gold,
          opacity: checked ? 1 : 0, transition: 'opacity 100ms',
        }}>
          {radio ? '●' : '✓'}
        </span>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
        </span>
      </span>
      {count !== undefined && (
        <span style={{
          fontSize: 11, color: T.textMuted,
          fontFamily: "'IBM Plex Mono', monospace",
          fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── FilterBar ─────────────────────────────────────────

export function FilterBar({
  sports, sportFilter, onSportFilter,
  maxSizes, maxFilter, onMaxFilter,
  allFees, feeFilter, onFeeFilter,
  dateFilter, onDateFilter,
  customFrom, customTo, onCustomFrom, onCustomTo,
}: Props) {
  const [open, setOpen] = useState<string | null>(null);

  const toggleOpen = (key: string) => setOpen(p => p === key ? null : key);
  const close = () => setOpen(null);

  const hasFilters = sportFilter.length > 0 || maxFilter.length > 0 || feeFilter.length > 0 || dateFilter !== 'all';

  const sportLabel = sportFilter.length === 0 ? 'Sport'
    : sportFilter.length === 1 ? sportFilter[0]
    : `Sport · ${sportFilter.length}`;

  const sizeLabel = maxFilter.length === 0 ? 'Contest Size'
    : maxFilter.length === 1 ? `${maxFilter[0]}-max`
    : `Size · ${maxFilter.length}`;

  const feeLabel = feeFilter.length === 0 ? 'Entry Fee'
    : feeFilter.length === 1 ? `$${feeFilter[0].toFixed(2)}`
    : `Fee · ${feeFilter.length}`;

  return (
    <div style={{ marginBottom: 28 }}>
      <style>{`
        .fd-panel { animation: fd-drop 130ms ease; }
        @keyframes fd-drop {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {open && (
        <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>

        {sports.length > 1 && (
          <Pill label={sportLabel} active={sportFilter.length > 0} isOpen={open === 'sport'} onToggle={() => toggleOpen('sport')}>
            <DropItem label="All sports" checked={sportFilter.length === 0} onClick={() => onSportFilter([])} />
            {divider}
            {sports.map(s => (
              <DropItem key={s} label={s} checked={sportFilter.includes(s)}
                onClick={() => onSportFilter(toggle(sportFilter, s))} />
            ))}
          </Pill>
        )}

        <Pill label={sizeLabel} active={maxFilter.length > 0} isOpen={open === 'size'} onToggle={() => toggleOpen('size')}>
          <DropItem label="All sizes" checked={maxFilter.length === 0} onClick={() => onMaxFilter([])} />
          {divider}
          {maxSizes.map(({ size, count }) => (
            <DropItem key={size} label={`${size}-max`} count={count}
              checked={maxFilter.includes(size)}
              onClick={() => onMaxFilter(toggle(maxFilter, size))} />
          ))}
        </Pill>

        <Pill label={feeLabel} active={feeFilter.length > 0} isOpen={open === 'fee'} onToggle={() => toggleOpen('fee')}>
          <DropItem label="All fees" checked={feeFilter.length === 0} onClick={() => onFeeFilter([])} />
          {divider}
          {allFees.map(({ fee, count }) => (
            <DropItem key={fee} label={`$${fee.toFixed(2)}`} count={count} mono
              checked={feeFilter.some(f => Math.abs(f - fee) < 0.001)}
              onClick={() => onFeeFilter(toggleFee(feeFilter, fee))} />
          ))}
        </Pill>

        <Pill
          label={DATE_LABEL[dateFilter]} active={dateFilter !== 'all'}
          isOpen={open === 'date'} onToggle={() => toggleOpen('date')}
          accent={T.blue} align="right"
        >
          {DATE_OPTS.map(([key, label]) => (
            <DropItem key={key} label={label} checked={dateFilter === key} radio
              onClick={() => { onDateFilter(key); if (key !== 'custom') close(); }} />
          ))}
        </Pill>

        {hasFilters && (
          <button
            onClick={() => { onSportFilter([]); onMaxFilter([]); onFeeFilter([]); onDateFilter('all'); }}
            style={{
              background: 'none', border: 'none', color: T.textMuted,
              fontSize: 13, cursor: 'pointer', padding: '10px 8px',
              minHeight: 44, transition: 'color 150ms',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = T.textPrimary)}
            onMouseLeave={e => (e.currentTarget.style.color = T.textMuted)}
          >
            Reset
          </button>
        )}
      </div>

      {dateFilter === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingLeft: 2, flexWrap: 'wrap' }}>
          <input type="date" value={customFrom} onChange={e => onCustomFrom(e.target.value)} style={dateInputStyle} />
          <span style={{ color: T.textMuted, fontSize: 12, flexShrink: 0 }}>→</span>
          <input type="date" value={customTo} onChange={e => onCustomTo(e.target.value)} style={dateInputStyle} />
        </div>
      )}
    </div>
  );
}
