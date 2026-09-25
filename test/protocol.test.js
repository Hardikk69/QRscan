import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import {
  base45Encode, base45Decode, computeSHA256, createEncoder, encodeDataFrame, generateTransferId, parseFrame, META_EVERY, PROTOCOL_ID
} from '../src/lib/protocol.js';
import { encodePacket, pickChunks, splitChunks } from '../src/lib/fountain.js';
import { FrameAssembler } from '../src/lib/assembler.js';

const random = n => new Uint8Array(randomBytes(n));

/** Feeds an encoder's frames to an assembler, dropping `lossRate` of them. Returns frames shown. */
function transfer(encoder, asm, { lossRate = 0, maxFrames = 100000, rng = Math.random } = {}) {
  for (let n = 0; n < maxFrames; n++) {
    if (rng() >= lossRate) asm.push(encoder.frameAt(n), n);
    if (asm.isComplete) return n + 1;
  }
  return null;
}

test('Base45 roundtrips any length and matches RFC 9285', () => {
  for (const len of [0, 1, 2, 3, 799, 800]) {
    const bytes = random(len);
    assert.deepEqual(base45Decode(base45Encode(bytes)), bytes);
  }
  assert.equal(base45Encode(new TextEncoder().encode('AB')), 'BB8');
  assert.throws(() => base45Decode('GGW')); // 65536+ is invalid
});

test('data frames are QR-alphanumeric and parse back exactly', () => {
  const tid = generateTransferId();
  const bytes = random(800);
  const text = encodeDataFrame(tid, 4100, 1000, bytes);
  assert.match(text, /^[0-9A-Z $%*+\-./:]+$/);
  assert.deepEqual(parseFrame(text), { type: 'data', transferId: tid, seed: 4100, totalChunks: 1000, bytes });
});

test('foreign and malformed codes are rejected', () => {
  assert.equal(parseFrame('https://example.com'), null);
  assert.equal(parseFrame('OT3:X:5:0:AA'), null); // totalChunks must be > 0
  assert.equal(parseFrame('{"protocol":"OTHER"}'), null);
  assert.equal(parseFrame(''), null);
});

test('fountain seeds are deterministic, systematic first, then mixed', () => {
  const total = 50;
  for (let seed = 0; seed < total; seed++) {
    assert.deepEqual(pickChunks(seed, total), [seed], 'first pass sends plain chunks in order');
  }
  // Repair packets: same seed always yields the same set, within range
  for (const seed of [total, total + 1, 12345]) {
    const picked = pickChunks(seed, total);
    assert.deepEqual(picked, pickChunks(seed, total));
    assert.equal(new Set(picked).size, picked.length, 'no repeated index inside a packet');
    assert.ok(picked.every(i => i >= 0 && i < total));
  }
  const degrees = Array.from({ length: 400 }, (_, i) => pickChunks(total + i, total).length);
  assert.ok(degrees.includes(1), 'some degree-1 packets restart the peeling cascade');
  assert.ok(degrees.filter(d => d >= 2 && d <= 5).length > 100, 'small degrees dominate');
  assert.ok(Math.max(...degrees) > 5, 'a tail of larger degrees keeps the cascade going');
  assert.ok(degrees.every(d => d >= 1 && d <= total), 'degree never exceeds the chunk count');
});

test('encoder frames: metadata every META_EVERY packets, packets are padded XORs', () => {
  const bytes = random(2450);
  const encoder = createEncoder({ bytes, fileName: 'a.bin', fileType: '', fileHash: 'x', chunkSize: 500 });
  assert.equal(encoder.totalChunks, 5);

  const meta = parseFrame(encoder.frameAt(0));
  assert.equal(meta.type, 'meta');
  assert.equal(meta.protocol, PROTOCOL_ID);
  assert.equal(meta.fileSize, 2450);
  assert.equal(parseFrame(encoder.frameAt(META_EVERY + 1)).type, 'meta');

  const first = parseFrame(encoder.frameAt(1));
  assert.equal(first.seed, 0);
  assert.equal(first.bytes.length, 500, 'every packet is one padded chunk long');
  assert.deepEqual(first.bytes, bytes.subarray(0, 500));

  // A repair packet equals the XOR of its chunks
  const chunks = splitChunks(bytes, 500);
  const repair = parseFrame(encoder.frameAt(encoder.framesPerPass + 1));
  assert.deepEqual(repair.bytes, encodePacket(chunks, repair.seed));
});

test('lossless transfer verifies and needs no repair packets', async () => {
  const bytes = random(20000);
  const fileHash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(await computeSHA256(bytes), fileHash);
  const encoder = createEncoder({ bytes, fileName: 'a.bin', fileType: 'application/octet-stream', fileHash, chunkSize: 800 });
  const asm = new FrameAssembler();

  const shown = transfer(encoder, asm);
  assert.equal(shown, encoder.framesPerPass, 'finishes exactly at the end of the first pass');
  assert.equal(asm.duplicates, 0);

  const { blob, verified } = await asm.reconstruct();
  assert.equal(verified, true);
  assert.equal(blob.size, bytes.length, 'padding trimmed');
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
});

test('lossy transfer recovers from repair packets instead of whole extra passes', async () => {
  const bytes = random(20000);
  const fileHash = createHash('sha256').update(bytes).digest('hex');
  let seed = 7;
  const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

  for (const lossRate of [0.1, 0.2, 0.4]) {
    const encoder = createEncoder({ bytes, fileName: 'a.bin', fileType: '', fileHash, chunkSize: 800 });
    const asm = new FrameAssembler();
    const shown = transfer(encoder, asm, { lossRate, rng });
    assert.ok(shown, `completes at ${lossRate * 100}% loss`);
    assert.equal((await asm.reconstruct()).verified, true);

    // Without fountain coding, 40% loss needs several full passes; here the received
    // packet count should stay close to the chunk count regardless of loss.
    const received = asm.seenSeeds.size;
    assert.ok(received < encoder.totalChunks * 1.6, // Benchmarked ~1.2-1.4x
      `${lossRate * 100}% loss: received ${received} packets for ${encoder.totalChunks} chunks`);
  }
});

test('assembler ignores repeats, other transfers, and needs metadata to finish', async () => {
  const bytes = random(4000);
  const encoder = createEncoder({ bytes, fileName: 'a.bin', fileType: '', fileHash: 'deadbeef', chunkSize: 800 });
  const asm = new FrameAssembler();

  assert.equal(asm.push(encoder.frameAt(1)), 'data');
  assert.equal(asm.push(encoder.frameAt(1)), 'duplicate');
  assert.equal(asm.push(encodeDataFrame('OTHERID', 0, 5, random(800))), null);
  assert.deepEqual(asm.missing(2), [1, 2]);

  for (let n = 2; n <= 5; n++) asm.push(encoder.frameAt(n));
  assert.equal(asm.missingCount, 0);
  assert.equal(asm.isComplete, false, 'still needs the metadata frame for name + hash');
  assert.equal(asm.push(encoder.frameAt(0)), 'meta');
  assert.equal(asm.isComplete, true);
  assert.equal(asm.duplicates, 1);
  assert.equal((await asm.reconstruct()).verified, false, 'hash mismatch is reported');
});
