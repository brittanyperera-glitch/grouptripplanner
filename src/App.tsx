import { useCallback, useEffect, useRef, useState } from 'react';
import Compare from './components/Compare';
import Toast from './components/Toast';
import { answer, move, removeId, retier, startPlace, tierOf } from './lib/ranking';
import Days from './screens/Days';
import Name from './screens/Name';
import Pace from './screens/Pace';
import Rate from './screens/Rate';
import Rerank from './screens/Rerank';
import { AppProvider, useApp } from './state';
import { AREAS, emptyRanking, PEOPLE } from './types';
import type { Item, Pace as PaceT, Pending, Person, Ranking, Response, Store, Tier } from './types';

type Step = 'days' | 'pace' | 'rate' | 'tabs';
type Tab = 'My trip' | 'Group' | 'Everyone' | 'Suggest';
const TABS: Tab[] = ['My trip', 'Group', 'Everyone', 'Suggest'];

// T5b replaces these four placeholders with the real screens.
const Placeholder = ({ title }: { title: string }) => (
  <div className="body"><div className="big">{title}</div><div className="sub">Coming soon.</div></div>
);
const MyTrip = () => <Placeholder title="My trip" />;
const Group = () => <Placeholder title="Group" />;
const Everyone = () => <Placeholder title="Everyone" />;
const Suggest = () => <Placeholder title="Suggest" />;
const PANELS: Record<Tab, () => JSX.Element> = { 'My trip': MyTrip, 'Group': Group, 'Everyone': Everyone, 'Suggest': Suggest };

const blank = (name: Person): Response => ({
  name, days: null, flex: false, pace: null, ranking: emptyRanking(), rated: [], submitted: false, updatedAt: new Date().toISOString(),
});

interface Placing { ranking: Ranking; pending: Pending; source: 'rate' | 'rerank' }

function Flow({ me, say }: { me: Person; say: (t?: string) => void }) {
  const { state, store, items, copy } = useApp();
  const [draft, setDraft] = useState<Response>(() => {
    const saved = state.responses[me];
    return saved ? structuredClone(saved) : blank(me);
  });
  const ref = useRef(draft);
  const [step, setStep] = useState<Step>(() => (draft.days === null ? 'days' : draft.pace === null ? 'pace' : draft.submitted ? 'tabs' : 'rate'));
  const [tab, setTab] = useState<Tab>('My trip');
  const [placing, setPlacing] = useState<Placing | null>(null);

  const save = useCallback((patch: Partial<Omit<Response, 'name'>>) => {
    ref.current = { ...ref.current, ...patch };
    setDraft(ref.current);
    void store.saveResponse(me, patch);
  }, [store, me]);

  const byId = Object.fromEntries(items.map(i => [i.id, i])) as Record<string, Item>;
  const unrated = items
    .filter(i => !draft.rated.includes(i.id))
    .sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area));
  const locked = PEOPLE.every(p => (p === me ? draft.submitted : state.responses[p]?.submitted));
  const shown: Step = locked ? 'tabs' : step;

  const commit = (r: Ranking, id: string) => save({ ranking: r, rated: draft.rated.includes(id) ? draft.rated : [...draft.rated, id] });

  const pickTier = (item: Item, tier: Tier) => {
    const r = structuredClone(draft.ranking);
    removeId(r, item.id);
    const pending = startPlace(r, item.id, tier);
    say(copy.quips.tier[tier]);
    if (pending) setPlacing({ ranking: r, pending, source: 'rate' });
    else commit(r, item.id);
  };

  const onAnswer = (a: 'new' | 'old' | 'same') => {
    if (!placing) return;
    const r = structuredClone(placing.ranking);
    const next = answer(r, placing.pending, a);
    if (next) { setPlacing({ ...placing, ranking: r, pending: next }); return; }
    commit(r, placing.pending.id);
    setPlacing(null);
  };

  const onMove = (id: string, dir: -1 | 1) => {
    const r = structuredClone(draft.ranking);
    move(r, id, dir);
    save({ ranking: r });
  };

  const onRetier = (id: string, tier: Tier) => {
    if (tierOf(draft.ranking, id) === tier) return;
    const r = structuredClone(draft.ranking);
    const pending = retier(r, id, tier);
    say(copy.quips.tier[tier]);
    if (pending) setPlacing({ ranking: r, pending, source: 'rerank' });
    else save({ ranking: r });
  };

  const submit = () => {
    save({ submitted: true });
    setStep('tabs');
  };

  let content;
  if (placing) {
    content = <Compare ranking={placing.ranking} pending={placing.pending} byId={byId} onAnswer={onAnswer} onCancel={placing.source === 'rerank' ? () => setPlacing(null) : undefined} />;
  } else if (shown === 'days') {
    content = <Days days={draft.days} flex={draft.flex} onPick={(days, flex) => {
      save({ days, flex });
      say(copy.quips.days[flex ? 'flex' : String(days)]);
      setStep(draft.pace === null ? 'pace' : draft.submitted ? 'tabs' : 'rate');
    }} />;
  } else if (shown === 'pace') {
    content = <Pace pace={draft.pace} onBack={() => setStep('days')} onPick={(p: PaceT) => {
      save({ pace: p });
      say(copy.quips.pace[String(p)]);
      setStep(draft.submitted ? 'tabs' : 'rate');
    }} />;
  } else if (shown === 'rate' && unrated.length > 0) {
    const total = unrated.length + draft.rated.filter(id => byId[id]).length;
    content = <Rate item={unrated[0]} n={total - unrated.length + 1} total={total} copy={copy} onTier={t => pickTier(unrated[0], t)} />;
  } else if (shown === 'rate') {
    content = <Rerank ranking={draft.ranking} byId={byId} onMove={onMove} onRetier={onRetier} onSubmit={submit} />;
  } else {
    const Panel = PANELS[tab];
    content = (
      <>
        <div role="tabpanel" aria-label={tab} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><Panel /></div>
        <div className="foot" style={{ flexDirection: 'column' }}>
          {locked
            ? <div className="sub" style={{ marginTop: 0 }}>Ratings are locked, the group stage is open.</div>
            : <button className="cta alt" onClick={() => setStep('rate')}>Edit my ratings</button>}
          {!locked && unrated.length > 0 && (
            <button className="cta" onClick={() => setStep('rate')}>{unrated.length} new to rate</button>
          )}
        </div>
        <div className="tabs" role="tablist">
          {TABS.map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>)}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="top"><b>{me}</b><span>{placing ? 'Compare' : { days: 'Days', pace: 'Pace', rate: 'Rating', tabs: '' }[shown]}</span></div>
      {content}
    </>
  );
}

function Shell() {
  const { me, setMe, copy, error, retry } = useApp();
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const seq = useRef(0);
  const say = useCallback((text?: string) => {
    if (text) setToast({ text, id: ++seq.current });
  }, []);
  const clear = useCallback(() => setToast(null), []);
  return (
    <div className="app">
      {error && <button className="errbar" onClick={retry}>{error}. Tap to retry</button>}
      {me
        ? <Flow key={me} me={me} say={say} />
        : <Name welcome={copy.welcome} onPick={p => { setMe(p); say(copy.quips.name[p]); }} />}
      {toast && <Toast key={toast.id} text={toast.text} onDone={clear} />}
    </div>
  );
}

export default function App({ store }: { store?: Store }) {
  useEffect(() => { document.title = 'Sri Lanka Trip Picker'; }, []);
  return <AppProvider store={store}><Shell /></AppProvider>;
}
