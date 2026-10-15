import Avatar from '../components/Avatar';
import { useOpenGuide } from '../components/GuideNav';
import { IconCheck } from '../components/Icons';
import TukTuk from '../components/TukTuk';
import { useApp } from '../state';
import { isLocal } from '../store';
import { emptyRanking, PEOPLE } from '../types';
import type { Pace, Person, Ranking } from '../types';

const SAMPLE_DAYS: { days: number; flex: boolean }[] = [
  { days: 9, flex: false }, { days: 11, flex: false }, { days: 14, flex: false }, { days: 14, flex: true },
];
const PICKS = 5;

/** Varied Musts and Keens from real catalogue ids; the rest are Meh. Deterministic per slot. */
function sampleRanking(ids: string[], slot: number): Ranking {
  const n = ids.length;
  const pick = (from: number, count: number) => Array.from({ length: count }, (_, j) => ids[(from + j * 7) % n]);
  const must = [...new Set(pick(slot * 5 + 1, PICKS))];
  const keen = [...new Set(pick(slot * 5 + 3, PICKS + 1))].filter(id => !must.includes(id));
  const rest = ids.filter(id => !must.includes(id) && !keen.includes(id));
  return { ...emptyRanking(), must: must.map(id => [id]), keen: keen.map(id => [id]), meh: rest.length ? [rest] : [] };
}

export default function Waiting() {
  const { state, me, store, items } = useApp();
  const openGuide = useOpenGuide();
  const done = PEOPLE.filter(p => state.responses[p]?.submitted);

  const fill = () => {
    const ids = items.map(i => i.id);
    const todo = PEOPLE.filter((p): p is Person => p !== me && !state.responses[p]?.submitted);
    todo.forEach((p, slot) => {
      const ranking = sampleRanking(ids, slot);
      const { days, flex } = SAMPLE_DAYS[slot % SAMPLE_DAYS.length];
      const pace: Pace = 1;
      void store.saveResponse(p, { days, flex, pace, ranking, rated: ids, submitted: true });
    });
  };

  return (
    <section className="body" aria-label="Waiting for the group">
      <div className="kicker">Group plan</div>
      <div className="big display">{done.length} of {PEOPLE.length} done</div>
      {/* The tuk-tuk idles at the group's progress, waiting on the rest. */}
      <div aria-hidden="true" style={{ position: 'relative', height: 38, marginTop: 4 }}>
        <span style={{ position: 'absolute', bottom: -2, left: `calc(${done.length / PEOPLE.length} * (100% - 46px))`, transition: 'left var(--dur-slow) var(--ease)' }}>
          <TukTuk width={46} idle />
        </span>
      </div>
      <div className="meter" aria-hidden="true"><span style={{ width: `${(done.length / PEOPLE.length) * 100}%` }} /></div>
      <div className="sub">The group plan opens when all five have submitted.</div>
      <div className="wait-grid" role="list" aria-label="Who has submitted">
        {PEOPLE.map(p => {
          const ok = done.includes(p);
          return (
            <div key={p} className="wait-person" role="listitem" aria-label={`${p}, ${ok ? 'submitted' : 'not yet'}`} data-done={ok}>
              <span className="wait-pic">
                <Avatar name={p} size={72} />
                {ok && <span className="wait-tick" role="img" aria-label="Submitted"><IconCheck size={14} /></span>}
              </span>
              <span className="wait-name">{p}</span>
            </div>
          );
        })}
      </div>
      {openGuide && <button className="cta guide-open" onClick={openGuide}>Open the guide</button>}
      {isLocal && <button className="demo" onClick={fill}>Test only: fake votes for the other four</button>}
    </section>
  );
}
