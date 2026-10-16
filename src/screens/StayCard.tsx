import { useState } from 'react';
import type { ReactNode } from 'react';
import Avatar from '../components/Avatar';
import { gbp, photoOf, ROOM_LABEL, STAY_COPY, TYPE_LABEL } from '../lib/stayflow';
import type { PlaceSuggestion, Player } from '../types';

const AREA_TINT = ['#5E6D82', '#9A4F2E', '#2B6E8F', '#8E6522', '#7A5C8A', '#2F7A6B', '#3E7D4A', '#3F7396', '#8A6A1F', '#1F7F97'];
const tintOf = (s: PlaceSuggestion) => AREA_TINT[[...s.area].reduce((n, c) => n + c.charCodeAt(0), 0) % AREA_TINT.length];

/** The stay's photo link, or the guide hostel's picture, or a plain block in the destination's colour. */
export function StayPhoto({ s, className = '' }: { s: PlaceSuggestion; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = photoOf(s);
  if (!src || failed) return <div className={`cover ${className} st-nophoto`} style={{ background: `linear-gradient(160deg, ${tintOf(s)}, #0B0D10 140%)` }} aria-hidden="true" />;
  return (
    <div className={`cover ${className}`}>
      <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    </div>
  );
}

/** Who suggested it: the avatar is the intended signal, the name is only its label. */
export function Suggester({ name, size = 26 }: { name: Player; size?: number }) {
  return <span className="st-by" role="img" aria-label={`Suggested by ${name}`} title={name}><Avatar name={name} size={size} /></span>;
}

export const priceText = (s: PlaceSuggestion) => (s.priceGbp === undefined ? null : `${gbp(s.priceGbp)} ${STAY_COPY.board.night}`);

export function Facts({ s }: { s: PlaceSuggestion }) {
  const price = priceText(s);
  return (
    <>
      {price && <p className="st-price">{price}</p>}
      {(s.stayType || s.rooms) && (
        <div className="st-chips">
          {s.stayType && <span className="st-chip">{TYPE_LABEL[s.stayType]}</span>}
          {s.rooms && <span className="st-chip">{ROOM_LABEL[s.rooms]}</span>}
        </div>
      )}
    </>
  );
}

export function Warns({ lines }: { lines: string[] }) {
  return <>{lines.map(l => <p key={l} className="st-warn" data-st-warn="">{l}</p>)}</>;
}

/** Photo above, facts below: the card on the board and the ranking grid. No controls inside, so a button can wrap it. */
export function StayFace({ s, lines, corner, children }: { s: PlaceSuggestion; lines: string[]; corner?: ReactNode; children?: ReactNode }) {
  return (
    <div className="st-face">
      <div className="st-photo-wrap">
        <StayPhoto s={s} className="st-photo" />
        {corner}
      </div>
      <div className="st-body">
        <div className="st-top">
          <h3 className="st-name">{s.title}</h3>
          <Suggester name={s.name} />
        </div>
        <Facts s={s} />
        {s.why && <p className="st-why">{s.why}</p>}
        <Warns lines={lines} />
        {children}
      </div>
    </div>
  );
}
