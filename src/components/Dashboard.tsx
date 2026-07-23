import { useMemo } from 'react';
import { T } from '../constants';
import { buildSportSummaries, MIN_N } from '../lib/process';
import type { SportSummary, EntryTypeSummary, Signal } from '../lib/process';
import type { Entry } from '../types';

const SIG: Record<Signal, { dot: string; stripe: string; bg: string; border: string; label: string }> = {
  keep:   { dot: '#3FC480', stripe: '#3FC480', bg: 'rgba(63,196,128,0.09)',  border: 'rgba(63,196,128,0.24)', label: 'Keep'   },
  watch:  { dot: '#C9A227', stripe: '#C9A227', bg: 'rgba(201,162,39,0.09)', border: 'rgba(201,162,39,0.26)', label: 'Watch'  },
  remove: { dot: '#CF4C3F', stripe: '#CF4C3F', bg: 'rgba(207,76,63,0.09)',  border: 'rgba(207,76,63,0.26)', label: 'Remove' },
  'low-n':{ dot: '#636D7E', stripe: '#636D7E', bg: 'rgba(99,109,126,0.07)', border: 'rgba(99,109,126,0.20)', label: 'Low n'  },
};

const BAR_MAX  = 0.30;
const BASELINE = (0.20 / BAR_MAX) * 100;  // 66.7% across bar = 20% cash rate mark

function fmtPct(v: number, dec = 1) { return `${(v * 100).toFixed(dec)}%`; }
function fmtNet(n: number) {
  const a = Math.abs(n), s = n >= 0 ? '+$' : '-$';
  return a >= 1000 ? `${s}${(a / 1000).toFixed(1)}k` : `${s}${a.toFixed(0)}`;
}

// ── Cash rate bar ─────────────────────────────────────────

function CashBar({ rate, signal, height = 6 }: { rate: number; signal: Signal; height?: number }) {
  const fill = Math.min(rate / BAR_MAX, 1) * 100;
  return (
    <div style={{ position: 'relative', height, background: 'rgba(255,255,255,0.07)', borderRadius: 3, flexShrink: 0 }}>
      <div style={{
        position: 'absolute', inset: '0 auto 0 0',
        width: `${fill}%`, minWidth: fill > 0 ? 3 : 0,
        background: SIG[signal].dot, borderRadius: 3, opacity: 0.85,
        transition: 'width 450ms cubic-bezier(0.4,0,0.2,1)',
      }} />
      <div style={{
        position: 'absolute', top: -2, bottom: -2,
        left: `${BASELINE}%`, width: 1,
        background: 'rgba(255,255,255,0.28)',
      }} />
    </div>
  );
}

// ── Signal badge ──────────────────────────────────────────

function SignalBadge({ signal, small = false }: { signal: Signal; small?: boolean }) {
  const s = SIG[signal];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: small ? '2px 7px' : '3px 9px',
      borderRadius: 20,
      fontSize: small ? 10 : 11,
      fontWeight: 600,
      background: s.bg, border: `1px solid ${s.border}`, color: s.dot,
      letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      <span style={{ width: small ? 5 : 6, height: small ? 5 : 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {s.label.toUpperCase()}
    </span>
  );
}

// ── Entry type row ────────────────────────────────────────

function EntryTypeRow({ et }: { et: EntryTypeSummary }) {
  const isRemove = et.signal === 'remove';
  const isWatch  = et.signal === 'watch';
  const s = SIG[et.signal];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 14px',
      marginLeft: -14, marginRight: -14,
      background: isRemove ? 'rgba(207,76,63,0.07)' : 'transparent',
      borderLeft: `2px solid ${isRemove ? s.stripe : 'transparent'}`,
    }}>
      <span className="mono" style={{
        fontSize: 11, flexShrink: 0,
        color: (isRemove || isWatch) ? T.textPrimary : T.textMuted,
        fontWeight: isRemove ? 600 : 400,
        width: 100, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {et.label}
        {et.n < MIN_N && <span style={{ marginLeft: 5, fontSize: 9, color: SIG['low-n'].dot, fontWeight: 400 }}>·low n</span>}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <CashBar rate={et.cashRate} signal={et.signal} height={4} />
      </div>

      <span className="mono" style={{
        fontSize: 12, fontWeight: 700, color: s.dot,
        width: 40, textAlign: 'right', flexShrink: 0,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {fmtPct(et.cashRate)}
      </span>

      <SignalBadge signal={et.signal} small />
    </div>
  );
}

// ── Sport card ────────────────────────────────────────────

function SportCard({ s, index }: { s: SportSummary; index: number }) {
  const sig = SIG[s.signal];

  return (
    <div style={{
      background: T.panel,
      border: `1px solid ${sig.border}`,
      borderRadius: 8,
      overflow: 'hidden',
      animation: 'cardIn 280ms ease both',
      animationDelay: `${Math.min(index * 55, 280)}ms`,
    }}>
      <div style={{ display: 'flex' }}>
        <div style={{ width: 3, flexShrink: 0, background: sig.stripe }} />

        <div style={{ flex: 1, padding: '16px 14px 14px', minWidth: 0 }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flexWrap: 'wrap' }}>
              <span className="display" style={{ fontSize: 20, fontWeight: 700, color: T.textPrimary, flexShrink: 0 }}>
                {s.sport}
              </span>
              <SignalBadge signal={s.signal} />
            </div>
            <span className="mono" style={{ fontSize: 11, color: T.textMuted, flexShrink: 0, paddingTop: 3 }}>
              {s.n.toLocaleString()} entries
            </span>
          </div>

          {/* Cash rate hero */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
              <span style={{
                fontSize: 30, fontWeight: 700, color: sig.dot,
                fontVariantNumeric: 'tabular-nums', lineHeight: 1,
              }}>
                {fmtPct(s.cashRate)}
              </span>
              <span style={{ fontSize: 11, color: T.textMuted }}>cash rate</span>
            </div>
            <CashBar rate={s.cashRate} signal={s.signal} />
          </div>

          {/* Finish distribution */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            background: 'rgba(0,0,0,0.18)', borderRadius: 6,
            padding: '10px 0', marginBottom: 12,
          }}>
            {[
              { label: 'Top 20%', v: s.dist.top20 },
              { label: 'Top 10%', v: s.dist.top10 },
              { label: 'Top 1%',  v: s.dist.top1  },
            ].map(({ label, v }, i) => (
              <div key={label} style={{
                textAlign: 'center', padding: '0 4px',
                borderLeft: i > 0 ? `1px solid ${T.border}` : 'none',
              }}>
                <div className="mono" style={{
                  fontSize: 15, fontWeight: 700, color: T.textPrimary,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {fmtPct(v)}
                </div>
                <div style={{ fontSize: 9, color: T.textMuted, marginTop: 3, letterSpacing: '0.04em' }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Net / ROI / avg */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="mono" style={{ fontSize: 13, color: s.net >= 0 ? T.gold : T.rust, fontVariantNumeric: 'tabular-nums' }}>
              {fmtNet(s.net)}
            </span>
            <span className="mono" style={{ fontSize: 13, color: s.roi >= 0 ? T.gold : T.rust, fontVariantNumeric: 'tabular-nums' }}>
              {s.roi >= 0 ? '+' : ''}{s.roi.toFixed(1)}% ROI
            </span>
            <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 'auto' }}>
              avg top {fmtPct(s.avgPct, 0)}
            </span>
          </div>

          {/* Entry type breakdown — only types with enough data */}
          {(() => {
            const types = s.entryTypes.filter(et => et.signal !== 'low-n');
            if (types.length < 2) return null;
            return (
              <>
                <div style={{ height: 1, background: T.border, margin: '12px -14px 10px' }} />
                <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>
                  By entry type
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {types.map(et => <EntryTypeRow key={et.key} et={et} />)}
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ── Cut list ──────────────────────────────────────────────

function CutList({ summaries }: { summaries: SportSummary[] }) {
  const items: { label: string; cashRate: number; n: number }[] = [];

  for (const s of summaries) {
    if (s.signal === 'remove') {
      items.push({ label: s.sport, cashRate: s.cashRate, n: s.n });
    } else {
      for (const et of s.entryTypes) {
        if (et.signal === 'remove') {
          items.push({ label: `${et.label} · ${s.sport}`, cashRate: et.cashRate, n: et.n });
        }
      }
    }
  }

  if (items.length === 0) return null;

  return (
    <div style={{
      background: 'rgba(207,76,63,0.07)',
      border: '1px solid rgba(207,76,63,0.28)',
      borderLeft: '3px solid #CF4C3F',
      borderRadius: '0 8px 8px 0',
      padding: '14px 18px',
      marginBottom: 22,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: '#CF4C3F',
        letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10,
      }}>
        ✂ {items.length === 1 ? '1 thing to cut' : `${items.length} things to consider cutting`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 14, color: T.textPrimary, fontWeight: 600 }}>{item.label}</span>
            <span className="mono" style={{
              fontSize: 12, color: T.textMuted,
              whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
            }}>
              {fmtPct(item.cashRate)} cash · {item.n} entries
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DashboardSection ──────────────────────────────────────

export function DashboardSection({ filtered }: { filtered: Entry[] }) {
  const summaries = useMemo(() => buildSportSummaries(filtered), [filtered]);

  if (filtered.length === 0) {
    return (
      <div style={{ color: T.textMuted, fontSize: 14, padding: '32px 0', textAlign: 'center' }}>
        No entries match the current filters.
      </div>
    );
  }

  const sportLine = summaries.map(s => s.sport).join(' · ');

  return (
    <div>
      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ marginBottom: 18 }}>
        <div className="display" style={{ fontSize: 16, fontWeight: 700, color: T.textPrimary, marginBottom: 3 }}>
          Performance by Sport
        </div>
        <div style={{ fontSize: 12, color: T.textMuted }}>
          {filtered.length.toLocaleString()} entries · {sportLine}
        </div>
      </div>

      <CutList summaries={summaries} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 14,
      }}>
        {summaries.map((s, i) => <SportCard key={s.sport} s={s} index={i} />)}
      </div>

      <div style={{
        marginTop: 24, fontSize: 12, color: T.textMuted, lineHeight: 1.8,
        borderTop: `1px solid ${T.border}`, paddingTop: 14,
      }}>
        <strong style={{ color: T.textPrimary }}>Signals: </strong>
        <span style={{ color: SIG.keep.dot }}>Keep</span> ≥17% cash ·{' '}
        <span style={{ color: SIG.watch.dot }}>Watch</span> 10–17% ·{' '}
        <span style={{ color: SIG.remove.dot }}>Remove</span> &lt;10% — needs {MIN_N}+ entries.
        {' '}The bar line = 20% (typical GPP cash line).
        {' '}Finish rates = % of entries landing in the top X% of their contest.
      </div>
    </div>
  );
}
