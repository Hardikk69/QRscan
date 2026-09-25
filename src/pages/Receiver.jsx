import { useEffect, useRef, useState } from 'react';
import { formatBytes, truncateMiddle } from '../lib/protocol.js';
import { listCameras, startScanner } from '../lib/scanner.js';
import { chirp, haptic, successMelody } from '../lib/feedback.js';
import { useAssembler } from '../hooks/useAssembler.js';
import { InfoGrid, MissingChunks, ProgressBar, StatusBadge } from '../components/ui.jsx';

export default function Receiver() {
  const { asm, push, reset } = useAssembler();
  const [status, setStatus] = useState('WAITING');
  const [cameras, setCameras] = useState([]); // Filled in after permission is granted
  const [cameraId, setCameraId] = useState(''); // '' = let the browser pick the rear camera
  const [activeCamera, setActiveCamera] = useState('');
  const [audio, setAudio] = useState(true);
  const [scanMode, setScanMode] = useState(null); // null (camera off) | 'native' | 'library'
  const [result, setResult] = useState(null);    // { url, name, size, hash, verified }
  const readerRef = useRef(null);
  const scannerRef = useRef(null);   // Running scanner, 'starting' while it boots, or null
  const completingRef = useRef(false);
  const onTextRef = useRef(null);

  // Release the camera when leaving the page
  useEffect(() => () => {
    const s = scannerRef.current;
    if (s && s !== 'starting') s.stop();
  }, []);

  // Free the previous download URL
  useEffect(() => () => {
    if (result?.url) URL.revokeObjectURL(result.url);
  }, [result]);

  const startCamera = async (id = cameraId) => {
    if (scannerRef.current) return;
    scannerRef.current = 'starting';
    setStatus(s => (s === 'WAITING' || s === 'ERROR' ? 'SCANNING' : s));
    try {
      const scanner = await startScanner(readerRef.current, id, text => onTextRef.current(text));
      scannerRef.current = scanner;
      setScanMode(scanner.native ? 'native' : 'library');
      setActiveCamera(scanner.label);
      listCameras().then(setCameras); // Labels are only available once permission is granted
    } catch (err) {
      scannerRef.current = null;
      console.error('Camera start failure:', err);
      setStatus('ERROR');
      alert('Failed to start camera: ' + (err.message || err));
    }
  };

  const stopCamera = async () => {
    const scanner = scannerRef.current;
    if (!scanner || scanner === 'starting') return;
    scannerRef.current = null;
    try {
      await scanner.stop();
    } catch (err) {
      console.warn('Error stopping camera:', err);
    }
    setScanMode(null);
    setActiveCamera('');
    setStatus(s => (s === 'SCANNING' ? 'WAITING' : s));
  };

  const finish = async () => {
    await stopCamera();
    setStatus('VERIFYING');
    try {
      const { blob, hash, verified } = await asm.reconstruct();
      setResult({ url: verified ? URL.createObjectURL(blob) : null, name: asm.meta.fileName, size: blob.size, hash, verified });
      setStatus(verified ? 'COMPLETED' : 'ERROR');
      if (verified && audio) successMelody();
    } catch (err) {
      console.error('Reconstruction error:', err);
      setStatus('ERROR');
      alert('File reconstruction failed: ' + err.message);
    }
  };

  const onText = (text) => {
    if (completingRef.current) return;
    const kind = push(text);
    if (kind === 'data' || kind === 'meta') setStatus('RECEIVING');
    if (kind === 'data' && audio) {
      chirp(880, 0.04);
      haptic(25);
    }
    if (asm.isComplete) {
      completingRef.current = true;
      finish();
    }
  };
  // The scanner keeps its first callback, so route it to the latest render's handler
  useEffect(() => {
    onTextRef.current = onText;
  });

  const resetTransfer = () => {
    reset();
    completingRef.current = false;
    setResult(null);
    setStatus(scannerRef.current ? 'SCANNING' : 'WAITING');
  };

  const changeCamera = async (id) => {
    setCameraId(id);
    if (scannerRef.current && scannerRef.current !== 'starting') {
      await stopCamera();
      startCamera(id);
    }
  };

  const received = asm.chunks.size;
  const total = asm.totalChunks;
  const pct = total ? Math.round((received / total) * 100) : 0;
  const meta = asm.meta;
  const rate = asm.rate();

  return (
    <>
      <div className="hero" style={{ padding: '1.5rem 0 1rem' }}>
        <h1>Receiver Device</h1>
        <p>Point camera at the sender screen to scan QR frames and assemble the file.</p>
      </div>

      <section className="card">
        <div className="card-title">
          <span>Camera Scanner</span>
          <StatusBadge status={status} />
        </div>

        <div className="config-row" style={{ marginBottom: '1rem' }}>
          <div className="form-group" style={{ flex: 2 }}>
            <label htmlFor="cameraSelect">Camera Source:</label>
            <select id="cameraSelect" className="form-select" value={cameraId} onChange={e => changeCamera(e.target.value)}>
              <option value="">Rear camera (automatic)</option>
              {cameras.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
            {activeCamera && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Using: {activeCamera}</span>}
          </div>
          <div className="form-group" style={{ flex: 1, justifyContent: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', marginTop: '1.6rem', fontSize: '0.85rem' }}>
              <input type="checkbox" checked={audio} onChange={e => setAudio(e.target.checked)} />
              <span>Audio Chirp</span>
            </label>
          </div>
        </div>

        <div className="camera-container">
          {/* html5-qrcode / the native scanner own this element's children; React leaves it empty */}
          <div id="reader" ref={readerRef} />
          {scanMode !== 'native' && <div className="viewfinder-box" />}
        </div>

        <div className="controls-toolbar" style={{ marginTop: '1rem' }}>
          {scanMode
            ? <button className="btn-ctrl btn-secondary" onClick={stopCamera}>Stop Camera</button>
            : <button className="btn-ctrl btn-primary" onClick={() => startCamera()}>📷 Start Camera</button>}
          <button className="btn-ctrl btn-secondary" onClick={resetTransfer}>↺ Reset Transfer</button>
        </div>

        {!scanMode && (
          <div className="alert-box" style={{ marginTop: '1rem' }}>
            <div className="alert-icon">ℹ️</div>
            <div className="alert-content">
              <strong>Camera Access Required:</strong>
              <p>Please allow camera permissions. On phones the rear camera is requested automatically; pick a specific camera above only if the wrong one opens. If using another device on the same local network, modern browsers require HTTPS or localhost for camera access.</p>
            </div>
          </div>
        )}
        {scanMode === 'library' && (
          <div className="alert-box" style={{ marginTop: '1rem' }}>
            <div className="alert-icon">⚠️</div>
            <div className="alert-content">
              <strong>Slow scanner in this browser:</strong>
              <p>This browser can only read one QR code at a time. Set the sender to &quot;1 QR code per frame&quot;. Android or Mac Chrome is much faster.</p>
            </div>
          </div>
        )}
      </section>

      {asm.transferId && (
        <section className="card">
          <div className="card-title">
            <span>Receiving File</span>
            <span className="badge badge-primary">{rate ? `${formatBytes(rate, 1)}/s` : '0 B/s'}</span>
          </div>

          <InfoGrid items={[
            ['File Name', meta?.fileName ?? '-'],
            ['File Type', meta?.fileType ?? '-'],
            ['File Size', meta ? formatBytes(meta.fileSize) : '-'],
            ['Sender Hash', meta ? truncateMiddle(meta.fileHash, 8, 8) : '-', meta?.fileHash]
          ]} />

          <div style={{ marginTop: '1.25rem' }}>
            <ProgressBar
              left={`${received} / ${total} chunks (${pct}%)`}
              right={asm.missingCount > 0 ? `Missing: ${asm.missingCount}` : 'All chunks received!'}
              rightStyle={{ color: asm.missingCount > 0 ? 'var(--warning)' : 'var(--success)', fontWeight: 600 }}
              pct={pct}
            />
          </div>

          {received > 0 && (
            <MissingChunks title="Chunks still missing (keep scanning; later frames repair them):" missing={asm.missing(25)} count={asm.missingCount} />
          )}

          <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Duplicate scans skipped: {asm.duplicates}</span>
            <span>ID: {asm.transferId}</span>
          </div>
        </section>
      )}

      {result && (
        <section className="card">
          <div className="completed-card">
            <div className="completed-icon">{result.verified ? '🎉' : '⚠️'}</div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{result.verified ? 'Transfer Complete!' : 'Transfer Failed'}</h2>

            <div className={`alert-box ${result.verified ? 'alert-success' : 'alert-danger'}`} style={{ maxWidth: 500, margin: '1rem auto', textAlign: 'left' }}>
              <div className="alert-icon">{result.verified ? '✓' : '✗'}</div>
              <div className="alert-content">
                <strong>{result.verified ? 'File Integrity Verified!' : 'File Integrity Verification Failed!'}</strong>
                <p>{result.verified
                  ? 'Reconstructed SHA-256 perfectly matches the original file.'
                  : `The reconstructed file's SHA-256 (${result.hash.substring(0, 16)}...) did not match the sender hash (${meta.fileHash.substring(0, 16)}...). The file may be corrupt.`}
                </p>
              </div>
            </div>

            <InfoGrid style={{ maxWidth: 500, margin: '1rem auto', textAlign: 'left' }} items={[
              ['File Name', result.name],
              ['Size', formatBytes(result.size)],
              ['Verified SHA-256', <span key="h" style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{result.hash}</span>]
            ]} />

            <div className="download-actions">
              {result.verified && (
                <a className="action-btn btn-success" href={result.url} download={result.name}>📥 DOWNLOAD FILE</a>
              )}
              <button className="btn-ctrl btn-secondary" style={{ justifyContent: 'center' }} onClick={() => { resetTransfer(); startCamera(); }}>
                Transfer Another File
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
