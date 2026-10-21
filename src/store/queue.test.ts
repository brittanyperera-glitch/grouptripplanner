import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStore } from './local';
import { WriteQueue } from './queue';
import type { Response } from '../types';
import { emptyRanking } from '../types';

type Patch = Partial<Omit<Response, 'name'>>;
type Name = Parameters<LocalStore['saveResponse']>[0];
const full = (over: Patch): Patch => ({ days: null, flex: false, pace: null, ranking: emptyRanking(), rated: [], submitted: false, ...over });
const hooks = () => ({ fails: 0, clears: 0, onFail() { this.fails++; }, onClear() { this.clears++; } });

beforeEach(() => localStorage.clear());

describe('WriteQueue', () => {
  it('failed save, newer save, retry: the latest full row is what gets stored', async () => {
    let offline = true;
    class Flaky extends LocalStore {
      override async saveResponse(...a: Parameters<LocalStore['saveResponse']>) {
        if (offline) throw new Error('offline');
        return super.saveResponse(...a);
      }
    }
    const base = new Flaky();
    const h = hooks();
    const q = new WriteQueue(base, h);
    await q.store.saveResponse('Alex', full({ days: 9 }));
    await q.store.saveResponse('Alex', full({ days: 14, pace: 2 }));
    expect(h.fails).toBeGreaterThan(0);
    offline = false;
    expect(await q.flush()).toBe(true);
    const row = (await base.load()).responses.Alex;
    expect(row?.days).toBe(14);
    expect(row?.pace).toBe(2);
    expect(h.clears).toBe(1);
  });

  it('retry sends one request per person, not one per failed save', async () => {
    const sent: Patch[] = [];
    class Spy extends LocalStore {
      fail = true;
      override async saveResponse(_n: Name, p: Patch) {
        if (this.fail) throw new Error('offline');
        sent.push(p);
      }
    }
    const base = new Spy();
    const q = new WriteQueue(base, hooks());
    for (const d of [5, 6, 7]) await q.store.saveResponse('Alex', full({ days: d }));
    base.fail = false;
    await q.flush();
    expect(sent.map(p => p.days)).toEqual([7]);
  });

  it('keeps only the latest vote per fork and person', async () => {
    const sent: string[] = [];
    class Spy extends LocalStore {
      fail = true;
      override async vote(v: Parameters<LocalStore['vote']>[0]) {
        if (this.fail) throw new Error('offline');
        sent.push(`${v.forkId}:${v.name}:${v.choice}`);
      }
    }
    const base = new Spy();
    const q = new WriteQueue(base, hooks());
    await q.store.vote({ forkId: 'f1', name: 'Alex', choice: 'a' });
    await q.store.vote({ forkId: 'f1', name: 'Alex', choice: 'b' });
    await q.store.vote({ forkId: 'f2', name: 'Alex', choice: 'a' });
    base.fail = false;
    await q.flush();
    expect(sent.sort()).toEqual(['f1:Alex:b', 'f2:Alex:a']);
  });

  it('never runs two writes at once and keeps submit order', async () => {
    let active = 0;
    let maxActive = 0;
    const order: number[] = [];
    class Slow extends LocalStore {
      override async saveResponse(_n: Name, p: Patch) {
        active++; maxActive = Math.max(maxActive, active);
        await new Promise(r => setTimeout(r, 5));
        order.push(p.days as number);
        active--;
      }
    }
    const q = new WriteQueue(new Slow(), hooks());
    await Promise.all([
      q.store.saveResponse('Alex', full({ days: 1 })),
      q.store.saveResponse('Brittany', full({ days: 2 })),
      q.store.saveResponse('Antek', full({ days: 3 })),
    ]);
    expect(maxActive).toBe(1);
    expect(order).toEqual([1, 2, 3]);
  });

  it('a newer save that lands while an older one is failing is not overwritten by the retry', async () => {
    const sent: number[] = [];
    let calls = 0;
    class Spy extends LocalStore {
      override async saveResponse(_n: Name, p: Patch) {
        calls++;
        if (calls === 1) { await new Promise(r => setTimeout(r, 5)); throw new Error('offline'); }
        sent.push(p.days as number);
      }
    }
    const q = new WriteQueue(new Spy(), hooks());
    await Promise.all([
      q.store.saveResponse('Alex', full({ days: 9 })),
      q.store.saveResponse('Alex', full({ days: 14 })),
    ]);
    await q.flush();
    expect(sent.at(-1)).toBe(14);
  });
});

// Reviewer's probe: Approve fails, Reject (queued behind it) succeeds, then the retry used to send Approve last.
describe('WriteQueue status writes', () => {
  const failFirst = (sent: string[]) => {
    let calls = 0;
    const send = async (id: string, st: string) => {
      calls++;
      if (calls === 1) { await new Promise(r => setTimeout(r, 5)); throw new Error('offline'); }
      sent.push(`${st} ${id}`);
    };
    return class extends LocalStore {
      override setSuggestionStatus(id: string, st: 'pending' | 'live' | 'rejected') { return send(id, st); }
      override setPlaceStatus(id: string, st: 'live' | 'withdrawn') { return send(id, st); }
    };
  };

  it('an old suggestion status retried after a newer one for the same id never lands last', async () => {
    const sent: string[] = [];
    const q = new WriteQueue(new (failFirst(sent))(), hooks());
    await Promise.all([q.store.setSuggestionStatus('s1', 'live'), q.store.setSuggestionStatus('s1', 'rejected')]);
    expect(await q.flush()).toBe(true);
    expect(sent).toEqual(['rejected s1']);
  });

  it('an old place status retried after a newer one for the same id never lands last', async () => {
    const sent: string[] = [];
    const q = new WriteQueue(new (failFirst(sent))(), hooks());
    await Promise.all([q.store.setPlaceStatus('p1', 'withdrawn'), q.store.setPlaceStatus('p1', 'live')]);
    expect(await q.flush()).toBe(true);
    expect(sent).toEqual(['live p1']);
  });

  it('a newer status queued after an old one has already failed replaces it', async () => {
    const sent: string[] = [];
    const q = new WriteQueue(new (failFirst(sent))(), hooks());
    await q.store.setSuggestionStatus('s1', 'live');
    await q.store.setSuggestionStatus('s1', 'rejected');
    expect(sent).toEqual(['rejected s1']);
  });

  it('statuses for different ids are each sent', async () => {
    const sent: string[] = [];
    const q = new WriteQueue(new (failFirst(sent))(), hooks());
    await Promise.all([q.store.setSuggestionStatus('s1', 'live'), q.store.setSuggestionStatus('s2', 'rejected'), q.store.setPlaceStatus('s1', 'withdrawn')]);
    await q.flush();
    expect(sent.sort()).toEqual(['live s1', 'rejected s2', 'withdrawn s1']);
  });
});

describe('WriteQueue crew stays', () => {
  type CrewPatch = Parameters<LocalStore['saveCrewStays']>[1];
  const pref = { topic: 'budget' as const, picks: {}, noPreference: true, skipped: false };

  it('two saves for one person queued behind another write become one write, newest value per field', async () => {
    const sent: Array<[string, CrewPatch]> = [];
    let release: () => void = () => undefined;
    class Spy extends LocalStore {
      override async saveCrewStays(n: Name, p: CrewPatch) {
        if (n === 'Brittany') await new Promise<void>(r => { release = r; });
        sent.push([n, p]);
      }
    }
    const q = new WriteQueue(new Spy(), hooks());
    const blocker = q.store.saveCrewStays('Brittany', { locked: true });
    const one = q.store.saveCrewStays('Alex', { quizDone: false, locked: true });
    const two = q.store.saveCrewStays('Alex', { quizDone: true, prefs: [pref] });
    release();
    await Promise.all([blocker, one, two]);
    const alex = sent.filter(([n]) => n === 'Alex');
    expect(alex).toHaveLength(1);
    expect(alex[0][1]).toEqual({ quizDone: true, locked: true, prefs: [pref] });
  });

  it('a retry after failures sends one write per person holding every field, newest value per field', async () => {
    const sent: CrewPatch[] = [];
    class Spy extends LocalStore {
      fail = true;
      override async saveCrewStays(_n: Name, p: CrewPatch) {
        if (this.fail) throw new Error('offline');
        sent.push(p);
      }
    }
    const base = new Spy();
    const q = new WriteQueue(base, hooks());
    await q.store.saveCrewStays('Alex', { quizDone: false, locked: true });
    await q.store.saveCrewStays('Alex', { quizDone: true, prefs: [pref] });
    base.fail = false;
    expect(await q.flush()).toBe(true);
    expect(sent).toEqual([{ quizDone: true, locked: true, prefs: [pref] }]);
  });
});

describe('WriteQueue place suggestions and stays admin', () => {
  type AdminPatch = Parameters<LocalStore['saveStaysAdmin']>[0];
  type Draft = Parameters<LocalStore['addPlaceSuggestion']>[0];
  const draft = (title: string): Draft => ({ name: 'Alex', area: 'Ella', kind: 'eat', title });
  const pin = (suggestionId: string | null) => ({ area: 'Ella' as const, suggestionId, at: 't' });

  it('two admin saves queued behind another write become one write: newest pins whole, scouts merged by area', async () => {
    const sent: AdminPatch[] = [];
    let release: () => void = () => undefined;
    class Spy extends LocalStore {
      override async addPlaceSuggestion() { await new Promise<void>(r => { release = r; }); }
      override async saveStaysAdmin(p: AdminPatch) { sent.push(p); }
    }
    const q = new WriteQueue(new Spy(), hooks());
    const blocker = q.store.addPlaceSuggestion(draft('x'));
    const one = q.store.saveStaysAdmin({ pins: [pin('a')], scouts: { Ella: 'Lazza', North: 'Alex' } });
    const two = q.store.saveStaysAdmin({ pins: [pin(null)], scouts: { Ella: 'Saulie' } });
    release();
    await Promise.all([blocker, one, two]);
    expect(sent).toEqual([{ pins: [pin(null)], scouts: { Ella: 'Saulie', North: 'Alex' } }]);
  });

  it('queued admin saves keep closed from one and pins from the other in a single write', async () => {
    const sent: AdminPatch[] = [];
    let release: () => void = () => undefined;
    class Spy extends LocalStore {
      override async addPlaceSuggestion() { await new Promise<void>(r => { release = r; }); }
      override async saveStaysAdmin(p: AdminPatch) { sent.push(p); }
    }
    const q = new WriteQueue(new Spy(), hooks());
    const blocker = q.store.addPlaceSuggestion(draft('x'));
    const one = q.store.saveStaysAdmin({ closed: ['Ella'] });
    const two = q.store.saveStaysAdmin({ pins: [pin('a')] });
    release();
    await Promise.all([blocker, one, two]);
    expect(sent).toEqual([{ closed: ['Ella'], pins: [pin('a')] }]);
  });

  it('a retry after failures sends one admin write holding every field, newest value per field', async () => {
    const sent: AdminPatch[] = [];
    class Spy extends LocalStore {
      fail = true;
      override async saveStaysAdmin(p: AdminPatch) {
        if (this.fail) throw new Error('offline');
        sent.push(p);
      }
    }
    const base = new Spy();
    const h = hooks();
    const q = new WriteQueue(base, h);
    await q.store.saveStaysAdmin({ scouts: { Ella: 'Lazza', North: 'Alex' } });
    await q.store.saveStaysAdmin({ pins: [pin('a')], scouts: { Ella: 'Saulie' } });
    expect(h.fails).toBeGreaterThan(0);
    base.fail = false;
    expect(await q.flush()).toBe(true);
    expect(sent).toEqual([{ pins: [pin('a')], scouts: { Ella: 'Saulie', North: 'Alex' } }]);
  });

  // Was ['add a','add b','withdrawn p1','live p1']: unkeyed statuses let an old retried one land last; adds still never fold.
  it('place adds are each sent in order; statuses for one id fold to the newest', async () => {
    const sent: string[] = [];
    let release: () => void = () => undefined;
    class Spy extends LocalStore {
      override async saveStaysAdmin() { await new Promise<void>(r => { release = r; }); }
      override async addPlaceSuggestion(s: Draft) { sent.push(`add ${s.title}`); }
      override async setPlaceStatus(id: string, st: 'live' | 'withdrawn') { sent.push(`${st} ${id}`); }
    }
    const q = new WriteQueue(new Spy(), hooks());
    const blocker = q.store.saveStaysAdmin({ pins: [] });
    const writes = [q.store.addPlaceSuggestion(draft('a')), q.store.addPlaceSuggestion(draft('b')), q.store.setPlaceStatus('p1', 'withdrawn'), q.store.setPlaceStatus('p1', 'live')];
    release();
    await Promise.all([blocker, ...writes]);
    expect(sent).toEqual(['add a', 'add b', 'live p1']);
  });
});

describe('WriteQueue trip admin', () => {
  type Items = Parameters<LocalStore['saveTripAdmin']>[1];

  it('saves for one person queued behind another write become one write, newest value per item', async () => {
    const sent: Array<[string, Items]> = [];
    let release: () => void = () => undefined;
    class Spy extends LocalStore {
      override async saveTripAdmin(n: Name, p: Items) {
        if (n === 'Brittany') await new Promise<void>(r => { release = r; });
        sent.push([n, p]);
      }
    }
    const q = new WriteQueue(new Spy(), hooks());
    const blocker = q.store.saveTripAdmin('Brittany', { eta: { done: true } });
    const one = q.store.saveTripAdmin('Alex', { flights: { done: false }, eta: { done: true } });
    const two = q.store.saveTripAdmin('Alex', { flights: { done: true, ref: 'R1' } });
    release();
    await Promise.all([blocker, one, two]);
    const alex = sent.filter(([n]) => n === 'Alex');
    expect(alex).toHaveLength(1);
    expect(alex[0][1]).toEqual({ flights: { done: true, ref: 'R1' }, eta: { done: true } });
  });

  it('a retry after a failure sends one write holding the newest value per item', async () => {
    const sent: Items[] = [];
    class Spy extends LocalStore {
      fail = true;
      override async saveTripAdmin(_n: Name, p: Items) {
        if (this.fail) throw new Error('offline');
        sent.push(p);
      }
    }
    const base = new Spy();
    const q = new WriteQueue(base, hooks());
    await q.store.saveTripAdmin('Alex', { flights: { done: false } });
    await q.store.saveTripAdmin('Alex', { flights: { done: true }, money: { done: true } });
    base.fail = false;
    expect(await q.flush()).toBe(true);
    expect(sent).toEqual([{ flights: { done: true }, money: { done: true } }]);
  });

  it('a failed complaint reaches the caller and never marks the queue unsaved', async () => {
    class NoTable extends LocalStore {
      override async addComplaint(): Promise<void> { throw new Error('no complaints table'); }
    }
    const h = hooks();
    const q = new WriteQueue(new NoTable(), h);
    await expect(q.store.addComplaint({ name: 'Alex', text: 'Too hot' })).rejects.toThrow('no complaints table');
    expect(h.fails).toBe(0);
    expect(await q.flush()).toBe(true);
  });

  it('a stored complaint reads back through the local store', async () => {
    const base = new LocalStore();
    await new WriteQueue(base, hooks()).store.addComplaint({ name: 'Alex', text: 'Too hot' });
    expect(await base.loadComplaints()).toMatchObject([{ name: 'Alex', text: 'Too hot' }]);
  });
});
