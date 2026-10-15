import { useState } from 'react';
import type { FormEvent } from 'react';
import { verifyTripKey } from '../store/tripKey';
import './PasswordGate.css';

type Phase = 'idle' | 'checking' | 'wrong' | 'offline';

/** Stands in front of the app until the trip password is right. A wrong one keeps what was typed. */
export default function PasswordGate({ onAccept }: { onAccept(password: string): void }) {
  const [value, setValue] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const pw = value.trim();
    if (!pw || phase === 'checking') return;
    setPhase('checking');
    try {
      if (await verifyTripKey(pw)) onAccept(pw); else setPhase('wrong');
    } catch {
      setPhase('offline');
    }
  };

  return (
    <main className="gate">
      <form className="gate-card" onSubmit={submit}>
        <h1>The Homecoming</h1>
        <label htmlFor="trip-password">Trip password</label>
        <input
          id="trip-password" type="password" autoComplete="current-password" autoFocus
          value={value} onChange={e => { setValue(e.target.value); if (phase !== 'checking') setPhase('idle'); }}
          aria-invalid={phase === 'wrong'} aria-describedby="trip-password-msg"
        />
        <p id="trip-password-msg" className="gate-msg" role="alert">
          {phase === 'wrong' && "That's not it"}
          {phase === 'offline' && "Couldn't reach the server. Try again"}
        </p>
        <button type="submit" className="gate-go" disabled={!value.trim() || phase === 'checking'}>Let me in</button>
      </form>
    </main>
  );
}
