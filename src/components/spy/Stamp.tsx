import { useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { motion } from '../motion';
import { thud } from '../sound';
import './spy.css';

const BITS = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);

/** A stamp that thunks in and can throw a short burst. Motion other than 'full' shows it still; mute lives in sound.ts, which makes thud a no-op. */
export default function Stamp({ text, tone = 'accent', big = false, burst = false, sound = false }: {
  text: string; tone?: 'accent' | 'quiet'; big?: boolean; burst?: boolean; sound?: boolean;
}) {
  const full = useMemo(motion, []) === 'full';
  useEffect(() => { if (sound) thud(); }, [sound]);
  const cls = ['spy-stamp', tone === 'quiet' && 'spy-stamp-quiet', big && 'spy-stamp-big', full && 'spy-thunk'].filter(Boolean).join(' ');
  return (
    <span className={cls}>
      {text}
      {full && burst && BITS.map((a, i) => <i key={i} className="spy-burst" aria-hidden="true" style={{ '--dx': `${Math.round(Math.cos(a) * 34)}px`, '--dy': `${Math.round(Math.sin(a) * 34)}px` } as CSSProperties} />)}
    </span>
  );
}
