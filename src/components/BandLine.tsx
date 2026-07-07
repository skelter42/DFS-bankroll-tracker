import { T, NOISE_FLOOR } from '../constants';
import type { Band } from '../types';

interface Props {
  bands: Band[];
  compact?: boolean;
}

export function BandLine({ bands, compact }: Props) {
  return (
    <div style={{ display: 'flex', gap: compact ? 20 : 28, flexWrap: 'wrap' }}>
      {bands.map((b) => {
        const scaleMax  = b.baseline * 3;
        const basePos   = (b.baseline / scaleMax) * 100;
        const actualPos = Math.min((b.actual / scaleMax) * 100, 100);
        const delta     = b.actual - b.baseline;
        const deltaPp   = delta * 100;
        const lowSample = b.hits < NOISE_FLOOR;
        const color     = lowSample
          ? T.textMuted
          : delta >  0.0005 ? T.gold
          : delta < -0.0005 ? T.rust
          : T.blue;

        return (
          <div key={b.label} style={{ minWidth: compact ? 130 : 150 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: T.textMuted, letterSpacing: '0.03em' }}>
                {b.label}
              </span>
              <span className="mono" style={{ fontSize: 12, color, fontWeight: 600 }}>
                {deltaPp > 0 ? '+' : ''}{deltaPp.toFixed(2)}pp
              </span>
            </div>

            {/* market-line track */}
            <div style={{ position: 'relative', height: 16 }}>
              <div style={{
                position: 'absolute', top: 7, left: 0, right: 0,
                height: 2, background: T.border, borderRadius: 1,
              }} />
              {/* baseline tick */}
              <div
                style={{
                  position: 'absolute', top: 3, left: `${basePos}%`,
                  width: 2, height: 10, background: T.blue,
                  transform: 'translateX(-1px)',
                }}
                title={`Baseline: ${(b.baseline * 100).toFixed(1)}%`}
              />
              {/* actual marker */}
              <div
                style={{
                  position: 'absolute', top: 2, left: `${actualPos}%`,
                  width: 10, height: 10, borderRadius: '50%',
                  background: color, transform: 'translateX(-5px)',
                  boxShadow: `0 0 0 2px ${T.panel}`,
                }}
                title={`Actual: ${(b.actual * 100).toFixed(2)}%`}
              />
            </div>

            <div className="mono" style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
              {(b.actual * 100).toFixed(2)}% actual
              {lowSample && <span> · low n ({b.hits})</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
