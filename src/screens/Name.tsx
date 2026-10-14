import { PEOPLE } from '../types';
import type { Person } from '../types';

export default function Name({ welcome, onPick }: { welcome: string; onPick: (p: Person) => void }) {
  return (
    <div className="body">
      <div className="big">Who's this?</div>
      {welcome && <div className="lede">{welcome}</div>}
      <div className="sub">One link for all five of us. Tap your name, no account or password.</div>
      <div className="names">
        {PEOPLE.map(n => (
          <button key={n} className="name" aria-pressed="false" onClick={() => onPick(n)}>{n}</button>
        ))}
      </div>
    </div>
  );
}
