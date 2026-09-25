/**
 * Receiver-side reassembly shared by the Receiver page and the Simulator:
 * session isolation, fountain decoding, progress tracking and SHA-256 verified
 * reconstruction. No DOM access, so it is unit tested in Node.
 *
 * Decoding is the standard LT peeling algorithm: a packet whose unknown-chunk set has been
 * reduced to one chunk solves that chunk, which may in turn reduce other held packets.
 */
import { computeSHA256, describeForeign, parseFrame } from './protocol.js';
import { pickChunks, xorInto } from './fountain.js';

export class FrameAssembler {
  constructor() {
    this.reset();
  }

  reset() {
    this.transferId = null;
    this.meta = null;
    this.chunks = new Map();  // Solved chunkIndex -> Uint8Array
    this.pending = [];        // Packets still mixing several unknown chunks
    this.seenSeeds = new Set();
    this.totalChunks = 0;
    this.chunkSize = 0;
    this.duplicates = 0;      // Repeated or fully redundant packets
    this.ignored = 0;         // Decoded QR codes that were not frames of this transfer
    this.otherVersion = null; // Protocol id/prefix of a sender running a different version
    this.bytes = 0;           // Useful (solved) bytes, for the throughput readout
    this.startTime = 0;
  }

  /**
   * Feeds one scanned QR string.
   * @returns {'data'|'meta'|'duplicate'|null} what happened; null = ignored (foreign code or other transfer)
   */
  push(text, now = performance.now()) {
    const frame = parseFrame(text);
    if (!frame) {
      this.ignored++;
      const foreign = describeForeign(text);
      if (foreign.reason === 'version') this.otherVersion = foreign.version;
      return null;
    }

    // The first valid frame (data or meta) locks the receiver to that transfer
    if (!this.transferId) this.transferId = frame.transferId;
    else if (frame.transferId !== this.transferId) {
      this.ignored++;
      return null;
    }

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

    if (this.seenSeeds.has(frame.seed)) {
      this.duplicates++;
      return 'duplicate';
    }
    this.seenSeeds.add(frame.seed);
    this.totalChunks = frame.totalChunks;
    this.chunkSize = frame.bytes.length;
    if (!this.startTime) this.startTime = now;

    const unknown = new Set(pickChunks(frame.seed, frame.totalChunks));
    if (!this.#reduce(unknown, frame.bytes)) {
      this.duplicates++; // Carried nothing new
      return 'duplicate';
    }

    this.pending.push({ unknown, data: frame.bytes });
    this.#peel();
    return 'data';
  }

  /** Removes already-solved chunks from a packet. Returns false when nothing unknown is left. */
  #reduce(unknown, data) {
    for (const index of unknown) {
      const solved = this.chunks.get(index);
      if (solved) {
        xorInto(data, solved);
        unknown.delete(index);
      }
    }
    return unknown.size > 0;
  }

  /**
   * Solves every packet that is down to one unknown chunk, repeatedly.
   * ponytail: O(pending²) rescan per solve; pending stays tiny in practice
   * (the systematic pass solves most chunks outright). Index pending by chunk if it grows.
   */
  #peel() {
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (let i = this.pending.length - 1; i >= 0; i--) {
        const packet = this.pending[i];
        if (!this.#reduce(packet.unknown, packet.data)) {
          this.pending.splice(i, 1); // Became redundant
          continue;
        }
        if (packet.unknown.size === 1) {
          const [index] = packet.unknown;
          this.chunks.set(index, packet.data);
          this.bytes += packet.data.length;
          this.pending.splice(i, 1);
          progressed = true;
        }
      }
    }
  }

  /** Complete once every chunk is solved AND the metadata frame (name + hash) has arrived. */
  get isComplete() {
    return !!this.meta && this.chunks.size === this.meta.totalChunks;
  }

  get missingCount() {
    return this.totalChunks - this.chunks.size;
  }

  /** First `limit` unsolved chunk indexes. */
  missing(limit = Infinity) {
    const out = [];
    for (let i = 0; i < this.totalChunks && out.length < limit; i++) {
      if (!this.chunks.has(i)) out.push(i);
    }
    return out;
  }

  /** Useful bytes per second since the first packet (0 during the first second). */
  rate(now = performance.now()) {
    const seconds = (now - this.startTime) / 1000;
    return this.startTime && seconds > 1 ? this.bytes / seconds : 0;
  }

  /** Joins chunks in order, trims the padding and verifies the SHA-256 against the sender's hash. */
  async reconstruct() {
    const parts = [];
    for (let i = 0; i < this.meta.totalChunks; i++) {
      const chunk = this.chunks.get(i);
      if (!chunk) throw new Error(`Missing chunk #${i} during reconstruction.`);
      parts.push(chunk);
    }
    // The last chunk was zero-padded so packets could XOR cleanly
    const blob = new Blob(parts, { type: this.meta.fileType }).slice(0, this.meta.fileSize, this.meta.fileType);
    const hash = await computeSHA256(await blob.arrayBuffer());
    return { blob, hash, verified: hash === this.meta.fileHash };
  }
}
