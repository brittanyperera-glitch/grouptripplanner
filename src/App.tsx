import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Avatar from './components/Avatar';
import { AdminNav } from './components/AdminNav';
import { GuideNav } from './components/GuideNav';
import { MUTE_KEY } from './components/sound';
import { IconBook, IconGroup, IconList, IconPin, IconRoute, IconSpark } from './components/Icons';
import { cssEnter, lastNav, navigate } from './components/motion';
import QuipBurst from './components/QuipBurst';
import type { QuipKind } from './components/QuipBurst';
import { QuipGate } from './components/quipRate';
import { groupAwards } from './lib/awards';
import { awardsKey, isFinalizing, openItems, routePlan, tabBadges, toRate } from './lib/openItems';
import type { OpenItem } from './lib/openItems';
import { hidesTabs, pickScreen } from './lib/overlay';
import type { Overlay } from './lib/overlay';
import { removeId, setTier } from './lib/ranking';
import Awards from './screens/Awards';
import Bingo from './screens/Bingo';
import Days from './screens/Days';
import Extras from './screens/Extras';
import Finalize, { EditListRow } from './screens/Finalize';
import Guide from './screens/Guide';
import GroupHub from './screens/GroupHub';
import type { GroupView } from './screens/GroupHub';
import MyTrip from './screens/MyTrip';
import Name from './screens/Name';
import OpenItems from './screens/OpenItems';
import Walkthrough from './screens/Walkthrough';
import Interview from './screens/Interview';
import { markSeen as markWalkSeen, readSeen as readWalkSeen, shouldShow as walkShould, todayKey } from './lib/walkthrough';
import Pace from './screens/Pace';
import Plan from './screens/Plan';
import Premiere from './screens/Reveal';
import Profile from './screens/Profile';
import profileCopy from './content/profile.json';
import Raw, { wantsRaw } from './screens/Raw';
import Rate from './screens/Rate';
import Rerank from './screens/Rerank';
import Suggest from './screens/Suggest';
import Waiting from './screens/Waiting';
import BigState from './components/BigState';
import HowTo, { howtoWanted, markHowtoSeen } from './screens/HowTo';
import type { HowToCopy } from './screens/HowTo';
import copyData from './content/copy.json';
import genresJson from './data/genres.json';
import GuestRoot from './guest/GuestRoot';
import Landing from './screens/Landing';
import Stays from './screens/Stays';
import TripAdmin from './screens/TripAdmin';
import { AppProvider, ME_KEY, pickQuip, useApp } from './state';
import { connectionMissingNow, supabaseConfigured } from './store';
import { clearTripKey, readTripKey } from './store/tripKey';
import { clearLocalProgress } from './store/fresh';
import { isLocalStoreKey } from './store/local';
import { useGroupResult, usePersonPlan } from './workers/usePlan';
import { AREAS, emptyRanking, GUESTS, isGuest, PEOPLE } from './types';
import type { Genre, GroupResult, Item, Pace as PaceT, Player, Ranking, Response, Store, Tier } from './types';

type Step = 'days' | 'pace' | 'howto' | 'rate' | 'tabs';
const howtoCopy = () => (copyData as unknown as { howto?: HowToCopy }).howto;
type Tab = 'My trip' | 'Picks' | 'Group' | 'Stays' | 'Suggest' | 'Guide' | 'Profile';
// The tab bar only renders once I have submitted, so Guide is never offered before that.
const TABS: Tab[] = ['My trip', 'Picks', 'Group', 'Stays', 'Suggest', 'Guide', 'Profile'];
const GENRES = genresJson.genres as Genre[];
const AWARDS_SEEN_KEY = 'tp:awards-seen';
const readSeen = (): string | null => { try { return localStorage.getItem(AWARDS_SEEN_KEY); } catch { return null; } };
const TAB_ICON: Record<Tab, (p: { size?: number }) => JSX.Element> = { 'My trip': IconRoute, 'Picks': IconList, 'Group': IconGroup, 'Stays': IconPin, 'Suggest': IconSpark, 'Guide': IconBook, 'Profile': IconGroup };
type Say = (t?: string, kind?: QuipKind) => void;

type TripView = 'mine' | 'group';

// Flow computes the group result once and every tab reads it from here.
const GroupCtx = createContext<GroupResult | null>(null);
// Back to the landing screen (guest or trip password); only set for the trip, never inside a guest sandbox.
const LogoutCtx = createContext<(() => void) | null>(null);
const useGroup = () => useContext(GroupCtx);

/** The group plan, shown under My trip once all five have rated. */
function GroupTrip() {
  const group = useGroup();
  if (!group) return <div className="body"><div className="sub">Working out the plan...</div></div>;
  return (
    <>
      <Plan group={group} reveal={<Premiere group={group} />} />
      <Extras group={group} />
    </>
  );
}

function MyTripTab() {
  const { state, me, items, legs } = useApp();
  // Until she picks a view, the group plan leads once it is open. The tab remounts on re-entry, which resets the pick.
  const [picked, setPicked] = useState<TripView | null>(null);
  const resp = me ? state.responses[me] : undefined;
  const { data: plan } = usePersonPlan(resp, items, legs);
  // Same test as group.open in lib/group.ts: all five trip members have submitted.
  const open = PEOPLE.every(p => state.responses[p]?.submitted);
  const view: TripView = picked ?? (open ? 'group' : 'mine');
  let content;
  if (view === 'group' && open) content = <GroupTrip />;
  else if (view === 'group') content = <section className="body" aria-label="Group trip, not open yet"><BigState headline="The plan is locked." sub="It opens when all five have finished rating. Ask the slow ones." crew={{ label: 'Who has finished rating', done: p => !!state.responses[p]?.submitted, doneLabel: 'finished rating', waitLabel: 'still rating', caption: `${PEOPLE.filter(p => state.responses[p]?.submitted).length} of ${PEOPLE.length} done` }} /></section>;
  else if (!resp) content = <div className="body"><div className="sub">Loading</div></div>;
  else if (!plan) content = <div className="body"><div className="sub">Working out the plan...</div></div>;
  else content = <MyTrip plan={plan} days={resp.flex ? 14 : resp.days ?? 9} />;
  const shown: TripView = view;
  return (
    <>
      <div className="mt-sub">
        <div className="mt-seg">
          <button type="button" aria-pressed={shown === 'mine'} onClick={() => setPicked('mine')}>My trip</button>
          <button type="button" aria-pressed={shown === 'group'} onClick={() => setPicked('group')}>Group trip</button>
        </div>
      </div>
      {content}
    </>
  );
}

function GroupTab({ view, onView }: { view: GroupView; onView(v: GroupView): void }) {
  const { state, me } = useApp();
  const group = useGroup();
  const [editing, setEditing] = useState(false);
  // Until I have saved my final list, that step stands alone; the hub returns after saving.
  const finalizing = !!group && isFinalizing(group);
  const saved = !!(me && state.responses[me]?.final);
  const stage = !group ? 'loading' : !group.open ? 'waiting' : finalizing && (!saved || editing) ? 'finalize' : view;
  // The tab's content swaps without a tab change (a deciding vote opens Finalize, a hub block opens), so start it at the top.
  useLayoutEffect(() => { if (!/jsdom/.test(navigator.userAgent)) window.scrollTo(0, 0); }, [stage]);
  if (!group) return <div className="body"><div className="sub">Working out the plan...</div></div>;
  if (!group.open) return <Waiting />;
  if (stage === 'finalize') return <Finalize group={group} editing={editing} onSaved={() => setEditing(false)} />;
  return (
    <>
      {finalizing && view === 'hub' && <EditListRow group={group} onEdit={() => setEditing(true)} />}
      <GroupHub group={group} view={view} onView={onView} />
    </>
  );
}

function SuggestTab() {
  const { state } = useApp();
  return <Suggest open={PEOPLE.every(p => state.responses[p]?.submitted)} />;
}

// Picks is drawn inside Flow, which holds my draft ranking.
const PANELS: Record<Exclude<Tab, 'My trip' | 'Picks' | 'Profile' | 'Group' | 'Stays'>, () => JSX.Element> = { 'Suggest': SuggestTab, 'Guide': Guide };

const blank = (name: Player): Response => ({
  name, days: null, flex: false, pace: null, ranking: emptyRanking(), rated: [], submitted: false, updatedAt: new Date().toISOString(),
});

const START_OVER_ARMED_MS = 4000;

/**
 * The header's one Menu: Change days or pace (while rating), Not you? and Start over, so the header stays one row
 * on a phone (Brittany 2026-10-15). Start over takes two taps; the first arms it for a few seconds, no browser dialog.
 */
// Log out is the same item for everyone: a trip member forgets the password, a guest's demo resets; both land on the entry screen.
function HeaderMenu({ onProfile, onChange, onStats, onNotYou, onStartOver, onLogout, todo = 0, onItems, onAwards, onAdmin }: { onProfile(): void; onChange?(): void; onStats?(): void; onNotYou(): void; onStartOver(): void; onLogout?(): void; todo?: number; onItems?(): void; onAwards?(): void; onAdmin?(): void }) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), START_OVER_ARMED_MS);
    return () => clearTimeout(t);
  }, [armed]);
  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setArmed(false); };
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const pick = (act: () => void) => () => { setOpen(false); setArmed(false); act(); };
  return (
    <div className="hmenu" ref={box}>
      <button className="link" aria-haspopup="true" aria-expanded={open} onClick={() => { setOpen(o => !o); setArmed(false); }}>Menu</button>
      {open && (
        <div className="hmenu-list" role="group" aria-label="Menu">
          {onItems && <button onClick={pick(onItems)}>{todo > 0 ? `Open items (${todo})` : 'Open items'}</button>}
          {onAwards && <button onClick={pick(onAwards)}>Awards</button>}
          {onAdmin && <button onClick={pick(onAdmin)}>Trip admin</button>}
          <button onClick={pick(onProfile)}>{profileCopy.menuItem}</button>
          {onStats && <button onClick={pick(onStats)}>Group stats</button>}
          {onChange && <button onClick={pick(onChange)}>Change days or pace</button>}
          <button onClick={pick(onNotYou)}>Not you?</button>
          {onLogout && <button onClick={pick(onLogout)}>Log out</button>}
          <button className={armed ? 'armed' : undefined} onClick={armed ? pick(onStartOver) : () => setArmed(true)}>
            {armed ? 'Tap again to start over' : 'Start over'}
          </button>
        </div>
      )}
    </div>
  );
}

function Flow({ me, say, onStartOver }: { me: Player; say: Say; onStartOver(): void }) {
  const { state, store, items, legs, copy, clearMe, finishSandbox } = useApp();
  const logout = useContext(LogoutCtx);
  const { data: group } = useGroupResult(state, items, legs);
  const [draft, setDraft] = useState<Response>(() => {
    const saved = state.responses[me];
    return saved ? structuredClone(saved) : blank(me);
  });
  const ref = useRef(draft);
  const [step, setStep] = useState<Step>(() => (draft.days === null ? 'days' : draft.pace === null ? 'pace' : draft.submitted ? 'tabs' : 'rate'));
  const [rawTab, setTabState] = useState<Tab>('My trip');
  const [groupView, setGroupView] = useState<GroupView>('hub');
  const [editing, setEditing] = useState(false);
  // At most one page sits over the current step or tab (the profile card before the tabs, then Open items, the travel
  // quiz, Travel Bingo, Awards); closing it leaves that screen as it was. pickScreen decides what shows.
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [awardsSeen, setAwardsSeen] = useState<string | null>(readSeen);
  // The welcome-back walkthrough shows once a day, to someone who opens the app already submitted.
  const [walkDay, setWalkDay] = useState<string | null>(readWalkSeen);
  const scrollBack = useRef<number | null>(null);
  // On the tabs the profile is its own tab (Brittany 2026-10-16); before that it opens over the current step.
  const openProfile = () => {
    if (step === 'tabs') {
      navigate('tab', () => { if (tabRef.current !== 'Profile') setTab('Profile'); else if (overlay) dropOverlay(); });
      return;
    }
    if (overlay === 'profile') return;
    navigate('fwd', () => showOverlay('profile'));
  };
  const closeProfile = () => navigate('back', () => setOverlay(null));
  // Jump to a Group view from anywhere (the Menu).
  const openGroup = (v: GroupView) => navigate('tab', () => {
    setGroupView(v);
    if (tabRef.current !== 'Group') setTab('Group'); else if (overlay) dropOverlay();
  });
  const openItemsPage = () => {
    if (overlay === 'items') return;
    navigate('fwd', () => showOverlay('items'));
  };
  // A row on the Open items page: close the page, then go where the action is.
  const goItem = (i: OpenItem) => navigate('tab', () => {
    if (i.target.tab === 'Awards') { showOverlay('awards'); return; }
    if (i.target.tab === 'Quiz') { showOverlay('quiz'); return; }
    if (i.target.tab === 'Bingo') { showOverlay('bingo'); return; }
    if (i.target.tab === 'Group') setGroupView(i.target.view ?? 'hub');
    if (tabRef.current !== i.target.tab) setTab(i.target.tab); else dropOverlay();
  });
  const closeAwards = () => {
    try { localStorage.setItem(AWARDS_SEEN_KEY, awardsKey(awardList)); } catch { /* storage unavailable: unseen again next visit */ }
    setAwardsSeen(awardsKey(awardList));
    if (overlay === 'awards') dropOverlay();
  };

  // Each tab switch is a history entry with the same URL, so a phone's Back returns to the previous tab
  // instead of leaving the app. The hash is left alone because the raw page routes on it.
  const tabRef = useRef(rawTab);
  // An overlay opened on the tabs owns one such entry too (tpOverlay), so Back closes it first. Going to a tab from it
  // replaces that entry rather than stacking on it, and closing it by hand pops it (selfPop swallows that popstate).
  const selfPop = useRef(false);
  const setTab = useCallback((t: Tab) => {
    const entry = { ...history.state, tpTab: t, tpOverlay: undefined };
    if (history.state?.tpOverlay) history.replaceState(entry, ''); else history.pushState(entry, '');
    setOverlay(null);
    setTabState(t);
  }, []);
  const showOverlay = (o: Overlay) => {
    if (overlay === null && o !== 'awards') scrollBack.current = window.scrollY;
    setOverlay(o);
    if (step !== 'tabs') return;
    const entry = { ...history.state, tpTab: tabRef.current, tpOverlay: o };
    if (history.state?.tpOverlay) history.replaceState(entry, ''); else history.pushState(entry, '');
  };
  const dropOverlay = () => {
    setOverlay(null);
    if (history.state?.tpOverlay) { selfPop.current = true; history.back(); }
  };
  const closeOverlay = () => navigate('back', dropOverlay);
  useEffect(() => {
    if (step !== 'tabs') return;
    history.replaceState({ ...history.state, tpTab: tabRef.current, tpOverlay: undefined }, '');
    const onPop = (e: PopStateEvent) => {
      if (selfPop.current) { selfPop.current = false; return; }
      const t = (e.state as { tpTab?: Tab } | null)?.tpTab;
      if (t && TABS.includes(t)) navigate('back', () => { setOverlay(null); setTabState(t); });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [step]);

  const save = useCallback((patch: Partial<Omit<Response, 'name'>>) => {
    ref.current = { ...ref.current, ...patch };
    setDraft(ref.current);
    const { days, flex, pace, ranking, rated, submitted } = ref.current;
    void store.saveResponse(me, { days, flex, pace, ranking, rated, submitted });
  }, [store, me]);

  const byId = Object.fromEntries(items.map(i => [i.id, i])) as Record<string, Item>;
  // A card brought back by Undo goes first, whatever its area.
  const [undone, setUndone] = useState<string | null>(null);
  const unrated = toRate(items, draft.rated)
    .sort((a, b) => Number(b.id === undone) - Number(a.id === undone) || AREAS.indexOf(a.area) - AREAS.indexOf(b.area));
  // Only the five trip members are in the group: a guest is never locked out by the seeded crew.
  const statsOpen = !isGuest(me) && PEOPLE.every(p => state.responses[p]?.submitted);
  const locked = (PEOPLE as readonly string[]).includes(me) && PEOPLE.every(p => (p === me ? draft.submitted : state.responses[p]?.submitted));
  const shown: Step = locked ? 'tabs' : step;
  const awardList = useMemo(() => (group?.locked ? groupAwards(state, items, GENRES, [...group.results, ...group.knockouts]) : []), [group, state, items]);
  const awardsUnseen = awardList.length > 0 && awardsSeen !== awardsKey(awardList);
  // Once ratings lock, Picks has nothing left to offer: the bar drops it and a stale visit lands on Group.
  // Stays opens once the route is final, and takes Picks' slot so the bar stays at six tabs (a seventh clips at 320).
  const routeFinal = routePlan(group, state) !== null;
  const tab: Tab = locked && rawTab === 'Picks' ? 'Group' : rawTab === 'Stays' && !routeFinal ? 'My trip' : rawTab;
  const tabs = TABS.filter(t => !(t === 'Picks' && (locked || routeFinal)) && !(t === 'Stays' && !routeFinal));
  tabRef.current = tab;
  const todo = shown === 'tabs' ? openItems({ me, group, state, unrated: unrated.length, ratingsLocked: locked, awardsUnseen }) : [];
  const badges = tabBadges(todo);
  const today = todayKey(new Date());
  // Returning means they had already submitted when the app opened; a guest sandbox has no "back", so it never shows there.
  const arrivedSubmitted = useRef(draft.submitted).current;
  // Awards open on their own first; the walkthrough follows with whatever is still to do.
  const walkEligible = arrivedSubmitted && !isGuest(me) && walkShould(todo, today, walkDay);
  const screen = pickScreen({ shown, overlay, awardsUnseen, walkEligible });
  const finishWalk = () => { setWalkDay(today); markWalkSeen(); };

  const changeDays = () => navigate('back', () => { setOverlay(null); setEditing(true); setStep('days'); });
  const pickTab = (t: Tab) => {
    if (t !== tab) navigate('tab', () => { if (t === 'Group') setGroupView('hub'); setTab(t); });
    else if (overlay) navigate('back', dropOverlay);
    else if (t === 'Group' && groupView !== 'hub') navigate('back', () => setGroupView('hub'));
  };
  const changeLink = <button className="link" onClick={changeDays}>Change days or pace</button>;

  const commit = (r: Ranking, id: string) => save({ ranking: r, rated: draft.rated.includes(id) ? draft.rated : [...draft.rated, id] });

  // Before the head to heads a swipe only picks a tier: no in-tier comparisons (Brittany 2026-10-15).
  const quipGate = useRef(new QuipGate());
  const pickTier = (item: Item, tier: Tier) => {
    if (locked) return;
    const r = structuredClone(draft.ranking);
    setTier(r, item.id, tier);
    if (quipGate.current.next(tier)) say(pickQuip(copy.quips.tier[tier]), tier);
    if (unrated.length === 1) navigate('fwd', () => commit(r, item.id));
    else commit(r, item.id);
  };

  // Undo the last vote (Brittany 2026-10-15: "need to be able to go back if you click wrong"). Repeats walk further back.
  const lastRated = [...draft.rated].reverse().find(id => byId[id]);
  const undo = () => {
    if (locked || !lastRated) return;
    const r = structuredClone(draft.ranking);
    removeId(r, lastRated);
    setUndone(lastRated);
    save({ ranking: r, rated: draft.rated.filter(id => id !== lastRated) });
  };

  // A drag, drop or keyboard move on Your picks: the whole ranking arrives. No quips here (Brittany: less frequent).
  const onReorder = (next: Ranking) => {
    if (locked) return;
    save({ ranking: next });
  };

  const submit = () => {
    save({ submitted: true });
    navigate('fwd', () => setStep('tabs'));
  };

  let content;
  if (shown === 'days') {
    content = <Days days={draft.days} flex={draft.flex} onPick={(days, flex) => {
      // No quip screen on the setup steps (Brittany 2026-10-15).
      save({ days, flex });
      navigate('fwd', () => setStep(editing || draft.pace === null ? 'pace' : draft.submitted ? 'tabs' : 'rate'));
    }} />;
  } else if (shown === 'pace') {
    content = <Pace pace={draft.pace} onBack={() => navigate('back', () => setStep('days'))} onPick={(p: PaceT) => {
      save({ pace: p });
      const intro = howtoWanted(howtoCopy(), { editing, submitted: draft.submitted, rated: draft.rated.length });
      navigate('fwd', () => { setEditing(false); setStep(draft.submitted ? 'tabs' : intro ? 'howto' : 'rate'); });
    }} />;
  } else if (shown === 'howto' && howtoCopy()) {
    const leave = () => { markHowtoSeen(); navigate('fwd', () => setStep('rate')); };
    content = <HowTo copy={howtoCopy() as HowToCopy} onDone={leave} onSkip={leave} />;
  } else if (shown === 'rate' && unrated.length > 0) {
    const total = unrated.length + draft.rated.filter(id => byId[id]).length;
    content = <Rate item={unrated[0]} next={unrated[1]} n={total - unrated.length + 1} total={total} copy={copy} onTier={t => pickTier(unrated[0], t)} onUndo={lastRated ? undo : undefined} />;
  } else if (shown === 'rate') {
    content = <Rerank ranking={draft.ranking} byId={byId} onChange={onReorder} onSubmit={submit}
      title="Your picks" kicker="All rated" sub="Drag a row to rank it inside its tier, or into another tier to change it. Then submit." cta="Done, submit" />;
  } else if (tab === 'Picks') {
    // Your picks lives in the tab bar (Brittany 2026-10-15); after submitting, a reorder saves as you go.
    content = (
      <div role="tabpanel" aria-label="Picks" className="panel">
        {unrated.length > 0 && (
          <button className="cta" onClick={() => navigate('back', () => setStep('rate'))}>{unrated.length} new to rate</button>
        )}
        <Rerank ranking={draft.ranking} byId={byId} onChange={onReorder} onSubmit={() => undefined} sticky={false}
          title="Your picks" kicker="My picks" sub="Drag a row to rank it, or into another tier to change it. Saves as you go." />
        <div className="foot stack">{changeLink}</div>
      </div>
    );
  } else if (tab === 'Stays') {
    content = <div role="tabpanel" aria-label="Stays" className="panel"><Stays onQuiz={() => showOverlay('quiz')} /></div>;
  } else if (tab === 'Profile') {
    // Back goes to the tab I came from: tab switches are history entries.
    content = <div role="tabpanel" aria-label="Profile" className="panel"><Profile name={me} players={copy.players} onBack={() => history.back()} onQuiz={() => showOverlay('quiz')} onBingo={() => showOverlay('bingo')} /></div>;
  } else {
    const Panel = tab === 'Group' || tab === 'My trip' ? null : PANELS[tab];
    content = (
      <div role="tabpanel" aria-label={tab} className="panel"><AdminNav.Provider value={() => navigate('fwd', () => showOverlay('admin'))}><GuideNav.Provider value={() => navigate('tab', () => setTab('Guide'))}>
        {Panel ? <Panel /> : tab === 'My trip' ? <MyTripTab /> : <GroupTab view={groupView} onView={setGroupView} />}
      </GuideNav.Provider></AdminNav.Provider></div>
    );
  }

  const enter = cssEnter() ? lastNav() : null;
  if (screen === 'items') content = <OpenItems items={todo} onGo={goItem} onBack={closeOverlay} />;
  if (screen === 'walkthrough') content = <Walkthrough name={me} items={todo} onGo={goItem} onDone={finishWalk} />;
  if (screen === 'quiz') content = <Interview me={me} initial={state.stays?.crew[me]?.prefs} onSave={prefs => { void store.saveCrewStays(me, { prefs, quizDone: prefs.some(a => !a.skipped && (a.noPreference || Object.keys(a.picks).length > 0)) }); }} onDone={closeOverlay} onClose={closeOverlay} />;
  if (screen === 'bingo') content = <Bingo onBack={closeOverlay} />;
  if (screen === 'admin') content = <TripAdmin onBack={closeOverlay} />;
  // The quiz and Bingo only exist on the tabs, so the card before them leaves their rows out.
  if (screen === 'profile') content = <Profile name={me} players={copy.players} onBack={closeProfile} />;
  const baseKey = shown === 'tabs' ? `tabs:${tab}` : shown === 'rate' && unrated.length === 0 ? 'rerank' : shown;
  const screenKey = screen === 'base' || screen === 'awards' ? baseKey : screen;
  useLayoutEffect(() => {
    const over = screenKey === 'profile' || screenKey === 'items' || screenKey === 'quiz' || screenKey === 'bingo' || screenKey === 'admin';
    if (!/jsdom/.test(navigator.userAgent)) window.scrollTo(0, over ? 0 : scrollBack.current ?? 0);
    if (!over) scrollBack.current = null;
  }, [screenKey]);

  return (
    <GroupCtx.Provider value={group}>
      <header className="top">
        <button className="who" aria-label={`${me}, ${profileCopy.headerLabel}`} onClick={openProfile}>
          <Avatar name={me} size={30} />
          <b>{me}</b>
        </button>
        <HeaderMenu onProfile={openProfile} onChange={(shown === 'rate' || shown === 'tabs') && !locked ? changeDays : undefined} onStats={shown === 'tabs' && statsOpen ? () => openGroup('stats') : undefined} onNotYou={() => navigate('back', clearMe)} onStartOver={onStartOver} onLogout={finishSandbox ?? logout ?? undefined}
          todo={todo.length} onItems={shown === 'tabs' ? openItemsPage : undefined} onAwards={shown === 'tabs' && awardList.length > 0 ? () => showOverlay('awards') : undefined} onAdmin={shown === 'tabs' ? () => navigate('fwd', () => showOverlay('admin')) : undefined} />
      </header>
      <div className={`screen${enter ? ` enter-${enter}` : ''}`} key={screenKey}>{content}</div>
      {shown === 'tabs' && !hidesTabs(screen) && (
        <nav className="tabs" role="tablist" aria-label="Sections">
          {tabs.map(t => {
            const Icon = TAB_ICON[t];
            const icon = t === 'Profile' ? <span className="tab-me" aria-hidden="true"><Avatar name={me} size={22} /></span> : <Icon />;
            const n = t === 'Group' || t === 'Picks' || t === 'Suggest' || t === 'Stays' ? badges[t] ?? 0 : 0;
            return <button key={t} role="tab" aria-selected={tab === t} aria-describedby={n > 0 ? `oi-tab-${t}` : undefined} onClick={() => pickTab(t)}>{icon}<span>{t}</span>{n > 0 && <span className="badge-count" aria-hidden="true">{n > 9 ? '9+' : n}</span>}</button>;
          })}
          {tabs.map(t => (t === 'Group' || t === 'Picks' || t === 'Suggest' || t === 'Stays') && (badges[t] ?? 0) > 0 && <span key={t} id={`oi-tab-${t}`} hidden>{`${badges[t]} to do`}</span>)}
        </nav>
      )}
      {screen === 'awards' && <Awards awards={awardList} onClose={closeAwards} />}
    </GroupCtx.Provider>
  );
}

type Entry = 'landing' | 'trip' | 'guest';

function firstEntry(store?: Store): Entry {
  const hash = window.location.hash;
  if (hash === '#/guest') return 'guest';
  if (hash === '#/landing') return 'landing';
  if (store || !supabaseConfigured()) return 'trip';
  let me: string | null = null;
  try { me = localStorage.getItem(ME_KEY); } catch { /* storage unavailable: treated as a new visitor */ }
  return !readTripKey() && !me ? 'landing' : 'trip';
}

function Shell() {
  const { me, setMe, copy, error, retry, store, sandbox, finishSandbox } = useApp();
  const logout = useContext(LogoutCtx);
  const [resets, setResets] = useState(0);
  // My row goes back to blank on the server (the choice log keeps its history), this browser forgets my
  // progress but not who I am or the mute switch, and Flow remounts on the first step.
  const startOver = useCallback(() => {
    if (!me) return;
    clearLocalProgress(k => k === ME_KEY || k === MUTE_KEY || isLocalStoreKey(k));
    void store.saveResponse(me, { days: null, flex: false, pace: null, ranking: emptyRanking(), final: null, rated: [], submitted: false });
    navigate('back', () => setResets(n => n + 1));
  }, [me, store]);
  const [toast, setToast] = useState<{ text: string; kind: QuipKind; id: number } | null>(null);
  const seq = useRef(0);
  const say = useCallback<Say>((text, kind = 'hi') => {
    if (text) setToast({ text, kind, id: ++seq.current });
  }, []);
  const clear = useCallback(() => setToast(null), []);
  return (
    <div className="app">
      {error && <button className="errbar" onClick={retry}>{error}. Tap to retry</button>}
      {me
        ? <Flow key={`${me}:${resets}`} me={me} say={say} onStartOver={startOver} />
        : <Name welcome={sandbox ? copy.guestWelcome ?? copy.welcome : copy.welcome} welcomeSub={sandbox ? copy.guestWelcomeSub : copy.welcomeSub} players={copy.players}
            roster={sandbox ? GUESTS : PEOPLE} onPick={p => { setMe(p); say(pickQuip(copy.quips.name[p])); }} onLogout={finishSandbox ?? logout ?? undefined} />}
      {toast && <QuipBurst key={toast.id} text={toast.text} kind={toast.kind} onDone={clear} />}
    </div>
  );
}

export default function App({ store }: { store?: Store }) {
  useEffect(() => { document.title = 'The Homecoming'; }, []);
  const [entry, setEntry] = useState<Entry>(() => firstEntry(store));
  if (wantsRaw(window.location.hash)) return <Raw store={store} />;
  // The two hash switches skip the connection check: a guest never touches the shared database.
  if (entry === 'landing') return <Landing onTrip={() => setEntry('trip')} onGuest={() => setEntry('guest')} />;
  // Clear the #/guest hash too, or a reload would drop straight back into guest mode.
  const leaveGuest = () => { history.replaceState(null, '', window.location.pathname + window.location.search); setEntry('landing'); };
  if (entry === 'guest') return <GuestRoot onExit={leaveGuest}><Shell /></GuestRoot>;
  if (!store && connectionMissingNow()) {
    return (
      <div className="app">
        <div className="body" role="alert"><div className="big">Not connected to the shared database. Ask Brittany to add the Supabase keys.</div></div>
      </div>
    );
  }
  // Log out forgets this device's trip password and who I am (my picks stay in the shared database).
  const logout = () => {
    clearTripKey();
    try { localStorage.removeItem(ME_KEY); } catch { /* storage unavailable: nothing stored to clear */ }
    setEntry('landing');
  };
  return <LogoutCtx.Provider value={logout}><AppProvider store={store}><Shell /></AppProvider></LogoutCtx.Provider>;
}
