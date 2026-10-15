import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Avatar from './components/Avatar';
import CrewStrip from './components/CrewStrip';
import { IconGrid, IconGroup, IconRoute, IconSpark } from './components/Icons';
import { cssEnter, lastNav, navigate } from './components/motion';
import QuipBurst from './components/QuipBurst';
import type { QuipKind } from './components/QuipBurst';
import { setTier, tierOf } from './lib/ranking';
import Days from './screens/Days';
import Everyone from './screens/Everyone';
import Extras from './screens/Extras';
import Friends from './screens/Friends';
import Knockouts from './screens/Knockouts';
import MyTrip from './screens/MyTrip';
import Name from './screens/Name';
import Pace from './screens/Pace';
import Plan from './screens/Plan';
import Premiere from './screens/Trailer';
import Raw, { wantsRaw } from './screens/Raw';
import Rate from './screens/Rate';
import Rerank from './screens/Rerank';
import Suggest from './screens/Suggest';
import Waiting from './screens/Waiting';
import { AppProvider, pickQuip, useApp } from './state';
import { connectionMissingNow } from './store';
import { useGroupResult, usePersonPlan } from './workers/usePlan';
import { AREAS, emptyRanking, PEOPLE } from './types';
import type { Item, Pace as PaceT, Person, Ranking, Response, Store, Tier } from './types';

type Step = 'days' | 'pace' | 'rate' | 'tabs';
type Tab = 'My trip' | 'Group' | 'Everyone' | 'Suggest';
const TABS: Tab[] = ['My trip', 'Group', 'Everyone', 'Suggest'];
const TAB_ICON: Record<Tab, (p: { size?: number }) => JSX.Element> = { 'My trip': IconRoute, 'Group': IconGroup, 'Everyone': IconGrid, 'Suggest': IconSpark };
type Say = (t?: string, kind?: QuipKind) => void;

function MyTripTab() {
  const { state, me, items, legs } = useApp();
  const resp = me ? state.responses[me] : undefined;
  const { data: plan } = usePersonPlan(resp, items, legs);
  if (!resp) return <div className="body"><div className="sub">Loading</div></div>;
  if (!plan) return <div className="body"><div className="sub">Working out the plan...</div></div>;
  return <MyTrip plan={plan} days={resp.flex ? 14 : resp.days ?? 9} />;
}

function GroupTab() {
  const { state, items, legs } = useApp();
  const { data: group } = useGroupResult(state, items, legs);
  if (!group) return <div className="body"><div className="sub">Working out the plan...</div></div>;
  if (!group.open) return <Waiting />;
  return (
    <>
      <CrewStrip />
      {(group.knockouts.length > 0 || group.results.length > 0) && <Knockouts group={group} />}
      <Plan group={group} />
      <Extras group={group} />
      <Friends />
      <Premiere group={group} />
    </>
  );
}

function EveryoneTab() {
  const { state } = useApp();
  return <Everyone open={PEOPLE.every(p => state.responses[p]?.submitted)} />;
}

function SuggestTab() {
  const { state } = useApp();
  return <Suggest open={PEOPLE.every(p => state.responses[p]?.submitted)} />;
}

const PANELS: Record<Tab, () => JSX.Element> = { 'My trip': MyTripTab, 'Group': GroupTab, 'Everyone': EveryoneTab, 'Suggest': SuggestTab };

const blank = (name: Person): Response => ({
  name, days: null, flex: false, pace: null, ranking: emptyRanking(), rated: [], submitted: false, updatedAt: new Date().toISOString(),
});

function Flow({ me, say }: { me: Person; say: Say }) {
  const { state, store, items, copy, clearMe } = useApp();
  const [draft, setDraft] = useState<Response>(() => {
    const saved = state.responses[me];
    return saved ? structuredClone(saved) : blank(me);
  });
  const ref = useRef(draft);
  const [step, setStep] = useState<Step>(() => (draft.days === null ? 'days' : draft.pace === null ? 'pace' : draft.submitted ? 'tabs' : 'rate'));
  const [tab, setTab] = useState<Tab>('My trip');
  const [editing, setEditing] = useState(false);

  const save = useCallback((patch: Partial<Omit<Response, 'name'>>) => {
    ref.current = { ...ref.current, ...patch };
    setDraft(ref.current);
    const { days, flex, pace, ranking, rated, submitted } = ref.current;
    void store.saveResponse(me, { days, flex, pace, ranking, rated, submitted });
  }, [store, me]);

  const byId = Object.fromEntries(items.map(i => [i.id, i])) as Record<string, Item>;
  const unrated = items
    .filter(i => !draft.rated.includes(i.id))
    .sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area));
  const locked = PEOPLE.every(p => (p === me ? draft.submitted : state.responses[p]?.submitted));
  const shown: Step = locked ? 'tabs' : step;

  const changeDays = () => navigate('back', () => { setEditing(true); setStep('days'); });
  const changeLink = <button className="link" onClick={changeDays}>Change days or pace</button>;

  const commit = (r: Ranking, id: string) => save({ ranking: r, rated: draft.rated.includes(id) ? draft.rated : [...draft.rated, id] });

  // Before the head to heads a swipe only picks a tier: no in-tier comparisons (Brittany 2026-10-15).
  const pickTier = (item: Item, tier: Tier) => {
    if (locked) return;
    const r = structuredClone(draft.ranking);
    setTier(r, item.id, tier);
    say(pickQuip(copy.quips.tier[tier]), tier);
    if (unrated.length === 1) navigate('fwd', () => commit(r, item.id));
    else commit(r, item.id);
  };

  const onRetier = (id: string, tier: Tier) => {
    if (locked || tierOf(draft.ranking, id) === tier) return;
    const r = structuredClone(draft.ranking);
    setTier(r, id, tier);
    say(pickQuip(copy.quips.tier[tier]), tier);
    save({ ranking: r });
  };

  const submit = () => {
    save({ submitted: true });
    navigate('fwd', () => setStep('tabs'));
  };

  let content;
  if (shown === 'days') {
    content = <Days days={draft.days} flex={draft.flex} onPick={(days, flex) => {
      save({ days, flex });
      say(pickQuip(copy.quips.days[flex ? 'flex' : String(days)]));
      navigate('fwd', () => setStep(editing || draft.pace === null ? 'pace' : draft.submitted ? 'tabs' : 'rate'));
    }} />;
  } else if (shown === 'pace') {
    content = <Pace pace={draft.pace} onBack={() => navigate('back', () => setStep('days'))} onPick={(p: PaceT) => {
      save({ pace: p });
      say(pickQuip(copy.quips.pace[String(p)]));
      navigate('fwd', () => { setEditing(false); setStep(draft.submitted ? 'tabs' : 'rate'); });
    }} />;
  } else if (shown === 'rate' && unrated.length > 0) {
    const total = unrated.length + draft.rated.filter(id => byId[id]).length;
    content = <Rate item={unrated[0]} next={unrated[1]} n={total - unrated.length + 1} total={total} copy={copy} onTier={t => pickTier(unrated[0], t)} />;
  } else if (shown === 'rate') {
    content = <Rerank ranking={draft.ranking} byId={byId} onRetier={onRetier} onSubmit={submit}
      title="Your picks" kicker="All rated" sub="Order inside a tier does not matter. Change any tier, then submit." cta="Done, submit" />;
  } else {
    const Panel = PANELS[tab];
    content = (
      <>
        <div role="tabpanel" aria-label={tab} className="panel"><Panel /></div>
        <div className="foot stack">
          {locked
            ? <div className="sub locked">Ratings are locked, the group stage is open.</div>
            : <button className="cta alt" onClick={() => navigate('back', () => setStep('rate'))}>Edit my ratings</button>}
          {!locked && unrated.length > 0 && (
            <button className="cta" onClick={() => navigate('back', () => setStep('rate'))}>{unrated.length} new to rate</button>
          )}
          {!locked && changeLink}
        </div>
      </>
    );
  }

  const where = shown === 'rate' ? changeLink : { days: 'Days', pace: 'Pace', rate: '', tabs: '' }[shown];
  const enter = cssEnter() ? lastNav() : null;
  const screenKey = shown === 'tabs' ? `tabs:${tab}` : shown === 'rate' && unrated.length === 0 ? 'rerank' : shown;
  useLayoutEffect(() => {
    if (!/jsdom/.test(navigator.userAgent)) window.scrollTo(0, 0);
  }, [screenKey]);

  return (
    <>
      <header className="top">
        <span className="who">
          <Avatar name={me} size={30} />
          <b>{me}</b>
          <button className="link" onClick={() => navigate('back', clearMe)}>Not you?</button>
        </span>
        <span className="where">{where}</span>
      </header>
      <div className={`screen${enter ? ` enter-${enter}` : ''}`} key={screenKey}>{content}</div>
      {shown === 'tabs' && (
        <nav className="tabs" role="tablist" aria-label="Sections">
          {TABS.map(t => {
            const Icon = TAB_ICON[t];
            return <button key={t} role="tab" aria-selected={tab === t} onClick={() => { if (t !== tab) navigate('tab', () => setTab(t)); }}><Icon /><span>{t}</span></button>;
          })}
        </nav>
      )}
    </>
  );
}

function Shell() {
  const { me, setMe, copy, error, retry, items } = useApp();
  const [toast, setToast] = useState<{ text: string; kind: QuipKind; id: number } | null>(null);
  const seq = useRef(0);
  const say = useCallback<Say>((text, kind = 'hi') => {
    if (text) setToast({ text, kind, id: ++seq.current });
  }, []);
  // Intro slideshow: Brittany-approved places first, then the rest, six at most.
  const covers = [...items.filter(i => i.photo && copy.items[i.id]?.approved), ...items.filter(i => i.photo && !copy.items[i.id]?.approved)].slice(0, 6);
  const clear = useCallback(() => setToast(null), []);
  return (
    <div className="app">
      {error && <button className="errbar" onClick={retry}>{error}. Tap to retry</button>}
      {me
        ? <Flow key={me} me={me} say={say} />
        : <Name welcome={copy.welcome} welcomeSub={copy.welcomeSub} covers={covers} players={copy.players} onPick={p => { setMe(p); say(pickQuip(copy.quips.name[p])); }} />}
      {toast && <QuipBurst key={toast.id} text={toast.text} kind={toast.kind} onDone={clear} />}
    </div>
  );
}

export default function App({ store }: { store?: Store }) {
  useEffect(() => { document.title = 'Sri Lanka Trip Picker'; }, []);
  if (wantsRaw(window.location.hash)) return <Raw store={store} />;
  if (!store && connectionMissingNow()) {
    return (
      <div className="app">
        <div className="body" role="alert"><div className="big">Not connected to the shared database. Ask Brittany to add the Supabase keys.</div></div>
      </div>
    );
  }
  return <AppProvider store={store}><Shell /></AppProvider>;
}
