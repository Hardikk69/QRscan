import { useEffect, useRef, useState } from 'react';
import { drawQrGrid } from '../lib/qrGrid.js';

const BADGE_COLORS = {
  IDLE: 'badge-neutral', WAITING: 'badge-neutral', STOPPED: 'badge-neutral',
  READY: 'badge-primary', SCANNING: 'badge-primary', RECEIVING: 'badge-primary',
  PREPARING: 'badge-warning', PAUSED: 'badge-warning', VERIFYING: 'badge-warning',
  TRANSMITTING: 'badge-success', COMPLETED: 'badge-success', VERIFIED: 'badge-success',
  ERROR: 'badge-danger'
};

export function StatusBadge({ status }) {
  return <span className={`badge ${BADGE_COLORS[status] || 'badge-neutral'}`}>{status}</span>;
}

/** Click-to-browse / drag-and-drop file picker. */
export function FileDrop({ onFile, compact = false, hint }) {
  const inputRef = useRef(null);
  const [dragover, setDragover] = useState(false);

  return (
    <div
      className={`drop-zone${dragover ? ' dragover' : ''}`}
      style={compact ? { padding: '1.5rem 1rem' } : undefined}
      onClick={() => inputRef.current.click()}
      onDragOver={e => { e.preventDefault(); setDragover(true); }}
      onDragLeave={() => setDragover(false)}
      onDrop={e => {
        e.preventDefault();
        setDragover(false);
        onFile(e.dataTransfer.files[0]);
      }}
    >
      <div className="drop-icon" style={compact ? { fontSize: '2rem' } : undefined}>📁</div>
      <p><strong>Click to browse</strong> or drag & drop a file here</p>
      {hint && <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={e => {
          onFile(e.target.files[0]);
          e.target.value = ''; // Allow picking the same file again
        }}
      />
    </div>
  );
}

/** Label/value grid. items: [label, value, title?][] */
export function InfoGrid({ items, style }) {
  return (
    <div className="file-info-grid" style={style}>
      {items.map(([label, value, title]) => (
        <div className="info-item" key={label}>
          <span className="info-label">{label}</span>
          <span className="info-value" title={title}>{value}</span>
        </div>
      ))}
    </div>
  );
}

export function ProgressBar({ left, right, rightStyle, pct }) {
  return (
    <div className="progress-container">
      <div className="progress-header">
        <span>{left}</span>
        <span style={rightStyle}>{right}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Pills for missing chunk numbers. `missing` is already limited; `count` is the full total. */
export function MissingChunks({ title, missing, count }) {
  if (count === 0) return null;
  return (
    <div className="missing-chunks-box">
      <strong>{title}</strong>
      <div className="chunks-badge-list">
        {missing.map(i => <span className="chunk-pill" key={i}>#{i + 1}</span>)}
        {count > missing.length && <span className="chunk-pill">+{count - missing.length} more</span>}
      </div>
    </div>
  );
}

/** Canvas showing the current frame's QR codes. Pass canvasRef to read the canvas from the parent. */
export function QrCanvas({ texts, perFrame, canvasRef }) {
  const ownRef = useRef(null);
  const ref = canvasRef || ownRef;

  useEffect(() => {
    if (!texts.length) return;
    try {
      drawQrGrid(ref.current, texts, perFrame);
    } catch (err) {
      console.error('QR rendering error:', err);
    }
  }, [texts, perFrame, ref]);

  return <canvas ref={ref} width="800" height="800" />;
}

/** Labeled <select>. options: [value, label][] */
export function Select({ id, label, value, onChange, options }) {
  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="form-select" value={value} onChange={e => onChange(Number(e.target.value))}>
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </div>
  );
}
