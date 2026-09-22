import { useCallback, useState } from 'react';
import { computeSHA256, formatBytes } from '../lib/protocol.js';

const MAX_RECOMMENDED = 15 * 1024 * 1024;

/**
 * Reads a picked file into memory and computes its SHA-256.
 * status: IDLE -> PREPARING -> READY | ERROR
 */
export function useHashedFile() {
  const [state, setState] = useState({ status: 'IDLE', file: null, bytes: null, hash: '' });

  const select = useCallback(async (file) => {
    if (!file) return;
    if (file.size === 0) {
      alert('The selected file is empty (0 bytes). Please choose a valid file.');
      return;
    }
    if (file.size > MAX_RECOMMENDED && !confirm(
      `File size is ${formatBytes(file.size)}. Transmitting files over 15 MB optically will take several thousand QR frames. Continue?`
    )) return;

    setState({ status: 'PREPARING', file, bytes: null, hash: '' });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const hash = await computeSHA256(bytes);
      setState({ status: 'READY', file, bytes, hash });
    } catch (err) {
      console.error('File reading or hashing error:', err);
      alert('Failed to read or process the selected file: ' + err.message);
      setState(s => ({ ...s, status: 'ERROR' }));
    }
  }, []);

  return [state, select];
}
