import { useState, useRef, useEffect } from 'react';
import { T } from '../constants';
import {
  bySport, bySportFormat, byFee, byField, findLeaks, findEdges,
  buildCore, buildTail, buildForm, calc,
  MIN_N, ROI_KEEP, ROI_WATCH, T1, T01,
  fmtNet, fmtRoi, fmtPct, fmtFee, fmtMoney,
} from '../lib/engine';
import type { Entry } from '../types';

interface Message { role: 'user' | 'assistant'; content: string; }

const STARTERS = [
  'What should I cut?',
  'Where is my edge?',
  'Top 1% or top 0.1%?',
  'How should I size my bankroll?',
  'What field size should I play?',
];

// ═══════════════════════════════════════════════════════════
//  Answer engine
//
//  Every answer is computed from the loaded entries. Strategy
//  claims are stated only where this player's own numbers back
//  them up, so nothing here is generic advice.
// ═══════════════════════════════════════════════════════════

type Answer = string;

function needMore(n: number): Answer {
  return `Only ${n} entries in the current filter — I need about ${MIN_N} in a slice before ROI means anything. Widen the date range or clear a filter.`;
}

// ── What should I cut? ────────────────────────────────────

function answerCut(es: Entry[]): Answer {
  const leaks = findLeaks(es, 10);
  if (leaks.length === 0) {
    const watch = bySportFormat(es).filter(s => s.signal === 'watch').sort((a, b) => a.roi - b.roi);
    if (watch.length === 0) {
      return `Nothing to cut. Every slice with ${MIN_N}+ entries is at or above ${ROI_KEEP}% ROI.`;
    }
    return [
      `No hard cuts — nothing with ${MIN_N}+ entries is below ${ROI_WATCH}% ROI.`,
      ``,
      `Closest to the line:`,
      ...watch.slice(0, 5).map(s => `  ${s.label} — ${fmtRoi(s.roi)} ROI, ${fmtNet(s.net)} on ${s.n.toLocaleString()} entries`),
      ``,
      `Watch these. If any drops below ${ROI_WATCH}% it moves to the cut list.`,
    ].join('\n');
  }

  const bleed = leaks.reduce((s, l) => s + l.net, 0);
  const freed = leaks.reduce((s, l) => s + l.fees, 0);

  const lines = [
    `Cut these ${leaks.length}, worst first. Together they cost you ${fmtNet(bleed)} on $${Math.round(freed).toLocaleString()} of fees.`,
    ``,
  ];
  leaks.forEach((l, i) => {
    lines.push(`${i + 1}. ${l.label}`);
    lines.push(`   ${fmtNet(l.net)} · ${fmtRoi(l.roi)} ROI · ${l.n.toLocaleString()} entries`);
  });

  const core = buildCore(es);
  if (core.hasCore && core.core.net > 0) {
    lines.push(``);
    lines.push(`That freed $${Math.round(freed).toLocaleString()} belongs in your core: ${core.combos.join(' + ')} at ${fmtRoi(core.core.roi)} ROI.`);
  }
  return lines.join('\n');
}

// ── Where is my edge? ─────────────────────────────────────

function answerEdge(es: Entry[]): Answer {
  const edges = findEdges(es, 8);
  const core  = buildCore(es);
  const tail  = buildTail(es);

  if (edges.length === 0 && !core.hasCore) {
    return `No slice with ${MIN_N}+ entries is above ${ROI_KEEP}% ROI in this filter. Either the sample is too thin or you don't yet have a provable edge here.`;
  }

  const lines: string[] = [];

  if (edges.length > 0) {
    lines.push(`Where you're actually making money:`);
    lines.push(``);
    edges.forEach(s => {
      lines.push(`  ${s.label} — ${fmtRoi(s.roi)} ROI · ${fmtNet(s.net)} · ${s.n.toLocaleString()} entries`);
    });
  }

  if (core.hasCore) {
    lines.push(``);
    lines.push(`Isolated, your core runs ${fmtRoi(core.core.roi)} ROI (${fmtNet(core.core.net)}) — that's ${core.combos.join(' + ')}${core.excludeFees.length ? `, skipping ${core.excludeFees.map(fmtFee).join(' and ')}` : ''}.`);
    if (core.rest.net < 0) {
      lines.push(`Everything outside it gave back ${fmtMoney(core.rest.net)} of that.`);
    }
  }

  if (tail.edge1 > 1.05) {
    lines.push(``);
    lines.push(`Your top-1% rate is ${tail.edge1.toFixed(2)}x a random player and your top-0.1% rate is ${tail.edge01.toFixed(2)}x.`);
    lines.push(tail.edge01 > tail.edge1
      ? `The tail edge is the bigger one — your leverage is landing. Build for the spike.`
      : `Your edge is flat across tiers, meaning you're not yet building leveraged enough to spike the very top.`);
  }

  return lines.join('\n');
}

// ── Top 1% vs top 0.1% ────────────────────────────────────

function answerTailTarget(es: Entry[]): Answer {
  const t = buildTail(es);
  if (t.overall.n < MIN_N) return needMore(t.overall.n);

  const t01 = es.filter(e => e.pct <= T01);
  if (t01.length === 0) {
    return [
      `You have no top-0.1% finishes in this filter, so I can't price the tail from your own data yet.`,
      ``,
      `Structurally: a top-0.1% finish pays roughly 100x your entry while a top-1% finish pays closer to 10x. That gap is why the tail is the target. But you also can't finish top-0.1% in a field under about 1,000 entries — the tier rounds to first place. Check your field sizes first.`,
    ].join('\n');
  }

  const lines = [
    `Build for 0.1%. Measure with 1%. Here's why, from your data:`,
    ``,
    `THE PAYOUT GAP`,
    `  One top-0.1% finish: $${t.valueTop01.toFixed(2)} average`,
    `  One top-1% finish:   $${t.valueTop1.toFixed(2)} average`,
  ];
  if (t.tailRatio > 1) {
    lines.push(`  One top-0.1% is worth ${t.tailRatio.toFixed(0)} top-1% finishes.`);
  }
  lines.push(``);
  lines.push(`WHERE YOUR MONEY CAME FROM`);
  lines.push(`  Top 0.1% — ${fmtPct(t.overall.top01, 2)} of entries → ${fmtPct(t.shareTop01, 0)} of winnings`);
  lines.push(`  Top 1%   — ${fmtPct(t.overall.top1, 2)} of entries → ${fmtPct(t.shareTop1, 0)} of winnings`);
  lines.push(`  Top 10%  — ${fmtPct(t.overall.top10, 1)} of entries → ${fmtPct(t.shareTop10, 0)} of winnings`);
  lines.push(``);
  lines.push(`The payout curve is exponential, so the top sliver carries a wildly outsized share of the money.`);
  lines.push(``);
  lines.push(`THE CATCH`);
  lines.push(`You can't aim at 0.1% instead of 1% — it's the same distribution's tail. What changes is the leverage dial: more correlation, more low-owned plays. Turning it up moves probability out of "safe 5% finish" and into "either 0.1% or nothing."`);
  lines.push(``);
  lines.push(`WHY MEASURE WITH 1%`);
  const n1 = es.filter(e => e.pct <= T1).length;
  lines.push(`You have ${n1.toLocaleString()} top-1% finishes vs ${t01.length.toLocaleString()} top-0.1%. The 1% rate has enough sample to actually track month to month; the 0.1% rate is too noisy to steer by. So: build for the spike, grade yourself on the 1% rate, treat 0.1% hits as the payoff.`);

  // Field-size ceiling — a real constraint on tail chasing.
  const fields = byField(es).filter(s => s.n >= 30);
  const capped = fields.filter(s => s.top01 === 0 && s.n >= MIN_N);
  if (capped.length > 0) {
    lines.push(``);
    lines.push(`ONE CONSTRAINT`);
    lines.push(`You have zero top-0.1% finishes in ${capped.map(s => s.label).join(' and ')}. In small fields that tier rounds to first place, so tail-chasing there is close to impossible. Chase the tail where the field is big enough to have one.`);
  }

  // Where to actually chase it: needs both a reachable tail and positive ROI.
  const viable = fields.filter(s => s.top01 > 0 && s.roi >= ROI_WATCH)
    .sort((a, b) => b.roi - a.roi);
  if (viable.length > 0) {
    const best = viable[0];
    lines.push(``);
    lines.push(`WHERE TO CHASE IT`);
    lines.push(`${best.label} — ${fmtRoi(best.roi)} ROI with a top-0.1% rate of ${fmtPct(best.top01, 3)}. That's the best combination of a reachable tail and a field you actually beat. Not simply the largest field: the biggest ones hold the most tail upside and the most competition at the same time.`);
  }

  return lines.join('\n');
}

// ── Bankroll ──────────────────────────────────────────────

function answerBankroll(es: Entry[]): Answer {
  const core  = buildCore(es);
  const leaks = findLeaks(es, 6);
  const edges = findEdges(es, 5);
  const all   = calc(es);
  if (all.n < MIN_N) return needMore(all.n);

  const lines: string[] = [];

  if (leaks.length > 0) {
    const freed = leaks.reduce((s, l) => s + l.fees, 0);
    lines.push(`STOP SPENDING HERE — frees $${Math.round(freed).toLocaleString()}`);
    leaks.slice(0, 5).forEach(l => lines.push(`  ${l.label} (${fmtRoi(l.roi)} ROI)`));
    lines.push(``);
  }

  if (edges.length > 0) {
    const tot = edges.reduce((s, e) => s + e.fees, 0);
    lines.push(`PUT IT HERE INSTEAD`);
    edges.forEach(s => {
      const share = tot > 0 ? (s.fees / tot) * 100 : 0;
      lines.push(`  ${s.label} — ${fmtRoi(s.roi)} ROI · currently ${share.toFixed(0)}% of your winning-slice spend`);
    });
    lines.push(``);
  }

  if (core.hasCore) {
    lines.push(`SIZING`);
    lines.push(`Your core runs ${fmtRoi(core.core.roi)} ROI but only ${fmtPct(core.coverage, 0)} of your volume sits in it. That ratio is the single biggest lever you have — every point of volume you move from the rest into the core compounds.`);
    lines.push(``);
  }

  lines.push(`VARIANCE`);
  const t = buildTail(es);
  if (t.shareTop01 > 0.10) {
    const gap = Math.round(1 / Math.max(t.overall.top01, 1e-9));
    lines.push(`${fmtPct(t.shareTop01, 0)} of your winnings come from top-0.1% finishes, and those land roughly every ${gap.toLocaleString()} entries. Long dry stretches are therefore structural, not a sign anything is broken. Size each slate so a drought that long never threatens the roll — if a full gap between hits would bust you, the slate is too big.`);
  } else {
    lines.push(`Your winnings aren't heavily tail-dependent yet, so variance is moderate. As you push for bigger scores expect the swings to widen.`);
  }

  const form = buildForm(es).filter(r => r.cooling);
  if (form.length > 0) {
    lines.push(``);
    lines.push(`RIGHT NOW`);
    lines.push(`${form.map(r => r.sport).join(', ')} ${form.length === 1 ? 'is' : 'are'} running below lifetime ROI over the last 90 days. Reduce there until form recovers — bankroll preserved in a cold stretch is bankroll available when your best sport comes back in season.`);
  }

  return lines.join('\n');
}

// ── Field size ────────────────────────────────────────────

function answerField(es: Entry[]): Answer {
  const fields = byField(es).filter(s => s.n >= 30);
  if (fields.length === 0) return needMore(es.length);

  const lines = [`Field size, by your own results:`, ``];
  fields.forEach(s => {
    const flag = s.top01 === 0 && s.n >= MIN_N ? '  ← no reachable tail'
               : s.signal === 'keep'           ? '  ← profitable'
               : s.signal === 'remove'         ? '  ← losing'
               : '';
    lines.push(`  ${s.label.padEnd(16)} ${fmtRoi(s.roi).padStart(7)} ROI · ${fmtNet(s.net).padStart(7)} · top-0.1% ${fmtPct(s.top01, 3)}${flag}`);
  });

  // A field with no reachable tail can post fine ROI and still be the wrong
  // home for a GPP roll — you can't win big where big doesn't pay out.
  const withTail = fields.filter(s => s.top01 > 0);
  const capped   = fields.filter(s => s.top01 === 0 && s.n >= MIN_N);
  const best     = withTail.filter(s => s.roi >= ROI_KEEP).sort((a, b) => b.roi - a.roi)[0]
                ?? withTail.sort((a, b) => b.roi - a.roi)[0];
  const worst    = fields.filter(s => s.signal === 'remove').sort((a, b) => a.roi - b.roi)[0];

  lines.push(``);
  if (best) {
    lines.push(`Play ${best.label} — ${fmtRoi(best.roi)} ROI on ${best.n.toLocaleString()} entries, with a top-0.1% rate of ${fmtPct(best.top01, 3)}. Best mix of a field you beat and a tail you can actually reach.`);
  }
  if (worst) {
    lines.push(`Avoid ${worst.label} — ${fmtRoi(worst.roi)} ROI, ${fmtNet(worst.net)}.`);
  }

  if (capped.length > 0) {
    const c = capped.sort((a, b) => b.roi - a.roi)[0];
    lines.push(``);
    lines.push(`Note on ${c.label}: ${fmtRoi(c.roi)} ROI looks fine, but you have zero top-0.1% finishes there — in a field that small the tier rounds to first place. It's a grind-it-out spot, not somewhere a big score can come from.`);
  }

  const tailiest = [...fields].sort((a, b) => b.top01 - a.top01)[0];
  if (tailiest && best && tailiest.key !== best.key && tailiest.top01 > best.top01) {
    lines.push(``);
    lines.push(`${tailiest.label} gives your highest top-0.1% rate (${fmtPct(tailiest.top01, 3)}) but ${fmtRoi(tailiest.roi)} ROI. Bigger fields carry more tail upside and more competition at once — a high tail rate alone isn't a reason to move there.`);
  }

  return lines.join('\n');
}

// ── Format ────────────────────────────────────────────────

function answerFormat(es: Entry[]): Answer {
  const formats = bySportFormat(es).filter(s => s.n >= 30);
  if (formats.length === 0) return needMore(es.length);

  const keep   = formats.filter(s => s.signal === 'keep').sort((a, b) => b.roi - a.roi);
  const cut    = formats.filter(s => s.signal === 'remove').sort((a, b) => a.net - b.net);
  const watch  = formats.filter(s => s.signal === 'watch').sort((a, b) => b.roi - a.roi);

  const lines: string[] = [];
  if (keep.length) {
    lines.push(`KEEP`);
    keep.forEach(s => lines.push(`  ${s.label} — ${fmtRoi(s.roi)} ROI · ${fmtNet(s.net)} · ${s.n.toLocaleString()}n`));
  }
  if (watch.length) {
    lines.push(``, `WATCH`);
    watch.slice(0, 5).forEach(s => lines.push(`  ${s.label} — ${fmtRoi(s.roi)} ROI · ${fmtNet(s.net)}`));
  }
  if (cut.length) {
    lines.push(``, `CUT`);
    cut.forEach(s => lines.push(`  ${s.label} — ${fmtRoi(s.roi)} ROI · ${fmtNet(s.net)}`));
  }

  // Same sport, different format — the clearest apples-to-apples signal.
  const bySportName = new Map<string, typeof formats>();
  for (const f of formats) {
    const sport = f.label.split(' ')[0];
    const arr = bySportName.get(sport) ?? [];
    arr.push(f);
    bySportName.set(sport, arr);
  }
  const splits: string[] = [];
  for (const [sport, fs] of bySportName) {
    if (fs.length < 2) continue;
    const sorted = [...fs].sort((a, b) => b.roi - a.roi);
    const hi = sorted[0], lo = sorted[sorted.length - 1];
    if (hi.roi - lo.roi >= 10) {
      splits.push(`  ${sport}: ${hi.label.replace(sport, '').trim()} ${fmtRoi(hi.roi)} vs ${lo.label.replace(sport, '').trim()} ${fmtRoi(lo.roi)}`);
    }
  }
  if (splits.length) {
    lines.push(``, `SAME SPORT, DIFFERENT GAME`);
    lines.push(...splits);
    lines.push(``);
    lines.push(`These are separate skills. Roster construction wins Classic; game-script reading wins Showdown. Edge in one doesn't carry to the other.`);
  }

  return lines.join('\n');
}

// ── Fees ──────────────────────────────────────────────────

function answerFee(es: Entry[]): Answer {
  const fees = byFee(es).filter(s => s.n >= 30)
    .sort((a, b) => parseFloat(a.key) - parseFloat(b.key));
  if (fees.length === 0) return needMore(es.length);

  const lines = [`Entry fee, by your results:`, ``];
  fees.forEach(s => {
    const flag = s.signal === 'keep' ? '  ← works' : s.signal === 'remove' ? '  ← leaking' : '';
    lines.push(`  ${s.label.padEnd(16)} ${fmtRoi(s.roi).padStart(7)} ROI · ${fmtNet(s.net).padStart(7)} · ${s.n.toLocaleString()}n${flag}`);
  });

  // An isolated bad tier surrounded by good ones is a real, fixable leak.
  const bad = fees.filter(s => s.signal === 'remove');
  for (const b of bad) {
    const i = fees.indexOf(b);
    const lo = fees[i - 1], hi = fees[i + 1];
    if (lo && hi && lo.roi > ROI_KEEP && hi.roi > ROI_KEEP) {
      lines.push(``);
      lines.push(`${b.label} is an island: ${lo.label} makes money and ${hi.label} makes money, but ${b.label} loses ${fmtNet(-b.net)}. That's not variance — something about that tier's fields or payout curve doesn't suit you. Skip it and split the volume to either side.`);
    }
  }

  const best = fees.filter(s => s.signal === 'keep').sort((a, b) => b.net - a.net)[0];
  if (best) {
    lines.push(``);
    lines.push(`Most profitable tier: ${best.label} at ${fmtRoi(best.roi)} ROI, ${fmtNet(best.net)}.`);
  }
  return lines.join('\n');
}

// ── Overview ──────────────────────────────────────────────

function answerOverview(es: Entry[]): Answer {
  const all  = calc(es);
  const t    = buildTail(es);
  const core = buildCore(es);
  const leaks = findLeaks(es, 3);

  const lines = [
    `${all.n.toLocaleString()} entries · ${fmtNet(all.net)} · ${fmtRoi(all.roi)} ROI · ${fmtPct(all.cashRate)} cash`,
    ``,
  ];
  if (core.hasCore) {
    lines.push(`Core (${core.combos.join(' + ')}): ${fmtRoi(core.core.roi)} ROI, ${fmtNet(core.core.net)}`);
    lines.push(`Everything else: ${fmtRoi(core.rest.roi)} ROI, ${fmtNet(core.rest.net)}`);
    lines.push(``);
  }
  if (all.n >= MIN_N) {
    lines.push(`Finish rates vs random: top-1% ${t.edge1.toFixed(2)}x · top-0.1% ${t.edge01.toFixed(2)}x`);
    lines.push(``);
  }
  if (leaks.length) {
    lines.push(`Biggest leaks: ${leaks.map(l => `${l.label} (${fmtNet(l.net)})`).join(', ')}`);
    lines.push(``);
  }
  lines.push(`Ask me: what to cut · where your edge is · top 1% or 0.1% · bankroll sizing · field size · format · entry fee`);
  return lines.join('\n');
}

// ── Router ────────────────────────────────────────────────

function analyze(q: string, es: Entry[]): Answer {
  if (es.length === 0) return 'No entries match the current filter. Widen the date range or clear a filter.';
  const s = q.toLowerCase();

  const has = (...w: string[]) => w.some(x => s.includes(x));

  // Tail-target question first — it shares vocabulary with several others.
  if (has('0.1', '.1%', 'top 1', 'top1', 'tail', 'spike', 'one percent', 'ceiling', 'upside'))
    return answerTailTarget(es);
  if (has('cut', 'remove', 'drop', 'stop', 'quit', 'leak', 'losing', 'bleed'))
    return answerCut(es);
  if (has('edge', 'best', 'good at', 'strong', 'winning', 'profitable', 'working'))
    return answerEdge(es);
  if (has('field', 'entrants', 'contest size', 'gpp size'))
    return answerField(es);
  if (has('bankroll', 'allocat', 'sizing', 'spend', 'budget', 'stake', 'variance', 'how much'))
    return answerBankroll(es);
  if (has('fee', 'price', 'buy-in', 'buyin', 'stake level', 'dollar', 'cent'))
    return answerFee(es);
  if (has('format', 'classic', 'showdown', 'captain', 'contest type', 'game type'))
    return answerFormat(es);
  if (has('sport', 'nfl', 'nba', 'mlb', 'nhl', 'golf'))
    return answerEdge(es);

  return answerOverview(es);
}

// ═══════════════════════════════════════════════════════════
//  Component
// ═══════════════════════════════════════════════════════════

export function DFSAgent({ filtered }: { filtered: Entry[]; dateFilter?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (messages.length > 0) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  const send = (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg) return;
    setInput('');
    setMessages(prev => [
      ...prev,
      { role: 'user',      content: msg },
      { role: 'assistant', content: analyze(msg, filtered) },
    ]);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div style={{
      marginTop: 36, background: T.panel,
      border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, padding: '13px 18px',
        background: 'rgba(0,0,0,0.18)', borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <span style={{ fontSize: 15, color: T.gold }}>✦</span>
          <span className="display" style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary }}>
            DFS Analyst
          </span>
          {filtered.length > 0 && (
            <span style={{ fontSize: 11, color: T.textMuted, whiteSpace: 'nowrap' }}>
              · {filtered.length.toLocaleString()} entries
            </span>
          )}
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            style={{
              background: 'none', border: 'none', color: T.textMuted,
              fontSize: 12, cursor: 'pointer', padding: '4px 8px', fontFamily: 'inherit',
            }}
          >
            Clear
          </button>
        )}
      </div>

      {messages.length === 0 && (
        <div style={{ padding: '15px 18px 3px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STARTERS.map(s => (
            <button
              key={s}
              onClick={() => send(s)}
              style={{
                background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`,
                borderRadius: 20, color: T.textMuted, fontSize: 12,
                padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit',
                transition: 'background 120ms, color 120ms',
              }}
              onMouseEnter={e => { const b = e.currentTarget; b.style.background = 'rgba(255,255,255,0.09)'; b.style.color = T.textPrimary; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.background = 'rgba(255,255,255,0.04)'; b.style.color = T.textMuted; }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div style={{
        maxHeight: 520, overflowY: 'auto', padding: '16px 18px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div
              className={m.role === 'assistant' ? 'mono' : undefined}
              style={{
                maxWidth: m.role === 'user' ? '84%' : '100%',
                padding: m.role === 'user' ? '10px 14px' : '13px 15px',
                borderRadius: m.role === 'user' ? '14px 14px 3px 14px' : '10px',
                background: m.role === 'user' ? 'rgba(201,162,39,0.13)' : 'rgba(255,255,255,0.035)',
                border: `1px solid ${m.role === 'user' ? 'rgba(201,162,39,0.22)' : T.border}`,
                fontSize: m.role === 'user' ? 13 : 12.5,
                lineHeight: m.role === 'user' ? 1.6 : 1.75,
                color: T.textPrimary, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={{
        display: 'flex', gap: 8, padding: '12px 18px',
        borderTop: `1px solid ${T.border}`, background: 'rgba(0,0,0,0.10)',
      }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Ask about cuts, edge, bankroll, field size…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
          style={{
            flex: 1, background: T.bg, border: `1px solid ${T.border}`,
            borderRadius: 7, padding: '10px 14px', fontSize: 13,
            color: T.textPrimary, outline: 'none', fontFamily: 'inherit', minWidth: 0,
          }}
        />
        <button
          onClick={() => send()}
          disabled={!input.trim()}
          style={{
            background: input.trim() ? T.gold : 'rgba(201,162,39,0.18)',
            border: 'none', borderRadius: 7,
            color: input.trim() ? '#0B0E13' : T.textMuted,
            fontSize: 13, fontWeight: 700, padding: '10px 18px',
            cursor: input.trim() ? 'pointer' : 'default',
            fontFamily: 'inherit', transition: 'background 140ms, color 140ms', flexShrink: 0,
          }}
        >
          Ask →
        </button>
      </div>
    </div>
  );
}
