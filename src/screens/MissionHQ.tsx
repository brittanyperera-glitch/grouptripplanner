import './MissionHQ.css';
import { useMemo } from 'react';
import Countdown from '../components/spy/Countdown';
import CrewRing from '../components/spy/CrewRing';
import MissionFile from '../components/spy/MissionFile';
import NextMove from '../components/spy/NextMove';
import SpyScreen from '../components/spy/SpyScreen';
import Stamp from '../components/spy/Stamp';
import { WEEKDAY_DAY_MONTH } from '../lib/dates';
import { crewReadiness, missionFiles, nextMove, spyActive } from '../lib/missions';
import type { MissionId, MissionInput, Move } from '../lib/missions';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { GroupResult, Person } from '../types';
import { useTripModel } from './useTripModel';

const COPY = { notSet: 'Launch date not set', launch: 'Wheels down Colombo', files: 'Mission files', plain: 'Mission HQ', clear: 'Every mission is done.' };

interface BodyProps {
  me: Person; input: MissionInput; start: string | null; replay?: boolean;
  onGo(m: Move): void; onOpen(id: MissionId): void; onExit(): void;
}

/** Props-in HQ. The spy look is on only while a mission has work left, or while the finale is replayed. */
export function MissionHQBody({ me, input, start, replay = false, onGo, onOpen, onExit }: BodyProps) {
  const real = missionFiles(input);
  if (!replay && !spyActive(input)) {
    return (
      <section className="body spyhq-plain" aria-label={COPY.plain}>
        <h2>{COPY.plain}</h2>
        <p>{COPY.clear}</p>
        <ul>{real.map(f => <li key={f.id}>{`${f.title}: ${f.status}`}</li>)}</ul>
        <p>{start ? `Trip starts ${WEEKDAY_DAY_MONTH.format(new Date(`${start}T00:00:00Z`))}` : COPY.notSet}</p>
      </section>
    );
  }
  const files = replay ? real.map(f => ({ ...f, done: f.total, complete: true, status: 'Secured' })) : real;
  const crew = crewReadiness(input);
  const people = replay ? crew.people.map(p => ({ ...p, done: p.total })) : crew.people;
  const mine = people.find(p => p.name === me) ?? { done: 0, total: 1 };
  const move = replay ? null : nextMove(me, input);
  return (
    <SpyScreen code="Operation Homecoming" title={COPY.plain} replay={replay ? { onExit } : undefined}>
      {!replay && <NextMove me={me} move={move} done={mine.done} total={mine.total} onStart={onGo} />}
      {start
        ? <Countdown at={`${start}T00:00`} label={COPY.launch} />
        : <div className="spy-cd"><span className="spy-code">{COPY.notSet}</span></div>}
      <CrewRing percent={replay ? 100 : crew.percent} people={people} />
      <div className="spyhq-board">
        <span className="spy-code">{COPY.files}</span>
        {files.map(f => <MissionFile key={f.id} file={f} onOpen={replay ? undefined : onOpen} />)}
      </div>
      {replay && <div className="spyhq-done"><Stamp text="Mission complete" big burst sound /><span className="spy-code">{`Crew ${PEOPLE.length}/${PEOPLE.length}`}</span></div>}
    </SpyScreen>
  );
}

/** Container: reads the app and the trip model, nothing else. A guest or nobody signed in has no HQ. */
export default function MissionHQ({ group, replay, onGo, onOpen, onExit, today }: { group: GroupResult; replay?: boolean; today?: string } & Pick<BodyProps, 'onGo' | 'onOpen' | 'onExit'>) {
  const { state, me } = useApp();
  const model = useTripModel(group, today);
  const input = useMemo<MissionInput>(() => ({ state, plan: model.plan, model }), [state, model]);
  if (!me || !PEOPLE.includes(me as Person)) return null;
  return <MissionHQBody me={me as Person} input={input} start={model.start} replay={replay} onGo={onGo} onOpen={onOpen} onExit={onExit} />;
}
