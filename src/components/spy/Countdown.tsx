import { useEffect, useState } from 'react';
import { WEEKDAY_DAY_MONTH } from '../../lib/dates';
import './spy.css';

// Sri Lanka has no daylight saving, so a local time is always 330 minutes ahead of UTC.
const COLOMBO_MS = 330 * 60_000;
const pad = (n: number) => String(n).padStart(2, '0');

/** 'T-20d 01:02:05' to a Sri Lanka time ('YYYY-MM-DDTHH:mm'), 'Wheels down' once it has passed, null if the time cannot be read. */
export function countdownText(at: string, now: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(at);
  if (!m) return null;
  const s = Math.floor((Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - COLOMBO_MS - now) / 1000);
  if (s <= 0) return 'Wheels down';
  return `T-${Math.floor(s / 86400)}d ${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** `now` is for tests; without it the clock ticks every second. */
export default function Countdown({ at, label, now }: { at: string; label: string; now?: number }) {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (now !== undefined) return;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [now]);
  const text = countdownText(at, now ?? tick);
  if (text === null) return null;
  return (
    <div className="spy-cd">
      <div className="spy-cd-row"><span className="spy-code">{label}</span><span className="spy-code">{WEEKDAY_DAY_MONTH.format(new Date(`${at.slice(0, 10)}T00:00:00Z`))}</span></div>
      <div className="spy-cd-num" role="timer">{text}</div>
    </div>
  );
}
