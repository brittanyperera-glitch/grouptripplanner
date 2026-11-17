import './MissionHQ.css';
import { useEffect, useMemo, useState } from 'react';
import SpyScreen from '../components/spy/SpyScreen';
import Stamp from '../components/spy/Stamp';
import { crewReadiness, spyActive } from '../lib/missions';
import type { MissionInput } from '../lib/missions';
import { useApp } from '../state';
import type { GroupResult } from '../types';
import { useTripModel } from './useTripModel';

export const SEEN_KEY = 'gth-mission-complete-seen';
const COPY = { title: 'Mission complete', go: 'Go to the trip' };

const seen = () => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* storage unavailable: it may show again */ } };

export function MissionCompleteBody({ ready, of, onTrip }: { ready: number; of: number; onTrip(): void }) {
  return (
    <SpyScreen code="Operation Homecoming" title={COPY.title}>
      <div className="spyhq-done">
        <Stamp text={COPY.title} big burst sound />
        <span className="spy-code">{`Crew ${ready}/${of}`}</span>
        <button type="button" className="spy-btn spy-btn-solid" onClick={onTrip}>{COPY.go}</button>
      </div>
    </SpyScreen>
  );
}

/** Shows once: when every mission is done and the seen flag is unset. Showing it sets the flag. */
export default function MissionComplete({ group, onTrip, today }: { group: GroupResult; onTrip(): void; today?: string }) {
  const { state } = useApp();
  const model = useTripModel(group, today);
  const input = useMemo<MissionInput>(() => ({ state, plan: model.plan, model }), [state, model]);
  const [first] = useState(() => !seen());
  const show = first && !spyActive(input);
  useEffect(() => { if (show) markSeen(); }, [show]);
  if (!show) return null;
  const { people } = crewReadiness(input);
  return <MissionCompleteBody ready={people.filter(p => p.done >= p.total).length} of={people.length} onTrip={onTrip} />;
}
