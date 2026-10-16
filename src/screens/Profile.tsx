import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import Avatar from '../components/Avatar';
import { motion } from '../components/motion';
import profile from '../content/profile.json';
import type { Copy } from '../state';
import { PEOPLE } from '../types';
import type { Player } from '../types';
import { artSrc, cardData, cardNo, kitText, PALETTE, renderCardBlob, selfieSrc, tierOf } from './profileCard';
import type { CardData } from './profileCard';
import './Profile.css';

type Players = NonNullable<Copy['players']>;
type Done = 'saved' | 'copied' | 'sent' | 'failed';
type View = 'card' | 'character';

const CONFIRM_MS = 2200;
export const VIEW_KEY = 'tp:profile-view';
const TILT_DEG = 9;

const readView = (): View => {
  try { return localStorage.getItem(VIEW_KEY) === 'character' ? 'character' : 'card'; } catch { return 'card'; }
};

/** True when this browser can put an image on the clipboard. The Copy button is hidden otherwise. */
export const canCopyImage = () => typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function';

/** True when this browser can share a PNG file (phones). The Send button is hidden otherwise. */
export function canShareImage() {
  try {
    return typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
      && navigator.canShare({ files: [new File([], 'card.png', { type: 'image/png' })] });
  } catch { return false; }
}

const fileName = (name: Player) => `the-homecoming-${name.toLowerCase()}.png`;

function Picture({ name }: { name: Player }) {
  // Selfie first, then the character art, then the initial: a missing file never leaves a hole in the card.
  const [stage, setStage] = useState<'selfie' | 'art' | 'none'>('selfie');
  if (stage === 'none') return <span className="pf-c-initial" aria-hidden="true">{name.charAt(0)}</span>;
  return stage === 'selfie'
    ? <img src={selfieSrc(name)} alt={`${name} selfie`} onError={() => setStage('art')} />
    : <img className="art" src={artSrc(name)} alt={name} onError={() => setStage('none')} />;
}

function Card({ d, tilt }: { d: CardData; tilt: boolean }) {
  const rowH = Math.min(74, 222 / Math.max(d.stats.length, 1));
  const el = useRef<HTMLElement>(null);
  const [a, b] = PALETTE[d.name];
  // A small 3D tilt that follows the pointer or finger and settles back on leave. Set on the element, not in state, so a drag does not re-render.
  const aim = (e: PointerEvent) => {
    const box = el.current;
    if (!tilt || !box) return;
    const r = box.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    box.style.setProperty('--pf-ry', `${(x * 2 * TILT_DEG).toFixed(2)}deg`);
    box.style.setProperty('--pf-rx', `${(-y * 2 * TILT_DEG).toFixed(2)}deg`);
    box.style.setProperty('--pf-fx', `${((1 - (x + 0.5)) * 100).toFixed(1)}%`);
    box.dataset.tilting = '';
  };
  const rest = () => {
    const box = el.current;
    if (!box) return;
    box.style.removeProperty('--pf-ry'); box.style.removeProperty('--pf-rx'); box.style.removeProperty('--pf-fx');
    delete box.dataset.tilting;
  };
  return (
    <article ref={el} className="pf-card" aria-label={`${d.name} trip card`} style={{ '--pf-a': a, '--pf-b': b } as CSSProperties}
      onPointerMove={aim} onPointerDown={aim} onPointerLeave={rest} onPointerUp={rest} onPointerCancel={rest}>
      <div className="pf-c-in">
        <div className="pf-c-face" />
        <span className="pf-c-no">{cardNo(d)}</span>
        <span className="pf-c-stars" role="img" aria-label={`${d.rarity}, ${d.stars} of 5 stars`}>
          {[1, 2, 3, 4, 5].map(i => <span key={i} className={i <= d.stars ? 'on' : undefined}>{'★'}</span>)}
        </span>
        <div className="pf-c-pic">
          <div className="pf-c-win" />
          <div className="pf-c-pop"><Picture name={d.name} /></div>
        </div>
        <span className="pf-c-stamp">{d.rarity}</span>
        <h2 className="pf-c-name">{d.name}</h2>
        {d.title && <div className="pf-c-title">{d.title}</div>}
        {d.stats.length > 0 && (
          <div className="pf-c-stats" style={{ '--rh': rowH } as CSSProperties}>
            {d.stats.map(s => (
              <div key={s.label} className="pf-c-stat" data-tier={tierOf(s.value)}>
                <span className={`pf-c-val${s.value > 10 ? ' over' : ''}`}>{s.value}</span>
                <span className="pf-c-label">{s.label}</span>
                <span className="pf-c-bar" role="meter" aria-label={s.label} aria-valuemin={0} aria-valuemax={10}
                  aria-valuenow={Math.min(10, s.value)} aria-valuetext={String(s.value)}>
                  <span style={{ '--v': Math.min(10, s.value) / 10 } as CSSProperties} />
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="pf-c-fact">{d.fact && <><span>{profile.funFact}</span><b>{d.fact}</b></>}</div>
        <div className="pf-c-meta"><span>{profile.height} {d.heightCm} cm</span><i aria-hidden="true">|</i><span>{profile.kit} {kitText(d)}</span></div>
        <div className="pf-c-foil" aria-hidden="true" />
      </div>
    </article>
  );
}

export default function Profile({ name, players = {}, onBack }: { name: Player; players?: Players; onBack: () => void }) {
  const [mode] = useState(motion);
  // Each tap remounts the figure, which restarts its one jump; nothing animates until the first tap.
  const [jumps, setJumps] = useState(0);
  const [view, setViewState] = useState<View>(readView);
  const setView = (v: View) => {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage unavailable: the choice lasts this visit */ }
  };
  const d = useMemo(() => cardData(name, Math.max((PEOPLE as Player[]).indexOf(name), 0) + 1, PEOPLE.length, players[name]), [name, players]);
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copyOk = useMemo(canCopyImage, []);
  const sendOk = useMemo(canShareImage, []);

  const run = async (ok: Done, job: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    let result: Done | null = ok;
    try { await job(); } catch (e) { result = (e as Error)?.name === 'AbortError' ? null : 'failed'; }
    setBusy(false);
    setDone(result);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(null), CONFIRM_MS);
  };

  const save = () => run('saved', async () => {
    const blob = await renderCardBlob(d);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName(name);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  // The ClipboardItem takes the promise itself so Safari still counts the tap as the gesture while the PNG renders.
  const copy = () => run('copied', () => navigator.clipboard.write([new ClipboardItem({ 'image/png': renderCardBlob(d) })]));
  const send = () => run('sent', async () => {
    const blob = await renderCardBlob(d);
    await navigator.share({ files: [new File([blob], fileName(name), { type: 'image/png' })], title: `${name}, trip card` });
  });

  const label = (key: 'saved' | 'copied' | 'sent', idle: string) => (done === key ? profile[key] : idle);
  return (
    <div className="body pf-screen" data-view={view}>
      <div className="pf-top">
        <button className="link pf-back" onClick={onBack}>{profile.back}</button>
        <div className="pf-switch" role="group" aria-label={profile.switchLabel}>
          <button aria-pressed={view === 'card'} onClick={() => setView('card')}>{profile.viewCard}</button>
          <button aria-pressed={view === 'character'} onClick={() => setView('character')}>{profile.viewCharacter}</button>
        </div>
      </div>
      {view === 'card' ? (
        <>
          <Card d={d} tilt={mode === 'full'} />
          <div className="pf-actions" aria-live="polite">
            <button className="cta" onClick={save}>{label('saved', profile.save)}</button>
            {copyOk && <button className="cta alt" onClick={copy}>{label('copied', profile.copy)}</button>}
            {sendOk && <button className="cta alt" onClick={send}>{label('sent', profile.send)}</button>}
          </div>
          {done === 'failed' && <div className="pf-fail" role="alert">{profile.failed}</div>}
        </>
      ) : (
        <section className="pf-char" aria-label={`${name}, full size`} style={{ '--pf-a': PALETTE[name][0], '--pf-b': PALETTE[name][1] } as CSSProperties}>
          <button className="pf-stage" aria-label={`Make ${name} jump`} onClick={() => { if (mode === 'full') setJumps(n => n + 1); }}>
            <span key={jumps} className="pf-jumper" data-jump={jumps > 0 ? '' : undefined}>
              <Avatar name={name} crop="stage" size={600} />
            </span>
          </button>
          <h2 className="pf-char-name">{name}</h2>
          {d.title && <div className="pf-char-title">{d.title}</div>}
        </section>
      )}
    </div>
  );
}
