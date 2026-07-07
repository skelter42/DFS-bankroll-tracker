import { useState, useMemo, useCallback, useEffect } from 'react';
import Papa from 'papaparse';
import { X } from 'lucide-react';
import { BASELINES, NOISE_FLOOR, T } from './constants';
import { parseMoney, extractMax } from './lib/parse';
import { saveEntries, loadSaved, clearSaved } from './lib/storage';
import { UploadZone } from './components/UploadZone';
import { FilterBar } from './components/FilterBar';
import { OverallCard, SportCard } from './components/StatsCard';
import { KpiStrip } from './components/KpiStrip';
import { MonthlyChart } from './components/MonthlyChart';
import type { Entry, Band, DateFilter } from './types';

function makeBands(entries: Entry[]): Band[] {
  const n = entries.length;
  if (n === 0) return [
    { label: 'Top 1%',  baseline: BASELINES.p1,  actual: 0, hits: 0 },
    { label: 'Top 10%', baseline: BASELINES.p10, actual: 0, hits: 0 },
    { label: 'Top 20%', baseline: BASELINES.p20, actual: 0, hits: 0 },
  ];
  const hit1  = entries.filter(e => e.pct <= BASELINES.p1).length;
  const hit10 = entries.filter(e => e.pct <= BASELINES.p10).length;
  const hit20 = entries.filter(e => e.pct <= BASELINES.p20).length;
  return [
    { label: 'Top 1%',  baseline: BASELINES.p1,  actual: hit1  / n, hits: hit1  },
    { label: 'Top 10%', baseline: BASELINES.p10, actual: hit10 / n, hits: hit10 },
    { label: 'Top 20%', baseline: BASELINES.p20, actual: hit20 / n, hits: hit20 },
  ];
}

export default function App() {
  const [rows,       setRows]       = useState<Entry[] | null>(null);
  const [fileName,   setFileName]   = useState('');
  const [error,      setError]      = useState('');
  const [maxFilter,  setMaxFilter]  = useState<number | null>(null);
  const [feeFilter,  setFeeFilter]  = useState<number | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [loading,    setLoading]    = useState(true);

  // Restore from IndexedDB on first load
  useEffect(() => {
    loadSaved().then(saved => {
      if (saved) {
        setRows(saved.entries);
        setFileName(saved.fileName);
      }
    }).finally(() => setLoading(false));
  }, []);

  const handleFile = useCallback((file: File) => {
    setError('');
    setFileName(file.name);
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
                sport:      r.Sport,
                entryName:  r.Entry ?? '',
                date:       r.Contest_Date_EST ? new Date(r.Contest_Date_EST) : null,
                place,
                entries,
                pct:        place / entries,
                fee:        parseMoney(r.Entry_Fee),
                winnings:   parseMoney(r.Winnings_Non_Ticket) + parseMoney(r.Winnings_Ticket),
                maxSize:    extractMax(r.Entry),
              };
            })
            .filter((r): r is Entry => r !== null);

          if (data.length === 0) {
            setError("No usable rows found. Check this is a DraftKings contest history export.");
            setRows(null);
            return;
          }
          setRows(data);
          setMaxFilter(null);
          setFeeFilter(null);
          setDateFilter('all');
          saveEntries(data, file.name);
        } catch {
          setError("Couldn't parse that file. Make sure it's an unmodified DK export.");
          setRows(null);
        }
      },
      error: () => setError("Couldn't read that file."),
    });
  }, []);

  const maxSizes = useMemo(() => {
    if (!rows) return [];
    const counts: Record<number, number> = {};
    rows.forEach(r => { if (r.maxSize !== null) counts[r.maxSize] = (counts[r.maxSize] ?? 0) + 1; });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([size, count]) => ({ size: parseInt(size, 10), count }));
  }, [rows]);

  const feesForMax = useMemo(() => {
    if (!rows || maxFilter === null) return [];
    const counts: Record<string, number> = {};
    rows.forEach(r => {
      if (r.maxSize === maxFilter) {
        const key = r.fee.toFixed(2);
        counts[key] = (counts[key] ?? 0) + 1;
      }
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([fee, count]) => ({ fee: parseFloat(fee), count }));
  }, [rows, maxFilter]);

  const maxDate = useMemo(() => {
    if (!rows) return null;
    let max: Date | null = null;
    rows.forEach(r => { if (r.date && (!max || r.date > max)) max = r.date; });
    return max;
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows || maxFilter === null) return [];
    let out = rows.filter(r => r.maxSize === maxFilter);
    if (feeFilter !== null) out = out.filter(r => Math.abs(r.fee - feeFilter) < 0.001);
    if (dateFilter !== 'all' && maxDate) {
      const days   = parseInt(dateFilter, 10);
      const cutoff = new Date(maxDate.getTime() - days * 86_400_000);
      out = out.filter(r => r.date && r.date >= cutoff);
    }
    return out;
  }, [rows, maxFilter, feeFilter, dateFilter, maxDate]);

  const bySport = useMemo(() => {
    const groups: Record<string, Entry[]> = {};
    filtered.forEach(r => { (groups[r.sport] ??= []).push(r); });
    return Object.entries(groups)
      .map(([sport, entries]) => {
        const fees     = entries.reduce((s, e) => s + e.fee, 0);
        const winnings = entries.reduce((s, e) => s + e.winnings, 0);
        return {
          sport,
          n:        entries.length,
          bands:    makeBands(entries),
          roi:      fees > 0 ? (winnings - fees) / fees : 0,
          fees,
          winnings,
        };
      })
      .sort((a, b) => b.n - a.n);
  }, [filtered]);

  const overall = useMemo(() => {
    if (filtered.length === 0) return null;
    const fees     = filtered.reduce((s, e) => s + e.fee, 0);
    const winnings = filtered.reduce((s, e) => s + e.winnings, 0);
    return {
      n:        filtered.length,
      bands:    makeBands(filtered),
      roi:      fees > 0 ? (winnings - fees) / fees : 0,
      fees,
      winnings,
    };
  }, [filtered]);

  const kpis = useMemo(() => {
    if (!rows) return null;
    const fees     = rows.reduce((s, r) => s + r.fee, 0);
    const winnings = rows.reduce((s, r) => s + r.winnings, 0);
    const net      = winnings - fees;
    return { entries: rows.length, fees, winnings, net, roi: fees > 0 ? net / fees : 0 };
  }, [rows]);

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

  const reset = () => { setRows(null); setFileName(''); setError(''); clearSaved(); };

  return (
    <div style={{
      minHeight: '100vh',
      background: T.bg,
      color: T.textPrimary,
      fontFamily: "'IBM Plex Sans', 'Inter', sans-serif",
    }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '32px 20px 80px' }}>

        {/* ── Header ─────────────────────────────────────── */}
        <div style={{ marginBottom: 36 }}>
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

        {/* ── Upload ─────────────────────────────────────── */}
        {!rows && !loading && <UploadZone onFile={handleFile} error={error} />}

        {/* ── Loaded ─────────────────────────────────────── */}
        {rows && (
          <div>
            {/* file bar */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 24, paddingBottom: 16, borderBottom: `1px solid ${T.border}`,
            }}>
              <div className="mono" style={{ fontSize: 12, color: T.textMuted }}>
                {fileName} · {rows.length.toLocaleString()} entries loaded
              </div>
              <button onClick={reset} style={{
                background: 'none', border: `1px solid ${T.border}`, color: T.textMuted,
                borderRadius: 4, padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <X size={13} /> Clear
              </button>
            </div>

            {kpis && <KpiStrip kpis={kpis} />}
            <MonthlyChart data={monthlyPnl} />

            <FilterBar
              maxSizes={maxSizes}
              maxFilter={maxFilter}
              onMaxFilter={(size) => { setMaxFilter(size); setFeeFilter(null); }}
              feesForMax={feesForMax}
              feeFilter={feeFilter}
              onFeeFilter={setFeeFilter}
              dateFilter={dateFilter}
              onDateFilter={setDateFilter}
            />

            {maxFilter === null && (
              <div style={{ color: T.textMuted, fontSize: 14, padding: '24px 0' }}>
                Pick a contest max size above to see your baseline-vs-actual breakdown.
              </div>
            )}

            {maxFilter !== null && filtered.length === 0 && (
              <div style={{ color: T.textMuted, fontSize: 14, padding: '24px 0' }}>
                No entries match that combination.
              </div>
            )}

            {maxFilter !== null && overall && (
              <>
                <OverallCard stat={overall} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {bySport.map(s => <SportCard key={s.sport} stat={s} />)}
                </div>

                <div style={{
                  marginTop: 24, fontSize: 12, color: T.textMuted, lineHeight: 1.6,
                  borderTop: `1px solid ${T.border}`, paddingTop: 16,
                }}>
                  <strong style={{ color: T.textPrimary }}>Reading this:</strong> the gold/rust
                  marker shows your actual finish rate against the no-edge baseline for that band
                  (the slate line). Gold = beating the field, rust = under it. Bands flagged{' '}
                  <span style={{ color: T.textMuted }}>low n</span> have fewer than {NOISE_FLOOR}{' '}
                  hits — treat as noise, not signal. ROI is rake-adjusted: your actual return vs.
                  entry fees paid, separate from the percentile bands above.
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
