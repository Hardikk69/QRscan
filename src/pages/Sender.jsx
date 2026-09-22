import { useEffect, useMemo, useRef, useState } from 'react';
import { buildFrames, formatBytes, truncateMiddle } from '../lib/protocol.js';
import { useHashedFile } from '../hooks/useHashedFile.js';
import { useFrameLoop } from '../hooks/useFrameLoop.js';
import { FileDrop, InfoGrid, ProgressBar, QrCanvas, Select, StatusBadge } from '../components/ui.jsx';
import { CHUNK_SIZE_OPTIONS, DEFAULTS, INTERVAL_OPTIONS, PER_FRAME_OPTIONS } from '../options.js';

export default function Sender() {
  const [picked, selectFile] = useHashedFile();
  const [chunkSize, setChunkSize] = useState(DEFAULTS.chunkSize);
  const [interval, setFrameInterval] = useState(DEFAULTS.interval);
  const [perFrame, setPerFrame] = useState(DEFAULTS.perFrame);
  // 'SETUP' until the first Start, then TRANSMITTING | PAUSED | STOPPED
  const [mode, setMode] = useState('SETUP');
  const transmissionRef = useRef(null);
  const wrapperRef = useRef(null);

  const prepared = useMemo(() => (picked.status === 'READY'
    ? buildFrames({ bytes: picked.bytes, fileName: picked.file.name, fileType: picked.file.type, fileHash: picked.hash, chunkSize })
    : null), [picked, chunkSize]);
  const frames = prepared?.frames ?? [];
  const frameCount = Math.ceil(frames.length / perFrame);

  const { index, cycle, setPos } = useFrameLoop(frameCount, interval, mode === 'TRANSMITTING');
  const texts = useMemo(() => frames.slice(index * perFrame, (index + 1) * perFrame), [frames, index, perFrame]);

  // New file / chunk size / codes per frame: start again from frame 0
  useEffect(() => setPos({ index: 0, cycle: 1 }), [prepared, perFrame, setPos]);

  const onFile = (file) => {
    setMode('SETUP');
    selectFile(file);
  };

  const start = () => {
    setPos({ index: 0, cycle: 1 });
    setMode('TRANSMITTING');
    requestAnimationFrame(() => transmissionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const scrub = (value) => {
    if (mode === 'TRANSMITTING') setMode('PAUSED');
    setPos(p => ({ ...p, index: value }));
  };

  const status = mode === 'SETUP' ? picked.status : mode;
  const pct = frameCount ? Math.round(((index + 1) / frameCount) * 100) : 0;

  return (
    <>
      <div className="hero" style={{ padding: '1.5rem 0 1rem' }}>
        <h1>Sender Device</h1>
        <p>Select a file to slice into sequential QR frames and broadcast optically.</p>
      </div>

      <section className="card">
        <div className="card-title">
          <span>1. Select File</span>
          <StatusBadge status={status} />
        </div>

        <FileDrop onFile={onFile} hint="Images, PDF, TXT, DOCX, ZIP, etc. (air-gapped transfer)" />

        {picked.file && (
          <>
            <InfoGrid items={[
              ['File Name', picked.file.name],
              ['File Type', picked.file.type || 'application/octet-stream'],
              ['File Size', formatBytes(picked.file.size)],
              ['SHA-256 Hash', picked.hash ? truncateMiddle(picked.hash, 10, 10) : 'Computing SHA-256...', picked.hash && `Full SHA-256: ${picked.hash}`]
            ]} />

            <div className="config-row">
              <Select id="chunkSize" label="Chunk Size (Bytes):" value={chunkSize} onChange={setChunkSize} options={CHUNK_SIZE_OPTIONS} />
              <Select id="interval" label="Frame Interval (Speed):" value={interval} onChange={setFrameInterval} options={INTERVAL_OPTIONS} />
              <Select id="perFrame" label="QR Codes per Frame:" value={perFrame} onChange={setPerFrame} options={PER_FRAME_OPTIONS} />
            </div>
          </>
        )}

        <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-ctrl btn-primary" disabled={!prepared} onClick={start}>Start Transfer</button>
        </div>
      </section>

      {mode !== 'SETUP' && prepared && (
        <section className="card" ref={transmissionRef}>
          <div className="card-title">
            <span>2. QR Frame Transmission</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span className="badge badge-primary">Cycle: {cycle}</span>
              <span className="badge badge-neutral">{interval} ms</span>
            </div>
          </div>

          <div className="qr-display-area">
            <div className="qr-canvas-wrapper" ref={wrapperRef}>
              <QrCanvas texts={texts} perFrame={perFrame} />
            </div>
          </div>

          <ProgressBar left={`Frame ${index + 1} / ${frameCount}`} right={`${pct}% Complete`} pct={pct} />

          <div style={{ margin: '0.5rem 0 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Scrub:</span>
            <input
              type="range" min="0" max={frameCount - 1} value={index}
              onChange={e => scrub(Number(e.target.value))}
              style={{ flex: 1, cursor: 'pointer' }}
            />
          </div>

          <div className="controls-toolbar">
            {mode === 'TRANSMITTING'
              ? <button className="btn-ctrl btn-secondary" onClick={() => setMode('PAUSED')}>⏸ Pause</button>
              : <button className="btn-ctrl btn-primary" onClick={() => setMode('TRANSMITTING')}>▶ Resume</button>}
            <button className="btn-ctrl btn-danger" onClick={() => setMode('STOPPED')}>⏹ Stop</button>
            <button className="btn-ctrl btn-secondary" onClick={() => setPos({ index: 0, cycle: 1 })}>↺ Restart Cycle</button>
            <button className="btn-ctrl btn-secondary" onClick={() => wrapperRef.current.requestFullscreen?.()}>⛶ Fullscreen</button>
          </div>

          <div className="alert-box" style={{ marginTop: '1.5rem' }}>
            <div className="alert-icon">💡</div>
            <div className="alert-content">
              <strong>For best scanning results:</strong>
              <ul>
                <li>Use Fullscreen and increase screen brightness to maximum</li>
                <li>Keep sender screen and receiver camera steady</li>
                <li>Keep every QR code inside the receiver camera view</li>
                <li>Avoid direct glare, sunlight, or screen reflections</li>
              </ul>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
