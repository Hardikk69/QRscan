import { useCallback, useRef, useState } from 'react';
import { FrameAssembler } from '../lib/assembler.js';

/**
 * Keeps one FrameAssembler per component and re-renders whenever a scan changes it.
 */
export function useAssembler() {
  const ref = useRef(null);
  ref.current ??= new FrameAssembler();
  const [, setVersion] = useState(0);

  const push = useCallback((text) => {
    const result = ref.current.push(text);
    if (result) setVersion(v => v + 1);
    return result;
  }, []);

  const reset = useCallback(() => {
    ref.current.reset();
    setVersion(v => v + 1);
  }, []);

  return { asm: ref.current, push, reset };
}
