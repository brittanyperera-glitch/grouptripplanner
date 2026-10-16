export type Tier = 'must' | 'keen' | 'meh' | 'skip';
export const TIERS: Tier[] = ['must', 'keen', 'meh', 'skip'];
export type Level = string[];
export type Ranking = Record<Tier, Level[]>;
export const emptyRanking = (): Ranking => ({ must: [], keen: [], meh: [], skip: [] });

export type Slot = 'sunrise' | 'morning' | 'afternoon' | 'sunset' | 'evening' | 'late' | 'any';
export type Area = 'Colombo' | 'North' | 'East coast' | 'Cultural Triangle' | 'Kandy and Knuckles' | 'Kitulgala' | 'Hill country' | 'Ella' | 'Wild south' | 'South coast';
export const AREAS: Area[] = ['Colombo', 'North', 'East coast', 'Cultural Triangle', 'Kandy and Knuckles', 'Kitulgala', 'Hill country', 'Ella', 'Wild south', 'South coast'];
export type Hub = 'AIR' | 'Colombo' | 'Jaffna' | 'Trincomalee' | 'Sigiriya' | 'Kandy' | 'Kitulgala' | 'Nuwara Eliya' | 'Ella' | 'Tissa' | 'Udawalawe' | 'Weligama';
export type Category = 'Food' | 'Temple' | 'History' | 'Nature' | 'Hike' | 'Wildlife' | 'Beach' | 'Train' | 'Adventure' | 'Culture' | 'Nightlife';
export interface Item {
  id: string; name: string; area: Area; about: string; hours: number; slot: Slot; fee: string;
  category?: Category; sideTrip: number; book?: string; warn?: string; photo?: string; hub?: Hub;
  google?: { rating: string; reviews: string; url: string }; suggestedBy?: Player; credit?: string; when?: string;
}
export interface Leg { a: Hub; b: Hub; hours: number; km?: number; src: string }
export type Pace = 0 | 1 | 2; // pack, balanced, slow
export const PACE_HOURS: Record<Pace, number> = { 0: 11, 1: 9, 2: 7 };
export interface PlanInput {
  items: Item[]; scores: Record<string, number>; days: number; pace: Pace; legs: Leg[];
  mustIds?: string[]; forceIn?: string[]; forceOut?: string[];
}
// hours = total time the entry takes from the day (scheduling). For activities, onSite + roundTrip = hours.
export interface DayEntry {
  kind: 'drive' | 'activity' | 'train' | 'free'; label: string; hours: number; itemId?: string; from?: Hub; to?: Hub;
  onSite?: number; roundTrip?: number;
}
export interface Day { n: number; area: Area | null; entries: DayEntry[]; spare: number; rainSlack: boolean }
export interface Plan {
  route: Hub[]; areas: Area[]; days: Day[]; chosen: string[]; dropped: string[];
  travelHours: number; fits: boolean; missingMusts: string[]; score: number;
  overflow?: boolean; forceFailed?: boolean;
}
export type Person = 'Brittany' | 'Alex' | 'Antek' | 'Lazza' | 'Saulie';
export const PEOPLE: Person[] = ['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie'];
export const GUESTS = ['Tuktuk', 'Aunty', 'Groom'] as const;
export type Guest = typeof GUESTS[number];
export type Player = Person | Guest;
export const isGuest = (p: Player | null): p is Guest => p !== null && (GUESTS as readonly string[]).includes(p);
export interface Response {
  name: Player; days: number | null; flex: boolean; pace: Pace | null;
  ranking: Ranking; rated: string[]; submitted: boolean; updatedAt: string;
  // The Finalize list, saved after the head to heads; ranking stays as submitted, which the head to heads use.
  final?: Ranking | null;
}
export interface Suggestion { id: string; name: Player; title: string; area: Area; note: string; status: 'pending' | 'live' | 'rejected'; createdAt: string }
export interface Vote { forkId: string; name: Player; choice: 'a' | 'b' }
export type ChoiceKind = 'tier' | 'rerank' | 'knockout' | 'days' | 'pace' | 'suggest';
// ref is the item id (tier), the fork id (knockout), the area (suggest) or null.
export interface ChoiceInput { name: Player; kind: ChoiceKind; ref: string | null; value: unknown }
export interface ChoiceEntry extends ChoiceInput { id: string; at: string }
export interface AppState { responses: Partial<Record<Player, Response>>; suggestions: Suggestion[]; votes: Vote[] }
export interface Store {
  load(): Promise<AppState>;
  saveResponse(name: Player, patch: Partial<Omit<Response, 'name'>>): Promise<void>;
  addSuggestion(s: { name: Player; title: string; area: Area; note: string }): Promise<void>;
  setSuggestionStatus(id: string, status: Suggestion['status']): Promise<void>;
  vote(v: Vote): Promise<void>;
  subscribe(cb: (s: AppState) => void): () => void;
  logChoice(c: ChoiceInput): Promise<void>;
  loadLog(): Promise<ChoiceEntry[]>;
}
// a = contested item first, then anything else forcing it in adds; b = items it would displace
export interface Knockout {
  forkId: string; a: string[]; b: string[]; votes: { a: Person[]; b: Person[] };
  // A same-type keep vote: a = the places to tick, b = places of that type already in for good,
  // votes.a = everyone who has ticked every place in a. One stored vote per place: 'a' keep, 'b' drop.
  genre?: { id: string; tally: Record<string, { keep: Person[]; drop: Person[] }> };
}
// A finer type than Category, for spotting two of the same kind on the group shortlist (src/data/genres.json).
export interface Genre { id: string; label: string; one: string; many: string; items: string[] }
export interface GroupResult {
  open: boolean; days: number; pace: Pace; base: Plan | null; knockouts: Knockout[];
  results: { forkId: string; a: string[]; b: string[]; winner: 'a' | 'b' | 'displaced' }[]; final: Plan | null;
  extras: { id: string; who: { name: Player; tier: Tier }[] }[];
  // Items that lost a head to head; who has saved a Finalize list; locked once all five have.
  knocked: string[]; finalized: Player[]; locked: boolean;
}
export const AREA_HUB: Record<Area, Hub> = {
  'Colombo': 'Colombo', 'North': 'Jaffna', 'East coast': 'Trincomalee', 'Cultural Triangle': 'Sigiriya', 'Kandy and Knuckles': 'Kandy', 'Kitulgala': 'Kitulgala',
  'Hill country': 'Nuwara Eliya', 'Ella': 'Ella', 'Wild south': 'Udawalawe', 'South coast': 'Weligama',
};
