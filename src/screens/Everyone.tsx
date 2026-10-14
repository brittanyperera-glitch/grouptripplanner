import { labels, tierOf } from '../lib/ranking';
import { useApp } from '../state';
import { AREAS, PEOPLE } from '../types';
import type { Tier } from '../types';

const LETTER: Record<Tier, string> = { must: 'M', keen: 'K', meh: 'm', skip: 'S' };

export default function Everyone({ open }: { open: boolean }) {
  const { state, items } = useApp();
  if (!open) {
    return (
      <section className="body" aria-label="Everyone">
        <div className="big">Everyone</div>
        <div className="sub">Picks show once all five have submitted.</div>
        {PEOPLE.map(p => {
          const ok = state.responses[p]?.submitted;
          return <div key={p} className="row2"><span>{p}</span><span className={ok ? 'done' : 'wait'}>{ok ? 'Submitted' : 'Not yet'}</span></div>;
        })}
      </section>
    );
  }
  const lab = Object.fromEntries(PEOPLE.map(p => [p, labels(state.responses[p]?.ranking ?? { must: [], keen: [], meh: [], skip: [] })]));
  const rows = [...items].sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area));
  return (
    <section className="body" aria-label="Everyone">
      <div className="big">Everyone</div>
      <div className="sub">M Must, K Keen, m Meh, S Skip. The number is each person's own rank.</div>
      <div className="scrollx">
        <table className="grid">
          <thead>
            <tr><th scope="col">Item</th>{PEOPLE.map(p => <th key={p} scope="col">{p}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(i => (
              <tr key={i.id}>
                <th scope="row"><span className="nm">{i.name}</span><small>{i.area}</small></th>
                {PEOPLE.map(p => {
                  const r = state.responses[p];
                  const t = r ? tierOf(r.ranking, i.id) : null;
                  return <td key={p} className={t ?? 'none'}>{t ? `${LETTER[t]} ${lab[p][i.id]}` : '-'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
