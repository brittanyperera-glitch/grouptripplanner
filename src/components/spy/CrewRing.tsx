import { levelOf } from '../../lib/missions';
import type { Person } from '../../types';
import './spy.css';

const C = 2 * Math.PI * 50;
export const initials = (name: string) => name.slice(0, 2).toUpperCase();

export default function CrewRing({ percent, people }: { percent: number; people: { name: Person; done: number; total: number }[] }) {
  return (
    <div className="spy-ring-wrap">
      <svg className="spy-ring" viewBox="0 0 120 120" role="img" aria-label={`Crew readiness ${percent} percent`}>
        <circle cx="60" cy="60" r="50" fill="none" stroke="var(--s-chip)" strokeWidth="12" />
        <circle cx="60" cy="60" r="50" fill="none" stroke="var(--s-ok)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(C * percent) / 100} ${C}`} transform="rotate(-90 60 60)" />
        <text x="60" y="58" textAnchor="middle" fontSize="24" fontWeight="700">{`${percent}%`}</text>
        <text x="60" y="76" textAnchor="middle" fontSize="8" letterSpacing="1.5" style={{ fill: 'var(--s-dim)' }}>CREW READY</text>
      </svg>
      <div className="spy-agents">
        {people.map(p => (
          <div className="spy-agent" key={p.name}>
            <span className="spy-av" title={p.name}>{initials(p.name)}</span>
            <div className="spy-bar"><span style={{ width: `${(100 * p.done) / p.total}%` }} /></div>
            <span className="spy-lvl">{`L${levelOf(p.done, p.total)}`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
