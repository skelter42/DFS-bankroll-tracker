import { T } from '../constants';

interface Month {
  month: string; // "YY-MM"
  net: number;
}

const HALF  = 76; // px each direction from zero line
const Y_W   = 42; // px for Y-axis label column

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

  const maxAbs = Math.max(...data.map(d => Math.abs(d.net)), 1);
  const yMax   = niceMax(maxAbs);
  const mid    = yMax / 2;

  // ticks above zero line (mirrored below)
  const ticks  = [mid, yMax];

  return (
    <div style={{
      background: T.panel, border: `1px solid ${T.border}`,
      borderRadius: 6, padding: '16px 16px 12px', marginBottom: 20,
    }}>
      <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 14 }}>
        Monthly P&amp;L
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: `${Y_W + data.length * 22}px` }}>

          {/* Chart row: Y-axis + bar area */}
          <div style={{ display: 'flex' }}>

            {/* ── Y-axis labels ──────────────────────── */}
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

            {/* ── Bar area ───────────────────────────── */}
            <div style={{ flex: 1, position: 'relative', height: HALF * 2 + 1 }}>

              {/* Gridlines (painted first, behind bars) */}
              {ticks.map(t => (
                <div key={`g+${t}`} style={{
                  position: 'absolute', left: 0, right: 0,
                  top: HALF - Math.round(t / yMax * HALF),
                  height: 1, background: T.border, opacity: 0.45,
                }} />
              ))}
              {ticks.map(t => (
                <div key={`g-${t}`} style={{
                  position: 'absolute', left: 0, right: 0,
                  top: HALF + Math.round(t / yMax * HALF),
                  height: 1, background: T.border, opacity: 0.45,
                }} />
              ))}

              {/* Zero line */}
              <div style={{
                position: 'absolute', left: 0, right: 0, top: HALF,
                height: 1, background: T.border,
              }} />

              {/* Bars (position:relative paints over the gridlines above) */}
              <div style={{ display: 'flex', gap: 3, height: '100%', position: 'relative' }}>
                {data.map((d) => {
                  const h   = Math.round(Math.abs(d.net) / yMax * HALF);
                  const pos = d.net >= 0;
                  return (
                    <div
                      key={d.month}
                      title={`${d.month}  ${d.net >= 0 ? '+$' : '-$'}${Math.abs(d.net).toFixed(0)}`}
                      style={{ flex: 1, height: '100%', position: 'relative' }}
                    >
                      {d.net !== 0 && (
                        <div style={{
                          position: 'absolute',
                          ...(pos ? { bottom: HALF + 1 } : { top: HALF + 1 }),
                          left: '10%', width: '80%',
                          height: Math.max(h, 1),
                          background: pos ? T.gold : T.rust,
                          opacity: 0.88,
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
          <div style={{ display: 'flex', gap: 3, marginTop: 6, paddingLeft: Y_W }}>
            {data.map((d, i) => (
              <div key={d.month} style={{ flex: 1, textAlign: 'center' }}>
                {i % Math.ceil(data.length / 12) === 0 && (
                  <span className="mono" style={{ fontSize: 9, color: T.textMuted }}>
                    {d.month.slice(-2)}
                  </span>
                )}
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
