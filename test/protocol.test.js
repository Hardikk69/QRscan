import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import {
  base45Encode, base45Decode, buildFrames, computeSHA256, encodeDataFrame, generateTransferId, parseFrame, META_EVERY, PROTOCOL_ID
} from '../src/lib/protocol.js';
import { FrameAssembler } from '../src/lib/assembler.js';

const random = n => new Uint8Array(randomBytes(n));

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
  const text = encodeDataFrame(tid, 41, 1000, bytes);
  assert.match(text, /^[0-9A-Z $%*+\-./:]+$/);
  assert.deepEqual(parseFrame(text), { type: 'data', transferId: tid, chunkIndex: 41, totalChunks: 1000, bytes });
});

test('foreign and out-of-range codes are rejected', () => {
  assert.equal(parseFrame('https://example.com'), null);
  assert.equal(parseFrame('OT2:X:5:3:AA'), null);
  assert.equal(parseFrame('{"protocol":"OTHER"}'), null);
  assert.equal(parseFrame(''), null);
});

test('buildFrames interleaves a metadata frame every META_EVERY data frames', async () => {
  const bytes = random(2450);
  const { frames, totalChunks } = buildFrames({ bytes, fileName: 'a.bin', fileType: '', fileHash: 'x', chunkSize: 100 });
  assert.equal(totalChunks, 25);
  assert.equal(frames.length, 25 + Math.ceil(25 / META_EVERY));
  const meta = parseFrame(frames[0]);
  assert.equal(meta.type, 'meta');
  assert.equal(meta.protocol, PROTOCOL_ID);
  assert.equal(meta.totalChunks, 25);
  assert.equal(parseFrame(frames[META_EVERY + 1]).type, 'meta');
});

test('assembler handles out-of-order, duplicate and foreign frames, then verifies SHA-256', async () => {
  const bytes = random(2450);
  const fileHash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(await computeSHA256(bytes), fileHash);
  const { frames } = buildFrames({ bytes, fileName: 'a.bin', fileType: 'application/octet-stream', fileHash, chunkSize: 500 });
  const [meta, ...data] = frames; // 5 chunks -> one meta frame first

  const asm = new FrameAssembler();
  assert.equal(asm.push(data[1]), 'data');
  assert.equal(asm.push(data[1]), 'duplicate');
  assert.equal(asm.push(encodeDataFrame('OTHER', 0, 5, random(10))), null); // other transfer
  for (const i of [3, 0, 4, 2]) asm.push(data[i]);
  assert.equal(asm.missingCount, 0);
  assert.equal(asm.isComplete, false, 'needs the metadata frame for name + hash');
  assert.equal(asm.push(meta), 'meta');
  assert.equal(asm.isComplete, true);
  assert.equal(asm.duplicates, 1);

  const result = await asm.reconstruct();
  assert.equal(result.verified, true);
  assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), bytes);

  // Tampering is detected
  asm.chunks.get(0)[0] ^= 0xFF;
  assert.equal((await asm.reconstruct()).verified, false);
});

test('assembler reports missing chunks', () => {
  const { frames } = buildFrames({ bytes: random(1000), fileName: 'a', fileType: '', fileHash: 'x', chunkSize: 100 });
  const asm = new FrameAssembler();
  asm.push(frames[1]); // chunk 0
  asm.push(frames[4]); // chunk 3
  assert.deepEqual(asm.missing(3), [1, 2, 4]);
  assert.equal(asm.missingCount, 8);
});
