import { T } from '../constants';
import type { Entry } from '../types';
import { buildContestGroups, CASH_KEEP, CASH_WATCH } from '../lib/process';
import type { ContestGroup, SportRow, Signal } from '../lib/process';

// ── Signal config ─────────────────────────────────────

const SIG: Record<Signal, { label: string; color: string; bg: string; border: string }> = {
  keep:   { label: '✓ Keep',   color: T.gold,      bg: 'rgba(201,162,39,0.09)', border: 'rgba(201,162,39,0.22)' },
  watch:  { label: '⚠ Watch',  color: '#D97706',   bg: 'rgba(217,119,6,0.09)',  border: 'rgba(217,119,6,0.22)'  },
  remove: { label: '✕ Remove', color: T.rust,      bg: 'rgba(176,72,59,0.09)',  border: 'rgba(176,72,59,0.30)'  },
  'low-n':{ label: '? Low data', color: T.textMuted, bg: 'rgba(136,145,160,0.07)', border: T.border },
};

// ── Cash-rate bar ─────────────────────────────────────
// Bar spans 0–30%; baseline tick at 20%

const BAR_MAX  = 0.30;
const BASELINE = 0.20;

function CashBar({ rate, signal }: { rate: number; signal: Signal }) {
  const fillPct     = Math.min(rate / BAR_MAX, 1) * 100;
  const baselinePct = (BASELINE / BAR_MAX) * 100;
  const color       = SIG[signal].color;

  return (
    <div style={{ position: 'relative', height: 7, background: '#1A2030', borderRadius: 4, margin: '6px 0 3px' }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, height: '100%',
        width: `${fillPct}%`,
        background: color, opacity: 0.85, borderRadius: 4,
        transition: 'width 400ms ease',
      }} />
      {/* baseline tick */}
      <div style={{
        position: 'absolute', top: -2, bottom: -2,
        left: `${baselinePct}%`,
        width: 1.5, background: T.textMuted, opacity: 0.5, borderRadius: 1,
      }} />
    </div>
  );
}

// ── Single contest-type card ──────────────────────────

function ContestCard({ g }: { g: ContestGroup }) {
  const sig      = SIG[g.signal];
  const netPos   = g.net >= 0;
  const netStr   = `${netPos ? '+' : '-'}$${Math.abs(Math.round(g.net)).toLocaleString()}`;
  const roiStr   = `${g.roi >= 0 ? '+' : ''}${g.roi.toFixed(1)}%`;
  const netColor = netPos ? T.gold : T.rust;

  return (
    <div style={{
      background:   T.panel,
      border:       `1px solid ${g.signal === 'remove' ? sig.border : T.border}`,
      borderRadius: 8,
      padding:      '16px 18px 18px',
      display:      'flex',
      flexDirection: 'column',
      gap:          0,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span className="display" style={{ fontSize: 15, fontWeight: 600, color: T.textPrimary }}>
          {g.label}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
          padding: '3px 8px', borderRadius: 4,
          color: sig.color, background: sig.bg, border: `1px solid ${sig.border}`,
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {sig.label}
        </span>
      </div>

      {/* Cash-rate section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 10, color: T.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Cash Rate
          </span>
          <span className="mono" style={{ fontSize: 20, fontWeight: 600, color: sig.color }}>
            {(g.cashRate * 100).toFixed(1)}%
          </span>
        </div>
        <CashBar rate={g.cashRate} signal={g.signal} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: T.textMuted }}>
          <span>0%</span>
          <span>~20% expected</span>
          <span>30%</span>
        </div>
      </div>

      {/* Stats row */}
      <div style={{
        display: 'flex', gap: 14, flexWrap: 'wrap',
        borderTop: `1px solid ${T.border}`, marginTop: 14, paddingTop: 12,
      }}>
        {([
          { label: 'ENTRIES',     value: g.n.toLocaleString(),                     color: T.textPrimary },
          { label: 'NET P&L',     value: netStr,                                    color: netColor },
          { label: 'ROI',         value: roiStr,                                    color: netColor },
          { label: 'AVG FINISH',  value: `${(g.avgPct * 100).toFixed(0)}th pct`,   color: T.textMuted },
        ] as { label: string; value: string; color: string }[]).map(({ label, value, color }) => (
          <div key={label}>
            <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
            <div className="mono" style={{ fontSize: 12, color, fontWeight: 500 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Sport breakdown */}
      {g.sports.length > 1 && (
        <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 12, paddingTop: 12 }}>
          <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
            By sport
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {g.sports.slice(0, 5).map((s: SportRow) => (
              <div key={s.sport} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: T.textPrimary, minWidth: 44, fontWeight: 500 }}>{s.sport}</span>
                <span className="mono" style={{ fontSize: 12, color: SIG[s.signal].color, minWidth: 38 }}>
                  {(s.cashRate * 100).toFixed(0)}%
                </span>
                <span style={{ fontSize: 11, color: T.textMuted, flex: 1 }}>
                  {s.n.toLocaleString()} entries
                </span>
                <span className="mono" style={{ fontSize: 11, color: s.net >= 0 ? T.gold : T.rust }}>
                  {s.net >= 0 ? '+' : '-'}${Math.abs(Math.round(s.net)).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────

export function ProcessPage({ rows }: { rows: Entry[] }) {
  const groups  = buildContestGroups(rows);
  const removes = groups.filter(g => g.signal === 'remove');
  const watches = groups.filter(g => g.signal === 'watch');
  const keeps   = groups.filter(g => g.signal === 'keep');
  const lowN    = groups.filter(g => g.signal === 'low-n');

  // Suppress unused-import warning — values are used in process.ts only;
  // keep the import so TS verifies the contract
  void CASH_KEEP; void CASH_WATCH;

  return (
    <div>

      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <div className="display" style={{ fontSize: 18, fontWeight: 600, color: T.textPrimary, marginBottom: 4 }}>
          Process Audit
        </div>
        <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.5, maxWidth: 520 }}>
          Cash rate by contest type — the % of your entries that finished in a paid position.
          DraftKings GPPs typically pay ~top 20%, so that's the baseline.
        </div>
      </div>

      {/* Summary chips */}
      {groups.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {removes.length > 0 && (
            <span style={{ padding: '5px 12px', borderRadius: 20, fontSize: 13, background: SIG.remove.bg, border: `1px solid ${SIG.remove.border}`, color: SIG.remove.color }}>
              {removes.length} to remove
            </span>
          )}
          {watches.length > 0 && (
            <span style={{ padding: '5px 12px', borderRadius: 20, fontSize: 13, background: SIG.watch.bg, border: `1px solid ${SIG.watch.border}`, color: SIG.watch.color }}>
              {watches.length} to watch
            </span>
          )}
          {keeps.length > 0 && (
            <span style={{ padding: '5px 12px', borderRadius: 20, fontSize: 13, background: SIG.keep.bg, border: `1px solid ${SIG.keep.border}`, color: SIG.keep.color }}>
              {keeps.length} on track
            </span>
          )}
          {lowN.length > 0 && (
            <span style={{ padding: '5px 12px', borderRadius: 20, fontSize: 13, background: SIG['low-n'].bg, border: `1px solid ${SIG['low-n'].border}`, color: SIG['low-n'].color }}>
              {lowN.length} low data
            </span>
          )}
        </div>
      )}

      {/* Card grid — auto-fill 2 cols on desktop, 1 on mobile */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 12,
      }}>
        {groups.map(g => <ContestCard key={g.key} g={g} />)}
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 24, fontSize: 12, color: T.textMuted, lineHeight: 1.7,
        borderTop: `1px solid ${T.border}`, paddingTop: 16,
      }}>
        <strong style={{ color: T.textPrimary }}>How signals work:</strong>
        {' '}Cash rate = entries that paid out / total entries.
        {' '}<span style={{ color: T.gold }}>Keep</span>{' '}≥17% · <span style={{ color: '#D97706' }}>Watch</span>{' '}10–17% · <span style={{ color: T.rust }}>Remove</span>{' '}&lt;10%.
        {' '}Needs 30+ entries to fire — fewer is flagged low data.
        {' '}Avg finish percentile is independent of payout: lower is better (1 = 1st place).
        {' '}Sport rows inherit the same thresholds but require 15+ entries.
      </div>
    </div>
  );
}
