import { levelOf, toNextLevel } from '../../lib/missions';
import type { Move } from '../../lib/missions';
import { plural } from '../../lib/stayflow';
import type { Person } from '../../types';
import { initials } from './CrewRing';
import './spy.css';

/** The one place the accent colour goes on HQ: what this person should do next, and how close the next level is. */
export default function NextMove({ me, move, done, total, onStart }: { me: Person; move: Move | null; done: number; total: number; onStart(m: Move): void }) {
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
      {move && <button type="button" className="spy-btn spy-btn-solid spy-me-cta" onClick={() => onStart(move)}>Start mission</button>}
    </div>
  );
}
