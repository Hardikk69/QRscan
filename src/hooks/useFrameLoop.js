import { useEffect, useState } from 'react';

/**
 * Cycles through `frameCount` frames every `interval` ms while `running`,
 * looping back to 0 and counting cycles so the receiver can catch missed frames.
 */
export function useFrameLoop(frameCount, interval, running) {
  const [pos, setPos] = useState({ index: 0, cycle: 1 });

  useEffect(() => {
    if (!running || frameCount === 0) return;
    const id = setInterval(() => {
      setPos(p => (p.index + 1 >= frameCount
        ? { index: 0, cycle: p.cycle + 1 }
        : { index: p.index + 1, cycle: p.cycle }));
    }, interval);
    return () => clearInterval(id);
  }, [running, interval, frameCount]);

  // Clamp in case frameCount shrank (e.g. more codes per frame)
  const index = Math.min(pos.index, Math.max(frameCount - 1, 0));
  return { index, cycle: pos.cycle, setPos };
}
