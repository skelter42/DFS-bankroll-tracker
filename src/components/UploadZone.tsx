import { useState } from 'react';
import { Upload, AlertTriangle } from 'lucide-react';
import { T } from '../constants';

interface Props {
  onFile: (file: File) => void;
  error: string;
}

export function UploadZone({ onFile, error }: Props) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div>
      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          border: `1px dashed ${dragOver ? T.gold : T.border}`,
          background: dragOver ? 'rgba(201,162,39,0.06)' : T.panel,
          borderRadius: 6,
          padding: '48px 24px',
          cursor: 'pointer',
          transition: 'border-color 120ms, background 120ms',
        }}
      >
        <Upload size={22} color={dragOver ? T.gold : T.blue} strokeWidth={1.5} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: T.textPrimary }}>
            Drop your contest history CSV, or click to browse
          </div>
          <div className="mono" style={{ fontSize: 12, color: T.textMuted, marginTop: 4, wordBreak: 'break-all' }}>
            draftkings-contest-entry-history.csv
          </div>
        </div>
        <input
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </label>

      {error && (
        <div style={{
          marginTop: 12,
          display: 'flex', gap: 8, alignItems: 'flex-start',
          color: T.rust, fontSize: 13,
        }}>
          <AlertTriangle size={15} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* DraftKings export instructions */}
      <div style={{
        marginTop: 16,
        background: T.panel,
        border: `1px solid ${T.border}`,
        borderRadius: 6,
        padding: '14px 16px',
      }}>
        <div style={{
          fontSize: 11, color: T.textMuted, letterSpacing: '0.06em',
          textTransform: 'uppercase', marginBottom: 10,
        }}>
          How to export from DraftKings
        </div>
        <ol style={{
          margin: 0, paddingLeft: 18,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {[
            <>Go to <strong style={{ color: T.textPrimary }}>DraftKings.com</strong> and sign in</>,
            <>Click <strong style={{ color: T.textPrimary }}>Contests</strong> in the top navigation</>,
            <>Select <strong style={{ color: T.textPrimary }}>Contest History</strong> from the dropdown</>,
            <>Click <strong style={{ color: T.textPrimary }}>Download CSV</strong> — the file saves to your device</>,
          ].map((step, i) => (
            <li key={i} style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.5 }}>
              {step}
            </li>
          ))}
        </ol>
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: `1px solid ${T.border}`,
          fontSize: 12, color: T.textMuted, lineHeight: 1.5,
        }}>
          Your CSV never leaves your browser — all processing happens locally.
        </div>
      </div>
    </div>
  );
}
