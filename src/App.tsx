import { useState, useMemo, useCallback, useEffect } from 'react';
import Papa from 'papaparse';
import { X } from 'lucide-react';
import { T } from './constants';
import { parseMoney, extractMax } from './lib/parse';
import { saveEntries, loadSaved, clearSaved } from './lib/storage';
import { UploadZone } from './components/UploadZone';
import { FilterBar } from './components/FilterBar';
import { MonthlyChart } from './components/MonthlyChart';
import { DashboardSection } from './components/Dashboard';
import { DFSAgent } from './components/DFSAgent';
import type { Entry, DateFilter } from './types';

export default function App() {
  const [rows,        setRows]        = useState<Entry[] | null>(null);
  const [fileName,    setFileName]    = useState('');
  const [error,       setError]       = useState('');
  const [sportFilter, setSportFilter] = useState<string[]>([]);
  const [typeKeys,    setTypeKeys]    = useState<string[]>([]);
  const [dateFilter,  setDateFilter]  = useState<DateFilter>('30');
  const [customFrom,  setCustomFrom]  = useState('');
  const [customTo,    setCustomTo]    = useState('');
  const [loading,     setLoading]     = useState(true);
  const [parsing,     setParsing]     = useState(false);

  useEffect(() => {
    loadSaved().then(saved => {
      if (saved) { setRows(saved.entries); setFileName(saved.fileName); }
    }).finally(() => setLoading(false));
  }, []);

  const handleFile = useCallback((file: File) => {
    setError('');
    setFileName(file.name);
    setParsing(true);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        try {
          const data = res.data
            .map((r): Entry | null => {
              const place   = parseFloat(r.Place);
              const entries = parseFloat(r.Contest_Entries);
              if (!r.Sport || isNaN(place) || isNaN(entries) || entries <= 0) return null;
              return {
                sport:     r.Sport,
                gameType:  r.Game_Type ?? '',
                entryName: r.Entry ?? '',
                contestId: r.Contest_Key ?? '',
                date:      r.Contest_Date_EST ? new Date(r.Contest_Date_EST) : null,
                place,
                entries,
                pct:       place / entries,
                fee:       parseMoney(r.Entry_Fee),
                winnings:  parseMoney(r.Winnings_Non_Ticket) + parseMoney(r.Winnings_Ticket),
                pool:      parseMoney(r.Prize_Pool),
                maxSize:   extractMax(r.Entry),
              };
            })
            .filter((r): r is Entry => r !== null);

          if (data.length === 0) {
            setError("No usable rows found. Check this is a DraftKings contest history export.");
            setRows(null);
            setParsing(false);
            return;
          }
          setRows(data);
          setSportFilter([]); setTypeKeys([]);
          setDateFilter('30'); setCustomFrom(''); setCustomTo('');
          saveEntries(data, file.name);
          setParsing(false);
        } catch {
          setError("Couldn't parse that file. Make sure it's an unmodified DK export.");
          setRows(null);
          setParsing(false);
        }
      },
      error: () => { setError("Couldn't read that file."); setParsing(false); },
    });
  }, []);

  const allTypes = useMemo(() => {
    if (!rows) return [];
    const map = new Map<string, { fee: number; maxSize: number | null; count: number }>();
    rows.forEach(e => {
      const k = `${e.fee}|${e.maxSize ?? 'null'}`;
      if (!map.has(k)) map.set(k, { fee: e.fee, maxSize: e.maxSize, count: 0 });
      map.get(k)!.count++;
    });
    const fmtFee  = (f: number) => { const c = Math.round(f * 100); if (c === 0) return 'Free'; if (c < 100) return `${c}¢`; if (c % 100 === 0) return `$${c / 100}`; return `$${f.toFixed(2)}`; };
    const fmtSize = (m: number | null) => m === null ? '?-max' : m === 1 ? 'single' : `${m}-max`;
    return [...map.entries()]
      .map(([key, v]) => ({ key, label: `${fmtFee(v.fee)} · ${fmtSize(v.maxSize)}`, count: v.count }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const sports = useMemo(() => {
    if (!rows) return [];
    const s = new Set<string>();
    rows.forEach(r => { if (r.sport) s.add(r.sport); });
    return [...s].sort();
  }, [rows]);

  const maxDate = useMemo((): Date | null => {
    if (!rows) return null;
    let max: Date | null = null;
    rows.forEach(r => { if (r.date && (!max || r.date > max)) max = r.date; });
    return max;
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    let out = [...rows];
    if (sportFilter.length > 0) out = out.filter(r => sportFilter.includes(r.sport));
    if (typeKeys.length > 0) {
      const ks = new Set(typeKeys);
      out = out.filter(r => ks.has(`${r.fee}|${r.maxSize ?? 'null'}`));
    }
    if (dateFilter === 'custom') {
      if (customFrom) out = out.filter(r => r.date && r.date >= new Date(customFrom));
      if (customTo)   out = out.filter(r => r.date && r.date <= new Date(customTo + 'T23:59:59'));
    } else if (dateFilter !== 'all') {
      const md = maxDate;
      if (md) {
        const days   = parseInt(dateFilter, 10);
        const cutoff = new Date(md.getTime() - days * 86_400_000);
        out = out.filter(r => r.date && r.date >= cutoff);
      }
    }
    return out;
  }, [rows, sportFilter, typeKeys, dateFilter, maxDate, customFrom, customTo]);

  const monthlyPnl = useMemo(() => {
    if (!rows) return [];
    const byMonth: Record<string, { fees: number; winnings: number }> = {};
    rows.forEach(r => {
      if (!r.date) return;
      const m = r.date.toISOString().slice(0, 7);
      if (!byMonth[m]) byMonth[m] = { fees: 0, winnings: 0 };
      byMonth[m].fees     += r.fee;
      byMonth[m].winnings += r.winnings;
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month: month.slice(2), net: v.winnings - v.fees }));
  }, [rows]);

  const reset = () => {
    setRows(null); setFileName(''); setError('');
    setSportFilter([]); setTypeKeys([]);
    setDateFilter('30'); setCustomFrom(''); setCustomTo('');
    clearSaved();
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: T.bg,
      color: T.textPrimary,
      fontFamily: "'IBM Plex Sans', 'Inter', sans-serif",
    }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '32px 20px 80px' }}>

        {/* ── Header ─────────────────────────────────────── */}
        <div className="site-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <h1 className="display" style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
                Slate Tracker
              </h1>
              <span className="mono" style={{ fontSize: 12, color: T.textMuted, letterSpacing: '0.08em' }}>
                v0.1
              </span>
            </div>
            <p style={{ margin: '6px 0 0', color: T.textMuted, fontSize: 14, maxWidth: 480, lineHeight: 1.5 }}>
              Upload your DraftKings contest history. Track your bankroll and see exactly where you're beating the field.
            </p>
          </div>
          <a
            href="https://discord.gg/ZHU5frV3C"
            target="_blank"
            rel="noreferrer"
            className="discord-btn"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(88,101,242,0.12)',
              border: '1px solid rgba(88,101,242,0.35)',
              borderRadius: 6, padding: '9px 14px',
              fontSize: 13, color: '#8B9CF4',
              textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
              transition: 'background 150ms, border-color 150ms, color 150ms',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(88,101,242,0.2)';
              (e.currentTarget as HTMLAnchorElement).style.color = '#A5B4FB';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(88,101,242,0.12)';
              (e.currentTarget as HTMLAnchorElement).style.color = '#8B9CF4';
            }}
          >
            <svg width="16" height="12" viewBox="0 0 24 18" fill="currentColor">
              <path d="M20.317 1.492a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 1.492a.07.07 0 0 0-.032.027C.533 6.168-.32 10.698.099 15.175c.005.029.02.055.042.073a19.85 19.85 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.1.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
            </svg>
            Community
          </a>
        </div>

        {/* ── Upload ─────────────────────────────────────── */}
        {!rows && !loading && !parsing && <UploadZone onFile={handleFile} error={error} />}

        {/* ── Parsing ────────────────────────────────────── */}
        {parsing && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 0', gap: 16 }}>
            <div className="parse-spinner" />
            <div style={{ color: T.textMuted, fontSize: 14 }}>Parsing your contest history…</div>
          </div>
        )}

        {/* ── Loaded ─────────────────────────────────────── */}
        {rows && !parsing && (
          <div>
            {/* file bar */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 16, padding: '10px 14px',
              background: T.panel, border: `1px solid ${T.border}`, borderRadius: 6,
            }}>
              <div className="mono" style={{ fontSize: 12, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {fileName} · {rows.length.toLocaleString()} entries loaded
              </div>
              <button onClick={reset} style={{
                background: 'none', border: `1px solid ${T.border}`, color: T.textMuted,
                borderRadius: 4, padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, marginLeft: 12,
              }}>
                <X size={12} /> Clear
              </button>
            </div>

            <MonthlyChart data={monthlyPnl} />

            <FilterBar
              sports={sports}
              sportFilter={sportFilter}
              onSportFilter={setSportFilter}
              allTypes={allTypes}
              typeKeys={typeKeys}
              onTypeKeys={setTypeKeys}
              dateFilter={dateFilter}
              onDateFilter={setDateFilter}
              customFrom={customFrom}
              customTo={customTo}
              onCustomFrom={setCustomFrom}
              onCustomTo={setCustomTo}
            />

            <div style={{ height: 1, background: T.border, margin: '4px 0 24px' }} />

            <DashboardSection filtered={filtered} />
            <DFSAgent filtered={filtered} dateFilter={dateFilter} />
          </div>
        )}
      </div>
    </div>
  );
}
