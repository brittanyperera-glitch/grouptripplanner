import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppProvider } from '../state';
import { IdleWarning } from './IdleWarning';
import { MemoryStore } from './MemoryStore';
import { clearStaleTp, restoreTp, snapshotTp } from './deviceState';
import { GUEST_IDLE_MS, GUEST_WARN_MS } from './timing';
import { useIdleReset } from './useIdleReset';

export default function GuestRoot({ onExit, children }: { onExit(): void; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const store = useMemo(() => new MemoryStore(), []);
  const exited = useRef(false);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  // Children wait for ready so they never read the real visitor's tp: keys; restore only on unmount.
  useEffect(() => {
    const snap = snapshotTp();
    clearStaleTp();
    setReady(true);
    return () => restoreTp(snap);
  }, []);

  const exit = useCallback(() => {
    if (exited.current) return;
    exited.current = true;
    onExitRef.current();
  }, []);

  const { warning, keepGoing } = useIdleReset({ idleMs: GUEST_IDLE_MS, warnMs: GUEST_WARN_MS, onIdle: exit });

  if (!ready) return null;
  return (
    <AppProvider store={store} sandbox={{ onFinish: exit }}>
      {children}
      {warning && <IdleWarning onStay={keepGoing} onFinish={exit} />}
    </AppProvider>
  );
}
