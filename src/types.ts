export type Tier = 'must' | 'keen' | 'meh' | 'skip';
export const TIERS: Tier[] = ['must', 'keen', 'meh', 'skip'];
export type Level = string[];
export type Ranking = Record<Tier, Level[]>;
export const emptyRanking = (): Ranking => ({ must: [], keen: [], meh: [], skip: [] });
export interface Pending { id: string; tier: Tier; lo: number; hi: number; steps: number }

export type Slot = 'sunrise' | 'morning' | 'afternoon' | 'sunset' | 'evening' | 'late' | 'any';
export type Area = 'Colombo' | 'Cultural Triangle' | 'Kandy and Knuckles' | 'Kitulgala' | 'Hill country' | 'Ella' | 'Wild south' | 'South coast';
export const AREAS: Area[] = ['Colombo', 'Cultural Triangle', 'Kandy and Knuckles', 'Kitulgala', 'Hill country', 'Ella', 'Wild south', 'South coast'];
export type Hub = 'AIR' | 'Colombo' | 'Sigiriya' | 'Kandy' | 'Kitulgala' | 'Nuwara Eliya' | 'Ella' | 'Tissa' | 'Udawalawe' | 'Weligama';
export interface Item {
  id: string; name: string; area: Area; about: string; hours: number; slot: Slot; fee: string;
  sideTrip: number; book?: string; warn?: string; photo?: string; hub?: Hub;
  google?: { rating: string; reviews: string; url: string }; suggestedBy?: Person; credit?: string; when?: string;
}
export interface Leg { a: Hub; b: Hub; hours: number; src: string }
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
export interface Response {
  name: Person; days: number | null; flex: boolean; pace: Pace | null;
  ranking: Ranking; rated: string[]; submitted: boolean; updatedAt: string;
}
export interface Suggestion { id: string; name: Person; title: string; area: Area; note: string; status: 'pending' | 'live' | 'rejected'; createdAt: string }
export interface Vote { forkId: string; name: Person; choice: 'a' | 'b' }
export interface AppState { responses: Partial<Record<Person, Response>>; suggestions: Suggestion[]; votes: Vote[] }
export interface Store {
  load(): Promise<AppState>;
  saveResponse(name: Person, patch: Partial<Omit<Response, 'name'>>): Promise<void>;
  addSuggestion(s: { name: Person; title: string; area: Area; note: string }): Promise<void>;
  setSuggestionStatus(id: string, status: Suggestion['status']): Promise<void>;
  vote(v: Vote): Promise<void>;
  subscribe(cb: (s: AppState) => void): () => void;
}
// a = contested item first, then anything else forcing it in adds; b = items it would displace
export interface Knockout { forkId: string; a: string[]; b: string[]; votes: { a: Person[]; b: Person[] } }
export interface GroupResult {
  open: boolean; days: number; pace: Pace; base: Plan | null; knockouts: Knockout[];
  results: { forkId: string; a: string[]; b: string[]; winner: 'a' | 'b' | 'displaced' }[]; final: Plan | null;
  extras: { id: string; who: { name: Person; tier: Tier }[] }[];
}
export const AREA_HUB: Record<Area, Hub> = {
  'Colombo': 'Colombo', 'Cultural Triangle': 'Sigiriya', 'Kandy and Knuckles': 'Kandy', 'Kitulgala': 'Kitulgala',
  'Hill country': 'Nuwara Eliya', 'Ella': 'Ella', 'Wild south': 'Udawalawe', 'South coast': 'Weligama',
};
