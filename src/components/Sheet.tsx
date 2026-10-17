import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './Sheet.css';

interface Props {
  title: string;
  closeLabel: string;
  footer: React.ReactNode;
  onClose(): void;
  /** When given, the body is a <form> that submits through this; otherwise a plain div. */
  onSubmit?(): void;
  children: React.ReactNode;
}

/** Bottom sheet: portal, dialog role, backdrop, Esc to close, focus in on open and back to the opener on close. */
export default function Sheet({ title, closeLabel, footer, onClose, onSubmit, children }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeNow = useRef(onClose);
  closeNow.current = onClose;
  // Read during render, before any autoFocus inside moves focus, so closing can hand it back to the opener.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  useEffect(() => {
    if (!dialog.current?.contains(document.activeElement)) dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeNow.current(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus(); };
  }, [opener]);
  return createPortal(
    <div className="shs-wrap">
      <div className="shs-backdrop" aria-hidden="true" onClick={onClose} />
      <div ref={dialog} className="shs-panel" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className="shs-head">
          <h2 className="shs-title">{title}</h2>
          <button type="button" className="shs-x" onClick={onClose}>{closeLabel}</button>
        </header>
        {onSubmit
          ? <form className="shs-body" onSubmit={e => { e.preventDefault(); onSubmit(); }}>{children}</form>
          : <div className="shs-body">{children}</div>}
        <footer className="shs-foot">{footer}</footer>
      </div>
    </div>,
    document.body,
  );
}
