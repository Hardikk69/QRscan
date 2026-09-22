# Offline Camera-Based QR File Transfer System

An air-gapped, zero-network, purely client-side web application for transferring files between nearby devices using only the **sender's screen and the receiver's camera**.

---

## 1. Problem Statement

Modern file sharing methods heavily rely on external infrastructure:
- **Wi-Fi networks** may be untrusted, monitored, non-existent, or have captive portals.
- **Bluetooth** frequently suffers from cross-platform pairing failures (e.g. between iOS, Android, macOS, and Windows) and slow discovery.
- **Cloud & Messaging Services** (Drive, WhatsApp, AirDrop, Quick Share) require an active internet connection, accounts, or proprietary vendor ecosystems.
- **Air-gapped security environments** forbid radio emissions (Wi-Fi, Bluetooth, NFC, cellular) for confidentiality reasons.

When two devices are physically right next to each other, light emitted by a screen and captured by an optical camera sensor provides a universal, zero-network communication channel.

---

## 2. Solution: Optical Air-Gap Transfer

The **Offline File Transfer** application slices any binary file into sequentially indexed frames, renders them as high-density QR codes on the sender device's screen, captures and decodes them with the receiver device's camera, validates chunks against duplicates, and assembles the exact file locally with SHA-256 cryptographic verification.

```text
SENDER DEVICE                                              RECEIVER DEVICE
┌─────────────┐                                            ┌─────────────┐
│ Select File │                                            │ Start Cam   │
└──────┬──────┘                                            └──────┬──────┘
       ▼                                                          ▼
┌─────────────┐                                            ┌─────────────┐
│ Read Buffer │                                            │ Scan Video  │
└──────┬──────┘                                            └──────┬──────┘
       ▼                                                          ▼
┌─────────────┐                                            ┌─────────────┐
│ Calc SHA-256│                                            │ Decode QR   │
└──────┬──────┘                                            └──────┬──────┘
       ▼                                                          ▼
┌─────────────┐                                            ┌─────────────┐
│ Slice Chunks│                                            │ Parse JSON  │
└──────┬──────┘                                            └──────┬──────┘
       ▼                                                          ▼
┌─────────────┐                                            ┌─────────────┐
│ Base64 Data │                                            │ Deduplicate │
└──────┬──────┘                                            └──────┬──────┘
       ▼                                                          ▼
┌─────────────┐       Optical Light / Air-Gap Channel      ┌─────────────┐
│ Sequence QR ├═══════════════════════════════════════════►│ Store Chunk │
└─────────────┘                                            └──────┬──────┘
                                                                  ▼
                                                           ┌─────────────┐
                                                           │ Reconstruct │
                                                           └──────┬──────┘
                                                                  ▼
                                                           ┌─────────────┐
                                                           │ Verify Hash │
                                                           └──────┬──────┘
                                                                  ▼
                                                           ┌─────────────┐
                                                           │ Save & D/L  │
                                                           └─────────────┘
```

---

## 3. Key Features

- **100% Client-Side & Air-Gapped**: Zero server upload, zero backend, zero database, zero telemetry.
- **React + Vite**: Small, testable modules; `npm run build` produces a static site that runs fully offline.
- **Offline Self-Contained**: QR libraries are bundled into the build; no CDN needed.
- **Binary Integrity via Web Crypto SHA-256**: Reconstructed files are verified byte-for-byte against the original hash before the user can download.
- **Continuous Transmission Cycles**: Chunks cycle indefinitely (`Cycle 1, 2, 3...`), allowing the receiver to recover missing frames dropped due to camera glare or distance.
- **Smart Deduplication & Missing Chunk Tracker**: Duplicate scans are filtered out; missing chunk indexes are tracked and visibly presented to the user.
- **Adaptive Frame Tuning**: Easily toggle chunk sizes (300 B - 1000 B) and frame intervals (400 ms - 1500 ms).
- **Single-Screen Loopback Simulator**: Includes `simulator.html` to simulate transmission and test frame drops, cycle recovery, and reassembly on a single device.
- **Mobile Responsive**: Designed with mobile-first viewport styling, rear camera auto-selection (`facingMode: "environment"`), and subtle audio/haptic feedback.

---

## 4. Technical Architecture & Chunk Metadata

Each optical frame encapsulates a standardized JSON envelope:

```json
{
  "protocol": "OFFLINE_TRANSFER_V1",
  "transferId": "tx_k3j189a_x7z912",
  "fileName": "document.pdf",
  "fileType": "application/pdf",
  "fileSize": 1048576,
  "fileHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "chunkIndex": 14,
  "totalChunks": 210,
  "data": "JVBERi0xLjQKJeLjz9MKMS..."
}
```

### Protocol Advantages
- **First-Frame Discovery**: Every frame carries the file's metadata (`fileName`, `fileSize`, `fileHash`, `totalChunks`), so the receiver can begin tracking immediately regardless of which frame it scans first.
- **Session Isolation**: `transferId` prevents mixing frames if multiple transfers take place or if a previous transfer was aborted.
- **Chunked Base64 Safety**: Safe chunked binary conversion prevents stack overflow even on large ArrayBuffers.

---

## 5. How to Run

Requires Node.js 18+.

```bash
npm install
npm run dev          # dev server at http://localhost:5173
npm test             # protocol + reassembly unit tests (node:test)
npm run build        # production build in dist/ (works from any static server or folder)
npm run preview      # serve the production build
```

### Testing on a phone (camera needs a secure context)

Browsers only allow the camera on `localhost` or `https://`. To use a phone as the receiver:
- Run `npm run dev -- --host`, then either enable `chrome://flags/#unsafely-treat-insecure-origin-as-secure` on the phone for `http://<your-ip>:5173`, or
- Tunnel it over HTTPS: `cloudflared tunnel --url http://localhost:5173` and open the `https://...` URL on the phone.

---

## 6. Project Structure

```text
index.html                 # Vite entry
src/
├── main.jsx               # React root
├── App.jsx                # Nav + hash routes (#/send, #/receive, #/simulator)
├── styles.css
├── options.js             # Chunk size / speed / codes-per-frame options
├── pages/                 # Home, Sender, Receiver, Simulator
├── components/ui.jsx      # Shared UI: badge, file drop, progress, QR canvas, ...
├── hooks/                 # useHashedFile, useFrameLoop, useAssembler
└── lib/
    ├── protocol.js        # V2 framing, Base45, SHA-256 (no DOM, unit tested)
    ├── assembler.js       # Dedup, missing chunks, verified reassembly (unit tested)
    ├── qrGrid.js          # Draws 1/2/4 QR codes per frame
    ├── scanner.js         # Camera: native BarcodeDetector, html5-qrcode fallback
    └── feedback.js        # Audio chirp + haptics
test/protocol.test.js
```

---

## 7. State Machines

### Sender State Machine
```text
[IDLE] ──(File Selected)──► [FILE_SELECTED] ──► [PREPARING] ──► [READY]
                                                                  │
                                                               (Start)
                                                                  │
[COMPLETED] ◄── [STOPPED] ◄── [TRANSMITTING] ◄────────────────────┘
                                  │      ▲
                               (Pause) (Resume)
                                  ▼      │
                               [ PAUSED ]
```

### Receiver State Machine
```text
[WAITING] ──(Start Camera)──► [SCANNING] ──(First Chunk)──► [RECEIVING]
                                                                │
                                                        (All Chunks)
                                                                ▼
[COMPLETED] ◄──(Hash Match)── [VERIFYING] ◄── [RECONSTRUCTING]
     │                              │
(Download)                   (Hash Mismatch)
     ▼                              ▼
 [ SAVED ]                      [ ERROR ]
```

---

## 8. Physical Testing & Verification Checklist

| Category | Test Case | Target / Expected Result | Status |
| :--- | :--- | :--- | :--- |
| **File Types** | Text file (`.txt`) | Clean chunking, verified hash | Verified |
| | Image (`.jpg`, `.png`) | Exact binary preservation | Verified |
| | Document (`.pdf`, `.docx`) | Zero corruption of binary headers | Verified |
| | Archive (`.zip`) | Checksum match, unzips cleanly | Verified |
| **File Sizes** | Small (10 KB - 50 KB) | 20 - 100 chunks, fast transfer | Verified |
| | Medium (100 KB - 500 KB) | 200 - 1,000 chunks | Verified |
| | Large (1 MB - 5 MB) | Multi-cycle completion | Verified |
| **Conditions** | Bright / Ambient room | Rapid frame acquisition | Verified |
| | Low light | Screen illumination aids camera | Verified |
| | High screen brightness | Optimal QR edge detection | Recommended |
| | Varying distances (15 - 40 cm) | Viewfinder auto-focus | Supported |
| **Reliability** | Duplicate frames | Ignored, progress counter unchanged | Verified |
| | Out-of-order chunks | Strict index sorting ensures file order | Verified |
| | Missing chunks | Picked up in subsequent cycles | Verified |
| | Corrupted / foreign QR | Discarded silently without crashing | Verified |
| | Hash verification | Rejects tampered data; accepts authentic | Verified |

---

## 9. Performance & Practical Limitations

1. **QR Data Capacity vs. Camera Resolution**:
   A Version 15–20 QR code comfortably carries ~500–800 bytes with error correction level M. Exceeding 1200 bytes makes QR dots microscopic, demanding 4K cameras and macro lenses.
2. **Camera Frame Rate**:
   Most consumer smartphone webcams operate at 30–60 fps, with web browser decoders reliably capturing 1.5 to 3 unique QR codes per second.
3. **Recommended File Sizes**:
   Air-gapped optical transfer is best suited for files between **1 KB and 2 MB** (keys, tickets, credentials, configuration files, photos, short documents). Larger multi-megabyte files work through repeated cycles, but require patience.
4. **Lighting & Glare**:
   Reflections off glossy laptop screens or glare from overhead fixtures can obstruct QR corner markers. Adjust screen angle and brightness for optimal results.

---

## 10. Future Enhancements

- **Brotli / Gzip / DEFLATE In-Browser Compression**: Integrate `CompressionStream` to shrink text and PDF payloads by up to 70% before chunking.
- **Reed-Solomon Fountain Codes (RaptorQ)**: Transmit rateless parity blocks so the receiver only needs any $K$ unique packets without needing specific missing chunk indexes.
- **Adaptive Luminance / Color Coding**: Use 4-color or 8-color QR palettes to double or triple per-frame throughput.
- **Multi-File Batch Bundling**: Send multiple files or full directories inside an in-memory ZIP package.
- **End-to-End Hybrid Encryption**: Optional ECDH/AES-GCM encryption with an on-screen passphrase.

---

## 11. Security & Privacy Assurance

- **Zero network requests** are dispatched during transmission.
- Files remain strictly in volatile memory (`ArrayBuffer`) and browser sandbox.
- Transferred data is never written to `localStorage` or external storage.
- Optical transfer leaves no radio-frequency footprint.
