import { T } from '../constants';

interface Kpis {
  entries: number;
  fees: number;
  winnings: number;
  net: number;
  roi: number;
}

export function KpiStrip({ kpis }: { kpis: Kpis }) {
  const tiles = [
    { label: 'Net P&L',   value: `${kpis.net >= 0 ? '+$' : '-$'}${Math.abs(kpis.net).toFixed(0)}`,  color: kpis.net >= 0 ? T.gold : T.rust },
    { label: 'ROI',       value: `${kpis.roi >= 0 ? '+' : ''}${(kpis.roi * 100).toFixed(1)}%`,       color: kpis.roi >= 0 ? T.gold : T.rust },
    { label: 'Fees Paid', value: `$${kpis.fees.toFixed(0)}`,                                          color: T.textMuted },
    { label: 'Entries',   value: kpis.entries.toLocaleString(),                                        color: T.textMuted },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
      {tiles.map(({ label, value, color }) => (
        <div key={label} style={{
          background: T.panel, border: `1px solid ${T.border}`,
          borderRadius: 6, padding: '14px 16px',
        }}>
          <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
            {label}
          </div>
          <div className="mono" style={{ fontSize: 20, fontWeight: 600, color }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}
