import { useState, useMemo, useRef, useEffect } from 'react';
import { T } from '../constants';
import { buildSportSummaries, MIN_N, CASH_KEEP, CASH_WATCH } from '../lib/process';
import type { Entry } from '../types';

const LS_KEY = 'dfs_anthropic_key';
const MODEL  = 'claude-haiku-4-5-20251001';

interface Message { role: 'user' | 'assistant'; content: string; }

const DATE_LABELS: Record<string, string> = {
  '30': 'Last 30 days', '60': 'Last 60 days', '90': 'Last 90 days',
  all: 'All time', custom: 'Custom range',
};

const STARTERS = [
  'What should I cut?',
  'Where is my edge?',
  'How should I allocate my bankroll?',
  'Best contest type for me?',
];

// ── System prompt ─────────────────────────────────────────

function buildPrompt(filtered: Entry[], dateFilter: string): string {
  if (filtered.length === 0) return 'No entries loaded.';

  const summaries = buildSportSummaries(filtered);
  const fees     = filtered.reduce((s, r) => s + r.fee, 0);
  const winnings = filtered.reduce((s, r) => s + r.winnings, 0);
  const net      = winnings - fees;
  const cashes   = filtered.filter(r => r.winnings > 0).length;
  const cashRate = cashes / filtered.length;
  const roi      = fees > 0 ? (net / fees) * 100 : 0;
  const p        = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
  const fn       = (n: number) => `${n >= 0 ? '+$' : '-$'}${Math.abs(n).toFixed(0)}`;

  const sportLines = summaries.map(s => {
    const types = s.entryTypes.filter(et => et.signal !== 'low-n');
    return [
      `${s.sport} [${s.signal.toUpperCase()}] ${s.n} entries`,
      `  Cash: ${p(s.cashRate)} | Net: ${fn(s.net)} | ROI: ${s.roi >= 0 ? '+' : ''}${s.roi.toFixed(1)}%`,
      `  Finish: Top 20% ${p(s.dist.top20)} · Top 10% ${p(s.dist.top10)} · Top 1% ${p(s.dist.top1)}`,
      ...types.map(et => `  ${et.label}: ${p(et.cashRate)} [${et.signal.toUpperCase()}] ${et.n} entries`),
    ].join('\n');
  }).join('\n\n');

  const cuts: string[] = [];
  for (const s of summaries) {
    if (s.signal === 'remove') cuts.push(`${s.sport} overall`);
    else for (const et of s.entryTypes) {
      if (et.signal === 'remove') cuts.push(`${et.label} · ${s.sport}`);
    }
  }

  return `You are a DFS performance analyst for a DraftKings player. Be concise and direct. If something should be cut, say so clearly. If they have edge somewhere, highlight it. Keep responses focused and actionable — no filler.

PERIOD: ${DATE_LABELS[dateFilter] ?? dateFilter}
OVERVIEW: ${filtered.length} entries | ${p(cashRate)} cash | ${fn(net)} net | ${roi >= 0 ? '+' : ''}${roi.toFixed(1)}% ROI

SPORT BREAKDOWN:
${sportLines}

${cuts.length > 0 ? `CUT SIGNALS:\n${cuts.map(c => `• ${c}`).join('\n')}` : 'No remove signals — all at watch or keep.'}

SIGNAL THRESHOLDS: Keep ≥${CASH_KEEP * 100}% | Watch ${CASH_WATCH * 100}–${CASH_KEEP * 100}% | Remove <${CASH_WATCH * 100}% (min ${MIN_N} entries)
FINISH RATES: % of entries finishing in the top 20/10/1% of their contest. Above the random baseline = beating the field at that tier.`;
}

// ── DFSAgent ──────────────────────────────────────────────

export function DFSAgent({ filtered, dateFilter }: { filtered: Entry[]; dateFilter: string }) {
  const [apiKey,    setApiKey]    = useState(() => localStorage.getItem(LS_KEY) ?? '');
  const [keyInput,  setKeyInput]  = useState('');
  const [showKey,   setShowKey]   = useState(false);
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [input,     setInput]     = useState('');
  const [sending,   setSending]   = useState(false);
  const [err,       setErr]       = useState('');
  const bottomRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);

  const systemPrompt = useMemo(() => buildPrompt(filtered, dateFilter), [filtered, dateFilter]);
  const hasKey       = apiKey.length > 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const saveKey = () => {
    const k = keyInput.trim();
    if (!k) return;
    localStorage.setItem(LS_KEY, k);
    setApiKey(k);
    setKeyInput('');
    setShowKey(false);
  };

  const removeKey = () => {
    localStorage.removeItem(LS_KEY);
    setApiKey('');
    setShowKey(false);
  };

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || sending || !hasKey) return;
    setInput('');
    setErr('');

    const next: Message[] = [...messages, { role: 'user', content: msg }];
    setMessages(next);
    setSending(true);

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          system: systemPrompt,
          messages: next.slice(-12),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: { message?: string } })?.error?.message ?? `API error ${res.status}`);
      }

      const data = await res.json() as { content?: { text: string }[] };
      const reply = data.content?.[0]?.text ?? '(no response)';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
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
          <span className="display" style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary }}>DFS Agent</span>
          {filtered.length > 0 && (
            <span style={{ fontSize: 11, color: T.textMuted }}>
              · {filtered.length.toLocaleString()} entries loaded
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              style={{
                background: 'none', border: 'none', color: T.textMuted,
                fontSize: 12, cursor: 'pointer', padding: '4px 8px', fontFamily: 'inherit',
              }}
            >
              Clear chat
            </button>
          )}
          <button
            onClick={() => { setShowKey(s => !s); setKeyInput(''); }}
            style={{
              background: hasKey ? 'rgba(63,196,128,0.09)' : 'rgba(201,162,39,0.09)',
              border: `1px solid ${hasKey ? 'rgba(63,196,128,0.28)' : 'rgba(201,162,39,0.30)'}`,
              borderRadius: 6,
              color: hasKey ? '#3FC480' : T.gold,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              padding: '5px 10px', fontFamily: 'inherit',
            }}
          >
            {hasKey ? '● Connected' : '⚿ Add Key'}
          </button>
        </div>
      </div>

      {/* Key input panel */}
      {showKey && (
        <div style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${T.border}`,
          background: 'rgba(201,162,39,0.04)',
        }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: T.textMuted, lineHeight: 1.55 }}>
            Enter your <strong style={{ color: T.textPrimary }}>Anthropic API key</strong>. Stored only in your browser's local storage — never sent to any server other than Anthropic's API.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="password"
              placeholder="sk-ant-api03-..."
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveKey()}
              autoFocus
              style={{
                flex: 1, minWidth: 180,
                background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6,
                padding: '9px 12px', fontSize: 13, color: T.textPrimary,
                outline: 'none', fontFamily: "'IBM Plex Mono', monospace",
              }}
            />
            <button
              onClick={saveKey}
              style={{
                background: T.gold, border: 'none', borderRadius: 6,
                color: '#0B0E13', fontSize: 13, fontWeight: 700,
                padding: '9px 16px', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Connect
            </button>
            {hasKey && (
              <button
                onClick={removeKey}
                style={{
                  background: 'none', border: `1px solid ${T.border}`, borderRadius: 6,
                  color: T.textMuted, fontSize: 13, padding: '9px 12px',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Remove
              </button>
            )}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: T.textMuted }}>
            Get a key at{' '}
            <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: T.gold }}>
              console.anthropic.com
            </a>
          </p>
        </div>
      )}

      {/* No-key empty state */}
      {!hasKey && !showKey && (
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 30, marginBottom: 14 }}>🤖</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.textPrimary, marginBottom: 8 }}>
            Your AI DFS analyst
          </div>
          <p style={{ margin: '0 auto 22px', maxWidth: 360, fontSize: 13, color: T.textMuted, lineHeight: 1.65 }}>
            Ask about finish rates, which contests to cut, where your edge is, and how to allocate bankroll. Powered by Claude. Your data stays in your browser.
          </p>
          <button
            onClick={() => setShowKey(true)}
            style={{
              background: T.gold, border: 'none', borderRadius: 7,
              color: '#0B0E13', fontSize: 14, fontWeight: 700,
              padding: '11px 26px', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Connect Anthropic Key
          </button>
        </div>
      )}

      {/* Chat UI */}
      {hasKey && (
        <>
          {/* Starter chips */}
          {messages.length === 0 && (
            <div style={{ padding: '14px 18px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STARTERS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={sending}
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
                  maxWidth: '84%',
                  padding: '10px 14px',
                  borderRadius: m.role === 'user' ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                  background: m.role === 'user'
                    ? 'rgba(201,162,39,0.13)'
                    : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${m.role === 'user' ? 'rgba(201,162,39,0.22)' : T.border}`,
                  fontSize: 13, lineHeight: 1.65, color: T.textPrimary,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {m.content}
                </div>
              </div>
            ))}

            {sending && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '10px 16px',
                  borderRadius: '14px 14px 14px 3px',
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${T.border}`,
                  fontSize: 13, color: T.textMuted,
                }}>
                  Analyzing…
                </div>
              </div>
            )}

            {err && (
              <div style={{
                fontSize: 12, color: T.rust, padding: '8px 12px',
                background: 'rgba(176,72,59,0.10)', borderRadius: 6,
              }}>
                {err}
              </div>
            )}

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
              placeholder="Ask about your DFS performance…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              disabled={sending}
              style={{
                flex: 1, background: T.bg, border: `1px solid ${T.border}`,
                borderRadius: 7, padding: '10px 14px', fontSize: 13,
                color: T.textPrimary, outline: 'none', fontFamily: 'inherit',
              }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || sending}
              style={{
                background: input.trim() && !sending ? T.gold : 'rgba(201,162,39,0.18)',
                border: 'none', borderRadius: 7,
                color: input.trim() && !sending ? '#0B0E13' : T.textMuted,
                fontSize: 13, fontWeight: 700,
                padding: '10px 18px', cursor: input.trim() && !sending ? 'pointer' : 'default',
                fontFamily: 'inherit', transition: 'background 140ms, color 140ms',
                flexShrink: 0,
              }}
            >
              Ask →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
