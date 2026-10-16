import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import Avatar from '../components/Avatar';
import { motion } from '../components/motion';
import profile from '../content/profile.json';
import { friendStats } from '../lib/friendship';
import { useApp } from '../state';
import type { Copy } from '../state';
import { GUESTS, isGuest, PEOPLE } from '../types';
import type { Player } from '../types';
import { artSrc, cardColours, cardData, cardLayout, cardNo, FRIEND_LABELS, metaText, PALETTE, renderCardBlob, textSize, tierOf } from './profileCard';
import type { Box, CardData, CardFriends } from './profileCard';
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
  // The full-body art, then the initial: a missing file never leaves a hole in the card.
  const [failed, setFailed] = useState(false);
  return failed
    ? <span className="pf-c-initial" aria-hidden="true">{name.charAt(0)}</span>
    : <img src={artSrc(name)} alt={name} onError={() => setFailed(true)} />;
}

// Places a block on the 800 x 1056 card grid; the CSS multiplies by --p.
const at = (b: Box, size?: number) => ({ '--y': b.y, '--h': b.h, ...(size ? { '--fs': size } : {}) } as CSSProperties);

function Card({ d, tilt }: { d: CardData; tilt: boolean }) {
  const el = useRef<HTMLElement>(null);
  const c = cardColours(d.name);
  const L = cardLayout(d);
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
  const colours = { '--pf-a': c.a, '--pf-b': c.b, '--pf-plate': c.plate, '--pf-tint': c.tint, '--pf-meta': c.meta, '--pf-ray-y': L.rayY,
    '--pf-hi': c.fill.hi, '--pf-mid': c.fill.mid, '--pf-lo': c.fill.lo } as CSSProperties;
  return (
    <article ref={el} className="pf-card" aria-label={`${d.name} trip card`} style={colours}
      onPointerMove={aim} onPointerDown={aim} onPointerLeave={rest} onPointerUp={rest} onPointerCancel={rest}>
      <div className="pf-c-in">
        <div className="pf-c-face" />
        <div className="pf-c-plate" style={{ '--y': L.plateTop } as CSSProperties} />
        <div className="pf-c-art" style={at({ y: L.figTop, h: L.figBottom - L.figTop })}><Picture name={d.name} /></div>
        <span className="pf-c-no">{cardNo(d)}</span>
        <span className="pf-c-stars" role="img" aria-label={`${d.rarity}, ${d.stars} of 5 stars`}>
          {[1, 2, 3, 4, 5].map(i => <span key={i} className={i <= d.stars ? 'on' : undefined}>{'\u2605'}</span>)}
        </span>
        <span className="pf-c-stamp">{d.rarity}</span>
        <h2 className="pf-c-name" style={at(L.name, textSize(d.name, 120, 720))}>{d.name}</h2>
        {L.title && <div className="pf-c-title" style={at(L.title, textSize(d.title, 46, 720))}>{d.title}</div>}
        {L.stats && (
          <div className="pf-c-stats" style={at(L.stats)}>
            {d.stats.map(s => (
              <div key={s.label} className="pf-c-stat" data-tier={tierOf(s.value)}>
                <span className="pf-c-label">{s.label}</span>
                <span className="pf-c-bar" role="meter" aria-label={s.label} aria-valuemin={0} aria-valuemax={10}
                  aria-valuenow={Math.min(10, s.value)} aria-valuetext={String(s.value)}>
                  <span style={{ '--v': Math.min(10, s.value) / 10 } as CSSProperties} />
                </span>
                <span className={`pf-c-val${s.value > 10 ? ' over' : ''}`}>{s.value}</span>
              </div>
            ))}
          </div>
        )}
        {L.friends && d.friends && (
          <div className="pf-c-friends" style={at(L.friends)}>
            {(['twin', 'clash'] as const).map(k => {
              const f = d.friends![k];
              return f && (
                <div key={k} className="pf-c-friend" data-kind={k}>
                  <i style={{ '--pf-fc': PALETTE[f.name][1] } as CSSProperties}><Avatar name={f.name} size={48} /></i>
                  <small>{FRIEND_LABELS[k]}</small><b>{f.name}</b><em>{f.pct}%</em>
                </div>
              );
            })}
          </div>
        )}
        {L.fact && d.fact && <div className="pf-c-fact" style={at(L.fact)}><span>{profile.funFact}</span><b>{d.fact}</b></div>}
        <div className="pf-c-meta" style={at(L.meta)}>{metaText(d).map((t, i) => <span key={i}>{t}</span>)}</div>
        <div className="pf-c-foil" aria-hidden="true" />
      </div>
    </article>
  );
}

type ProfileProps = { name: Player; players?: Players; onBack: () => void; onQuiz?: () => void; onBingo?: () => void };

/** The Profile screen inside the app: reads the group's friendship stats for the card. */
export default function Profile(props: ProfileProps) {
  const { state } = useApp();
  const { name } = props;
  // Same gate as the Group stats page (Friends.tsx): a trip member, once all five have submitted.
  const friends = useMemo<CardFriends | null>(() => {
    if (isGuest(name) || !PEOPLE.every(p => state.responses[p]?.submitted)) return null;
    const { twin, clash } = friendStats(state.responses, name);
    return twin || clash ? { twin, clash } : null;
  }, [name, state.responses]);
  return <ProfileView {...props} friends={friends} quizDone={!!state.stays?.crew[name]?.quizDone} />;
}

export function ProfileView({ name, players = {}, onBack, friends, onQuiz, onBingo, quizDone = false }: ProfileProps & { friends?: CardFriends | null; quizDone?: boolean }) {
  const [mode] = useState(motion);
  // Each tap remounts the figure, which restarts its one jump; nothing animates until the first tap.
  const [jumps, setJumps] = useState(0);
  const [view, setViewState] = useState<View>(readView);
  const setView = (v: View) => {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage unavailable: the choice lasts this visit */ }
  };
  // A guest is numbered within the guest roster, so Aunty is card 2 of 3 rather than card 1 of the trip's five.
  const roster: readonly Player[] = isGuest(name) ? GUESTS : PEOPLE;
  const d = useMemo(() => cardData(name, Math.max(roster.indexOf(name), 0) + 1, roster.length, players[name], friends), [name, players, roster, friends]);
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
      {onQuiz && view === 'card' && (
        <div className="pf-quiz">
          <span>Travel profile</span>
          <button className="link pf-quiz-go" onClick={onQuiz}>{quizDone ? 'Retake' : 'Do it, 3 minutes'}</button>
        </div>
      )}
      {onBingo && view === 'card' && (
        <div className="pf-bingo">
          <span>Trip predictions</span>
          <button className="link pf-quiz-go" onClick={onBingo}>Travel Bingo</button>
        </div>
      )}
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
