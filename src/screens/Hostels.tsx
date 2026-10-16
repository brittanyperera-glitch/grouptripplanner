import { useState } from 'react';
import { AREAS, AREA_HUB } from '../types';
import data from '../content/hostels.json';
import './Hostels.css';

type Hostel = {
  id: string; name: string; hub: string; area: string; mapsUrl: string;
  rating: { source: string; score: number; reviews: number; checked: string };
  about: string; groupFit: string; bunkGbp: number | null; roomGbp: number | null; roomFor: number | null;
  priceDate: string | null; priceChecked: string; priceNote?: string; bookUrl: string;
  photo: { file: string }; tag?: 'Social' | 'Quiet'; note?: string;
};
type Group = { hub: string; label: string; vibe: string; note?: string };
const { groups, hostels } = data as unknown as { groups: Group[]; hostels: Hostel[] };

// Route order from the planner's own area list; Wild south holds two hubs (Tissa, then Udawalawe).
const ORDER: string[] = ['AIR', ...AREAS.flatMap(a => (AREA_HUB[a] === 'Udawalawe' ? ['Tissa', 'Udawalawe'] : [AREA_HUB[a]])), 'Off route'];
const GROUPS = [...groups].sort((a, b) => ORDER.indexOf(a.hub) - ORDER.indexOf(b.hub));

const gbp = (n: number) => `£${n.toFixed(2).replace(/\.00$/, '')}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

function Card({ h }: { h: Hostel }) {
  const priced = h.bunkGbp !== null || h.roomGbp !== null;
  return (
    <article className="hs-card" aria-label={h.name}>
      <img className="hs-photo" src={`/img/hostels/${h.photo.file}`} alt={h.name} loading="lazy" decoding="async" />
      <div className="hs-body">
        <h4 className="hs-name">{h.name}</h4>
        <p className="hs-area">{h.area}{h.tag && <span className="hs-tag">{h.tag}</span>}</p>
        <p className="hs-rating"><b>{h.rating.score.toFixed(1)} on {h.rating.source}, {h.rating.reviews} reviews</b> <small>checked {day(h.rating.checked)}</small></p>
        <p className="hs-about">{h.about}</p>
        <p className="hs-fit">{h.groupFit}</p>
        <div className="hs-prices">
          <p className="hs-price">{h.bunkGbp !== null ? `Bunk from ${gbp(h.bunkGbp)}` : 'Bunk: no price'}</p>
          <p className="hs-price">{h.roomGbp !== null ? `Room from ${gbp(h.roomGbp)} (sleeps ${h.roomFor})` : 'Room: no price'}</p>
        </div>
        <p className="hs-small">{priced && h.priceDate ? `${day(h.priceDate)} price, checked ${day(h.priceChecked)}` : ''}{h.priceNote ? `${priced ? '. ' : ''}${h.priceNote}` : ''}</p>
        {h.note && <p className="hs-small">{h.note}</p>}
        <div className="hs-links">
          <a href={h.mapsUrl} target="_blank" rel="noopener noreferrer">Map</a>
          <a href={h.bookUrl} target="_blank" rel="noopener noreferrer">See and book</a>
        </div>
      </div>
    </article>
  );
}

export default function Hostels() {
  const firstWithHostels = GROUPS.find(g => hostels.some(h => h.hub === g.hub))?.hub;
  const [open, setOpen] = useState<Set<string>>(() => new Set(firstWithHostels ? [firstWithHostels] : []));
  const toggle = (hub: string) => setOpen(s => { const n = new Set(s); if (!n.delete(hub)) n.add(hub); return n; });
  return (
    <div className="hs-list">
      {GROUPS.map(g => {
        const list = hostels.filter(h => h.hub === g.hub);
        if (!list.length) return <p className="hs-none" key={g.hub}>{g.label}: {g.note}</p>;
        const lows = list.map(h => h.bunkGbp).filter((n): n is number => n !== null);
        const head = `${g.label}, ${list.length} ${list.length === 1 ? 'hostel' : 'hostels'}${lows.length ? `, from ${gbp(Math.min(...lows))}` : ''}`;
        const isOpen = open.has(g.hub);
        return (
          <section className="hs-group" key={g.hub}>
            <h3 className="hs-head">
              <button type="button" aria-expanded={isOpen} aria-controls={`hs-${g.hub}`} onClick={() => toggle(g.hub)}>
                <span>{head}</span><span className="hs-chev" aria-hidden="true">{isOpen ? '-' : '+'}</span>
              </button>
            </h3>
            {isOpen && (
              <div className="hs-panel" id={`hs-${g.hub}`}>
                <p className="hs-vibe">{g.vibe}</p>
                {g.note && <p className="hs-vibe">{g.note}</p>}
                {list.map(h => <Card h={h} key={h.id} />)}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
