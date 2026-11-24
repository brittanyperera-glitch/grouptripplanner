import './MissionHQ.css';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import SpyScreen from '../components/spy/SpyScreen';
import Stamp from '../components/spy/Stamp';
import { crewReadiness, spyActive } from '../lib/missions';
import type { MissionInput } from '../lib/missions';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { GroupResult, Person } from '../types';
import { useTripModel } from './useTripModel';

// A tp: key so ?fresh, an epoch bump and guest mode's snapshot all reset it with the other seen flags.
export const SEEN_KEY = 'tp:mission-complete-seen';
export const CODE = 'Operation Homecoming';
const COPY = { title: 'Mission complete', go: 'Go to the trip' };

// Blocked storage counts as seen, as in HowTo.tsx and MyTrip.tsx: nothing could remember it, so the finale would replay on every mount.
export const finaleSeen = () => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; } };
export const markFinaleSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* a full quota fails the write: it may show once more */ } };

const eligible = (me: string | null, i: MissionInput) => !!me && PEOPLE.includes(me as Person) && !spyActive(i);
/** For the shell: one of the five, every mission done, and the finale not yet seen. Ask once on open, then call `markFinaleSeen` when it closes. */
export const finaleDue = (me: string | null, i: MissionInput) => eligible(me, i) && !finaleSeen();

/** The finale block: the stamp and the crew count. The finale screen adds its button. */
export function Finale({ ready, of, children }: { ready: number; of: number; children?: ReactNode }) {
  return (
    <div className="spyhq-done">
      <Stamp text={COPY.title} big burst sound />
      <span className="spy-code">{`Crew ${ready}/${of}`}</span>
      {children}
    </div>
  );
}

export function MissionCompleteBody({ ready, of, onTrip }: { ready: number; of: number; onTrip(): void }) {
  return (
    <SpyScreen code={CODE} title={COPY.title}>
      <Finale ready={ready} of={of}>
        <button type="button" className="spy-btn spy-btn-solid" onClick={onTrip}>{COPY.go}</button>
      </Finale>
    </SpyScreen>
  );
}

/** Shows once: to one of the five, when every mission is done and the seen flag is unset. Pressing its button sets the flag. */
export default function MissionComplete({ group, onTrip, today }: { group: GroupResult; onTrip(): void; today?: string }) {
  const { state, me } = useApp();
  const model = useTripModel(group, today);
  const input = useMemo<MissionInput>(() => ({ state, plan: model.plan, model }), [state, model]);
  const [first] = useState(() => !finaleSeen());
  const show = first && eligible(me, input);
  if (!show) return null;
  const { people } = crewReadiness(input);
  return <MissionCompleteBody ready={people.filter(p => p.done >= p.total).length} of={people.length} onTrip={() => { markFinaleSeen(); onTrip(); }} />;
}
