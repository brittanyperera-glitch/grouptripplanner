import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import './Map.css';
import { motion } from './motion';
import { buildLegs, legD, tukHeight, tukTransform, useLegDrive, type Leg } from './routeDrive';
import TukTuk from './TukTuk';
import type { Hub } from '../types';

export const COAST: [number, number][] = [[9.83, 80.25], [9.66, 80.02], [9.38, 80.12], [9.0, 79.92], [8.6, 79.92], [8.23, 79.75], [8.03, 79.83], [7.58, 79.79], [7.2, 79.83], [6.93, 79.85], [6.58, 79.96], [6.42, 80.0], [6.2, 80.07], [6.03, 80.22], [5.94, 80.46], [5.92, 80.59], [6.02, 80.8], [6.12, 81.12], [6.22, 81.33], [6.4, 81.6], [6.84, 81.84], [7.2, 81.85], [7.72, 81.7], [8.15, 81.43], [8.57, 81.23], [8.95, 81.0], [9.27, 80.82], [9.6, 80.55], [9.83, 80.25]];

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

/** Lat/lon to map space, shared by RouteMap and the route reveal's illustrated island. */
export const px = (lat: number, lon: number): [number, number] => [(lon - 79.55) * 118, (9.95 - lat) * 118];
/** Map-space position of a hub, for drawing on top of RouteMap. */
export const hubXY = (h: Hub) => px(HUB[h].lat, HUB[h].lon);
export const hubName = (h: Hub) => HUB[h].name;
/** Where RouteMap prints a hub's name, so a caller can print a second line under it. */
export function hubLabel(h: Hub) {
  const [x, y] = hubXY(h);
  const { side } = HUB[h];
  return { side, x: side === 'l' ? x - 10 : side === 'r' ? x + 10 : x, y: side === 't' ? y - 11 : y + 4, anchor: side === 'l' ? 'end' : side === 'r' ? 'start' : 'middle' } as const;
}
const pts = (list: [number, number][]) => list.map(([a, o]) => px(a, o).map(n => n.toFixed(1)).join(',')).join(' ');

const TUK_W = 30, TUK_H = tukHeight(TUK_W);
const TAG_CH = 6.6; // label width per letter, Barlow Condensed 11.5px uppercase with tracking
const PAUSE_MS = 450; // the tuk-tuk's beat at each stop on My trip
// Where the tuk-tuk's wheels sit relative to a stop's dot: beside it on the side away from the stop's name,
// or below it when the name is on top.
const parkOff = (h: Hub): [number, number] => {
  const { side } = HUB[h];
  return side === 't' ? [0, TUK_H + 6] : [(side === 'l' ? 1 : -1) * (TUK_W / 2 + 7), 7];
};
type Drive = 'idle' | 'done' | { k: number; moving: boolean };

// Schematic island with the route drawn over it. `route` starts and ends at AIR.
// `drive` (My trip): once it is true and motion is on, the route draws leg by leg while a tuk-tuk drives it, then parks.
export default function RouteMap({ route, drive = false }: { route: Hub[]; drive?: boolean }) {
  const uid = useId().replace(/[^A-Za-z0-9]/g, '');
  const line = pts(route.map(h => [HUB[h].lat, HUB[h].lon]));
  const animate = drive && motion() === 'full' && route.length > 1;
  const legs = useMemo(() => buildLegs(route.map(hubXY)), [route]);
  const [at, setAt] = useState<Drive>('idle');
  const tukRef = useRef<SVGGElement>(null);
  const lineRef = useRef<SVGGElement>(null);

  useEffect(() => {
    if (!animate || at === 'done') return;
    if (at === 'idle') { setAt({ k: 0, moving: true }); return; }
    const t = setTimeout(() => {
      if (at.moving) setAt({ k: at.k, moving: false });
      else setAt(at.k + 1 < legs.length ? { k: at.k + 1, moving: true } : 'done');
    }, at.moving ? legs[at.k].ms : PAUSE_MS);
    return () => clearTimeout(t);
  }, [animate, at, legs]);

  const stops = [...new Set(route)];
  const run = animate && typeof at === 'object' ? at : null;
  useLegDrive(!!run?.moving, run ? legs[run.k] : undefined, parkOff(run ? route[run.k] : 'AIR'), parkOff(run ? route[run.k + 1] : 'AIR'), TUK_W, tukRef, lineRef);
  const drawn = run ? (run.moving ? run.k : run.k + 1) : legs.length;
  const shown = run ? new Set(route.slice(0, drawn + 1)) : null;
  const shownStops = stops.filter(h => !shown || shown.has(h));
  const tukHub = run ? route[run.moving ? run.k : run.k + 1] : 'AIR';
  const tukLeg = run ? legs[run.k] : legs[legs.length - 1];
  const [hx, hy] = hubXY(tukHub);
  const legLine = (l: Leg, i: number) => (
    <g key={i}>
      <path className="route-halo" d={legD(l)} />
      <path className="route-line" d={legD(l)} />
    </g>
  );
  return (
    <div className="map" data-drive={animate ? (run ? 'on' : at) : undefined}>
      <svg viewBox="-60 10 350 470" role="img" aria-label={`Route: ${route.map(h => HUB[h].name).join(', ')}`}>
        <rect className="map-sea" x="-60" y="10" width="350" height="470" />
        <polygon className="map-shore" points={pts(COAST)} />
        <polygon className="map-land" points={pts(COAST)} />
        {run ? (
          <>
            {legs.slice(0, drawn).map(legLine)}
            {run.moving && (
              // The leg draws itself: a mask reveals the dashed line as --o runs 1 to 0 (a plain dashoffset would erase the dashes).
              <g key={`live${run.k}`} ref={lineRef} style={{ '--o': 1 } as CSSProperties}>
                <mask id={`reveal${uid}${run.k}`} maskUnits="userSpaceOnUse" x="-60" y="10" width="350" height="470">
                  <path d={legD(legs[run.k])} fill="none" stroke="#fff" strokeWidth="8" pathLength={1} strokeDasharray="1 1" style={{ strokeDashoffset: 'var(--o)' }} />
                </mask>
                <g mask={`url(#reveal${uid}${run.k})`}>
                  <path className="route-halo" d={legD(legs[run.k])} />
                  <path className="route-line" d={legD(legs[run.k])} />
                </g>
              </g>
            )}
          </>
        ) : (
          <>
            <polyline className="route-halo" points={line} />
            <polyline className="route-line" points={line} />
          </>
        )}
        {shownStops.map(h => {
          const { x, y, anchor } = hubLabel(h);
          const w = HUB[h].name.length * TAG_CH;
          const x0 = anchor === 'end' ? x - w : anchor === 'start' ? x : x - w / 2;
          return (
            <g key={h}>
              <rect className="stop-tag" x={x0 - 4} y={y - 10.5} width={w + 8} height="14" rx="2" />
              <text className="stop-label" x={x} y={y} textAnchor={anchor}>{HUB[h].name}</text>
            </g>
          );
        })}
        {shownStops.map(h => {
          const [x, y] = hubXY(h);
          return <circle key={h} className="stop-dot" cx={x} cy={y} r="4" />;
        })}
        {animate && at !== 'idle' && (
          <g ref={tukRef} transform={tukTransform(hx + parkOff(tukHub)[0], hy + parkOff(tukHub)[1], tukLeg.b[0] < tukLeg.a[0], TUK_W)}>
            <TukTuk width={TUK_W} driving={!!run?.moving} idle={!!run && !run.moving} />
          </g>
        )}
      </svg>
    </div>
  );
}
