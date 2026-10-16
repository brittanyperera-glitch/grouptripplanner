import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { hostelOf, hostelPrice, hostelsFor, parseUrl, ROOM_LABEL, STAY_COPY, TYPE_LABEL } from '../lib/stayflow';
import { useApp } from '../state';
import type { Area, PlaceDraft, PlaceSuggestion, RoomType, StayType } from '../types';
import './Stays.css';

const C = STAY_COPY.sheet;
const MAX_TITLE = 80, MAX_WHY = 140;

interface Props { area: Area; areas: Area[]; editing?: PlaceSuggestion; onClose(): void }

/** Bottom sheet to add a stay, or to change one before lock-in (a change is a new card plus a withdrawn old one: nothing is deleted). */
export default function StayAddSheet({ area, areas, editing, onClose }: Props) {
  const { me, store } = useApp();
  const [where, setWhere] = useState<Area>(editing?.area ?? area);
  const [hostelId, setHostelId] = useState(editing?.hostelId ?? '');
  const [link, setLink] = useState(editing?.link ?? '');
  const [name, setName] = useState(editing?.title ?? '');
  const [price, setPrice] = useState(editing?.priceGbp === undefined ? '' : String(editing.priceGbp));
  const [rooms, setRooms] = useState<RoomType | undefined>(editing?.rooms);
  const [type, setType] = useState<StayType | undefined>(editing?.stayType);
  const [why, setWhy] = useState(editing?.why ?? '');
  const [photo, setPhoto] = useState(editing?.photo ?? '');
  const dialog = useRef<HTMLDivElement>(null);
  const closeNow = useRef(onClose);
  closeNow.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeNow.current(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus(); };
  }, []);

  const hostels = hostelsFor(where);
  const chosen = hostelOf(hostelId);
  const linkOk = parseUrl(link), photoOk = parseUrl(photo);
  const n = Number(price.trim().replace(/^£/, ''));
  const priceOk = price.trim() !== '' && Number.isFinite(n) && n > 0 && n < 10000;
  // Six guide hostels have no price, so choosing one waives the price; a typed price still has to make sense.
  const priceFine = priceOk || (chosen !== undefined && price.trim() === '');
  const ready = !!me && name.trim() !== '' && priceFine && linkOk.ok && photoOk.ok && areas.includes(where);

  const pickHostel = (id: string) => {
    setHostelId(id);
    const h = hostelOf(id);
    if (!h) return;
    const p = hostelPrice(h);
    setName(h.name); setPrice(p === null ? '' : String(p)); setLink(h.bookUrl);
    setRooms(h.bunkGbp !== null ? 'dorm' : 'private'); setType('hostel');
  };

  const save = () => {
    if (!ready || !me) return;
    const url = linkOk.ok ? linkOk.url : undefined, img = photoOk.ok ? photoOk.url : undefined;
    const draft: PlaceDraft = {
      name: me, area: where, kind: 'stay', title: name.trim(),
      ...(url && { link: url }), ...(priceOk && { priceGbp: Math.round(n * 100) / 100 }), ...(type && { stayType: type }), ...(rooms && { rooms }),
      ...(why.trim() && { why: why.trim() }), ...(img && { photo: img }),
      // The guide link only holds while the name is still the guide's.
      ...(chosen && chosen.name === name.trim() && { hostelId: chosen.id }),
    };
    void store.addPlaceSuggestion(draft);
    if (editing) void store.setPlaceStatus(editing.id, 'withdrawn');
    onClose();
  };

  const chips = <T extends string>(label: string, labels: Record<T, string>, value: T | undefined, set: (v: T | undefined) => void) => (
    <div className="st-field" role="group" aria-label={label}>
      <span className="st-label">{label}</span>
      <div className="st-chips">
        {(Object.keys(labels) as T[]).map(k => (
          <button key={k} type="button" className="st-pill" aria-pressed={value === k} onClick={() => set(value === k ? undefined : k)}>{labels[k]}</button>
        ))}
      </div>
    </div>
  );

  return createPortal(
    <div className="st-sheet-wrap">
      <div className="st-backdrop" aria-hidden="true" onClick={onClose} />
      <div ref={dialog} className="st-sheet" role="dialog" aria-modal="true" aria-label={editing ? C.edit : C.title} tabIndex={-1}>
        <header className="st-sheet-head">
          <h2 className="st-sheet-title">{editing ? C.edit : C.title}</h2>
          <button type="button" className="st-x" onClick={onClose}>{C.close}</button>
        </header>
        <div className="st-form">
          <label className="st-field">
            <span className="st-label">{C.where}</span>
            <select className="st-select" value={where} onChange={e => { setWhere(e.target.value as Area); setHostelId(''); }}>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          {hostels.length > 0 && (
            <label className="st-field">
              <span className="st-label">{C.guide}</span>
              <select className="st-select" value={hostelId} onChange={e => pickHostel(e.target.value)}>
                <option value="">{C.guideNone}</option>
                {hostels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </label>
          )}
          <div className="st-field">
            <label className="st-field">
              <span className="st-label">{C.link}</span>
              <input className="field" inputMode="url" autoCapitalize="none" placeholder="https://" value={link} onChange={e => setLink(e.target.value)} />
            </label>
            {!linkOk.ok && <span className="st-err" role="alert">{C.badLink}</span>}
          </div>
          <label className="st-field">
            <span className="st-label">{C.name}</span>
            <input className="field" maxLength={MAX_TITLE} value={name} onChange={e => setName(e.target.value)} />
          </label>
          <div className="st-field">
            <label className="st-field">
              <span className="st-label">{C.price}</span>
              <input className="field" inputMode="decimal" placeholder="12" value={price} onChange={e => setPrice(e.target.value)} />
            </label>
            {!chosen && <span className="st-hint">{C.priceHint}</span>}
          </div>
          {chips(C.rooms, ROOM_LABEL, rooms, setRooms)}
          {chips(C.type, TYPE_LABEL, type, setType)}
          <label className="st-field">
            <span className="st-label">{C.why}</span>
            <input className="field" maxLength={MAX_WHY} value={why} onChange={e => setWhy(e.target.value)} />
          </label>
          <div className="st-field">
            <label className="st-field">
              <span className="st-label">{C.photo}</span>
              <input className="field" inputMode="url" autoCapitalize="none" placeholder="https://" value={photo} onChange={e => setPhoto(e.target.value)} />
            </label>
            {!photoOk.ok && <span className="st-err" role="alert">{C.badLink}</span>}
          </div>
        </div>
        <footer className="st-sheet-foot">
          <button type="button" className="cta" disabled={!ready} onClick={save}>{editing ? C.saveEdit : C.save}</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
