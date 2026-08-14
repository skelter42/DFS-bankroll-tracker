import { useState, useRef, useEffect } from 'react';
import { T } from '../constants';
import { buildSportSummaries, MIN_N, CASH_KEEP, CASH_WATCH } from '../lib/process';
import type { Entry } from '../types';

interface Message { role: 'user' | 'assistant'; content: string; }

const STARTERS = [
  'What should I cut?',
  'Where is my edge?',
  'How should I allocate my bankroll?',
  'Best contest type for me?',
];

// ── Local analysis engine ──────────────────────────────────

function analyze(question: string, filtered: Entry[]): string {
  if (filtered.length === 0) return 'No entries loaded for the current filter. Try expanding your date range.';

  const summaries  = buildSportSummaries(filtered);
  const q          = question.toLowerCase();
  const p          = (v: number) => `${(v * 100).toFixed(1)}%`;
  const fn         = (n: number) => `${n >= 0 ? '+$' : '-$'}${Math.abs(n).toFixed(0)}`;

  // ── What should I cut? ────────────────────────────────
  if (q.includes('cut') || q.includes('remove') || q.includes('drop') || q.includes('stop')) {
    const lines: string[] = [];

    for (const s of summaries) {
      if (s.signal === 'remove') {
        lines.push(`• ${s.sport} overall — ${p(s.cashRate)} cash on ${s.n} entries (${fn(s.net)} net). Cut entirely until you have a clear edge.`);
      } else {
        for (const et of s.entryTypes) {
          if (et.signal === 'remove') {
            lines.push(`• ${et.label} in ${s.sport} — ${p(et.cashRate)} cash on ${et.n} entries (${fn(et.net)} net). Stop playing this format.`);
          }
        }
      }
    }

    if (lines.length === 0) {
      const watches = summaries.filter(s => s.signal === 'watch');
      if (watches.length > 0) {
        return `Nothing hits the cut threshold right now — all sports with enough entries (${MIN_N}+) are at watch or keep.\n\nWatch-list (${CASH_WATCH * 100}–${CASH_KEEP * 100}% cash — keep an eye on these):\n` +
          watches.map(s => `• ${s.sport} — ${p(s.cashRate)} cash, ${fn(s.net)} net`).join('\n');
      }
      return `Nothing to cut — all your sports with ${MIN_N}+ entries are performing at keep level (≥${CASH_KEEP * 100}% cash rate). Keep going.`;
    }

    return `Things to cut now:\n\n${lines.join('\n\n')}\n\nCut threshold: <${CASH_WATCH * 100}% cash rate with ${MIN_N}+ entries.`;
  }

  // ── Where is my edge? ─────────────────────────────────
  if (q.includes('edge') || q.includes('best') || q.includes('good') || q.includes('strong') || q.includes('where')) {
    const keeps = summaries.filter(s => s.signal === 'keep');
    const topTypes: { sport: string; label: string; cashRate: number; roi: number; n: number }[] = [];

    for (const s of summaries) {
      for (const et of s.entryTypes) {
        if (et.signal === 'keep') topTypes.push({ sport: s.sport, label: et.label, cashRate: et.cashRate, roi: et.roi, n: et.n });
      }
    }
    topTypes.sort((a, b) => b.cashRate - a.cashRate);

    if (keeps.length === 0 && topTypes.length === 0) {
      return `No clear edge signals yet. You need ${MIN_N}+ entries in a sport or contest type to get a reliable read. Keep grinding and check back.`;
    }

    const lines: string[] = [];

    if (keeps.length > 0) {
      lines.push('Sports with edge:');
      for (const s of keeps) {
        const top1flag = s.dist.top1 >= 0.02 ? ` 🔥 Top 1% finishes: ${p(s.dist.top1)}` : '';
        lines.push(`• ${s.sport} — ${p(s.cashRate)} cash | ${s.roi >= 0 ? '+' : ''}${s.roi.toFixed(1)}% ROI | ${fn(s.net)} net${top1flag}`);
      }
    }

    if (topTypes.length > 0) {
      lines.push('\nBest contest formats:');
      topTypes.slice(0, 3).forEach(t => {
        lines.push(`• ${t.label} · ${t.sport} — ${p(t.cashRate)} cash | ${t.roi >= 0 ? '+' : ''}${t.roi.toFixed(1)}% ROI`);
      });
    }

    return lines.join('\n');
  }

  // ── Bankroll allocation ────────────────────────────────
  if (q.includes('bankroll') || q.includes('allocat') || q.includes('spend') || q.includes('invest') || q.includes('size')) {
    const keeps   = summaries.filter(s => s.signal === 'keep');
    const watches = summaries.filter(s => s.signal === 'watch');
    const removes = summaries.filter(s => s.signal === 'remove');

    const lines: string[] = [];

    if (removes.length > 0) {
      lines.push(`Stop spending on: ${removes.map(s => s.sport).join(', ')} — below ${CASH_WATCH * 100}% cash rate. Redirect that money.`);
    }

    if (keeps.length > 0) {
      lines.push(`\nDouble down on (keep signal):`);
      const total = keeps.reduce((s, k) => s + k.n, 0);
      keeps.forEach(s => {
        const share = total > 0 ? Math.round((s.n / total) * 100) : 0;
        lines.push(`• ${s.sport} — currently ${share}% of your keep-signal volume | ${p(s.cashRate)} cash | ${fn(s.net)} net`);
      });
      lines.push('\nConsider shifting bankroll toward your keep-signal sports proportional to their ROI.');
    }

    if (watches.length > 0) {
      lines.push(`\nWatch (maintain current level, don't add):\n` + watches.map(s => `• ${s.sport} — ${p(s.cashRate)} cash`).join('\n'));
    }

    if (keeps.length === 0 && watches.length === 0) {
      return `Not enough data yet for confident allocation advice — you need ${MIN_N}+ entries per sport. Play lower stakes across sports to build your sample.`;
    }

    return lines.join('\n');
  }

  // ── Best contest type ──────────────────────────────────
  if (q.includes('contest') || q.includes('type') || q.includes('format') || q.includes('entry') || q.includes('fee') || q.includes('single') || q.includes('max')) {
    const all: { sport: string; label: string; cashRate: number; roi: number; net: number; n: number; signal: string }[] = [];

    for (const s of summaries) {
      for (const et of s.entryTypes) {
        if (et.signal === 'low-n') continue;
        all.push({ sport: s.sport, label: et.label, cashRate: et.cashRate, roi: et.roi, net: et.net, n: et.n, signal: et.signal });
      }
    }

    if (all.length === 0) {
      return `Not enough data per contest type yet (need ${MIN_N}+ entries each). Keep playing and check back.`;
    }

    all.sort((a, b) => b.cashRate - a.cashRate);

    const best   = all.filter(t => t.signal === 'keep');
    const mid    = all.filter(t => t.signal === 'watch');
    const worst  = all.filter(t => t.signal === 'remove');

    const lines: string[] = [];

    if (best.length > 0) {
      lines.push('Keep playing:');
      best.forEach(t => lines.push(`• ${t.label} · ${t.sport} — ${p(t.cashRate)} cash | ${t.roi >= 0 ? '+' : ''}${t.roi.toFixed(1)}% ROI`));
    }
    if (mid.length > 0) {
      lines.push('\nWatch (borderline — track closely):');
      mid.forEach(t => lines.push(`• ${t.label} · ${t.sport} — ${p(t.cashRate)} cash`));
    }
    if (worst.length > 0) {
      lines.push('\nCut these formats:');
      worst.forEach(t => lines.push(`• ${t.label} · ${t.sport} — ${p(t.cashRate)} cash | ${fn(t.net)} net`));
    }

    return lines.join('\n');
  }

  // ── Fallback ──────────────────────────────────────────
  const fees     = filtered.reduce((s, r) => s + r.fee, 0);
  const winnings = filtered.reduce((s, r) => s + r.winnings, 0);
  const net      = winnings - fees;
  const cashes   = filtered.filter(r => r.winnings > 0).length;
  const cashRate = cashes / filtered.length;

  return `I can help with:\n• What to cut\n• Where your edge is\n• Bankroll allocation\n• Best contest types\n\nTry one of those, or click a chip above.\n\nYour current snapshot: ${filtered.length} entries | ${p(cashRate)} cash | ${fn(net)} net`;
}

// ── DFSAgent ──────────────────────────────────────────────

export function DFSAgent({ filtered, dateFilter: _ }: { filtered: Entry[]; dateFilter: string }) {
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [input,     setInput]     = useState('');
  const bottomRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg) return;
    setInput('');

    const reply = analyze(msg, filtered);
    setMessages(prev => [
      ...prev,
      { role: 'user',      content: msg   },
      { role: 'assistant', content: reply },
    ]);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div style={{
      marginTop: 36,
      background: T.panel,
      border: `1px solid ${T.border}`,
      borderRadius: 10,
      overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '13px 18px',
        background: 'rgba(0,0,0,0.18)',
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 15, color: T.gold }}>✦</span>
          <span className="display" style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary }}>DFS Analyst</span>
          {filtered.length > 0 && (
            <span style={{ fontSize: 11, color: T.textMuted }}>
              · {filtered.length.toLocaleString()} entries analyzed
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

      {/* Starter chips */}
      {messages.length === 0 && (
        <div style={{ padding: '14px 18px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STARTERS.map(s => (
            <button
              key={s}
              onClick={() => send(s)}
              style={{
                background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`,
                borderRadius: 20, color: T.textMuted, fontSize: 12,
                padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit',
              }}
              onMouseEnter={e => { const b = e.currentTarget; b.style.background = 'rgba(255,255,255,0.09)'; b.style.color = T.textPrimary; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.background = 'rgba(255,255,255,0.04)'; b.style.color = T.textMuted; }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div style={{
        maxHeight: 420, overflowY: 'auto',
        padding: '16px 18px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '88%',
              padding: '10px 14px',
              borderRadius: m.role === 'user' ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
              background: m.role === 'user'
                ? 'rgba(201,162,39,0.13)'
                : 'rgba(255,255,255,0.05)',
              border: `1px solid ${m.role === 'user' ? 'rgba(201,162,39,0.22)' : T.border}`,
              fontSize: 13, lineHeight: 1.7, color: T.textPrimary,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {m.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{
        display: 'flex', gap: 8, padding: '12px 18px',
        borderTop: `1px solid ${T.border}`,
        background: 'rgba(0,0,0,0.10)',
      }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Ask about cuts, edge, bankroll, or contest types…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
          style={{
            flex: 1, background: T.bg, border: `1px solid ${T.border}`,
            borderRadius: 7, padding: '10px 14px', fontSize: 13,
            color: T.textPrimary, outline: 'none', fontFamily: 'inherit',
          }}
        />
        <button
          onClick={() => send()}
          disabled={!input.trim()}
          style={{
            background: input.trim() ? T.gold : 'rgba(201,162,39,0.18)',
            border: 'none', borderRadius: 7,
            color: input.trim() ? '#0B0E13' : T.textMuted,
            fontSize: 13, fontWeight: 700,
            padding: '10px 18px', cursor: input.trim() ? 'pointer' : 'default',
            fontFamily: 'inherit', transition: 'background 140ms, color 140ms',
            flexShrink: 0,
          }}
        >
          Ask →
        </button>
      </div>
    </div>
  );
}
