import { useMemo } from 'react';
import { T } from '../constants';
import {
  headline, cutList, playList, unknownList, dimensions, blockBands,
  fmtX, fmtNet, fmtSign, fmtPct, MAX_CI_WIDTH,
} from '../lib/engine';
import type { Slice, Verdict } from '../lib/engine';
import type { Entry } from '../types';

const C: Record<Verdict, string> = {
  play: '#3FC480', cut: '#CF4C3F', watch: '#C9A227', unknown: '#636D7E',
};
const BG: Record<Verdict, string> = {
  play:    'rgba(63,196,128,0.08)',
  cut:     'rgba(207,76,63,0.08)',
  watch:   'rgba(201,162,39,0.08)',
  unknown: 'rgba(99,109,126,0.06)',
};

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', paddingBottom: 8, marginBottom: 12,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <span className="display" style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>{title}</span>
        {note && <span style={{ fontSize: 11, color: T.textMuted }}>{note}</span>}
      </div>
      {children}
    </div>
  );
}

/** Confidence interval drawn against the 1.00x baseline. */
function RateBar({ s }: { s: Slice }) {
  const MAXX = 2.5;
  const pos = (v: number) => `${Math.min(Math.max(v, 0), MAXX) / MAXX * 100}%`;
  const col = C[s.verdict];
  return (
    <div style={{ position: 'relative', height: 16, flex: 1, minWidth: 90 }}>
      <div style={{ position: 'absolute', top: 7, left: 0, right: 0, height: 2, background: 'rgba(255,255,255,0.06)' }} />
      <div style={{
        position: 'absolute', top: 6, height: 4, borderRadius: 2, background: col, opacity: 0.75,
        left: pos(s.lo), width: `calc(${pos(s.hi)} - ${pos(s.lo)})`,
      }} />
      <div style={{ position: 'absolute', top: 3, left: pos(s.rate), width: 2, height: 10, background: col }} />
      {/* the 1.00x baseline */}
      <div style={{ position: 'absolute', top: 1, left: pos(1), width: 1, height: 14, background: 'rgba(255,255,255,0.4)' }} />
    </div>
  );
}

function Row({ s, showNet = true }: { s: Slice; showNet?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '9px 12px', background: BG[s.verdict],
      borderLeft: `2px solid ${C[s.verdict]}`, borderRadius: 4, marginBottom: 3,
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, flex: '1 1 120px', minWidth: 100 }}>
        {s.label}
      </span>
      <RateBar s={s} />
      <span className="mono" style={{
        fontSize: 13, fontWeight: 700, color: C[s.verdict], width: 46,
        textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0,
      }}>
        {fmtX(s.rate)}
      </span>
      <span className="mono" style={{
        fontSize: 10, color: T.textMuted, width: 82, textAlign: 'right',
        flexShrink: 0, fontVariantNumeric: 'tabular-nums',
      }}>
        {fmtX(s.lo)}–{fmtX(s.hi)}
      </span>
      {showNet && (
        <span className="mono" style={{
          fontSize: 11, color: s.net >= 0 ? T.gold : T.rust, width: 54,
          textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums',
        }}>
          {fmtNet(s.net)}
        </span>
      )}
      <span className="mono" style={{ fontSize: 10, color: T.textMuted, width: 48, textAlign: 'right', flexShrink: 0 }}>
        {s.n.toLocaleString()}n
      </span>
    </div>
  );
}

// ── Headline verdict ──────────────────────────────────────

function Headline({ es }: { es: Entry[] }) {
  const h = useMemo(() => headline(es), [es]);
  const v: Verdict = !h.readable ? 'unknown' : h.lo > 1 ? 'play' : h.hi < 1 ? 'cut' : 'watch';
  const msg = !h.readable
    ? `Not enough yet. ${h.needMore.toLocaleString()} more entries before this number means anything.`
    : h.lo > 1 ? 'Beating the field at the top. The process is working.'
    : h.hi < 1 ? 'Finishing below random at the top. Something is wrong upstream of contest choice.'
    : 'Indistinguishable from random. Not broken, not proven.';

  return (
    <div style={{
      background: BG[v], border: `1px solid ${C[v]}44`, borderLeft: `3px solid ${C[v]}`,
      borderRadius: '0 8px 8px 0', padding: '16px 18px', marginBottom: 26,
    }}>
      <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.textMuted, marginBottom: 8 }}>
        Top-1% finish rate vs a random player
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 34, fontWeight: 700, color: C[v], lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {fmtX(h.rate)}
        </span>
        <span className="mono" style={{ fontSize: 13, color: T.textMuted }}>
          95% range {fmtX(h.lo)} – {fmtX(h.hi)}
        </span>
      </div>
      <div style={{ fontSize: 13, color: T.textPrimary, marginBottom: 10, lineHeight: 1.5 }}>{msg}</div>
      <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.7 }}>
        {h.n.toLocaleString()} entries over {h.contests.toLocaleString()} contests ·{' '}
        <strong style={{ color: h.net >= 0 ? T.gold : T.rust }}>{fmtNet(h.net)}</strong> at {fmtSign(h.roi)} ROI ·{' '}
        beating the humans by <strong style={{ color: h.edge >= 0 ? T.gold : T.rust }}>{fmtSign(h.edge)}</strong> before rake
      </div>
    </div>
  );
}

// ── Sections ──────────────────────────────────────────────

function Cuts({ es }: { es: Entry[] }) {
  const list = useMemo(() => cutList(es), [es]);
  if (!list.length) {
    return (
      <Section title="Cut" note="confidently below random at the top">
        <div style={{ fontSize: 13, color: T.textMuted, padding: '10px 12px', background: BG.unknown, borderRadius: 4 }}>
          Nothing is confidently below a random player. That's not the same as everything being fine —
          most slices simply don't have the sample to convict.
        </div>
      </Section>
    );
  }
  const bleed = list.reduce((s, x) => s + x.net, 0);
  const freed = list.reduce((s, x) => s + x.fees, 0);
  return (
    <Section title="Cut" note="confidently below random at the top">
      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10, lineHeight: 1.6 }}>
        These {list.length} finish below a coin-flip player and the interval clears 1.00x.
        Together: <strong style={{ color: T.rust }}>{fmtNet(bleed)}</strong> on{' '}
        <strong style={{ color: T.textPrimary }}>${Math.round(freed).toLocaleString()}</strong> of entry fees.
      </div>
      {list.map(s => <Row key={s.dim + s.key} s={s} />)}
    </Section>
  );
}

function Plays({ es }: { es: Entry[] }) {
  const list = useMemo(() => playList(es), [es]);
  if (!list.length) {
    return (
      <Section title="Play" note="confidently above random at the top">
        <div style={{ fontSize: 13, color: T.textMuted, padding: '10px 12px', background: BG.unknown, borderRadius: 4 }}>
          No slice clears 1.00x with confidence yet. Keep volume in the places that are at least breaking even
          and let the sample build.
        </div>
      </Section>
    );
  }
  return (
    <Section title="Play" note="confidently above random at the top">
      {list.map(s => <Row key={s.dim + s.key} s={s} />)}
    </Section>
  );
}

function Unknown({ es }: { es: Entry[] }) {
  const list = useMemo(() => unknownList(es), [es]);
  if (!list.length) return null;
  return (
    <Section title="Not enough data" note="how many more entries before a call">
      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10, lineHeight: 1.6 }}>
        These have a point estimate but an interval too wide to act on. Closest to readable first.
      </div>
      {list.map(s => (
        <div key={s.dim + s.key} style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '9px 12px', background: BG.unknown, borderLeft: `2px solid ${C.unknown}`,
          borderRadius: 4, marginBottom: 3,
        }}>
          <span style={{ fontSize: 13, color: T.textMuted, flex: '1 1 120px' }}>{s.label}</span>
          <RateBar s={s} />
          <span className="mono" style={{ fontSize: 12, color: T.textMuted, width: 46, textAlign: 'right' }}>
            {fmtX(s.rate)}
          </span>
          <span className="mono" style={{ fontSize: 11, color: T.gold, width: 96, textAlign: 'right', flexShrink: 0 }}>
            +{s.needMore.toLocaleString()} needed
          </span>
        </div>
      ))}
    </Section>
  );
}

function Blocks({ es }: { es: Entry[] }) {
  const b = useMemo(() => blockBands(es), [es]);
  if (b.length < 3) return null;
  return (
    <Section title="Where a slate turns profitable" note="by your best finish in each contest">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>{['best finish', 'contests', 'profitable', 'ROI', 'net'].map((h, i) => (
              <th key={h} style={{
                padding: '6px 9px', textAlign: i === 0 ? 'left' : 'right', fontSize: 9,
                letterSpacing: '0.07em', textTransform: 'uppercase', color: T.textMuted,
                borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {b.map(r => {
              const good = r.roi > 0;
              return (
                <tr key={r.label}>
                  <td style={{ padding: '7px 9px', borderBottom: `1px solid ${T.border}`, color: T.textPrimary, fontWeight: 600 }}>
                    {r.label}
                  </td>
                  <td className="mono" style={{ padding: '7px 9px', textAlign: 'right', borderBottom: `1px solid ${T.border}`, color: T.textMuted }}>
                    {r.blocks.toLocaleString()}
                  </td>
                  <td className="mono" style={{ padding: '7px 9px', textAlign: 'right', borderBottom: `1px solid ${T.border}`, color: T.textMuted }}>
                    {fmtPct(r.profitable, 0)}
                  </td>
                  <td className="mono" style={{ padding: '7px 9px', textAlign: 'right', borderBottom: `1px solid ${T.border}`, color: good ? C.play : C.cut, fontWeight: 700 }}>
                    {fmtSign(r.roi)}
                  </td>
                  <td className="mono" style={{ padding: '7px 9px', textAlign: 'right', borderBottom: `1px solid ${T.border}`, color: r.net >= 0 ? T.gold : T.rust }}>
                    {fmtNet(r.net)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 9, lineHeight: 1.6 }}>
        Read down to where ROI crosses zero — that's the finish you need somewhere in a block
        just to break even. Everything below it is losing volume.
      </div>
    </Section>
  );
}

function Breakdown({ es }: { es: Entry[] }) {
  const d = useMemo(() => dimensions(es), [es]);
  const groups: [string, Slice[]][] = [
    ['By sport', d.sport], ['By sport & format', d.format],
    ['By entry fee', d.fee], ['By field size', d.field], ['By slate size', d.slate],
  ];
  return (
    <>
      {groups.filter(([, g]) => g.length > 1).map(([title, g]) => (
        <Section key={title} title={title}>
          {[...g].sort((a, b) => b.rate - a.rate).map(s => <Row key={s.dim + s.key} s={s} />)}
        </Section>
      ))}
    </>
  );
}

// ── Root ──────────────────────────────────────────────────

export function DashboardSection({ filtered }: { filtered: Entry[] }) {
  if (filtered.length === 0) {
    return (
      <div style={{ color: T.textMuted, fontSize: 14, padding: '32px 0', textAlign: 'center' }}>
        No entries match the current filters.
      </div>
    );
  }
  return (
    <div>
      <Headline es={filtered} />
      <Cuts es={filtered} />
      <Plays es={filtered} />
      <Unknown es={filtered} />
      <Blocks es={filtered} />
      <Breakdown es={filtered} />
      <div style={{
        marginTop: 20, paddingTop: 14, borderTop: `1px solid ${T.border}`,
        fontSize: 11.5, color: T.textMuted, lineHeight: 1.85,
      }}>
        <strong style={{ color: T.textPrimary }}>How to read this. </strong>
        Everything is scored on <strong style={{ color: T.textPrimary }}>top-1% finish rate</strong> as a
        multiple of a random player. 1.00x is a coin flip; the white tick on every bar marks it.
        The coloured band is the 95% range, clustered by contest — entries in one contest share a slate,
        so they aren't independent observations.
        <br />
        ROI is shown but never decided on: across this dataset, deleting a single winning entry moved
        slice ROI by up to 36 points and moved top-1% rate by 0.06. A slice only gets a verdict once its
        range is narrower than {MAX_CI_WIDTH.toFixed(2)}x and clears 1.00x in one direction.
      </div>
    </div>
  );
}
