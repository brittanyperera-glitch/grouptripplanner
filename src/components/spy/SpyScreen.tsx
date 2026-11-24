import type { ReactNode } from 'react';
import './spy.css';

/** The shell every spy screen sits in: a code eyebrow, a title, an optional way back and its children. */
export default function SpyScreen({ code, title, back, children }: {
  code: string; title: string; back?: { label: string; onClick(): void }; children?: ReactNode;
}) {
  return (
    <div className="spy">
      <div className="spy-body">
        {back && <button type="button" className="spy-back" onClick={back.onClick}>{`‹ ${back.label}`}</button>}
        <header className="spy-head"><div className="spy-code">{code}</div><h1>{title}</h1></header>
        {children}
      </div>
    </div>
  );
}
