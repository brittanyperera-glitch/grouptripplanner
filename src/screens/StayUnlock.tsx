import { unlockable } from '../lib/override';
import { STAY_COPY } from '../lib/stayflow';
import type { StayCtx } from '../lib/stayflow';
import { useApp } from '../state';
import './Stays.css';

const A = STAY_COPY.admin;

/** Brittany only: reopen someone's locked stays list so they can edit again. Renders nothing for anyone else. */
export default function StayUnlock({ ctx }: { ctx: StayCtx }) {
  const { store } = useApp();
  const who = unlockable(ctx.me, ctx.crewOf, ctx.participants);
  if (who.length === 0) return null;
  return (
    <div className="st-admin" role="group" aria-label={A.unlockTitle}>
      <div className="kicker">{A.unlockTitle}</div>
      <div className="st-kinds">
        {who.map(p => <button key={p} type="button" className="st-ghost" onClick={() => { void store.saveCrewStays(p, { locked: false }); }}>{A.unlock(p)}</button>)}
      </div>
    </div>
  );
}
