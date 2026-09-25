const STEPS = [
  ['Select a file', 'Pick any image, PDF, text, document, or archive directly from your device storage.'],
  ['File is split into frames', 'The file is sliced into small binary chunks, Base45-encoded into compact QR codes, with a SHA-256 hash in a separate metadata frame.'],
  ['QR frames appear rapidly', 'The sender screen shows a stream of fountain-coded QR frames, so any frame the camera misses is covered by later ones.'],
  ['Receiver scans with camera', "The receiver's camera captures frames, ignoring duplicates and tracking missing parts."],
  ['Reconstruction & verify', 'Once enough frames are captured the file is decoded, SHA-256 verified, and ready for instant local download.']
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>Offline File Transfer</h1>
        <p>Transfer files using only a screen and camera. No Wi-Fi. No Bluetooth. No Internet required during transfer.</p>
      </section>

      <section className="action-grid">
        <a href="#/send" className="action-card send-card">
          <div className="card-icon">📤</div>
          <h2>Send File</h2>
          <p>Select any file to slice into QR frames and broadcast on your screen.</p>
          <span className="action-btn btn-primary">SEND FILE</span>
        </a>
        <a href="#/receive" className="action-card receive-card">
          <div className="card-icon">📥</div>
          <h2>Receive File</h2>
          <p>Open camera, scan sequential QR frames, and assemble the file locally.</p>
          <span className="action-btn btn-success">RECEIVE FILE</span>
        </a>
      </section>

      <div className="alert-box">
        <div className="alert-icon">🛡️</div>
        <div className="alert-content">
          <strong>100% Client-Side & Air-Gapped</strong>
          <p>No file is uploaded to any server. Transfer happens purely through optical light captured by the camera sensor, protected by SHA-256 integrity verification.</p>
        </div>
      </div>

      <section className="card">
        <div className="card-title">
          <span>How It Works</span>
          <span className="badge badge-primary">Optical Air-Gap</span>
        </div>
        <div className="steps-list">
          {STEPS.map(([title, text], i) => (
            <div className="step-card" key={title}>
              <div className="step-num">{i + 1}</div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="card" style={{ textAlign: 'center', padding: '1.25rem' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Testing on a single device? Use the built-in{' '}
          <a href="#/simulator" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'underline' }}>Loopback Simulator</a>{' '}
          to test chunking, sequencing, scanning, and SHA-256 verification on one screen.
        </p>
      </div>
    </>
  );
}
