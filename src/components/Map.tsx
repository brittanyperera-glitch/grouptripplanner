import { useId } from 'react';
import type { Hub } from '../types';

const COAST: [number, number][] = [[9.83, 80.25], [9.66, 80.02], [9.38, 80.12], [9.0, 79.92], [8.6, 79.92], [8.23, 79.75], [8.03, 79.83], [7.58, 79.79], [7.2, 79.83], [6.93, 79.85], [6.58, 79.96], [6.42, 80.0], [6.2, 80.07], [6.03, 80.22], [5.94, 80.46], [5.92, 80.59], [6.02, 80.8], [6.12, 81.12], [6.22, 81.33], [6.4, 81.6], [6.84, 81.84], [7.2, 81.85], [7.72, 81.7], [8.15, 81.43], [8.57, 81.23], [8.95, 81.0], [9.27, 80.82], [9.6, 80.55], [9.83, 80.25]];

const HUB: Record<Hub, { lat: number; lon: number; name: string; side: 'l' | 'r' | 't' }> = {
  AIR: { lat: 7.18, lon: 79.88, name: 'Airport', side: 'l' },
  Jaffna: { lat: 9.66, lon: 80.01, name: 'Jaffna', side: 'r' },
  Trincomalee: { lat: 8.57, lon: 81.23, name: 'Trincomalee', side: 'r' },
  Colombo: { lat: 6.93, lon: 79.85, name: 'Colombo', side: 'l' },
  Sigiriya: { lat: 7.957, lon: 80.76, name: 'Sigiriya', side: 'r' },
  Kandy: { lat: 7.29, lon: 80.63, name: 'Kandy', side: 'r' },
  Kitulgala: { lat: 6.99, lon: 80.42, name: 'Kitulgala', side: 'l' },
  'Nuwara Eliya': { lat: 6.95, lon: 80.78, name: 'Nuwara Eliya', side: 't' },
  Ella: { lat: 6.87, lon: 81.05, name: 'Ella', side: 'r' },
  Tissa: { lat: 6.28, lon: 81.29, name: 'Tissa', side: 'r' },
  Udawalawe: { lat: 6.47, lon: 80.89, name: 'Udawalawe', side: 'r' },
  Weligama: { lat: 5.97, lon: 80.43, name: 'Weligama', side: 'l' },
};

const px = (lat: number, lon: number): [number, number] => [(lon - 79.55) * 118, (9.95 - lat) * 118];
const pts = (list: [number, number][]) => list.map(([a, o]) => px(a, o).map(n => n.toFixed(1)).join(',')).join(' ');

// Schematic island with the route drawn over it. `route` starts and ends at AIR.
export default function RouteMap({ route }: { route: Hub[] }) {
  const uid = useId().replace(/[^A-Za-z0-9]/g, '');
  const line = pts(route.map(h => [HUB[h].lat, HUB[h].lon]));
  const stops = [...new Set(route)];
  return (
    <div className="map scene">
      <svg viewBox="-60 10 340 470" role="img" aria-label={`Route: ${route.map(h => HUB[h].name).join(', ')}`}>
        <defs>
          <linearGradient id={`route${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFC15E" /><stop offset=".55" stopColor="#FF7A1A" /><stop offset="1" stopColor="#FF4D6D" />
          </linearGradient>
          <filter id={`glow${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        <polygon points={pts(COAST)} fill="#1A2620" stroke="#2F4A3E" strokeWidth="1.5" />
        <polyline points={line} fill="none" stroke="#FF7A1A" strokeOpacity=".55" strokeWidth="9" strokeLinejoin="round" strokeLinecap="round" filter={`url(#glow${uid})`} />
        <polyline points={line} fill="none" stroke={`url(#route${uid})`} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
        {stops.map(h => {
          const [x, y] = px(HUB[h].lat, HUB[h].lon);
          const { side, name } = HUB[h];
          const tx = side === 'l' ? x - 10 : side === 'r' ? x + 10 : x;
          const ty = side === 't' ? y - 11 : y + 4;
          return (
            <g key={h}>
              <circle cx={x} cy={y} r="10" fill="#FFC15E" opacity=".35" filter={`url(#glow${uid})`} />
              <circle cx={x} cy={y} r="4.5" fill="#FFF4E6" stroke="#FF7A1A" strokeWidth="2" />
              <text x={tx} y={ty} textAnchor={side === 'l' ? 'end' : side === 'r' ? 'start' : 'middle'} fontSize="11.5" fontWeight="800"
                fontFamily="Archivo, sans-serif" fill="#F6F2EC" stroke="#0B1620" strokeWidth="3" paintOrder="stroke">{name}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
