import { useState, useRef, useEffect } from 'react';
import { T } from '../constants';
import {
  headline, cutList, playList, unknownList, dimensions, blockBands, analyse,
  fmtX, fmtNet, fmtSign, fmtPct, MIN_N,
} from '../lib/engine';
import type { Slice } from '../lib/engine';
import type { Entry } from '../types';

interface Message { role: 'user' | 'assistant'; content: string; }

const STARTERS = ['What do I cut?', 'What should I play?', 'Am I actually good?', 'What needs more data?'];

// ═══════════════════════════════════════════════════════════
//  Answers are computed from the loaded entries. Every claim
//  carries its sample, and anything that can't clear its own
//  confidence interval is reported as unknown rather than
//  dressed up as a finding.
// ═══════════════════════════════════════════════════════════

const row = (s: Slice) =>
  `  ${s.label} — ${fmtX(s.rate)} [${fmtX(s.lo)}–${fmtX(s.hi)}] · ${fmtNet(s.net)} · ${s.n.toLocaleString()}n`;

function answerCut(es: Entry[]): string {
  const list = cutList(es, 8);
  if (!list.length) {
    return [
      `Nothing is confidently below a random player.`,
      ``,
      `That isn't the same as everything being fine — most slices just don't have`,
      `the sample to convict. Ask what needs more data to see which are closest.`,
    ].join('\n');
  }
  const bleed = list.reduce((s, x) => s + x.net, 0);
  const freed = list.reduce((s, x) => s + x.fees, 0);
  return [
    `Cut these ${list.length}. Each finishes below a coin-flip player with the interval clear of 1.00x.`,
    ``,
    ...list.map(row),
    ``,
    `Together: ${fmtNet(bleed)} on $${Math.round(freed).toLocaleString()} of entry fees.`,
  ].join('\n');
}

function answerPlay(es: Entry[]): string {
  const list = playList(es, 8);
  if (!list.length) {
    return [
      `No slice clears 1.00x with confidence yet.`,
      ``,
      `Keep volume where you're at least breaking even and let the sample build.`,
      `A top-1% rate needs roughly 5,000 entries before the interval tightens enough to act on.`,
    ].join('\n');
  }
  return [`Confidently above random at the top:`, ``, ...list.map(row)].join('\n');
}

function answerUnknown(es: Entry[]): string {
  const list = unknownList(es, 8);
  if (!list.length) return `Every slice with ${MIN_N}+ entries has a readable interval.`;
  return [
    `These have a number but the interval is too wide to act on. Closest to readable first:`,
    ``,
    ...list.map(s => `  ${s.label} — ${fmtX(s.rate)} [${fmtX(s.lo)}–${fmtX(s.hi)}] · needs ~${s.needMore.toLocaleString()} more entries`),
  ].join('\n');
}

function answerOverall(es: Entry[]): string {
  const h = headline(es);
  const out = [
    `${h.n.toLocaleString()} entries across ${h.contests.toLocaleString()} contests.`,
    ``,
    `Top-1% rate: ${fmtX(h.rate)}  [95% range ${fmtX(h.lo)}–${fmtX(h.hi)}]`,
  ];
  if (!h.readable) {
    out.push(``, `That range is too wide to conclude anything. About ${h.needMore.toLocaleString()} more entries`,
                 `before it tightens enough to be worth reading.`);
  } else if (h.lo > 1) {
    out.push(``, `Confidently above random. The process works — the question is only where.`);
  } else if (h.hi < 1) {
    out.push(``, `Confidently below random at the top. That's upstream of contest selection.`);
  } else {
    out.push(``, `Indistinguishable from random. Not broken, not proven.`);
  }
  out.push(``,
    `${fmtNet(h.net)} at ${fmtSign(h.roi)} ROI.`,
    `Beating the humans by ${fmtSign(h.edge)} before rake takes its cut.`,
    ``,
    `Note ROI is reported, not decided on: deleting one winning entry can move it tens of points.`);
  return out.join('\n');
}

function answerBlocks(es: Entry[]): string {
  const b = blockBands(es);
  if (b.length < 3) return `Not enough multi-entry contests to build the block table.`;
  const out = [`Where a slate turns profitable, by your best finish in it:`, ``];
  for (const r of b) {
    out.push(`  ${r.label.padEnd(16)} ${r.blocks.toString().padStart(5)} contests · ${fmtPct(r.profitable, 0).padStart(4)} profitable · ${fmtSign(r.roi).padStart(8)}`);
  }
  const flip = b.find(r => r.roi > 0 && b.indexOf(r) > 0);
  if (flip) out.push(``, `Break-even sits around a ${flip.label} finish. Below that you're funding the tail.`);
  return out.join('\n');
}

function answerDim(es: Entry[], which: keyof ReturnType<typeof dimensions>, title: string): string {
  const g = dimensions(es)[which];
  if (!g.length) return `Not enough entries to break out ${title.toLowerCase()}.`;
  return [`${title}, ranked by top-1% rate:`, ``,
          ...[...g].sort((a, b) => b.rate - a.rate).map(row)].join('\n');
}

function analyze(q: string, es: Entry[]): string {
  if (!es.length) return 'No entries match the current filter.';
  const s = q.toLowerCase();
  const has = (...w: string[]) => w.some(x => s.includes(x));

  if (has('cut', 'drop', 'stop', 'quit', 'leak', 'losing', 'bad'))       return answerCut(es);
  if (has('more data', 'unknown', 'sample', 'enough', 'confident'))      return answerUnknown(es);
  if (has('play', 'keep', 'edge', 'good at', 'best', 'winning'))         return answerPlay(es);
  if (has('block', 'break even', 'breakeven', 'profitable', 'need to'))  return answerBlocks(es);
  if (has('sport'))            return answerDim(es, 'sport',  'By sport');
  if (has('format', 'showdown', 'classic'))  return answerDim(es, 'format', 'By sport and format');
  if (has('fee', 'stake', 'price', 'dollar', 'dime', 'quarter')) return answerDim(es, 'fee', 'By entry fee');
  if (has('field', 'contest size', 'entrants'))                  return answerDim(es, 'field', 'By field size');
  if (has('slate', 'game', 'main', 'night', 'turbo'))            return answerDim(es, 'slate', 'By slate size');
  return answerOverall(es);
}

// ── Component ─────────────────────────────────────────────

export function DFSAgent({ filtered }: { filtered: Entry[]; dateFilter?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (messages.length) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  const send = (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg) return;
    setInput('');
    setMessages(p => [...p, { role: 'user', content: msg }, { role: 'assistant', content: analyze(msg, filtered) }]);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div style={{ marginTop: 34, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        padding: '12px 18px', background: 'rgba(0,0,0,0.18)', borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <span style={{ fontSize: 14, color: T.gold }}>✦</span>
          <span className="display" style={{ fontSize: 14, fontWeight: 700 }}>Ask the data</span>
          {filtered.length > 0 && (
            <span style={{ fontSize: 11, color: T.textMuted, whiteSpace: 'nowrap' }}>
              · {filtered.length.toLocaleString()} entries
            </span>
          )}
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} style={{
            background: 'none', border: 'none', color: T.textMuted, fontSize: 12,
            cursor: 'pointer', padding: '4px 8px', fontFamily: 'inherit',
          }}>Clear</button>
        )}
      </div>

      {messages.length === 0 && (
        <div style={{ padding: '14px 18px 2px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STARTERS.map(s => (
            <button key={s} onClick={() => send(s)} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`, borderRadius: 20,
              color: T.textMuted, fontSize: 12, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit',
            }}
              onMouseEnter={e => { const b = e.currentTarget; b.style.background = 'rgba(255,255,255,0.09)'; b.style.color = T.textPrimary; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.background = 'rgba(255,255,255,0.04)'; b.style.color = T.textMuted; }}
            >{s}</button>
          ))}
        </div>
      )}

      <div style={{ maxHeight: 480, overflowY: 'auto', padding: '15px 18px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div className={m.role === 'assistant' ? 'mono' : undefined} style={{
              maxWidth: m.role === 'user' ? '84%' : '100%',
              padding: m.role === 'user' ? '9px 14px' : '12px 15px',
              borderRadius: m.role === 'user' ? '14px 14px 3px 14px' : '9px',
              background: m.role === 'user' ? 'rgba(201,162,39,0.13)' : 'rgba(255,255,255,0.035)',
              border: `1px solid ${m.role === 'user' ? 'rgba(201,162,39,0.22)' : T.border}`,
              fontSize: m.role === 'user' ? 13 : 12,
              lineHeight: m.role === 'user' ? 1.6 : 1.75,
              color: T.textPrimary, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{m.content}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '11px 18px', borderTop: `1px solid ${T.border}`, background: 'rgba(0,0,0,0.10)' }}>
        <input
          ref={inputRef} type="text" placeholder="cuts · plays · sample size · field size · slate size"
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
          style={{
            flex: 1, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7,
            padding: '10px 14px', fontSize: 13, color: T.textPrimary, outline: 'none',
            fontFamily: 'inherit', minWidth: 0,
          }}
        />
        <button onClick={() => send()} disabled={!input.trim()} style={{
          background: input.trim() ? T.gold : 'rgba(201,162,39,0.18)', border: 'none', borderRadius: 7,
          color: input.trim() ? '#0B0E13' : T.textMuted, fontSize: 13, fontWeight: 700,
          padding: '10px 18px', cursor: input.trim() ? 'pointer' : 'default',
          fontFamily: 'inherit', flexShrink: 0,
        }}>Ask →</button>
      </div>
    </div>
  );
}
