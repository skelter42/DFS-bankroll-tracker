import { T } from '../constants';

interface Month {
  month: string; // "YY-MM"
  net: number;
}

const HALF    = 120;  // px each direction from zero line
const Y_W     = 46;   // px for Y-axis label column
const MIN_COL = 32;   // minimum px per bar column

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n   = v / mag;
  if (n <= 1)   return mag;
  if (n <= 1.5) return 1.5 * mag;
  if (n <= 2)   return 2   * mag;
  if (n <= 2.5) return 2.5 * mag;
  if (n <= 3)   return 3   * mag;
  if (n <= 4)   return 4   * mag;
  if (n <= 5)   return 5   * mag;
  if (n <= 7.5) return 7.5 * mag;
  return 10 * mag;
}

function fmtY(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a === 0) return '$0';
  if (a >= 1000) {
    const k = a / 1000;
    return `${s}$${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `${s}$${a}`;
}

export function MonthlyChart({ data }: { data: Month[] }) {
  if (data.length < 2) return null;

  // Scale to 90th-percentile so typical months fill the chart;
  // outlier bars are capped at the ceiling rather than shrinking everything else.
  const sorted = [...data.map(d => Math.abs(d.net))].sort((a, b) => a - b);
  const p90    = sorted[Math.min(Math.floor(sorted.length * 0.9), sorted.length - 1)];
  const yMax   = niceMax(Math.max(p90, 1));
  const mid    = yMax / 2;
  const ticks  = [mid, yMax];

  // Show at most ~14 month labels; always show January (year boundary)
  const step = Math.max(1, Math.ceil(data.length / 14));

  return (
    <div style={{
      background: T.panel, border: `1px solid ${T.border}`,
      borderRadius: 6, padding: '16px 16px 12px', marginBottom: 20,
    }}>
      <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 14 }}>
        Monthly P&amp;L
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: Y_W + data.length * MIN_COL }}>

          {/* Chart row: Y-axis + bar area */}
          <div style={{ display: 'flex' }}>

            {/* ── Y-axis labels ── */}
            <div style={{ width: Y_W, flexShrink: 0, position: 'relative', height: HALF * 2 + 1 }}>
              {ticks.map(t => (
                <span key={t} className="mono" style={{
                  position: 'absolute', right: 6,
                  top: HALF - Math.round(t / yMax * HALF),
                  fontSize: 9, color: T.textMuted,
                  transform: 'translateY(-50%)', whiteSpace: 'nowrap',
                }}>
                  {fmtY(t)}
                </span>
              ))}
              <span className="mono" style={{
                position: 'absolute', right: 6, top: HALF,
                fontSize: 9, color: T.textMuted, transform: 'translateY(-50%)',
              }}>
                $0
              </span>
              {ticks.map(t => (
                <span key={-t} className="mono" style={{
                  position: 'absolute', right: 6,
                  top: HALF + Math.round(t / yMax * HALF),
                  fontSize: 9, color: T.textMuted,
                  transform: 'translateY(-50%)', whiteSpace: 'nowrap',
                }}>
                  {fmtY(-t)}
                </span>
              ))}
            </div>

            {/* ── Bar area ── */}
            <div style={{ flex: 1, position: 'relative', height: HALF * 2 + 1 }}>

              {/* Gridlines (behind bars) */}
              {ticks.map(t => (
                <div key={`g+${t}`} style={{
                  position: 'absolute', left: 0, right: 0,
                  top: HALF - Math.round(t / yMax * HALF),
                  height: 1, background: T.border, opacity: 0.4,
                }} />
              ))}
              {ticks.map(t => (
                <div key={`g-${t}`} style={{
                  position: 'absolute', left: 0, right: 0,
                  top: HALF + Math.round(t / yMax * HALF),
                  height: 1, background: T.border, opacity: 0.4,
                }} />
              ))}

              {/* Zero line */}
              <div style={{
                position: 'absolute', left: 0, right: 0, top: HALF,
                height: 1, background: T.border,
              }} />

              {/* Bars (position:relative renders over gridlines) */}
              <div style={{ display: 'flex', height: '100%', position: 'relative' }}>
                {data.map((d) => {
                  const raw = Math.abs(d.net) / yMax * HALF;
                  const h   = Math.min(Math.round(raw), HALF - 1); // cap outliers at ceiling
                  const pos = d.net >= 0;
                  return (
                    <div
                      key={d.month}
                      title={`${d.month}  ${d.net >= 0 ? '+$' : '-$'}${Math.abs(d.net).toFixed(0)}`}
                      style={{ flex: 1, minWidth: MIN_COL, height: '100%', position: 'relative' }}
                    >
                      {d.net !== 0 && (
                        <div style={{
                          position: 'absolute',
                          ...(pos ? { bottom: HALF + 1 } : { top: HALF + 1 }),
                          left: 3, right: 3,
                          height: Math.max(h, 3),
                          background: pos ? T.gold : T.rust,
                          opacity: 0.9,
                          borderRadius: pos ? '2px 2px 0 0' : '0 0 2px 2px',
                        }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Month labels */}
          <div style={{ display: 'flex', marginTop: 5, paddingLeft: Y_W }}>
            {data.map((d, i) => {
              const mm    = parseInt(d.month.slice(-2), 10) - 1; // 0-indexed
              const isJan = mm === 0;
              const show  = isJan || i % step === 0;
              // January → year marker e.g. '24; others → first letter of month name
              const text  = isJan
                ? `'${d.month.slice(0, 2)}`
                : (MONTH_ABBR[mm]?.slice(0, 1) ?? '');
              return (
                <div key={d.month} style={{ flex: 1, minWidth: MIN_COL, textAlign: 'center' }}>
                  {show && (
                    <span className="mono" style={{
                      fontSize: 9,
                      color: isJan ? T.textPrimary : T.textMuted,
                      fontWeight: isJan ? 600 : 400,
                    }}>
                      {text}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}
