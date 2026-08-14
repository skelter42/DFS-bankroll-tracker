import { useMemo } from 'react';
import { T } from '../constants';
import {
  bySport, bySportFormat, byFee, byField, findLeaks, findEdges,
  buildCore, buildTail, buildForm, FIELDS,
  MIN_N, ROI_KEEP, ROI_WATCH, T20, T10, T1, T01,
  fmtNet, fmtRoi, fmtPct, fmtFee,
} from '../lib/engine';
import type { Slice, Signal } from '../lib/engine';
import type { Entry } from '../types';

const SIG: Record<Signal, { c: string; bg: string; bd: string; label: string }> = {
  keep:    { c: '#3FC480', bg: 'rgba(63,196,128,0.09)',  bd: 'rgba(63,196,128,0.25)', label: 'Keep'   },
  watch:   { c: '#C9A227', bg: 'rgba(201,162,39,0.09)',  bd: 'rgba(201,162,39,0.26)', label: 'Watch'  },
  remove:  { c: '#CF4C3F', bg: 'rgba(207,76,63,0.09)',   bd: 'rgba(207,76,63,0.26)',  label: 'Cut'    },
  'low-n': { c: '#636D7E', bg: 'rgba(99,109,126,0.07)',  bd: 'rgba(99,109,126,0.20)', label: 'Low n'  },
};

/** Colour a finish rate against the rate a random player would post. */
function edgeColor(actual: number, baseline: number): string {
  const r = actual / baseline;
  if (r >= 1.15) return '#3FC480';
  if (r >= 0.95) return '#C9A227';
  return '#CF4C3F';
}

function Badge({ signal }: { signal: Signal }) {
  const s = SIG[signal];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700,
      background: s.bg, border: `1px solid ${s.bd}`, color: s.c,
      letterSpacing: '0.05em', whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.c }} />
      {s.label.toUpperCase()}
    </span>
  );
}

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap',
      paddingBottom: 9, marginBottom: 14, borderBottom: `1px solid ${T.border}`,
    }}>
      <span className="display" style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>
        {title}
      </span>
      {note && <span style={{ fontSize: 11, color: T.textMuted }}>{note}</span>}
    </div>
  );
}

// ── Leaks: the headline answer to "what do I cut?" ────────

function Leaks({ entries }: { entries: Entry[] }) {
  const leaks = useMemo(() => findLeaks(entries), [entries]);
  if (leaks.length === 0) {
    return (
      <div style={{
        background: SIG.keep.bg, border: `1px solid ${SIG.keep.bd}`,
        borderLeft: `3px solid ${SIG.keep.c}`, borderRadius: '0 8px 8px 0',
        padding: '14px 18px', marginBottom: 28, fontSize: 13, color: T.textMuted, lineHeight: 1.6,
      }}>
        <strong style={{ color: SIG.keep.c }}>No leaks found.</strong>{' '}
        Nothing with {MIN_N}+ entries is below {ROI_WATCH}% ROI. Either you're clean or the
        filter is too narrow to judge.
      </div>
    );
  }

  const bleed = leaks.reduce((s, l) => s + l.net, 0);
  const freed = leaks.reduce((s, l) => s + l.fees, 0);

  return (
    <div style={{
      background: SIG.remove.bg, border: `1px solid ${SIG.remove.bd}`,
      borderLeft: `3px solid ${SIG.remove.c}`, borderRadius: '0 8px 8px 0',
      padding: '16px 18px', marginBottom: 28,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: SIG.remove.c,
        letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4,
      }}>
        Cut list — ranked by dollars lost
      </div>
      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 13, lineHeight: 1.6 }}>
        These {leaks.length} slices cost you <strong style={{ color: T.textPrimary }}>{fmtNet(bleed)}</strong>{' '}
        on <strong style={{ color: T.textPrimary }}>${freed.toFixed(0)}</strong> of entry fees.
        Cutting them frees that bankroll for the formats below.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {leaks.map((l, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '9px 0',
            borderTop: i > 0 ? `1px solid ${T.border}` : 'none',
          }}>
            <span style={{
              width: 18, fontSize: 11, color: SIG.remove.c,
              fontWeight: 700, flexShrink: 0,
            }}>
              {i + 1}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, flex: 1, minWidth: 130 }}>
              {l.label}
            </span>
            <span className="mono" style={{
              fontSize: 13, fontWeight: 700, color: SIG.remove.c,
              fontVariantNumeric: 'tabular-nums', width: 62, textAlign: 'right', flexShrink: 0,
            }}>
              {fmtNet(l.net)}
            </span>
            <span className="mono" style={{
              fontSize: 11, color: T.textMuted, width: 96, textAlign: 'right',
              flexShrink: 0, fontVariantNumeric: 'tabular-nums',
            }}>
              {fmtRoi(l.roi)} · {l.n.toLocaleString()}n
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Core vs rest: the counterfactual ──────────────────────

function CoreSplit({ entries }: { entries: Entry[] }) {
  const p = useMemo(() => buildCore(entries), [entries]);
  if (!p.hasCore) return null;

  const excl = [
    ...p.excludeFees.map(fmtFee),
    ...p.excludeFields.map(k => FIELDS.find(f => f.key === k)?.label ?? k),
  ];

  const Col = ({ label, stats, good }: { label: string; stats: typeof p.core; good: boolean }) => {
    const c = good ? SIG.keep.c : SIG.remove.c;
    return (
      <div style={{
        flex: 1, minWidth: 150, padding: '13px 15px',
        background: good ? SIG.keep.bg : SIG.remove.bg,
        border: `1px solid ${good ? SIG.keep.bd : SIG.remove.bd}`,
        borderRadius: 7,
      }}>
        <div style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.textMuted, marginBottom: 7 }}>
          {label}
        </div>
        <div className="mono" style={{ fontSize: 23, fontWeight: 700, color: c, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {fmtNet(stats.net)}
        </div>
        <div className="mono" style={{ fontSize: 12, color: c, marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>
          {fmtRoi(stats.roi)} ROI
        </div>
        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>
          {stats.n.toLocaleString()} entries
        </div>
      </div>
    );
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <SectionHead title="Your edge, isolated" note={`Core is ${fmtPct(p.coverage, 0)} of your volume`} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 11 }}>
        <Col label="Core format" stats={p.core} good />
        <Col label="Everything else" stats={p.rest} good={false} />
      </div>
      <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.65 }}>
        <strong style={{ color: T.textPrimary }}>Core</strong> = {p.combos.join(' · ')}
        {excl.length > 0 && <>, skipping {excl.join(' and ')}</>}.
        {p.rest.net < 0 && (
          <> Everything outside it gave back <strong style={{ color: SIG.remove.c }}>{fmtNet(-p.rest.net)}</strong> of
          what the core earned.</>
        )}
      </div>
    </div>
  );
}

// ── Tail report: where the money actually is ──────────────

function Tail({ entries }: { entries: Entry[] }) {
  const t = useMemo(() => buildTail(entries), [entries]);
  if (t.overall.n < MIN_N) return null;

  const tiers = [
    { label: 'Top 20%', actual: t.overall.top20, base: T20, edge: t.edge20 },
    { label: 'Top 10%', actual: t.overall.top10, base: T10, edge: t.edge10 },
    { label: 'Top 1%',  actual: t.overall.top1,  base: T1,  edge: t.edge1  },
    { label: 'Top 0.1%',actual: t.overall.top01, base: T01, edge: t.edge01 },
  ];

  return (
    <div style={{ marginBottom: 32 }}>
      <SectionHead title="Finish rates vs. a random player" note="1.00x = coin flip. Above = real edge." />

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 9, marginBottom: 13,
      }}>
        {tiers.map(({ label, actual, base, edge }) => (
          <div key={label} style={{
            background: T.panel, border: `1px solid ${T.border}`,
            borderRadius: 7, padding: '13px 14px',
          }}>
            <div className="mono" style={{
              fontSize: 19, fontWeight: 700, color: edgeColor(actual, base),
              fontVariantNumeric: 'tabular-nums', lineHeight: 1,
            }}>
              {fmtPct(actual, actual < 0.02 ? 2 : 1)}
            </div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4, letterSpacing: '0.04em' }}>
              {label}
            </div>
            <div className="mono" style={{
              fontSize: 11, marginTop: 5, color: edgeColor(actual, base),
              fontVariantNumeric: 'tabular-nums',
            }}>
              {edge.toFixed(2)}x baseline
            </div>
          </div>
        ))}
      </div>

      {t.valueTop01 > 0 && t.tailRatio > 1 && (
        <div style={{
          background: 'rgba(201,162,39,0.06)', border: `1px solid ${SIG.watch.bd}`,
          borderLeft: `3px solid ${SIG.watch.c}`, borderRadius: '0 7px 7px 0',
          padding: '13px 16px', fontSize: 12, color: T.textMuted, lineHeight: 1.7,
        }}>
          <strong style={{ color: SIG.watch.c }}>The tail is the whole game. </strong>
          One top-0.1% finish is worth{' '}
          <strong style={{ color: T.textPrimary }}>${t.valueTop01.toFixed(2)}</strong> on average —
          about <strong style={{ color: T.textPrimary }}>{t.tailRatio.toFixed(0)}x</strong> a
          top-1% finish (${t.valueTop1.toFixed(2)}). Those top-0.1% finishes are{' '}
          {fmtPct(t.overall.top01, 2)} of your entries but{' '}
          <strong style={{ color: T.textPrimary }}>{fmtPct(t.shareTop01, 0)}</strong> of your winnings.
        </div>
      )}
    </div>
  );
}

// ── Generic slice table ───────────────────────────────────

function SliceTable({ title, note, slices, showTail = false }: {
  title: string; note?: string; slices: Slice[]; showTail?: boolean;
}) {
  const rows = slices.filter(s => s.n >= 30);
  if (rows.length === 0) return null;

  return (
    <div style={{ marginBottom: 32 }}>
      <SectionHead title={title} note={note} />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['', 'Entries', 'ROI', 'Net', ...(showTail ? ['Top 1%', 'Top 0.1%'] : ['Cash', 'Top 1%']), ''].map((h, i) => (
                <th key={i} style={{
                  padding: '7px 9px', textAlign: i === 0 ? 'left' : 'right',
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                  color: T.textMuted, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(s => {
              const sig = SIG[s.signal];
              return (
                <tr key={s.key}>
                  <td style={{ padding: '9px', borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 600, color: T.textPrimary }}>{s.label}</span>
                  </td>
                  <td className="mono" style={{ padding: '9px', textAlign: 'right', borderBottom: `1px solid ${T.border}`, color: T.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                    {s.n.toLocaleString()}
                  </td>
                  <td className="mono" style={{ padding: '9px', textAlign: 'right', borderBottom: `1px solid ${T.border}`, color: s.signal === 'low-n' ? T.textMuted : sig.c, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtRoi(s.roi)}
                  </td>
                  <td className="mono" style={{ padding: '9px', textAlign: 'right', borderBottom: `1px solid ${T.border}`, color: s.net >= 0 ? T.gold : T.rust, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNet(s.net)}
                  </td>
                  {showTail ? (
                    <>
                      <td className="mono" style={{ padding: '9px', textAlign: 'right', borderBottom: `1px solid ${T.border}`, color: edgeColor(s.top1, T1), fontVariantNumeric: 'tabular-nums' }}>
                        {fmtPct(s.top1, 2)}
                      </td>
                      <td className="mono" style={{ padding: '9px', textAlign: 'right', borderBottom: `1px solid ${T.border}`, color: edgeColor(s.top01, T01), fontVariantNumeric: 'tabular-nums' }}>
                        {fmtPct(s.top01, 3)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="mono" style={{ padding: '9px', textAlign: 'right', borderBottom: `1px solid ${T.border}`, color: T.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtPct(s.cashRate)}
                      </td>
                      <td className="mono" style={{ padding: '9px', textAlign: 'right', borderBottom: `1px solid ${T.border}`, color: edgeColor(s.top1, T1), fontVariantNumeric: 'tabular-nums' }}>
                        {fmtPct(s.top1, 2)}
                      </td>
                    </>
                  )}
                  <td style={{ padding: '9px', textAlign: 'right', borderBottom: `1px solid ${T.border}` }}>
                    <Badge signal={s.signal} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Recent form ───────────────────────────────────────────

function Form({ entries }: { entries: Entry[] }) {
  const rows = useMemo(() => buildForm(entries), [entries]);
  const cooling = rows.filter(r => r.cooling);
  if (cooling.length === 0) return null;

  return (
    <div style={{ marginBottom: 32 }}>
      <SectionHead title="Cooling off" note="Last 90 days vs. lifetime" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {cooling.map(r => (
          <div key={r.sport} style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '10px 13px', background: T.panel,
            border: `1px solid ${T.border}`, borderLeft: `2px solid ${SIG.remove.c}`,
            borderRadius: 5,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, flex: 1, minWidth: 70 }}>
              {r.sport}
            </span>
            <span className="mono" style={{ fontSize: 12, color: SIG.remove.c, fontVariantNumeric: 'tabular-nums' }}>
              {fmtRoi(r.recentRoi)} now
            </span>
            <span style={{ fontSize: 11, color: T.textMuted }}>vs</span>
            <span className="mono" style={{ fontSize: 12, color: r.lifeRoi >= 0 ? T.gold : T.textMuted, fontVariantNumeric: 'tabular-nums' }}>
              {fmtRoi(r.lifeRoi)} lifetime
            </span>
            <span className="mono" style={{ fontSize: 11, color: T.textMuted, fontVariantNumeric: 'tabular-nums' }}>
              {r.recentN.toLocaleString()}n
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DashboardSection ──────────────────────────────────────

export function DashboardSection({ filtered }: { filtered: Entry[] }) {
  const sports  = useMemo(() => bySport(filtered),       [filtered]);
  const formats = useMemo(() => bySportFormat(filtered), [filtered]);
  const fees    = useMemo(() => byFee(filtered),         [filtered]);
  const fields  = useMemo(() => byField(filtered),       [filtered]);
  const edges   = useMemo(() => findEdges(filtered),     [filtered]);

  if (filtered.length === 0) {
    return (
      <div style={{ color: T.textMuted, fontSize: 14, padding: '32px 0', textAlign: 'center' }}>
        No entries match the current filters.
      </div>
    );
  }

  return (
    <div>
      <Leaks entries={filtered} />

      {edges.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionHead title="Press these" note={`${ROI_KEEP}%+ ROI with ${MIN_N}+ entries`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {edges.map(s => (
              <div key={s.key} style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: '10px 13px', background: SIG.keep.bg,
                border: `1px solid ${SIG.keep.bd}`, borderLeft: `2px solid ${SIG.keep.c}`,
                borderRadius: 5,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, flex: 1, minWidth: 110 }}>
                  {s.label}
                </span>
                <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: SIG.keep.c, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtRoi(s.roi)}
                </span>
                <span className="mono" style={{ fontSize: 12, color: T.gold, width: 58, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtNet(s.net)}
                </span>
                <span className="mono" style={{ fontSize: 11, color: T.textMuted, width: 54, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {s.n.toLocaleString()}n
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <CoreSplit entries={filtered} />
      <Tail entries={filtered} />
      <Form entries={filtered} />

      <SliceTable title="By sport"          slices={sports}  showTail />
      <SliceTable title="By sport & format" slices={formats} note="Classic and Showdown are different games" showTail />
      <SliceTable title="By entry fee"      slices={fees} />
      <SliceTable title="By field size"     slices={fields} note="Tail ceiling rises with field size" showTail />

      <div style={{
        marginTop: 22, fontSize: 11.5, color: T.textMuted, lineHeight: 1.85,
        borderTop: `1px solid ${T.border}`, paddingTop: 14,
      }}>
        <strong style={{ color: T.textPrimary }}>How signals work: </strong>
        <span style={{ color: SIG.keep.c }}>Keep</span> ≥{ROI_KEEP}% ROI ·{' '}
        <span style={{ color: SIG.watch.c }}>Watch</span> {ROI_WATCH}% to {ROI_KEEP}% ·{' '}
        <span style={{ color: SIG.remove.c }}>Cut</span> below {ROI_WATCH}% — needs {MIN_N}+ entries.
        {' '}Signals are ROI-based, not cash-rate-based: in GPP play cash rate barely moves between
        winning and losing formats, while ROI separates them cleanly.
      </div>
    </div>
  );
}
