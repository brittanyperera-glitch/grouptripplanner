import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Area, Item } from '../types';

const AREA_COLOR: Record<Area, string> = {
  'Colombo': '#5E6D82', 'North': '#9A4F2E', 'East coast': '#2B6E8F', 'Cultural Triangle': '#8E6522', 'Kandy and Knuckles': '#7A5C8A', 'Kitulgala': '#2F7A6B',
  'Hill country': '#3E7D4A', 'Ella': '#3F7396', 'Wild south': '#8A6A1F', 'South coast': '#1F7F97',
};

/** Photographer only: the trailing licence note ("CC BY-SA 4.0", "CC0", "FAL") is dropped. */
export const creditName = (credit: string) => credit.replace(/,\s*(CC[\w .-]*|FAL|public domain|private-use only.*)\s*$/i, '').trim();

export function CreditButton({ credit }: { credit: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  // Own pointerdown stops here so a tap on the i never starts a card drag or reaches the close listener.
  return (
    <span className="credit-wrap" onPointerDown={e => { e.nativeEvent.stopImmediatePropagation(); e.stopPropagation(); }}>
      <button type="button" className="credit-i" aria-label="Photo credit" aria-expanded={open} onClick={() => setOpen(o => !o)}>i</button>
      {open && <span className="credit-pop" role="status">Photo: {creditName(credit)}</span>}
    </span>
  );
}

// Photo from public/img, or a solid block in the area's colour when there is none or it fails to load.
export function Cover({ item, className, named = true, credit = false, children }: { item: Item; className: string; named?: boolean; credit?: boolean; children?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (!item.photo || failed) {
    return (
      <div className={`cover ${className} nophoto`} style={{ background: `linear-gradient(160deg, ${AREA_COLOR[item.area]}, #0B0D10 140%)` }}>
        {named && <span>{item.name}</span>}
        <small className="nopic">No picture yet</small>
        {children}
      </div>
    );
  }
  return (
    <div className={`cover ${className}`}>
      <img src={`/img/${item.photo}.jpg`} alt="" decoding="async" onError={() => setFailed(true)} />
      {children}
      {credit && item.credit && <CreditButton credit={item.credit} />}
    </div>
  );
}
