import { levelOf, toNextLevel } from '../../lib/missions';
import { plural } from '../../lib/stayflow';
import type { Player } from '../../types';
import { initials } from './CrewRing';
import './spy.css';

/** The one place the accent colour goes on HQ: what this person should do next, and how close the next level is. */
export default function NextMove<M extends { label: string }>({ me, move, done, total, onStart, cta = 'Start mission' }: { me: Player; move: M | null; done: number; total: number; onStart(m: M): void; cta?: string }) {
  const level = levelOf(done, total), more = toNextLevel(done, total);
  const who = `Agent ${me} · Level ${level}${more === null ? '' : ` · ${plural(more, 'task')} to Level ${level + 1}`}`;
  return (
    <div className={move ? 'spy-me' : 'spy-me spy-me-idle'}>
      <span className="spy-av">{initials(me)}</span>
      <div>
        <span className="spy-code">{move ? 'Your next move' : 'All clear'}</span><br />
        <b>{move ? move.label : 'Nothing open for you. Stand by.'}</b>
        <div className="spy-xp">{who}</div>
      </div>
      {move && <button type="button" className="spy-btn spy-btn-solid spy-me-cta" onClick={() => onStart(move)}>{cta}</button>}
    </div>
  );
}
