import { useEffect, useState } from 'react';

/**
 * Counts out frames every `interval` ms while `running`.
 * Fountain packets never run out, so the counter simply keeps climbing; the sender derives
 * "pass" numbers from it for display.
 */
export function useFrameLoop(interval, running) {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setN(v => v + 1), interval);
    return () => clearInterval(id);
  }, [running, interval]);

  return { n, setN };
}
