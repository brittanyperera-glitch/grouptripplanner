import './MissionHQ.css';
import './TodoTab.css';
import { useMemo } from 'react';
import MissionFile from '../components/spy/MissionFile';
import NextMove from '../components/spy/NextMove';
import SpyScreen from '../components/spy/SpyScreen';
import { NAMES } from '../lib/names';
import { crewReadiness, missionFiles } from '../lib/missions';
import type { MissionId, MissionInput } from '../lib/missions';
import { nextTask, youLine } from '../lib/todo';
import type { Open, SubId, Task } from '../lib/todo';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { GroupResult, Person } from '../types';
import { HqStanding } from './MissionHQ';
import { CODE } from './MissionComplete';
import { useTripModel } from './useTripModel';

const COPY = { files: 'Your files', fun: 'For fun' };
const DOOR: Record<MissionId, SubId> = { stays: 'stays', supply: 'bookings', touchdown: 'flights' };

/** The To do tab: your next move, the countdown and crew, one card per file ("You" and "Group"), then the fun tasks. It stays, stamped, when everything is done. */
export default function TodoTab({ group, tasks, onOpen, today }: { group: GroupResult; tasks: Task[]; onOpen(o: Open): void; today?: string }) {
  const { state, me } = useApp();
  const model = useTripModel(group, today);
  const input = useMemo<MissionInput>(() => ({ state, plan: model.plan, model }), [state, model]);
  if (!me || !PEOPLE.includes(me as Person)) return null;
  const crew = crewReadiness(input);
  const mine = crew.people.find(p => p.name === me) ?? { done: 0, total: 1 };
  const fun = tasks.filter(t => !t.owed);
  return (
    <SpyScreen code={CODE} title={NAMES.todo}>
      <NextMove me={me as Person} move={nextTask(tasks)} done={mine.done} total={mine.total} cta="Start" onStart={t => onOpen(t.open)} />
      <HqStanding start={model.start} crew={crew} />
      <div className="spyhq-board">
        <span className="spy-code">{COPY.files}</span>
        {missionFiles(input).map(f => <MissionFile key={f.id} file={f} you={youLine(f.id, tasks)} onOpen={id => onOpen({ sub: DOOR[id] })} />)}
      </div>
      {fun.length > 0 && (
        <div className="spyhq-board">
          <span className="spy-code">{COPY.fun}</span>
          {fun.map(t => <button key={t.id} type="button" className="spy-btn todo-fun" onClick={() => onOpen(t.open)}>{t.label}</button>)}
        </div>
      )}
    </SpyScreen>
  );
}
