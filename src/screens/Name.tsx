import { PEOPLE } from '../types';
import type { Person } from '../types';

export default function Name({ welcome, welcomeSub, onPick }: { welcome: string; welcomeSub?: string; onPick: (p: Person) => void }) {
  return (
    <div className="body">
      {welcome && <h1 className="big">{welcome}</h1>}
      {welcome && welcomeSub && <div className="sub">{welcomeSub}</div>}
      <div className={welcome ? 'ask' : 'big'}>Who's this?</div>
      <div className="sub">One link for all five of us. Tap your name, no account or password.</div>
      <div className="names">
        {PEOPLE.map(n => (
          <button key={n} className="name" aria-pressed="false" onClick={() => onPick(n)}>{n}</button>
        ))}
      </div>
    </div>
  );
}
