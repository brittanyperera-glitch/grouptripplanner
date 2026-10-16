import { useCallback, useEffect, useRef, useState } from 'react';

const EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;

export function useIdleReset({ idleMs, warnMs, onIdle }: { idleMs: number; warnMs: number; onIdle(): void }): { warning: boolean; keepGoing(): void } {
  const [warning, setWarning] = useState(false);
  const warningRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  const restart = useCallback(() => {
    clearTimeout(timer.current);
    warningRef.current = false;
    setWarning(false);
    timer.current = setTimeout(() => {
      warningRef.current = true;
      setWarning(true);
      timer.current = setTimeout(() => onIdleRef.current(), warnMs);
    }, idleMs);
  }, [idleMs, warnMs]);

  useEffect(() => {
    // Ignored while warning: a stray scroll must not hide the warning; only keepGoing() cancels it.
    const onInput = () => { if (!warningRef.current) restart(); };
    restart();
    for (const e of EVENTS) window.addEventListener(e, onInput, { passive: true });
    return () => {
      clearTimeout(timer.current);
      for (const e of EVENTS) window.removeEventListener(e, onInput);
    };
  }, [restart]);

  return { warning, keepGoing: restart };
}
