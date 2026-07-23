import { useState, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { T } from '../constants';
import { haptic } from '../lib/haptic';
import type { DateFilter } from '../types';
import type { ViewMode, SortKey } from '../lib/process';

interface Props {
  // sport
  sports: string[];
  sportFilter: string[];
  onSportFilter: (s: string[]) => void;
  // contest type (replaces maxSizes/maxFilter/allFees/feeFilter)
  allTypes: { key: string; label: string; count: number }[];
  typeKeys: string[];
  onTypeKeys: (k: string[]) => void;
  // date
  dateFilter: DateFilter;
  onDateFilter: (d: DateFilter) => void;
  customFrom: string;
  customTo: string;
  onCustomFrom: (s: string) => void;
  onCustomTo: (s: string) => void;
  // view mode
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  // sort
  sortBy: SortKey;
  onSortBy: (s: SortKey) => void;
}

function hexAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  return `rgba(${r},${g},${b},${a})`;
}

const DATE_OPTS: [DateFilter, string][] = [
  ['30', 'Last 30d'],
  ['60', 'Last 60d'],
  ['90', 'Last 90d'],
  ['all', 'All time'],
  ['custom', 'Custom range'],
];

const DATE_LABEL: Record<DateFilter, string> = {
  '30': 'Last 30d', '60': 'Last 60d', '90': 'Last 90d', all: 'All time', custom: 'Custom',
};

const SORT_OPTS: [SortKey, string][] = [
  ['rate-desc', 'Rate ↓'],
  ['rate-asc',  'Rate ↑'],
  ['entries',   'Most entries'],
];

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
  const btnRef = useRef<HTMLButtonElement>(null);
  const [panelSide, setPanelSide] = useState<'left' | 'right'>(align);
  const lit = active || isOpen;

  const handleToggle = () => {
    if (!isOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const dropW = 260;
      const spaceRight = window.innerWidth - rect.left - 16;
      const spaceLeft  = rect.right - 16;
      if (align === 'right') {
        setPanelSide(spaceLeft >= dropW ? 'right' : 'left');
      } else {
        setPanelSide(spaceRight >= dropW ? 'left' : 'right');
      }
    }
    onToggle();
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        onClick={handleToggle}
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
          fontFamily:   'inherit',
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
          ...(panelSide === 'right' ? { right: 0 } : { left: 0 }),
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
  allTypes, typeKeys, onTypeKeys,
  dateFilter, onDateFilter,
  customFrom, customTo, onCustomFrom, onCustomTo,
  viewMode, onViewMode,
  sortBy, onSortBy,
}: Props) {
  const [open, setOpen] = useState<string | null>(null);

  const toggleOpen = (key: string) => setOpen(p => p === key ? null : key);
  const close = () => setOpen(null);

  const hasFilters =
    sportFilter.length > 0 ||
    typeKeys.length > 0 ||
    dateFilter !== '30' ||
    sortBy !== 'rate-desc' ||
    viewMode !== 'type';

  const sportLabel = sportFilter.length === 0 ? 'Sport'
    : sportFilter.length === 1 ? sportFilter[0]
    : `Sport · ${sportFilter.length}`;

  const typePillLabel = typeKeys.length === 0 ? 'Contest Type'
    : typeKeys.length === 1 ? '1 type'
    : `${typeKeys.length} types`;

  const sortLabel = SORT_OPTS.find(s => s[0] === sortBy)?.[1] ?? 'Sort';

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

        {/* 1. Date pill */}
        <Pill
          label={DATE_LABEL[dateFilter]} active={dateFilter !== '30'}
          isOpen={open === 'date'} onToggle={() => { haptic(5); toggleOpen('date'); }}
          accent={T.blue}
        >
          {DATE_OPTS.map(([key, label]) => (
            <DropItem key={key} label={label} checked={dateFilter === key} radio
              onClick={() => { onDateFilter(key); if (key !== 'custom') close(); }} />
          ))}
        </Pill>

        {/* 2. Sport pill */}
        {sports.length > 1 && (
          <Pill label={sportLabel} active={sportFilter.length > 0} isOpen={open === 'sport'} onToggle={() => { haptic(5); toggleOpen('sport'); }}>
            <DropItem label="All sports" checked={sportFilter.length === 0} onClick={() => { onSportFilter([]); close(); }} />
            {divider}
            {sports.map(s => (
              <DropItem key={s} label={s} checked={sportFilter.includes(s)}
                onClick={() => onSportFilter(sportFilter.includes(s) ? sportFilter.filter(x => x !== s) : [...sportFilter, s])} />
            ))}
          </Pill>
        )}

        {/* 3. Contest Type pill */}
        <Pill label={typePillLabel} active={typeKeys.length > 0} isOpen={open === 'type'} onToggle={() => { haptic(5); toggleOpen('type'); }}>
          <DropItem label="All contest types" checked={typeKeys.length === 0} onClick={() => { onTypeKeys([]); close(); }} />
          {divider}
          {allTypes.map(t => (
            <DropItem key={t.key} label={t.label} count={t.count} checked={typeKeys.includes(t.key)}
              onClick={() => onTypeKeys(typeKeys.includes(t.key) ? typeKeys.filter(x => x !== t.key) : [...typeKeys, t.key])} />
          ))}
        </Pill>

        {/* 4. View mode inline toggle */}
        <div style={{
          display: 'flex', gap: 2, background: '#0C0F16',
          border: `1px solid ${T.border}`, borderRadius: 7, padding: 3,
        }}>
          {(['type', 'sport'] as ViewMode[]).map(m => (
            <button key={m} onClick={() => { haptic(6); onViewMode(m); }} style={{
              background:   viewMode === m ? '#1E2636' : 'none',
              border:       viewMode === m ? `1px solid ${T.border}` : '1px solid transparent',
              borderRadius: 5, color: viewMode === m ? T.textPrimary : T.textMuted,
              padding: '6px 10px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
              fontWeight: viewMode === m ? 600 : 400, minHeight: 36, whiteSpace: 'nowrap',
              transition: 'background 130ms, color 130ms',
            }}>
              {m === 'type' ? 'By Type' : '× Sport'}
            </button>
          ))}
        </div>

        {/* 5. Sort pill */}
        <Pill
          label={sortLabel} active={sortBy !== 'rate-desc'}
          isOpen={open === 'sort'} onToggle={() => { haptic(5); toggleOpen('sort'); }}
          accent={T.blue} align="right"
        >
          {SORT_OPTS.map(([k, l]) => (
            <DropItem key={k} label={l} checked={sortBy === k} radio
              onClick={() => { onSortBy(k); close(); haptic(6); }} />
          ))}
        </Pill>

        {/* 6. Reset button */}
        {hasFilters && (
          <button
            onClick={() => {
              haptic(8);
              onSportFilter([]);
              onTypeKeys([]);
              onDateFilter('30');
              onViewMode('type');
              onSortBy('rate-desc');
            }}
            style={{
              background: 'none', border: 'none', color: T.textMuted,
              fontSize: 13, cursor: 'pointer', padding: '10px 8px',
              minHeight: 44, transition: 'color 150ms', fontFamily: 'inherit',
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
