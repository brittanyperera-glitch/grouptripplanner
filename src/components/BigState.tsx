import type { CSSProperties, ReactNode } from 'react';
import { PEOPLE } from '../types';
import type { Person } from '../types';
import Avatar from './Avatar';
import { IconCheck, IconClock } from './Icons';
import './BigState.css';

export interface BigStateCrew {
  /** Accessible name of the strip. */
  label: string;
  done(p: Person): boolean;
  doneLabel: string;
  waitLabel: string;
  /** Short count under the strip, e.g. "1 of 5 done". */
  caption?: string;
}

export interface BigStateProps {
  headline: string;
  sub?: string;
  crew?: BigStateCrew;
  /** The one button. A screen with its own primary action elsewhere passes none. */
  action?: { label: string; onClick(): void };
  /** Beside a form: no page-filling height, a slightly smaller headline. */
  compact?: boolean;
  children?: ReactNode;
}

const AVATAR = 48;

/** The big "nothing to do right now" screen: one huge headline, one line, who is left, at most one button. */
export default function BigState({ headline, sub, crew, action, compact, children }: BigStateProps) {
  // The headline shrinks with its longest word so no word can run past the screen edge.
  const longest = Math.max(...headline.split(/\s+/).map(w => w.length));
  return (
    <div className="bs" data-compact={compact || undefined}>
      <h2 className="bs-h" style={{ '--bs-n': longest } as CSSProperties}>{headline}</h2>
      {sub && <p className="bs-sub" role="status">{sub}</p>}
      {children}
      {crew && (
        <>
          <ul className="bs-crew" aria-label={crew.label}>
            {PEOPLE.map(p => {
              const ok = crew.done(p);
              return (
                <li key={p} className="bs-p" data-done={ok} aria-label={`${p}, ${ok ? crew.doneLabel : crew.waitLabel}`}>
                  <span className="bs-pic">
                    <Avatar name={p} size={AVATAR} />
                    <span className="bs-badge" role="img" aria-label={ok ? crew.doneLabel : crew.waitLabel}>
                      {ok ? <IconCheck size={13} /> : <IconClock size={13} />}
                    </span>
                  </span>
                  <span className="bs-name">{p}</span>
                </li>
              );
            })}
          </ul>
          {crew.caption && <p className="bs-count">{crew.caption}</p>}
        </>
      )}
      {action && <button type="button" className="cta bs-go" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}
