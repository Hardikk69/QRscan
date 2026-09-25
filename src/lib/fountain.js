/**
 * LT (Luby transform) fountain coding.
 *
 * Each packet is the XOR of a pseudo-random set of file chunks, identified only by a seed.
 * Sender and receiver derive the same set from that seed, so the receiver can rebuild the
 * file from ANY set of packets slightly larger than the file: a missed packet costs roughly
 * one extra packet instead of waiting a whole cycle for that exact chunk to come round again.
 *
 * The first `totalChunks` seeds are the plain chunks in order (a "systematic" first pass), so a
 * clean transfer costs no more than sending the chunks directly; later seeds are repair packets.
 */

/** mulberry32: tiny PRNG with identical output in every JS engine, so both sides agree. */
function mulberry32(a) {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Robust soliton distribution. The ideal soliton part (P(1)=1/K, P(d)=1/(d(d-1))) mostly
 * yields small degrees that solve chunks immediately, plus a thin tail of large ones that
 * keep the peeling cascade going. The added spike of degree ~K/R is what makes decoding
 * finish reliably: parameters chosen by benchmark (see the table in the project notes),
 * giving ~1.0x packets with no loss and ~1.2-1.3x at 10-40% loss.
 */
const SPIKE_SHARE = 0.25;
const SPIKE_C = 0.1;
const SPIKE_DELTA = 0.05;

function degreeFor(rand, total) {
  if (rand() < SPIKE_SHARE) {
    const R = SPIKE_C * Math.log(total / SPIKE_DELTA) * Math.sqrt(total);
    return Math.min(Math.max(2, Math.round(total / R)), total);
  }
  const u = rand();
  if (u < 1 / total) return 1;
  const v = (u - 1 / total) / (1 - 1 / total);
  return Math.min(Math.max(2, Math.ceil(1 / (1 - v))), total);
}

/** Chunk indexes combined in the packet for `seed`. Deterministic: same seed, same list. */
export function pickChunks(seed, total) {
  if (seed < total) return [seed]; // Systematic first pass

  const rand = mulberry32(seed + 1);
  const degree = degreeFor(rand, total);
  if (degree === 1) return [Math.floor(rand() * total)];

  // Partial Fisher-Yates: `degree` distinct indexes without retry loops
  const pool = Array.from({ length: total }, (_, i) => i);
  const picked = [];
  for (let i = 0; i < degree; i++) {
    const j = i + Math.floor(rand() * (total - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
    picked.push(pool[i]);
  }
  return picked;
}

/** Splits bytes into equal chunks, zero-padding the last one so every packet XORs cleanly. */
export function splitChunks(bytes, chunkSize) {
  const total = Math.ceil(bytes.length / chunkSize);
  const chunks = [];
  for (let i = 0; i < total; i++) {
    const chunk = new Uint8Array(chunkSize);
    chunk.set(bytes.subarray(i * chunkSize, (i + 1) * chunkSize));
    chunks.push(chunk);
  }
  return chunks;
}

/** XOR of the chunks named by `seed`. */
export function encodePacket(chunks, seed) {
  const indexes = pickChunks(seed, chunks.length);
  const packet = Uint8Array.from(chunks[indexes[0]]);
  for (let i = 1; i < indexes.length; i++) {
    const chunk = chunks[indexes[i]];
    for (let b = 0; b < packet.length; b++) packet[b] ^= chunk[b];
  }
  return packet;
}

export function xorInto(target, source) {
  for (let i = 0; i < target.length; i++) target[i] ^= source[i];
}
