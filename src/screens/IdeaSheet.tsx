import { useState } from 'react';
import Sheet from '../components/Sheet';
import { useApp } from '../state';
import type { Area } from '../types';
import './IdeaSheet.css';

const TITLE_MAX = 80, NOTE_MAX = 300;

// DEFERRAL: a day column on suggestions. Her D12 (24 Nov) says no database change, so the day rides in the note as "Day N: ".
const TAG = /^Day ([1-9]\d*):(?: ([\s\S]*))?$/;
export const dayNote = (day: number, note: string) => `Day ${day}: ${note}`;
/** The day and the note as the friend typed it. "Day trip to Ella" and an old note with no tag have no day. */
export function parseIdea(note: string): { day: number | null; text: string } {
  const m = TAG.exec(note);
  return m ? { day: Number(m[1]), text: m[2] ?? '' } : { day: null, text: note };
}

/** A released friend's idea for one day of the route; Brittany decides it in the Organiser. */
export default function IdeaSheet({ day, area, onClose }: { day: number; area: Area; onClose(): void }) {
  const { me, store } = useApp();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [phase, setPhase] = useState<'idle' | 'saving' | 'failed'>('idle');
  const ready = !!me && title.trim() !== '' && phase !== 'saving';
  const save = async () => {
    if (!me || !ready) return;
    setPhase('saving');
    try {
      await store.addSuggestion({ name: me, title: title.trim(), area, note: dayNote(day, note.trim()) });
      onClose();
    } catch { setPhase('failed'); }
  };
  return (
    <Sheet
      title={`An idea for day ${day}`} closeLabel="Close" onClose={onClose} onSubmit={save}
      footer={<button type="button" className="cta" disabled={!ready} onClick={save}>Save idea</button>}
    >
      <p className="is-lead">{area}. Brittany decides whether it joins the route.</p>
      <label className="is-field"><span>Title</span><input className="field" autoFocus maxLength={TITLE_MAX} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label className="is-field"><span>Note (optional)</span><textarea className="field" rows={2} maxLength={NOTE_MAX - dayNote(day, '').length} value={note} onChange={e => setNote(e.target.value)} /></label>
      {phase === 'failed' && <p className="is-lead" role="alert">Couldn't save. Try again.</p>}
    </Sheet>
  );
}
