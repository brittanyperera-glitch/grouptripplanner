import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Area, Item } from '../types';

const AREA_COLOR: Record<Area, string> = {
  'Colombo': '#5E6D82', 'Cultural Triangle': '#8E6522', 'Kandy and Knuckles': '#7A5C8A', 'Kitulgala': '#2F7A6B',
  'Hill country': '#3E7D4A', 'Ella': '#3F7396', 'Wild south': '#8A6A1F', 'South coast': '#1F7F97',
};

// Photo from public/img, or a solid block in the area's colour when there is none or it fails to load.
export function Cover({ item, className, named = true, children }: { item: Item; className: string; named?: boolean; children?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (!item.photo || failed) {
    return (
      <div className={`${className} nophoto`} style={{ background: AREA_COLOR[item.area] }}>
        {named && <span>{item.name}</span>}
        {children}
      </div>
    );
  }
  return (
    <div className={className}>
      <img src={`/img/${item.photo}.jpg`} alt="" onError={() => setFailed(true)} />
      {children}
    </div>
  );
}

export function PhotoCard({ item, n, total }: { item: Item; n: number; total: number }) {
  return (
    <Cover item={item} className="photo">
      <span className="count">{n} of {total}</span>
      {item.credit && <span className="credit">Photo: {item.credit}</span>}
    </Cover>
  );
}
