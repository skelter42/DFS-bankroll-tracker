import { useState } from 'react';
import { T } from '../constants';
import { haptic } from '../lib/haptic';
import { buildContestGroups } from '../lib/process';
import type { ContestGroup, SportRow, Signal, ViewMode } from '../lib/process';
import type { Entry } from '../types';

// ── Signal palette ────────────────────────────────────

const SIG: Record<Signal, { label: string; color: string; bg: string; border: string; stripe: string }> = {
  keep:    { label: '✓ Keep',    color: T.gold,      bg: 'rgba(201,162,39,0.06)',  border: 'rgba(201,162,39,0.20)', stripe: T.gold      },
  watch:   { label: '⚠ Watch',   color: '#D97706',   bg: 'rgba(217,119,6,0.06)',   border: 'rgba(217,119,6,0.22)',  stripe: '#D97706'   },
  remove:  { label: '✕ Remove',  color: '#C0483B',   bg: 'rgba(176,72,59,0.09)',   border: 'rgba(176,72,59,0.28)',  stripe: '#C0483B'   },
  'low-n': { label: '? Low data',color: T.textMuted, bg: 'rgba(136,145,160,0.05)', border: T.border,               stripe: T.border    },
};

// ── Cash-rate bar (0–30%, baseline tick at 20%) ───────

const BAR_MAX  = 0.30;
const BASELINE = 0.20;

function CashBar({ rate, signal }: { rate: number; signal: Signal }) {
  const fillPct = Math.min(rate / BAR_MAX, 1) * 100;
  const tickPct = (BASELINE / BAR_MAX) * 100;
  return (
    <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, marginTop: 8 }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${fillPct}%`, background: SIG[signal].color,
        borderRadius: 3, transition: 'width 500ms cubic-bezier(.4,0,.2,1)',
      }} />
      <div style={{
        position: 'absolute', top: -3, bottom: -3, left: `${tickPct}%`,
        width: 2, background: T.textMuted, borderRadius: 1, opacity: 0.45,
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
      position:      'relative',
      background:    T.panel,
      borderRadius:  10,
      border:        `1px solid ${g.signal === 'remove' ? sig.border : T.border}`,
      overflow:      'hidden',
      animation:     'cardIn 320ms ease both',
      animationDelay:`${index * 45}ms`,
    }}>
      {/* Signal stripe */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: 3, background: sig.stripe,
      }} />

      <div style={{ padding: '16px 18px 18px 20px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 16 }}>
          <div>
            <div className="display" style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary, lineHeight: 1.2 }}>
              {g.label}
            </div>
            {g.sublabel && (
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3, letterSpacing: '0.04em' }}>
                {g.sublabel}
              </div>
            )}
          </div>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
            padding: '4px 9px', borderRadius: 5, flexShrink: 0,
            color: sig.color, background: sig.bg, border: `1px solid ${sig.border}`,
          }}>
            {sig.label}
          </span>
        </div>

        {/* Hero: cash rate */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'space-between' }}>
            <div>
              <span className="mono" style={{ fontSize: 36, fontWeight: 700, color: sig.color, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {(g.cashRate * 100).toFixed(1)}
              </span>
              <span style={{ fontSize: 16, color: sig.color, fontWeight: 500, marginLeft: 2 }}>%</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 1 }}>
                Cash Rate
              </div>
              <div style={{ fontSize: 11, color: T.textMuted }}>
                ~20% expected
              </div>
            </div>
          </div>
          <CashBar rate={g.cashRate} signal={g.signal} />
        </div>

        {/* Stats row */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8, paddingTop: 12,
          borderTop: `1px solid rgba(255,255,255,0.06)`,
        }}>
          {([
            { label: 'ENTRIES',  value: g.n.toLocaleString(),                        color: T.textPrimary },
            { label: 'NET P&L',  value: `${netPos ? '+' : '-'}$${Math.abs(Math.round(g.net)).toLocaleString()}`, color: nc },
            { label: 'ROI',      value: `${g.roi >= 0 ? '+' : ''}${g.roi.toFixed(1)}%`, color: nc },
            { label: 'AVG RANK', value: `${(g.avgPct * 100).toFixed(0)}th`,           color: T.textMuted },
          ] as { label: string; value: string; color: string }[]).map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
              <div className="mono" style={{ fontSize: 12, color, fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Sport breakdown (type mode only) */}
        {g.sports.length > 1 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid rgba(255,255,255,0.06)` }}>
            <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
              By sport
            </div>
            {g.sports.slice(0, 5).map((s: SportRow) => (
              <div key={s.sport} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                {/* signal dot */}
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: SIG[s.signal].color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: T.textPrimary, fontWeight: 500, minWidth: 42 }}>{s.sport}</span>
                <span className="mono" style={{ fontSize: 12, color: SIG[s.signal].color, minWidth: 36 }}>
                  {(s.cashRate * 100).toFixed(0)}%
                </span>
                <span style={{ fontSize: 11, color: T.textMuted, flex: 1 }}>{s.n.toLocaleString()} entries</span>
                <span className="mono" style={{ fontSize: 11, color: s.net >= 0 ? T.gold : T.rust }}>
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

// ── Page ─────────────────────────────────────────────

export function ProcessPage({ rows }: { rows: Entry[] }) {
  const [mode, setMode] = useState<ViewMode>('type');

  const groups  = buildContestGroups(rows, mode);
  const removes = groups.filter(g => g.signal === 'remove');
  const watches = groups.filter(g => g.signal === 'watch');
  const keeps   = groups.filter(g => g.signal === 'keep');
  const lowN    = groups.filter(g => g.signal === 'low-n');

  const switchMode = (m: ViewMode) => {
    haptic(8);
    setMode(m);
  };

  return (
    <div>
      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <div className="display" style={{ fontSize: 18, fontWeight: 700, color: T.textPrimary, marginBottom: 4 }}>
            Process Audit
          </div>
          <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.5 }}>
            Cash rate per contest type vs the ~20% GPP baseline.
          </div>
        </div>

        {/* View mode toggle */}
        <div style={{
          display: 'flex', gap: 3,
          background: '#0D1018', border: `1px solid ${T.border}`,
          borderRadius: 8, padding: 3, flexShrink: 0,
        }}>
          {(['type', 'sport'] as ViewMode[]).map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              style={{
                background:   mode === m ? '#1E2636' : 'none',
                border:       mode === m ? `1px solid ${T.border}` : '1px solid transparent',
                borderRadius: 6,
                color:        mode === m ? T.textPrimary : T.textMuted,
                padding:      '7px 12px',
                fontSize:     12,
                fontFamily:   'inherit',
                cursor:       'pointer',
                fontWeight:   mode === m ? 600 : 400,
                whiteSpace:   'nowrap',
                minHeight:    36,
                transition:   'background 150ms, color 150ms',
              }}
            >
              {m === 'type' ? 'Contest Type' : 'By Sport'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary chips */}
      {groups.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {removes.length > 0 && (
            <span style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, background: SIG.remove.bg, border: `1px solid ${SIG.remove.border}`, color: SIG.remove.color, fontWeight: 600 }}>
              {removes.length} to remove
            </span>
          )}
          {watches.length > 0 && (
            <span style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, background: SIG.watch.bg, border: `1px solid ${SIG.watch.border}`, color: SIG.watch.color, fontWeight: 600 }}>
              {watches.length} to watch
            </span>
          )}
          {keeps.length > 0 && (
            <span style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, background: SIG.keep.bg, border: `1px solid ${SIG.keep.border}`, color: SIG.keep.color, fontWeight: 600 }}>
              {keeps.length} on track
            </span>
          )}
          {lowN.length > 0 && (
            <span style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, background: SIG['low-n'].bg, border: `1px solid ${SIG['low-n'].border}`, color: SIG['low-n'].color }}>
              {lowN.length} low data
            </span>
          )}
        </div>
      )}

      {/* Card grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
        gap: 12,
      }}>
        {groups.map((g, i) => <ContestCard key={g.key} g={g} index={i} />)}
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 28, fontSize: 12, color: T.textMuted, lineHeight: 1.7,
        borderTop: `1px solid ${T.border}`, paddingTop: 16,
      }}>
        <strong style={{ color: T.textPrimary }}>Signals: </strong>
        <span style={{ color: SIG.keep.color }}>Keep</span> ≥17% · <span style={{ color: SIG.watch.color }}>Watch</span> 10–17% · <span style={{ color: SIG.remove.color }}>Remove</span> &lt;10% · needs 30+ entries.
        {' '}Switch to <strong style={{ color: T.textPrimary }}>By Sport</strong> to split each contest type by sport — so you can keep $3 single MLB while cutting $3 single NFL.
        {' '}Avg rank is finish percentile across all entries (lower = better).
      </div>
    </div>
  );
}
