/**
 * Receiver-side reassembly shared by the Receiver page and the Simulator:
 * session isolation, deduplication, missing-chunk tracking, throughput and
 * SHA-256 verified reconstruction. No DOM access, so it is unit tested in Node.
 */
import { parseFrame, computeSHA256 } from './protocol.js';

export class FrameAssembler {
  constructor() {
    this.reset();
  }

  reset() {
    this.transferId = null;
    this.meta = null;
    this.chunks = new Map(); // chunkIndex -> Uint8Array
    this.totalChunks = 0;
    this.duplicates = 0;
    this.bytes = 0;
    this.startTime = 0;
  }

  /**
   * Feeds one scanned QR string.
   * @returns {'data'|'meta'|'duplicate'|null} what happened; null = ignored (foreign code or other transfer)
   */
  push(text, now = performance.now()) {
    const frame = parseFrame(text);
    if (!frame) return null;

    // The first valid frame (data or meta) locks the receiver to that transfer
    if (!this.transferId) this.transferId = frame.transferId;
    else if (frame.transferId !== this.transferId) return null;

    if (frame.type === 'meta') {
      if (this.meta) return null;
      this.meta = {
        fileName: frame.fileName || 'transfer_file',
        fileType: frame.fileType || 'application/octet-stream',
        fileSize: frame.fileSize || 0,
        fileHash: (frame.fileHash || '').toLowerCase(),
        totalChunks: frame.totalChunks || 1
      };
      this.totalChunks = this.meta.totalChunks;
      return 'meta';
    }

    if (this.chunks.has(frame.chunkIndex)) {
      this.duplicates++;
      return 'duplicate';
    }
    this.totalChunks = frame.totalChunks;
    if (!this.startTime) this.startTime = now;
    this.chunks.set(frame.chunkIndex, frame.bytes);
    this.bytes += frame.bytes.length;
    return 'data';
  }

  /** Complete once every chunk AND the metadata frame (name + hash) have arrived. */
  get isComplete() {
    return !!this.meta && this.chunks.size === this.meta.totalChunks;
  }

  get missingCount() {
    return this.totalChunks - this.chunks.size;
  }

  /** First `limit` missing chunk indexes. */
  missing(limit = Infinity) {
    const out = [];
    for (let i = 0; i < this.totalChunks && out.length < limit; i++) {
      if (!this.chunks.has(i)) out.push(i);
    }
    return out;
  }

  /** Bytes per second since the first chunk (0 during the first second). */
  rate(now = performance.now()) {
    const seconds = (now - this.startTime) / 1000;
    return this.startTime && seconds > 1 ? this.bytes / seconds : 0;
  }

  /** Joins chunks in index order and verifies the SHA-256 against the sender's hash. */
  async reconstruct() {
    const parts = [];
    for (let i = 0; i < this.meta.totalChunks; i++) {
      const chunk = this.chunks.get(i);
      if (!chunk) throw new Error(`Missing chunk #${i} during reconstruction.`);
      parts.push(chunk);
    }
    const blob = new Blob(parts, { type: this.meta.fileType });
    const hash = await computeSHA256(await blob.arrayBuffer());
    return { blob, hash, verified: hash === this.meta.fileHash };
  }
}
