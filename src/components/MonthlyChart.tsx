import { T } from '../constants';

interface Month {
  month: string; // "YY-MM"
  net: number;
}

export function MonthlyChart({ data }: { data: Month[] }) {
  if (data.length < 2) return null;

  const maxAbs = Math.max(...data.map(d => Math.abs(d.net)), 1);
  const HALF = 64; // px each direction from zero line

  return (
    <div style={{
      background: T.panel, border: `1px solid ${T.border}`,
      borderRadius: 6, padding: '16px 20px 12px', marginBottom: 20,
    }}>
      <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 14 }}>
        Monthly P&L
      </div>

      <div style={{ overflowX: 'auto', marginLeft: -4, marginRight: -4, paddingLeft: 4, paddingRight: 4 }}>
        <div style={{ minWidth: `${data.length * 22}px` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: HALF * 2 + 1, position: 'relative' }}>
            {/* zero line */}
            <div style={{
              position: 'absolute', left: 0, right: 0, top: HALF,
              height: 1, background: T.border,
            }} />

            {data.map((d) => {
              const h = Math.round(Math.abs(d.net) / maxAbs * HALF);
              const pos = d.net >= 0;
              return (
                <div
                  key={d.month}
                  title={`${d.month}  ${d.net >= 0 ? '+$' : '-$'}${Math.abs(d.net).toFixed(0)}`}
                  style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
                >
                  <div style={{
                    position: 'absolute',
                    ...(pos
                      ? { bottom: HALF + 1, top: undefined }
                      : { top: HALF + 1, bottom: undefined }),
                    width: '80%',
                    height: h,
                    background: pos ? T.gold : T.rust,
                    opacity: 0.85,
                    borderRadius: pos ? '2px 2px 0 0' : '0 0 2px 2px',
                  }} />
                </div>
              );
            })}
          </div>

          {/* month labels */}
          <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
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
