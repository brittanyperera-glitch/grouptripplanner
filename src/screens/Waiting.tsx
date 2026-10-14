import { useApp } from '../state';
import { PEOPLE } from '../types';

export default function Waiting() {
  const { state } = useApp();
  const done = PEOPLE.filter(p => state.responses[p]?.submitted);
  return (
    <section className="body" aria-label="Waiting for the group">
      <div className="big">{done.length} of {PEOPLE.length} done</div>
      <div className="sub">The group plan opens when all five have submitted.</div>
      {PEOPLE.map(p => {
        const ok = done.includes(p);
        return <div key={p} className="row2"><span>{p}</span><span className={ok ? 'done' : 'wait'}>{ok ? 'Submitted' : 'Not yet'}</span></div>;
      })}
    </section>
  );
}
