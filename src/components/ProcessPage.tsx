import { useState, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { T } from '../constants';
import { haptic } from '../lib/haptic';
import { buildContestGroups, CASH_KEEP, CASH_WATCH } from '../lib/process';
import type { ContestGroup, SportRow, Signal, ViewMode, SortKey } from '../lib/process';
import type { Entry, DateFilter } from '../types';

// ── Signal palette ────────────────────────────────────

const SIG: Record<Signal, { label: string; color: string; bg: string; border: string; stripe: string }> = {
  keep:    { label: '✓ Keep',     color: T.gold,      bg: 'rgba(201,162,39,0.07)',  border: 'rgba(201,162,39,0.22)', stripe: T.gold    },
  watch:   { label: '⚠ Watch',    color: '#D97706',   bg: 'rgba(217,119,6,0.07)',   border: 'rgba(217,119,6,0.25)',  stripe: '#D97706' },
  remove:  { label: '✕ Remove',   color: '#C0483B',   bg: 'rgba(176,72,59,0.09)',   border: 'rgba(176,72,59,0.30)',  stripe: '#C0483B' },
  'low-n': { label: '? Low data', color: T.textMuted, bg: 'rgba(136,145,160,0.05)', border: T.border,               stripe: T.border  },
};

// ── Sort options ──────────────────────────────────────

const SORT_OPTS: [SortKey, string][] = [
  ['rate-desc', 'Rate: High → Low'],
  ['rate-asc',  'Rate: Low → High'],
  ['entries',   'Most Entries'],
];

// ── Date options (default 30d) ────────────────────────

const DATE_OPTS: [DateFilter, string][] = [
  ['30', 'Last 30 days'],
  ['60', 'Last 60 days'],
  ['90', 'Last 90 days'],
  ['all', 'All time'],
  ['custom', 'Custom range'],
];
const DATE_LABEL: Record<DateFilter, string> = {
  '30': 'Last 30d', '60': 'Last 60d', '90': 'Last 90d', all: 'All time', custom: 'Custom',
};

// ── Helpers ───────────────────────────────────────────

function fmtFee(fee: number): string {
  const c = Math.round(fee * 100);
  if (c === 0) return 'Free';
  if (c < 100) return `${c}¢`;
  if (c % 100 === 0) return `$${c / 100}`;
  return `$${fee.toFixed(2)}`;
}
function fmtSize(maxSize: number | null): string {
  if (maxSize === null) return '?-max';
  if (maxSize === 1) return 'single';
  return `${maxSize}-max`;
}
function typeLabel(fee: number, maxSize: number | null): string {
  return `${fmtFee(fee)} · ${fmtSize(maxSize)}`;
}

// ── Compact filter pill ───────────────────────────────

function Pill({
  id, label, active, openId, setOpenId, children,
}: {
  id: string; label: string; active: boolean;
  openId: string | null; setOpenId: (s: string | null) => void;
  children: ReactNode;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [side, setSide] = useState<'left' | 'right'>('left');
  const isOpen = openId === id;

  const toggle = () => {
    if (!isOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setSide(rect.left + 250 > window.innerWidth - 16 ? 'right' : 'left');
    }
    setOpenId(isOpen ? null : id);
  };

  const lit = active || isOpen;
  return (
    <div style={{ position: 'relative' }}>
      <button ref={btnRef} onClick={toggle} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: lit ? 'rgba(201,162,39,0.09)' : T.panel,
        border: `1px solid ${lit ? T.gold : T.border}`,
        borderRadius: 6, color: lit ? T.textPrimary : T.textMuted,
        padding: '9px 13px', fontSize: 13, cursor: 'pointer',
        whiteSpace: 'nowrap', minHeight: 44, userSelect: 'none',
        transition: 'background 140ms, border-color 140ms, color 140ms',
        fontFamily: 'inherit',
      }}>
        {label}
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none"
          style={{ transition: 'transform 150ms', transform: isOpen ? 'rotate(180deg)' : 'none', opacity: 0.5, flexShrink: 0 }}>
          <path d="M1 1L4 4L7 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {isOpen && (
        <div className="fd-panel" style={{
          position: 'absolute', top: 'calc(100% + 6px)',
          ...(side === 'right' ? { right: 0 } : { left: 0 }),
          background: '#161B26', border: '1px solid #2A3040', borderRadius: 8,
          boxShadow: '0 16px 48px rgba(0,0,0,0.65)',
          minWidth: 190, maxWidth: 'min(260px, calc(100vw - 32px))',
          maxHeight: 280, overflowY: 'auto', zIndex: 20, padding: '5px 0',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

function DropItem({ label, checked, onClick, count, radio = false }: {
  label: string; checked: boolean; onClick: () => void;
  count?: number; radio?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '10px 14px', minHeight: 44,
        background: hov ? 'rgba(255,255,255,0.04)' : 'transparent',
        border: 'none', color: checked ? T.gold : T.textPrimary,
        fontSize: 13, cursor: 'pointer', gap: 10, textAlign: 'left',
        transition: 'background 70ms, color 90ms', fontFamily: 'inherit',
      }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        <span style={{ width: 14, flexShrink: 0, fontSize: 11, color: T.gold, opacity: checked ? 1 : 0, transition: 'opacity 90ms' }}>
          {radio ? '●' : '✓'}
        </span>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      </span>
      {count !== undefined && (
        <span className="mono" style={{ fontSize: 11, color: T.textMuted, flexShrink: 0 }}>{count.toLocaleString()}</span>
      )}
    </button>
  );
}

// ── Insight banner ────────────────────────────────────

function InsightBanner({
  filtered, sportFilter, typeKeys, allTypes,
}: {
  filtered: Entry[];
  sportFilter: string[];
  typeKeys: string[];
  allTypes: { key: string; label: string }[];
}) {
  if (filtered.length < 20) return null;

  const cashRate = filtered.filter(e => e.winnings > 0).length / filtered.length;
  const sig: Signal = cashRate >= CASH_KEEP ? 'keep' : cashRate >= CASH_WATCH ? 'watch' : 'remove';

  const parts: string[] = [];
  if (typeKeys.length === 1) parts.push(allTypes.find(t => t.key === typeKeys[0])?.label ?? '');
  else if (typeKeys.length > 1) parts.push(`${typeKeys.length} contest types`);
  if (sportFilter.length === 1) parts.push(sportFilter[0]);
  else if (sportFilter.length > 1) parts.push(`${sportFilter.length} sports`);

  const context = parts.filter(Boolean).join(' · ');

  const advice: Record<Signal, string> = {
    keep:    'This is a strong category — keep it in your process.',
    watch:   'Below the 20% baseline — consider scaling back here.',
    remove:  'Well below baseline — consider pausing this category.',
    'low-n': 'Not enough data yet — keep playing and revisit.',
  };

  const icons: Record<Signal, string> = { keep: '✓', watch: '⚠', remove: '✕', 'low-n': '?' };

  return (
    <div style={{
      background: SIG[sig].bg, border: `1px solid ${SIG[sig].border}`,
      borderRadius: 10, padding: '14px 16px', marginBottom: 20,
      display: 'flex', gap: 14, alignItems: 'flex-start',
      animation: 'fadeIn 200ms ease',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 8, flexShrink: 0,
        background: SIG[sig].stripe,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, color: '#0B0E13', fontWeight: 700,
      }}>
        {icons[sig]}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, lineHeight: 1.3, marginBottom: 3 }}>
          <span className="mono">{(cashRate * 100).toFixed(1)}%</span> cash rate
          {' '}across <span className="mono">{filtered.length.toLocaleString()}</span> entries
          {context ? ` · ${context}` : ''}
        </div>
        <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.4 }}>
          {advice[sig]}
        </div>
      </div>
    </div>
  );
}

// ── Cash-rate bar ─────────────────────────────────────

const BAR_MAX  = 0.30;
const BASELINE = 0.20;

function CashBar({ rate, signal }: { rate: number; signal: Signal }) {
  const fill = Math.min(rate / BAR_MAX, 1) * 100;
  const tick  = (BASELINE / BAR_MAX) * 100;
  return (
    <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, marginTop: 8 }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${fill}%`, background: SIG[signal].color, borderRadius: 3,
        transition: 'width 450ms cubic-bezier(.4,0,.2,1)',
      }} />
      <div style={{
        position: 'absolute', top: -3, bottom: -3, left: `${tick}%`,
        width: 2, background: T.textMuted, opacity: 0.4, borderRadius: 1,
      }} />
    </div>
  );
}

// ── Contest card ──────────────────────────────────────

function ContestCard({ g, index }: { g: ContestGroup; index: number }) {
  const sig    = SIG[g.signal];
  const netPos = g.net >= 0;
  const nc     = netPos ? T.gold : T.rust;

  return (
    <div style={{
      position: 'relative', background: T.panel, borderRadius: 10, overflow: 'hidden',
      border: `1px solid ${g.signal === 'remove' ? sig.border : T.border}`,
      animation: 'cardIn 300ms ease both',
      animationDelay: `${Math.min(index * 40, 200)}ms`,
    }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: sig.stripe }} />

      <div style={{ padding: '15px 16px 17px 19px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 13 }}>
          <div>
            <div className="display" style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary, lineHeight: 1.2 }}>
              {g.label}
            </div>
            {g.sublabel && (
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{g.sublabel}</div>
            )}
          </div>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
            padding: '3px 8px', borderRadius: 4, flexShrink: 0,
            color: sig.color, background: sig.bg, border: `1px solid ${sig.border}`,
          }}>
            {sig.label}
          </span>
        </div>

        {/* Hero cash rate */}
        <div style={{ marginBottom: 13 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'space-between' }}>
            <div>
              <span className="mono" style={{ fontSize: 34, fontWeight: 700, color: sig.color, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {(g.cashRate * 100).toFixed(1)}
              </span>
              <span style={{ fontSize: 15, color: sig.color, fontWeight: 500, marginLeft: 1 }}>%</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Cash Rate</div>
              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>~20% expected</div>
            </div>
          </div>
          <CashBar rate={g.cashRate} signal={g.signal} />
        </div>

        {/* Stats */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
          paddingTop: 11, borderTop: `1px solid rgba(255,255,255,0.05)`,
        }}>
          {([
            { label: 'ENTRIES', value: g.n.toLocaleString(), color: T.textPrimary },
            { label: 'NET',     value: `${netPos ? '+' : '-'}$${Math.abs(Math.round(g.net)).toLocaleString()}`, color: nc },
            { label: 'ROI',     value: `${g.roi >= 0 ? '+' : ''}${g.roi.toFixed(1)}%`, color: nc },
            { label: 'AVG RNK', value: `${(g.avgPct * 100).toFixed(0)}th`, color: T.textMuted },
          ] as { label: string; value: string; color: string }[]).map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
              <div className="mono" style={{ fontSize: 11, color, fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Sport breakdown */}
        {g.sports.length > 1 && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid rgba(255,255,255,0.05)` }}>
            <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 7 }}>
              By sport
            </div>
            {g.sports.slice(0, 5).map((s: SportRow) => (
              <div key={s.sport} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: SIG[s.signal].color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: T.textPrimary, fontWeight: 500, minWidth: 40 }}>{s.sport}</span>
                <span className="mono" style={{ fontSize: 11, color: SIG[s.signal].color, minWidth: 32 }}>
                  {(s.cashRate * 100).toFixed(0)}%
                </span>
                <span style={{ fontSize: 10, color: T.textMuted, flex: 1 }}>{s.n.toLocaleString()} entries</span>
                <span className="mono" style={{ fontSize: 10, color: s.net >= 0 ? T.gold : T.rust }}>
                  {s.net >= 0 ? '+' : '-'}${Math.abs(Math.round(s.net)).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stateless section (used in unified single-page layout) ───────────────────

interface ProcessSectionProps {
  filtered: Entry[];
  sportFilter: string[];
  typeKeys: string[];
  allTypes: { key: string; label: string }[];
  viewMode: ViewMode;
  sortBy: SortKey;
}

export function ProcessSection({ filtered, sportFilter, typeKeys, allTypes, viewMode, sortBy }: ProcessSectionProps) {
  const groups = useMemo(() => {
    const gs = buildContestGroups(filtered, viewMode);
    return [...gs].sort((a, b) => {
      if (sortBy === 'rate-desc') return b.cashRate - a.cashRate;
      if (sortBy === 'rate-asc')  return a.cashRate - b.cashRate;
      return b.n - a.n;
    });
  }, [filtered, viewMode, sortBy]);

  const removes = groups.filter(g => g.signal === 'remove');
  const watches = groups.filter(g => g.signal === 'watch');
  const keeps   = groups.filter(g => g.signal === 'keep');
  const lowN    = groups.filter(g => g.signal === 'low-n');

  return (
    <div>
      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; } to { opacity: 1; }
        }
      `}</style>

      <div style={{ marginBottom: 16 }}>
        <div className="display" style={{ fontSize: 18, fontWeight: 700, color: T.textPrimary, marginBottom: 3 }}>
          Process Audit
        </div>
        <div style={{ fontSize: 13, color: T.textMuted }}>
          Finish rates by contest type.
        </div>
      </div>

      <InsightBanner filtered={filtered} sportFilter={sportFilter} typeKeys={typeKeys} allTypes={allTypes} />

      {groups.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {removes.length > 0 && <span style={{ padding: '4px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: SIG.remove.bg, border: `1px solid ${SIG.remove.border}`, color: SIG.remove.color }}>{removes.length} remove</span>}
          {watches.length > 0 && <span style={{ padding: '4px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: SIG.watch.bg,  border: `1px solid ${SIG.watch.border}`,  color: SIG.watch.color  }}>{watches.length} watch</span>}
          {keeps.length > 0   && <span style={{ padding: '4px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: SIG.keep.bg,   border: `1px solid ${SIG.keep.border}`,   color: SIG.keep.color   }}>{keeps.length} on track</span>}
          {lowN.length > 0    && <span style={{ padding: '4px 11px', borderRadius: 20, fontSize: 12, background: SIG['low-n'].bg, border: `1px solid ${SIG['low-n'].border}`, color: SIG['low-n'].color }}>{lowN.length} low data</span>}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: T.textMuted, alignSelf: 'center' }}>
            {filtered.length.toLocaleString()} entries
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ color: T.textMuted, fontSize: 14, padding: '32px 0', textAlign: 'center' }}>
          No entries match the current filters.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(288px, 1fr))',
          gap: 12,
        }}>
          {groups.map((g, i) => <ContestCard key={g.key} g={g} index={i} />)}
        </div>
      )}

      <div style={{
        marginTop: 28, fontSize: 12, color: T.textMuted, lineHeight: 1.7,
        borderTop: `1px solid ${T.border}`, paddingTop: 16,
      }}>
        <strong style={{ color: T.textPrimary }}>Signals: </strong>
        <span style={{ color: SIG.keep.color }}>Keep</span> ≥17% ·{' '}
        <span style={{ color: SIG.watch.color }}>Watch</span> 10–17% ·{' '}
        <span style={{ color: SIG.remove.color }}>Remove</span> &lt;10% — needs 30+ entries.
        {' '}Use <strong style={{ color: T.textPrimary }}>× Sport</strong> to split each type by sport — so you can keep $3 single MLB while cutting $3 single NFL.
        {' '}Avg rank is finish percentile (lower = better).
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────

export function ProcessPage({ rows }: { rows: Entry[] }) {
  const [dateFilter,  setDateFilter]  = useState<DateFilter>('30');
  const [customFrom,  setCustomFrom]  = useState('');
  const [customTo,    setCustomTo]    = useState('');
  const [sportFilter, setSportFilter] = useState<string[]>([]);
  const [typeKeys,    setTypeKeys]    = useState<string[]>([]);
  const [viewMode,    setViewMode]    = useState<ViewMode>('type');
  const [sortBy,      setSortBy]      = useState<SortKey>('rate-desc');
  const [openPill,    setOpenPill]    = useState<string | null>(null);

  const close = () => setOpenPill(null);

  // Available options (from ALL rows, not filtered)
  const allSports = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(e => { if (e.sport) s.add(e.sport); });
    return [...s].sort();
  }, [rows]);

  const allTypes = useMemo(() => {
    const map = new Map<string, { fee: number; maxSize: number | null; count: number }>();
    rows.forEach(e => {
      const k = `${e.fee}|${e.maxSize ?? 'null'}`;
      if (!map.has(k)) map.set(k, { fee: e.fee, maxSize: e.maxSize, count: 0 });
      map.get(k)!.count++;
    });
    return [...map.entries()]
      .map(([key, v]) => ({ key, label: typeLabel(v.fee, v.maxSize), count: v.count }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const maxDate = useMemo((): Date | null => {
    let max: Date | null = null;
    rows.forEach(e => { if (e.date && (!max || e.date > max)) max = e.date; });
    return max;
  }, [rows]);

  // Apply filters
  const filtered = useMemo(() => {
    let out = rows;
    if (dateFilter === 'custom') {
      if (customFrom) out = out.filter(e => e.date && e.date >= new Date(customFrom));
      if (customTo)   out = out.filter(e => e.date && e.date <= new Date(customTo + 'T23:59:59'));
    } else if (dateFilter !== 'all' && maxDate) {
      const days   = parseInt(dateFilter, 10);
      const cutoff = new Date(maxDate.getTime() - days * 86_400_000);
      out = out.filter(e => e.date && e.date >= cutoff);
    }
    if (sportFilter.length > 0) out = out.filter(e => sportFilter.includes(e.sport));
    if (typeKeys.length > 0) {
      const ks = new Set(typeKeys);
      out = out.filter(e => ks.has(`${e.fee}|${e.maxSize ?? 'null'}`));
    }
    return out;
  }, [rows, dateFilter, customFrom, customTo, sportFilter, typeKeys, maxDate]);

  // Build + sort groups
  const groups = useMemo(() => {
    const gs = buildContestGroups(filtered, viewMode);
    return [...gs].sort((a, b) => {
      if (sortBy === 'rate-desc') return b.cashRate - a.cashRate;
      if (sortBy === 'rate-asc')  return a.cashRate - b.cashRate;
      return b.n - a.n;
    });
  }, [filtered, viewMode, sortBy]);

  const removes = groups.filter(g => g.signal === 'remove');
  const watches = groups.filter(g => g.signal === 'watch');
  const keeps   = groups.filter(g => g.signal === 'keep');
  const lowN    = groups.filter(g => g.signal === 'low-n');

  const hasFilters = sportFilter.length > 0 || typeKeys.length > 0 || dateFilter !== '30';
  const reset = () => {
    haptic(8); setSportFilter([]); setTypeKeys([]);
    setDateFilter('30'); setCustomFrom(''); setCustomTo(''); close();
  };

  // Pill labels
  const sportLabel = sportFilter.length === 0 ? 'Sport'
    : sportFilter.length === 1 ? sportFilter[0]
    : `Sport · ${sportFilter.length}`;

  const typePillLabel = typeKeys.length === 0 ? 'Contest Type'
    : typeKeys.length === 1 ? (allTypes.find(t => t.key === typeKeys[0])?.label ?? 'Type')
    : `Type · ${typeKeys.length}`;

  const sortLabel = SORT_OPTS.find(s => s[0] === sortBy)?.[1] ?? 'Sort';

  const divider = <div style={{ height: 1, background: '#2A3040', margin: '4px 0' }} />;

  return (
    <div>
      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; } to { opacity: 1; }
        }
        .fd-panel { animation: fd-drop 120ms ease; }
        @keyframes fd-drop {
          from { opacity: 0; transform: translateY(-5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {openPill && <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />}

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div className="display" style={{ fontSize: 18, fontWeight: 700, color: T.textPrimary, marginBottom: 3 }}>
          Process Audit
        </div>
        <div style={{ fontSize: 13, color: T.textMuted }}>
          Finish rates by contest type. Defaulting to the last 30 days.
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>

        {/* Date */}
        <Pill id="date" label={DATE_LABEL[dateFilter]} active={dateFilter !== '30'} openId={openPill} setOpenId={id => { haptic(5); setOpenPill(id); }}>
          {DATE_OPTS.map(([k, l]) => (
            <DropItem key={k} label={l} checked={dateFilter === k} radio
              onClick={() => { setDateFilter(k); if (k !== 'custom') close(); }} />
          ))}
        </Pill>

        {/* Sport */}
        {allSports.length > 1 && (
          <Pill id="sport" label={sportLabel} active={sportFilter.length > 0} openId={openPill} setOpenId={id => { haptic(5); setOpenPill(id); }}>
            <DropItem label="All sports" checked={sportFilter.length === 0} onClick={() => { setSportFilter([]); close(); }} />
            {divider}
            {allSports.map(s => (
              <DropItem key={s} label={s} checked={sportFilter.includes(s)}
                onClick={() => setSportFilter(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])} />
            ))}
          </Pill>
        )}

        {/* Contest type */}
        <Pill id="type" label={typePillLabel} active={typeKeys.length > 0} openId={openPill} setOpenId={id => { haptic(5); setOpenPill(id); }}>
          <DropItem label="All contest types" checked={typeKeys.length === 0} onClick={() => { setTypeKeys([]); close(); }} />
          {divider}
          {allTypes.map(t => (
            <DropItem key={t.key} label={t.label} count={t.count} checked={typeKeys.includes(t.key)}
              onClick={() => setTypeKeys(p => p.includes(t.key) ? p.filter(x => x !== t.key) : [...p, t.key])} />
          ))}
        </Pill>

        {/* View mode inline toggle */}
        <div style={{
          display: 'flex', gap: 2, background: '#0C0F16',
          border: `1px solid ${T.border}`, borderRadius: 7, padding: 3,
        }}>
          {(['type', 'sport'] as ViewMode[]).map(m => (
            <button key={m} onClick={() => { haptic(6); setViewMode(m); close(); }} style={{
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

        {/* Sort */}
        <Pill id="sort" label={sortLabel} active={sortBy !== 'rate-desc'} openId={openPill} setOpenId={id => { haptic(5); setOpenPill(id); }}>
          {SORT_OPTS.map(([k, l]) => (
            <DropItem key={k} label={l} checked={sortBy === k} radio
              onClick={() => { setSortBy(k); close(); haptic(6); }} />
          ))}
        </Pill>

        {hasFilters && (
          <button onClick={reset} style={{
            background: 'none', border: 'none', color: T.textMuted,
            fontSize: 13, cursor: 'pointer', padding: '10px 6px', minHeight: 44,
            fontFamily: 'inherit', transition: 'color 140ms',
          }}
            onMouseEnter={e => (e.currentTarget.style.color = T.textPrimary)}
            onMouseLeave={e => (e.currentTarget.style.color = T.textMuted)}>
            Reset
          </button>
        )}
      </div>

      {/* Custom date inputs */}
      {dateFilter === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{
            background: T.panel, border: `1px solid ${T.border}`, borderRadius: 5,
            padding: '9px 10px', fontSize: 13, color: T.textPrimary, outline: 'none',
            colorScheme: 'dark', flex: '1', minWidth: 120,
          }} />
          <span style={{ color: T.textMuted, fontSize: 12, flexShrink: 0 }}>→</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{
            background: T.panel, border: `1px solid ${T.border}`, borderRadius: 5,
            padding: '9px 10px', fontSize: 13, color: T.textPrimary, outline: 'none',
            colorScheme: 'dark', flex: '1', minWidth: 120,
          }} />
        </div>
      )}

      {/* Insight banner */}
      <InsightBanner filtered={filtered} sportFilter={sportFilter} typeKeys={typeKeys} allTypes={allTypes} />

      {/* Summary chips */}
      {groups.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {removes.length > 0 && <span style={{ padding: '4px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: SIG.remove.bg, border: `1px solid ${SIG.remove.border}`, color: SIG.remove.color }}>{removes.length} remove</span>}
          {watches.length > 0 && <span style={{ padding: '4px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: SIG.watch.bg,  border: `1px solid ${SIG.watch.border}`,  color: SIG.watch.color  }}>{watches.length} watch</span>}
          {keeps.length > 0   && <span style={{ padding: '4px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: SIG.keep.bg,   border: `1px solid ${SIG.keep.border}`,   color: SIG.keep.color   }}>{keeps.length} on track</span>}
          {lowN.length > 0    && <span style={{ padding: '4px 11px', borderRadius: 20, fontSize: 12, background: SIG['low-n'].bg, border: `1px solid ${SIG['low-n'].border}`, color: SIG['low-n'].color }}>{lowN.length} low data</span>}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: T.textMuted, alignSelf: 'center' }}>
            {filtered.length.toLocaleString()} entries
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ color: T.textMuted, fontSize: 14, padding: '32px 0', textAlign: 'center' }}>
          No entries match the current filters.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(288px, 1fr))',
          gap: 12,
        }}>
          {groups.map((g, i) => <ContestCard key={g.key} g={g} index={i} />)}
        </div>
      )}

      <div style={{
        marginTop: 28, fontSize: 12, color: T.textMuted, lineHeight: 1.7,
        borderTop: `1px solid ${T.border}`, paddingTop: 16,
      }}>
        <strong style={{ color: T.textPrimary }}>Signals: </strong>
        <span style={{ color: SIG.keep.color }}>Keep</span> ≥17% ·{' '}
        <span style={{ color: SIG.watch.color }}>Watch</span> 10–17% ·{' '}
        <span style={{ color: SIG.remove.color }}>Remove</span> &lt;10% — needs 30+ entries.
        {' '}Use <strong style={{ color: T.textPrimary }}>× Sport</strong> to split each type by sport — so you can keep $3 single MLB while cutting $3 single NFL.
        {' '}Avg rank is finish percentile (lower = better).
      </div>
    </div>
  );
}
