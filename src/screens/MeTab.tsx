import './MeTab.css';
import CrewStrip from '../components/CrewStrip';
import { IconRight } from '../components/Icons';
import { allSubmitted } from '../lib/group';
import { NAMES } from '../lib/names';
import { isAdmin } from '../lib/override';
import type { Open } from '../lib/todo';
import { useApp } from '../state';
import type { Copy } from '../state';
import { isGuest } from '../types';
import type { Player } from '../types';
import Profile from './Profile';

function Row({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button type="button" className="me-row" onClick={onClick}>
      <span>{title}</span>
      <IconRight size={20} />
    </button>
  );
}

/** The Me tab: my card with no Back, then the Crew rows, What would you change?, Not you? and Log out, and Organiser for Brittany. */
export default function MeTab({ me, players, onOpen, onQuiz, onBingo, onAwards, onNotYou, onLogout, logoutLabel = 'Log out' }: {
  me: Player; players?: NonNullable<Copy['players']>; onOpen: (o: Open) => void; onQuiz: () => void; onBingo: () => void;
  onAwards?: () => void; onNotYou: () => void; onLogout?: () => void; logoutLabel?: string;
}) {
  const { state } = useApp();
  const stats = !isGuest(me) && allSubmitted(state.responses);
  const sub = (s: 'crew-stats' | 'crew-decided' | 'complaints' | 'organiser') => () => onOpen({ sub: s });
  return (
    <>
      <Profile name={me} players={players} onQuiz={onQuiz} onBingo={onBingo} />
      <section className="body me-rows" aria-label={NAMES.crew}>
        <div className="kicker">{NAMES.crew}</div>
        <CrewStrip />
        {stats && <Row title={NAMES.stats} onClick={sub('crew-stats')} />}
        {onAwards && <Row title="Awards" onClick={onAwards} />}
        <Row title={NAMES.decided} onClick={sub('crew-decided')} />
      </section>
      <section className="body me-rows" aria-label="More">
        <Row title="What would you change?" onClick={sub('complaints')} />
        {isAdmin(me) && <Row title={NAMES.organiser} onClick={sub('organiser')} />}
        <Row title="Not you?" onClick={onNotYou} />
        {onLogout && <Row title={logoutLabel} onClick={onLogout} />}
      </section>
    </>
  );
}
