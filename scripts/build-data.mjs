// Builds src/data/{catalogue,legs}.json from the research files, and copies photos.
// Every drive hour comes from a Google Maps reading in research/, except rows whose note starts
// "Estimate", which keep "(estimate)" in their src; a missing leg throws.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function hoursOf(s) {
  const h = /(\d+)\s*(?:h|hr)\b/.exec(s);
  const m = /(\d+)\s*min/.exec(s) || (h ? /(?:h|hr)\s+(\d+)\s*$/.exec(s.trim()) : null);
  if (!h && !m) throw new Error(`cannot parse duration "${s}"`);
  return (h ? +h[1] : 0) + (m ? +m[1] / 60 : 0);
}

function tableRows(md, startMarker) {
  const part = startMarker ? md.split(startMarker)[1].split('\n## ')[0] : md;
  return part.split('\n').filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l) && !/^\|\s*(leg|Leg)\s*\|/.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
}

const legRows = [
  ...tableRows(read('research/google_listings.md'), '## A.').map((c) => ({ label: c[0], dur: c[1], src: 'google_listings.md A' })),
  ...tableRows(read('research/maps_legs_extra.md')).map((c) => ({ label: c[0].replace(/^\d+\s+/, ''), dur: /^estimate/i.test(c[3] ?? '') ? `${c[1]} (estimate)` : c[1], src: 'maps_legs_extra.md' })),
].map((r) => ({ ...r, hours: Math.round(hoursOf(r.dur) * 100) / 100 }));

const HUB_ALIAS = [
  [/^(BIA airport|Bandaranaike International Airport)$/i, 'AIR'],
  [/^Colombo( Fort)?$/i, 'Colombo'], [/^Jaffna$/i, 'Jaffna'], [/^Trincomalee$/i, 'Trincomalee'], [/^Sigiriya$/i, 'Sigiriya'], [/^Kandy$/i, 'Kandy'],
  [/^Kitulgala$/i, 'Kitulgala'], [/^Nuwara Eliya$/i, 'Nuwara Eliya'], [/^Ella$/i, 'Ella'],
  [/^Tissamaharama$/i, 'Tissa'], [/^Udawalawe( National Park)?$/i, 'Udawalawe'], [/^Weligama$/i, 'Weligama'],
];
const hubOf = (name) => HUB_ALIAS.find(([re]) => re.test(name.trim()))?.[1] ?? null;

const legs = [];
for (const r of legRows) {
  const [a, b] = r.label.split('->').map((s) => s.trim());
  const ha = hubOf(a), hb = hubOf(b);
  if (ha && hb && ha !== hb) legs.push({ a: ha, b: hb, hours: r.hours, src: `${r.src}: ${r.label} ${r.dur}` });
}

const legHours = (from, toPattern) => {
  const row = legRows.find((r) => {
    const [a, b] = r.label.split('->').map((s) => s.trim());
    return new RegExp(`^${from}$`, 'i').test(a) && toPattern.test(b);
  });
  if (!row) throw new Error(`missing leg ${from} -> ${toPattern}`);
  return row.hours;
};

// Round trip = 2x one-way unless noted. pidurangala 0.3 is an estimate: same village road as Sigiriya.
const SIDE_TRIP = {
  dambulla: 2 * legHours('Sigiriya', /Dambulla/),
  elephants: 2 * legHours('Sigiriya', /Kaudulla/),
  anuradhapura: 2 * legHours('Sigiriya', /Anuradhapura/),
  polonnaruwa: 2 * legHours('Sigiriya', /Polonnaruwa/),
  knuckles: 2 * legHours('Kandy', /Riverston/),
  horton: 2 * legHours('Nuwara Eliya', /Horton/),
  train: legHours('Nuwara Eliya', /Nanu Oya/),
  diyaluma: 2 * legHours('Ella', /Diyaluma/),
  lipton: 2 * legHours('Ella', /Lipton/),
  yala: 2 * legHours('Tissamaharama', /Yala/),
  whales: 2 * legHours('Weligama', /Mirissa/),
  hiriketiya: 2 * legHours('Weligama', /Hiriketiya/),
  junglebeach: 2 * legHours('Weligama', /Jungle Beach/),
  galle: 2 * legHours('Weligama', /Galle Fort/),
  lavinia: 2 * legHours('Colombo', /Mount Lavinia/),
  delft: 2 * legHours('Jaffna', /Kurikadduwan/),
  nainativu: 2 * legHours('Jaffna', /Kurikadduwan/),
  pigeon: 2 * legHours('Trincomalee', /Nilaveli/),
  aukana: 2 * legHours('Sigiriya', /Aukana/),
  buduruwagala: 2 * legHours('Ella', /Buduruwagala/),
  wewurukannala: 2 * legHours('Weligama', /Wewurukannala/),
  rekawa: 2 * legHours('Weligama', /Rekawa/),
  tea: 2 * legHours('Nuwara Eliya', /Labookellie/),
  pidurangala: 0.3,
};

// Raw catalogue timing text -> planner Slot. The raw text is kept as `when` for display.
const SLOT = {
  'sunrise': 'sunrise', 'gate opening': 'sunrise', '06:00 start': 'sunrise', '06:30': 'sunrise',
  'morning': 'morning', 'late morning': 'morning', '09:00 or 14:30': 'morning', 'fixed tour times': 'morning',
  'afternoon': 'afternoon', 'late afternoon': 'afternoon',
  'sunset': 'sunset', 'evening': 'evening', '18:30': 'evening', 'late night': 'late',
  'any': 'any', 'daytime': 'any', 'train times': 'any',
};

const cat = JSON.parse(read('data/catalogue.json'));
const credits = JSON.parse(read('docs/mockups/img/credits.json'));
const CATEGORIES = ['Food', 'Temple', 'History', 'Nature', 'Hike', 'Wildlife', 'Beach', 'Train', 'Adventure', 'Culture', 'Nightlife'];
const items = cat.items.map((it) => {
  if (!CATEGORIES.includes(it.category)) throw new Error(`${it.id} has category "${it.category}", expected one of ${CATEGORIES.join(', ')}`);
  if (!(it.slot in SLOT)) throw new Error(`unmapped slot "${it.slot}" on ${it.id}`);
  // A name that promises sunset or night must be scheduled then, or the planner drives straight after it.
  if (/sunset|evening|night|dinner/i.test(it.name) && !['sunset', 'evening', 'late'].includes(SLOT[it.slot]))
    throw new Error(`${it.id} "${it.name}" is named for the evening but slotted "${it.slot}"`);
  const out = { ...it, when: it.slot, slot: SLOT[it.slot], sideTrip: Math.round((SIDE_TRIP[it.id] ?? 0) * 100) / 100 };
  if (it.id === 'yala') out.hub = 'Tissa';
  if (it.photo && credits[it.photo]) out.credit = `${credits[it.photo].artist}, ${credits[it.photo].license}`;
  return out;
});

// Sanity: 37 items, all hubs connected.
if (items.length !== 33) throw new Error(`expected 33 items, got ${items.length}`);
const hubs = ['AIR', 'Colombo', 'Jaffna', 'Trincomalee', 'Sigiriya', 'Kandy', 'Kitulgala', 'Nuwara Eliya', 'Ella', 'Tissa', 'Udawalawe', 'Weligama'];
const d = Object.fromEntries(hubs.map((a) => [a, Object.fromEntries(hubs.map((b) => [b, a === b ? 0 : Infinity]))]));
for (const l of legs) { d[l.a][l.b] = Math.min(d[l.a][l.b], l.hours); d[l.b][l.a] = Math.min(d[l.b][l.a], l.hours); }
for (const k of hubs) for (const i of hubs) for (const j of hubs) if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j];
for (const a of hubs) for (const b of hubs) if (!Number.isFinite(d[a][b])) throw new Error(`hubs not connected: ${a} -> ${b}`);

fs.mkdirSync(path.join(root, 'src/data'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/data/catalogue.json'), JSON.stringify({ areas: cat.areas, items }, null, 1));
fs.writeFileSync(path.join(root, 'src/data/legs.json'), JSON.stringify(legs, null, 1));

const imgSrc = path.join(root, 'docs/mockups/img'), imgDst = path.join(root, 'public/img');
fs.mkdirSync(imgDst, { recursive: true });
for (const f of fs.readdirSync(imgSrc)) if (f.endsWith('.jpg')) fs.copyFileSync(path.join(imgSrc, f), path.join(imgDst, f));

console.log(`items ${items.length}, legs ${legs.length}, photos ${fs.readdirSync(imgDst).length}`);
console.log('AIR->Sigiriya', d.AIR.Sigiriya.toFixed(2), '| Kandy->Ella', d.Kandy.Ella.toFixed(2), '| Weligama->AIR', d.Weligama.AIR.toFixed(2));
