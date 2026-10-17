import { useState } from 'react';
import Sheet from '../components/Sheet';
import { hostelOf, hostelPrice, hostelsFor, KIND_LABEL, parseUrl, ROOM_LABEL, STAY_COPY, TYPE_LABEL } from '../lib/stayflow';
import { useApp } from '../state';
import type { Area, PlaceDraft, PlaceKind, PlaceSuggestion, RoomType, StayType } from '../types';
import './Stays.css';

const C = STAY_COPY.sheet;
const MAX_TITLE = 80, MAX_WHY = 140;

interface Props { area: Area; kind?: PlaceKind; areas: Area[]; editing?: PlaceSuggestion; onClose(): void }

/** Bottom sheet to add a stay, or to change one before lock-in (a change is a new card plus a withdrawn old one: nothing is deleted). */
export default function StayAddSheet({ area, kind: startKind = 'stay', areas, editing, onClose }: Props) {
  const { me, store } = useApp();
  const [kind, setKind] = useState<PlaceKind>(editing?.kind ?? startKind);
  const [where, setWhere] = useState<Area>(editing?.area ?? area);
  const [hostelId, setHostelId] = useState(editing?.hostelId ?? '');
  const [link, setLink] = useState(editing?.link ?? '');
  const [name, setName] = useState(editing?.title ?? '');
  const [price, setPrice] = useState(editing?.priceGbp === undefined ? '' : String(editing.priceGbp));
  const [rooms, setRooms] = useState<RoomType | undefined>(editing?.rooms);
  const [type, setType] = useState<StayType | undefined>(editing?.stayType);
  const [why, setWhy] = useState(editing?.why ?? '');
  const [photo, setPhoto] = useState(editing?.photo ?? '');
  const hostels = hostelsFor(where);
  const chosen = hostelOf(hostelId);
  const linkOk = parseUrl(link), photoOk = parseUrl(photo);
  const n = Number(price.trim().replace(/^£/, ''));
  const priceOk = price.trim() !== '' && Number.isFinite(n) && n > 0 && n < 10000;
  // Six guide hostels have no price, so choosing one waives the price; a typed price still has to make sense.
  const isStay = kind === 'stay';
  // An eat / do / gem idea needs only a name; the cost is a rough optional figure but must make sense if typed.
  const priceFine = isStay ? priceOk || (chosen !== undefined && price.trim() === '') : price.trim() === '' || priceOk;
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
      name: me, area: where, kind, title: name.trim(),
      ...(url && { link: url }), ...(priceOk && { priceGbp: Math.round(n * 100) / 100 }), ...(isStay && type && { stayType: type }), ...(isStay && rooms && { rooms }),
      ...(why.trim() && { why: why.trim() }), ...(img && { photo: img }),
      // The guide link only holds while the name is still the guide's.
      ...(isStay && chosen && chosen.name === name.trim() && { hostelId: chosen.id }),
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

  return (
    <Sheet title={editing ? C.edit : isStay ? C.title : C.titleIdea} closeLabel={C.close} onClose={onClose}
      footer={<button type="button" className="cta" disabled={!ready} onClick={save}>{editing ? C.saveEdit : isStay ? C.save : C.saveIdea}</button>}>
      {!editing && (
        <div className="st-field" role="group" aria-label={C.kind}>
          <span className="st-label">{C.kind}</span>
          <div className="st-chips">
            {(Object.keys(KIND_LABEL) as PlaceKind[]).map(k => (
              <button key={k} type="button" className="st-pill" aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
            ))}
          </div>
        </div>
      )}
      <label className="st-field">
        <span className="st-label">{C.where}</span>
        <select className="st-select" value={where} onChange={e => { setWhere(e.target.value as Area); setHostelId(''); }}>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </label>
      {isStay && hostels.length > 0 && (
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
          <span className="st-label">{isStay ? C.price : C.cost}</span>
          <input className="field" inputMode="decimal" placeholder="12" value={price} onChange={e => setPrice(e.target.value)} />
        </label>
        {isStay && !chosen && <span className="st-hint">{C.priceHint}</span>}
      </div>
      {isStay && chips(C.rooms, ROOM_LABEL, rooms, setRooms)}
      {isStay && chips(C.type, TYPE_LABEL, type, setType)}
      <label className="st-field">
        <span className="st-label">{isStay ? C.why : C.whyIdea}</span>
        <input className="field" maxLength={MAX_WHY} value={why} onChange={e => setWhy(e.target.value)} />
      </label>
      <div className="st-field">
        <label className="st-field">
          <span className="st-label">{C.photo}</span>
          <input className="field" inputMode="url" autoCapitalize="none" placeholder="https://" value={photo} onChange={e => setPhoto(e.target.value)} />
        </label>
        {!photoOk.ok && <span className="st-err" role="alert">{C.badLink}</span>}
      </div>
    </Sheet>
  );
}
