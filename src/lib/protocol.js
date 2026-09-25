/**
 * Transfer protocol (V3): framing, Base45 encoding, hashing and formatting helpers.
 * No DOM access, so it runs in the browser and in Node tests.
 *
 * Data frame:  OT3:<transferId>:<seed base36>:<total base36>:<Base45 packet>
 *   The packet is a fountain-coded XOR of the chunks named by `seed` (see fountain.js).
 *   Pure QR-alphanumeric text (0-9 A-Z $%*+-./: space), so the QR encoder uses
 *   alphanumeric mode (5.5 bits/char) instead of byte mode (8 bits/char).
 * Meta frame:  JSON { protocol, transferId, fileName, fileType, fileSize, fileHash, totalChunks }
 *   Sent once every META_EVERY data frames instead of repeating it in every frame.
 */
import { encodePacket, splitChunks } from './fountain.js';

export const PROTOCOL_ID = 'OFFLINE_TRANSFER_V3';
export const META_EVERY = 10;
export const EC_LEVEL = 'L'; // Screens are clean; lowest error correction = most capacity
const FRAME_PREFIX = 'OT3';
const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

/** Base45 (RFC 9285) encode: 2 bytes -> 3 chars. */
export function base45Encode(bytes) {
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const n = bytes[i] * 256 + bytes[i + 1];
    out += B45[n % 45] + B45[Math.floor(n / 45) % 45] + B45[Math.floor(n / 2025)];
  }
  if (bytes.length % 2) {
    const n = bytes[bytes.length - 1];
    out += B45[n % 45] + B45[Math.floor(n / 45)];
  }
  return out;
}

/** Base45 (RFC 9285) decode. Throws on invalid input. */
export function base45Decode(str) {
  if (str.length % 3 === 1) throw new Error('Invalid Base45 length');
  const out = new Uint8Array(Math.floor(str.length / 3) * 2 + (str.length % 3 ? 1 : 0));
  let o = 0;
  for (let i = 0; i < str.length; i += 3) {
    const chars = str.substring(i, i + 3);
    let n = 0;
    for (let j = chars.length - 1; j >= 0; j--) {
      const v = B45.indexOf(chars[j]);
      if (v < 0) throw new Error('Invalid Base45 char');
      n = n * 45 + v;
    }
    if (chars.length === 3) {
      if (n > 0xFFFF) throw new Error('Invalid Base45 triplet');
      out[o++] = n >> 8;
      out[o++] = n & 0xFF;
    } else {
      if (n > 0xFF) throw new Error('Invalid Base45 pair');
      out[o++] = n;
    }
  }
  return out;
}

/** Uppercase base36 only, so it stays inside the QR alphanumeric charset. */
export function generateTransferId() {
  return (Date.now().toString(36) + Math.random().toString(36).substring(2, 6)).toUpperCase();
}

export function encodeDataFrame(transferId, seed, total, bytes) {
  return `${FRAME_PREFIX}:${transferId}:${seed.toString(36).toUpperCase()}:${total.toString(36).toUpperCase()}:${base45Encode(bytes)}`;
}

/**
 * Parses a scanned QR string into
 *   { type: 'data', transferId, seed, totalChunks, bytes } or
 *   { type: 'meta', transferId, fileName, fileType, fileSize, fileHash, totalChunks } or
 *   null for foreign / corrupt codes.
 */
export function parseFrame(text) {
  if (!text) return null;
  if (text.startsWith(FRAME_PREFIX + ':')) {
    // Base45 alphabet contains ':' so only the first 4 fields are split off
    const parts = text.split(':');
    if (parts.length < 5) return null;
    const seed = parseInt(parts[2], 36);
    const totalChunks = parseInt(parts[3], 36);
    if (!(seed >= 0 && totalChunks > 0)) return null;
    try {
      return { type: 'data', transferId: parts[1], seed, totalChunks, bytes: base45Decode(parts.slice(4).join(':')) };
    } catch {
      return null;
    }
  }
  try {
    const meta = JSON.parse(text);
    if (meta && meta.protocol === PROTOCOL_ID) return { type: 'meta', ...meta };
  } catch {
    // Not JSON: foreign QR code
  }
  return null;
}

/**
 * Why a scanned code was ignored, for the receiver's status line.
 * A sender running a different protocol version is the one case worth calling out:
 * it looks exactly like "the camera reads nothing" otherwise.
 * @returns {{ reason: 'version'|'foreign', version?: string }}
 */
export function describeForeign(text) {
  const prefix = /^([A-Z]+\d+):/.exec(text || '');
  if (prefix && prefix[1] !== FRAME_PREFIX) return { reason: 'version', version: prefix[1] };
  try {
    const json = JSON.parse(text);
    if (json && typeof json.protocol === 'string' && json.protocol !== PROTOCOL_ID) {
      return { reason: 'version', version: json.protocol };
    }
  } catch {
    // Not JSON
  }
  return { reason: 'foreign' };
}

/**
 * Prepares a file for sending. Fountain packets are endless, so frames are generated on
 * demand by position instead of being precomputed: each block of frames is one metadata
 * frame followed by META_EVERY packets.
 *
 * @returns {{ transferId, totalChunks, framesPerPass, frameAt(n: number): string }}
 */
export function createEncoder({ bytes, fileName, fileType, fileHash, chunkSize }) {
  const transferId = generateTransferId();
  const chunks = splitChunks(bytes, chunkSize);
  const totalChunks = chunks.length;
  const metaFrame = JSON.stringify({
    protocol: PROTOCOL_ID,
    transferId,
    fileName,
    fileType: fileType || 'application/octet-stream',
    fileSize: bytes.length,
    fileHash,
    totalChunks
  });

  const block = META_EVERY + 1; // 1 metadata frame + META_EVERY packets
  return {
    transferId,
    totalChunks,
    // Frames needed to show every chunk once (the systematic first pass), metadata included
    framesPerPass: totalChunks + Math.ceil(totalChunks / META_EVERY),
    frameAt(n) {
      const position = n % block;
      if (position === 0) return metaFrame;
      const seed = Math.floor(n / block) * META_EVERY + (position - 1);
      return encodeDataFrame(transferId, seed, totalChunks, encodePacket(chunks, seed));
    }
  };
}

/** SHA-256 hex digest via Web Crypto. */
export async function computeSHA256(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  if (!(bytes > 0)) return 'Unknown';
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(decimals)) + ' ' + sizes[i];
}

/** Shortens long strings (hashes) with an ellipsis in the middle. */
export function truncateMiddle(str, front = 8, back = 8) {
  if (!str) return '';
  if (str.length <= front + back + 3) return str;
  return `${str.substring(0, front)}...${str.substring(str.length - back)}`;
}
