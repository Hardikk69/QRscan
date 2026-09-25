import { useEffect, useMemo, useRef, useState } from 'react';
import { createEncoder, formatBytes, truncateMiddle } from '../lib/protocol.js';
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

  const encoder = useMemo(() => (picked.status === 'READY'
    ? createEncoder({ bytes: picked.bytes, fileName: picked.file.name, fileType: picked.file.type, fileHash: picked.hash, chunkSize })
    : null), [picked, chunkSize]);

  const { n, setN } = useFrameLoop(interval, mode === 'TRANSMITTING');
  const texts = useMemo(() => (encoder
    ? Array.from({ length: perFrame }, (_, i) => encoder.frameAt(n * perFrame + i))
    : []), [encoder, n, perFrame]);

  // New file / chunk size / codes per frame: start the packet stream again
  useEffect(() => setN(0), [encoder, perFrame, setN]);

  const onFile = (file) => {
    setMode('SETUP');
    selectFile(file);
  };

  const start = () => {
    setN(0);
    setMode('TRANSMITTING');
    requestAnimationFrame(() => transmissionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const status = mode === 'SETUP' ? picked.status : mode;
  // Frames per pass = enough to show every chunk once; after that it is repair packets
  const framesPerPass = encoder ? Math.ceil(encoder.framesPerPass / perFrame) : 0;
  const pass = framesPerPass ? Math.floor(n / framesPerPass) + 1 : 1;
  const pct = framesPerPass ? Math.round((((n % framesPerPass) + 1) / framesPerPass) * 100) : 0;

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
          <button className="btn-ctrl btn-primary" disabled={!encoder} onClick={start}>Start Transfer</button>
        </div>
      </section>

      {mode !== 'SETUP' && encoder && (
        <section className="card" ref={transmissionRef}>
          <div className="card-title">
            <span>2. QR Frame Transmission</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span className="badge badge-primary">{pass === 1 ? 'Pass 1' : `Repair pass ${pass}`}</span>
              <span className="badge badge-neutral">{interval} ms</span>
            </div>
          </div>

          <div className="qr-display-area">
            <div className="qr-canvas-wrapper" ref={wrapperRef}>
              <QrCanvas texts={texts} perFrame={perFrame} />
            </div>
          </div>

          <ProgressBar
            left={`Frame ${(n % framesPerPass) + 1} / ${framesPerPass}`}
            right={pass === 1 ? `${pct}% of first pass` : `${pct}% of repair pass ${pass}`}
            pct={pct}
          />

          <div className="controls-toolbar">
            {mode === 'TRANSMITTING'
              ? <button className="btn-ctrl btn-secondary" onClick={() => setMode('PAUSED')}>⏸ Pause</button>
              : <button className="btn-ctrl btn-primary" onClick={() => setMode('TRANSMITTING')}>▶ Resume</button>}
            <button className="btn-ctrl btn-danger" onClick={() => setMode('STOPPED')}>⏹ Stop</button>
            <button className="btn-ctrl btn-secondary" onClick={() => setN(0)}>↺ Restart</button>
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
                <li>Keep sending until the receiver reports 100%: every frame after the first pass repairs whatever it missed</li>
              </ul>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
