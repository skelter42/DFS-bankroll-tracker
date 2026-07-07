import { T } from '../constants';

interface Props {
  roi: number;
  small?: boolean;
}

export function RoiTag({ roi, small }: Props) {
  const pos = roi >= 0;
  return (
    <div
      className="mono"
      style={{ fontSize: small ? 12 : 13, color: pos ? T.gold : T.rust, fontWeight: 600 }}
    >
      ROI {pos ? '+' : ''}{(roi * 100).toFixed(1)}%
    </div>
  );
}
