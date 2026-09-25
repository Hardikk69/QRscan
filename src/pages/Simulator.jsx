import { useEffect, useMemo, useRef, useState } from 'react';
import { createEncoder, formatBytes, truncateMiddle } from '../lib/protocol.js';
import { getNativeDetector } from '../lib/scanner.js';
import { chirp, successMelody } from '../lib/feedback.js';
import { useHashedFile } from '../hooks/useHashedFile.js';
import { useFrameLoop } from '../hooks/useFrameLoop.js';
import { useAssembler } from '../hooks/useAssembler.js';
import { FileDrop, InfoGrid, MissingChunks, ProgressBar, QrCanvas, Select, StatusBadge } from '../components/ui.jsx';
import { CHUNK_SIZE_OPTIONS, DEFAULTS, INTERVAL_OPTIONS, PER_FRAME_OPTIONS } from '../options.js';

const DROP_OPTIONS = [
  [0, '0% (Ideal transmission)'],
  [20, '20% Frame Drops (Tests Cycle Recovery)'],
  [40, '40% Frame Drops (Heavy Interference)']
];

export default function Simulator() {
  const [picked, selectFile] = useHashedFile();
  const [chunkSize, setChunkSize] = useState(DEFAULTS.chunkSize);
  const [interval, setFrameInterval] = useState(DEFAULTS.interval);
  const [perFrame, setPerFrame] = useState(DEFAULTS.perFrame);
  const [dropRate, setDropRate] = useState(0);
  const [realDecode, setRealDecode] = useState(true);
  const [detector, setDetector] = useState(undefined); // undefined = checking, null = unsupported

  // Settings are captured when a run starts
  const [run, setRun] = useState(null); // { encoder, perFrame, startTime }
  const [running, setRunning] = useState(false);
  const [senderStatus, setSenderStatus] = useState('IDLE');
  const [result, setResult] = useState(null); // { url, name, seconds, verified }

  const { asm, push, reset } = useAssembler();
  const canvasRef = useRef(null);
  const decodeBusyRef = useRef(false);
  const doneRef = useRef(false);

  const runPerFrame = run?.perFrame ?? perFrame;
  const { n, setN } = useFrameLoop(interval, running);
  const texts = useMemo(() => (run
    ? Array.from({ length: runPerFrame }, (_, i) => run.encoder.frameAt(n * runPerFrame + i))
    : []), [run, n, runPerFrame]);
  const framesPerPass = run ? Math.ceil(run.encoder.framesPerPass / runPerFrame) : 0;
  const pass = framesPerPass ? Math.floor(n / framesPerPass) + 1 : 1;

  useEffect(() => {
    getNativeDetector().then(setDetector);
  }, []);

  useEffect(() => () => {
    if (result?.url) URL.revokeObjectURL(result.url);
  }, [result]);

  const finish = async () => {
    setRunning(false);
    setSenderStatus('COMPLETED');
    const seconds = (performance.now() - run.startTime) / 1000;
    const { blob, verified } = await asm.reconstruct();
    setResult({ url: verified ? URL.createObjectURL(blob) : null, name: asm.meta.fileName, seconds, size: blob.size, verified });
    if (verified) successMelody();
    else alert('Simulation SHA-256 verification failed!');
  };

  // Simulated receiver: "scan" every frame the sender shows.
  // The canvas is drawn in QrCanvas's effect, which runs before this parent effect.
  useEffect(() => {
    if (!running) return;
    const scan = (text) => {
      if (doneRef.current || Math.random() < dropRate / 100) return; // Glare / missed code
      if (push(text) === 'data') chirp(880, 0.03);
      if (asm.isComplete) {
        doneRef.current = true;
        finish();
      }
    };

    if (detector && realDecode) {
      if (decodeBusyRef.current) return; // Decoder still busy = frame missed, like a slow camera
      decodeBusyRef.current = true;
      detector.detect(canvasRef.current)
        .then(codes => codes.forEach(c => scan(c.rawValue)))
        .catch(() => {})
        .finally(() => { decodeBusyRef.current = false; });
    } else {
      texts.forEach(scan);
    }
    // Deliberately runs once per displayed frame; other values are read from the latest render
  }, [texts, running]);

  const start = () => {
    const encoder = createEncoder({ bytes: picked.bytes, fileName: picked.file.name, fileType: picked.file.type, fileHash: picked.hash, chunkSize });
    reset();
    doneRef.current = false;
    setResult(null);
    setRun({ encoder, perFrame, startTime: performance.now() });
    setN(0);
    setRunning(true);
    setSenderStatus('TRANSMITTING');
  };

  const stop = () => {
    setRunning(false);
    setSenderStatus('STOPPED');
  };

  const received = asm.chunks.size;
  const total = asm.totalChunks;
  const pct = total ? Math.round((received / total) * 100) : 0;
  const receiverStatus = result ? 'VERIFIED' : running ? 'RECEIVING' : senderStatus === 'STOPPED' ? 'STOPPED' : 'WAITING';
  const rate = asm.rate();
  const useRealDecode = !!detector && realDecode;

  return (
    <>
      <div className="hero" style={{ padding: '1.5rem 0 0.5rem' }}>
        <h1>End-to-End Loopback Simulator</h1>
        <p>Test the full sender chunking, QR sequencing, receiver deduplication, and SHA-256 verification pipeline on a single screen.</p>
      </div>

      <div className="alert-box">
        <div className="alert-icon">ℹ️</div>
        <div className="alert-content">
          <strong>Optical Pipeline Simulation:</strong>
          <p>The left panel slices a real file and renders QR codes. The right panel reads the rendered frames (with a real QR decoder where the browser has one), ignores duplicates, tracks what is still missing, and reconstructs the file.</p>
        </div>
      </div>

      <div className="sim-grid">
        <section className="card">
          <div className="card-title">
            <span>1. Sender Simulation</span>
            <StatusBadge status={picked.status === 'READY' && senderStatus === 'IDLE' ? 'READY' : senderStatus} />
          </div>

          <FileDrop onFile={selectFile} compact />

          {picked.file && (
            <InfoGrid style={{ marginTop: '0.75rem' }} items={[
              ['File', picked.file.name],
              ['Size', formatBytes(picked.file.size)],
              ['SHA-256', picked.hash ? truncateMiddle(picked.hash, 8, 8) : 'Hashing...', picked.hash]
            ]} />
          )}

          <div className="config-row" style={{ margin: '0.75rem 0' }}>
            <Select id="simChunkSize" label="Chunk Size:" value={chunkSize} onChange={setChunkSize} options={CHUNK_SIZE_OPTIONS} />
            <Select id="simInterval" label="Speed:" value={interval} onChange={setFrameInterval} options={INTERVAL_OPTIONS} />
            <Select id="simPerFrame" label="QR Codes per Frame:" value={perFrame} onChange={setPerFrame} options={PER_FRAME_OPTIONS} />
          </div>

          <div className="controls-toolbar" style={{ marginBottom: '1rem' }}>
            <button className="btn-ctrl btn-primary" disabled={picked.status !== 'READY' || running} onClick={start}>▶ Start Simulation</button>
            <button className="btn-ctrl btn-secondary" disabled={!running} onClick={stop}>⏹ Stop</button>
          </div>

          <div className="qr-display-area" style={{ minHeight: 280, padding: '1rem' }}>
            <div className="qr-canvas-wrapper">
              <QrCanvas texts={texts} perFrame={runPerFrame} canvasRef={canvasRef} />
            </div>
            <div style={{ marginTop: '0.75rem', fontWeight: 600, fontSize: '0.85rem' }}>
              Frame: {framesPerPass ? (n % framesPerPass) + 1 : 0} / {framesPerPass} | {pass === 1 ? 'First pass' : `Repair pass ${pass}`}
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-title">
            <span>2. Receiver Simulation</span>
            <StatusBadge status={receiverStatus} />
          </div>

          <div className="config-row" style={{ marginBottom: '0.75rem' }}>
            <Select id="simDropRate" label="Simulate Glare / Frame Drop (%):" value={dropRate} onChange={setDropRate} options={DROP_OPTIONS} />
            <div className="form-group" style={{ justifyContent: 'flex-end' }}>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', marginTop: '1.6rem', fontSize: '0.85rem' }}
                title="Decode the rendered canvas with the browser's native BarcodeDetector instead of passing the text directly"
              >
                <input type="checkbox" checked={useRealDecode} disabled={!detector} onChange={e => setRealDecode(e.target.checked)} />
                <span>Real QR decode</span>
              </label>
            </div>
          </div>

          <ProgressBar
            left={`${received} / ${total} chunks (${pct}%)`}
            right={asm.missingCount > 0 ? `Missing: ${asm.missingCount}` : received && !asm.meta ? 'Waiting for metadata frame' : '0 missing'}
            rightStyle={{ color: 'var(--warning)' }}
            pct={pct}
          />

          {received > 0 && <MissingChunks title="Missing Frame Numbers:" missing={asm.missing(15)} count={asm.missingCount} />}

          <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <span>Duplicates filtered: {asm.duplicates}</span> &bull;{' '}
            <span>{result
              ? `Done in ${result.seconds.toFixed(1)}s (${formatBytes(result.size / result.seconds, 1)}/s)`
              : `Throughput: ${formatBytes(rate, 1)}/s`}
            </span> &bull;{' '}
            <span>Decode: {detector === undefined ? '-' : detector ? 'native BarcodeDetector' : 'logical (no BarcodeDetector in this browser)'}</span>
          </div>

          {result?.verified && (
            <div className="alert-box alert-success" style={{ marginTop: '1.25rem' }}>
              <div className="alert-icon">✓</div>
              <div className="alert-content" style={{ width: '100%' }}>
                <strong>100% Transfer & SHA-256 Verified!</strong>
                <p style={{ margin: '0.25rem 0' }}>Reconstructed hash matches original.</p>
                <div style={{ marginTop: '0.75rem' }}>
                  <a className="action-btn btn-success" style={{ display: 'inline-block', padding: '0.5rem 1rem', fontSize: '0.9rem' }} href={result.url} download={result.name}>
                    Download Reconstructed File
                  </a>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
