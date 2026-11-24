import './MissionHQ.css';
import Countdown from '../components/spy/Countdown';
import CrewRing from '../components/spy/CrewRing';
import type { crewReadiness } from '../lib/missions';

const COPY = { notSet: 'Launch date not set', launch: 'Wheels down Colombo' };

/** The countdown and the crew ring the To do tab draws. */
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
