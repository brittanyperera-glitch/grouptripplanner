import './MissionHQ.css';
import { useMemo } from 'react';
import Countdown from '../components/spy/Countdown';
import CrewRing from '../components/spy/CrewRing';
import MissionFile from '../components/spy/MissionFile';
import NextMove from '../components/spy/NextMove';
import SpyScreen from '../components/spy/SpyScreen';
import { crewReadiness, missionFiles, nextMove } from '../lib/missions';
import type { MissionId, MissionInput, Move } from '../lib/missions';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { GroupResult, Person } from '../types';
import { CODE } from './MissionComplete';
import { useTripModel } from './useTripModel';

const COPY = { notSet: 'Launch date not set', launch: 'Wheels down Colombo', files: 'Mission files', title: 'Mission HQ', group: 'Group trip' };

/** The countdown and the crew ring: the part of the board the To do tab shares with this screen. */
export function HqStanding({ start, crew }: { start: string | null; crew: ReturnType<typeof crewReadiness> }) {
  return (
    <>
      {start
        ? <Countdown at={`${start}T00:00`} label={COPY.launch} />
        : <div className="spy-cd"><span className="spy-code">{COPY.notSet}</span></div>}
      <CrewRing percent={crew.percent} people={crew.people} />
    </>
  );
}

interface BodyProps {
  me: Person; input: MissionInput; start: string | null;
  onGo(m: Move): void; onOpen(id: MissionId): void;
  /** The way on to Group trip, drawn inside the HQ so no paper shows below it. */
  onGroup?(): void;
}

/** Props-in HQ for today's shell. The board stays once every mission is done, stamped: the game does not switch off. */
export function MissionHQBody({ me, input, start, onGo, onOpen, onGroup }: BodyProps) {
  const crew = crewReadiness(input);
  const mine = crew.people.find(p => p.name === me) ?? { done: 0, total: 1 };
  return (
    <SpyScreen code={CODE} title={COPY.title}>
      <NextMove me={me} move={nextMove(me, input)} done={mine.done} total={mine.total} onStart={onGo} />
      <HqStanding start={start} crew={crew} />
      <div className="spyhq-board">
        <span className="spy-code">{COPY.files}</span>
        {missionFiles(input).map(f => <MissionFile key={f.id} file={f} onOpen={onOpen} />)}
      </div>
      {onGroup && <button type="button" className="spy-btn spyhq-group" onClick={onGroup}>{COPY.group}</button>}
    </SpyScreen>
  );
}

/** Container: reads the app and the trip model, nothing else. A guest or nobody signed in has no HQ. `replay` and `onExit` are ignored: kept only so App.tsx and Plan.tsx still compile until the shell drops them. */
export default function MissionHQ({ group, onGo, onOpen, onGroup, today }: { group: GroupResult; today?: string; replay?: boolean; onExit?(): void } & Pick<BodyProps, 'onGo' | 'onOpen' | 'onGroup'>) {
  const { state, me } = useApp();
  const model = useTripModel(group, today);
  const input = useMemo<MissionInput>(() => ({ state, plan: model.plan, model }), [state, model]);
  if (!me || !PEOPLE.includes(me as Person)) return null;
  return <MissionHQBody me={me as Person} input={input} start={model.start} onGo={onGo} onOpen={onOpen} onGroup={onGroup} />;
}
