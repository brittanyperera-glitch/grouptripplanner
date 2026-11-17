import type { ReactNode } from 'react';
import './spy.css';

/** The shell every spy screen sits in: a code eyebrow, a title, an optional way back, and a replay banner while someone re-watches the finale. */
export default function SpyScreen({ code, title, back, replay, children }: {
  code: string; title: string; back?: { label: string; onClick(): void }; replay?: { onExit(): void }; children?: ReactNode;
}) {
  return (
    <div className="spy">
      {replay && <div className="spy-replay"><span>Replay</span><button type="button" onClick={replay.onExit}>Exit</button></div>}
      <div className="spy-body">
        {back && <button type="button" className="spy-back" onClick={back.onClick}>{`‹ ${back.label}`}</button>}
        <header className="spy-head"><div className="spy-code">{code}</div><h1>{title}</h1></header>
        {children}
      </div>
    </div>
  );
}
