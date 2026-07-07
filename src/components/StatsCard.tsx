import type { CSSProperties } from 'react';
import { T } from '../constants';
import { BandLine } from './BandLine';
import { RoiTag } from './RoiTag';
import type { SportStat, OverallStat } from '../types';

const card: CSSProperties = {
  background: T.panel,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
};

const cardHeader: CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
  flexWrap: 'wrap', gap: '4px 12px',
};

export function OverallCard({ stat }: { stat: OverallStat }) {
  return (
    <div style={{ ...card, padding: '20px 20px 22px', marginBottom: 20 }}>
      <div style={{ ...cardHeader, marginBottom: 16 }}>
        <div className="display" style={{ fontSize: 16, fontWeight: 600 }}>
          All sports · {stat.n.toLocaleString()} entries
        </div>
        <RoiTag roi={stat.roi} />
      </div>
      <BandLine bands={stat.bands} />
    </div>
  );
}

export function SportCard({ stat }: { stat: SportStat }) {
  return (
    <div style={{ ...card, padding: '16px 20px 18px' }}>
      <div style={{ ...cardHeader, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="display" style={{ fontSize: 14, fontWeight: 600 }}>{stat.sport}</span>
          <span className="mono" style={{ fontSize: 12, color: T.textMuted }}>n={stat.n}</span>
        </div>
        <RoiTag roi={stat.roi} small />
      </div>
      <BandLine bands={stat.bands} compact />
    </div>
  );
}
