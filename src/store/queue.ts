import { diffResponse } from './choices';
import { mergeAdmin, mergeAdminItems } from '../types';
import type { AdminItems, ChoiceInput, CrewStays, FinalStore, Person, PlaceSuggestion, Player, Response, StaysAdmin, Store, Suggestion, Vote } from '../types';

type Patch = Partial<Omit<Response, 'name'>>;
type CrewPatch = Partial<Omit<CrewStays, 'name'>>;
type SettingsPatch = Parameters<FinalStore['saveTripSettings']>[0];
type TravellerPatch = Parameters<FinalStore['saveTraveller']>[1];
/** Called once per job run: true only when that write succeeded. A coalesced job tells every caller folded into it. */
type Waiter = (ok: boolean) => void;
type Job =
  | { kind: 'resp'; key: string; name: Player; patch: Patch; waiters: Waiter[] }
  | { kind: 'crew'; key: string; name: Player; patch: CrewPatch; waiters: Waiter[] }
  | { kind: 'trip'; key: string; name: Player; patch: AdminItems; waiters: Waiter[] }
  | { kind: 'admin'; key: 'a:admin'; patch: Partial<StaysAdmin>; waiters: Waiter[] }
  | { kind: 'settings'; key: 'settings'; patch: SettingsPatch; waiters: Waiter[] }
  | { kind: 'traveller'; key: string; name: Person; patch: TravellerPatch; waiters: Waiter[] }
  | { kind: 'claim'; key: string; itemId: string; owner: Person | null; waiters: Waiter[] }
  | { kind: 'vote'; key: string; vote: Vote; waiters: Waiter[] }
  | { kind: 'log'; key: 'log'; entries: ChoiceInput[]; waiters: Waiter[] }
  | { kind: 'sugg'; key: string; id: string; status: Suggestion['status']; waiters: Waiter[] }
  | { kind: 'place'; key: string; id: string; status: PlaceSuggestion['status']; waiters: Waiter[] }
  | { kind: 'op'; key: null; run: () => Promise<void>; waiters: Waiter[] };

/** The final-stage setters again, resolving with whether the write was stored, so a screen can say Saved only when it was. */
export interface FinalSaves {
  saveTripSettings(patch: SettingsPatch): Promise<boolean>;
  saveTraveller(name: Person, patch: TravellerPatch): Promise<boolean>;
  saveBookingClaim(itemId: string, owner: Person | null): Promise<boolean>;
}

/** onAdminDenied: an organiser write the server refused with 42501; the job is dropped, not retried. */
interface Hooks { onFail(): void; onClear(): void; onAdminDenied?(kind: 'settings' | 'admin'): void }
// Postgres insufficient_privilege, which row-level security raises for a refused write.
const refused = (e: unknown) => (e as { code?: string } | null)?.code === '42501';

/**
 * Wraps a Store so writes never run in parallel. Saves for one person, votes for one fork and statuses for one
 * suggestion coalesce into the latest value, so a failed save is never replayed over a newer one.
 */
export class WriteQueue {
  readonly store: Store & FinalStore;
  readonly saves: FinalSaves;
  private queue: Job[] = [];
  private running = false;
  private current: Promise<boolean> = Promise.resolve(true);
  private dirty = false;
  // What was last stored, so each save is logged as the choices it adds. Seeded once from the base store.
  private known = new Map<Player, Response>();
  private lastVote = new Map<string, 'a' | 'b'>();

  constructor(private base: Store & Partial<FinalStore>, private hooks: Hooks) {
    void base.load().then(s => {
      for (const r of Object.values(s.responses)) if (r && !this.known.has(r.name)) this.known.set(r.name, r);
      for (const v of s.votes) if (!this.lastVote.has(`${v.forkId}:${v.name}`)) this.lastVote.set(`${v.forkId}:${v.name}`, v.choice);
    }).catch(() => undefined);
    this.saves = {
      saveTripSettings: patch => this.addOk({ kind: 'settings', key: 'settings', patch, waiters: [] }),
      saveTraveller: (name, patch) => this.addOk({ kind: 'traveller', key: `tv:${name}`, name, patch, waiters: [] }),
      saveBookingClaim: (itemId, owner) => this.addOk({ kind: 'claim', key: `bc:${itemId}`, itemId, owner, waiters: [] }),
    };
    this.store = {
      load: () => base.load(),
      subscribe: cb => base.subscribe(cb),
      saveResponse: (name, patch) => {
        const prev = this.known.get(name);
        const entries = diffResponse(name, prev, patch);
        this.known.set(name, { ...(prev ?? ({ name } as Response)), ...patch } as Response);
        const saved = this.add({ kind: 'resp', key: `r:${name}`, name, patch, waiters: [] });
        return Promise.all([saved, this.logAll(entries)]).then(() => undefined);
      },
      vote: vote => {
        const k = `${vote.forkId}:${vote.name}`;
        const changed = this.lastVote.get(k) !== vote.choice;
        this.lastVote.set(k, vote.choice);
        const saved = this.add({ kind: 'vote', key: `v:${vote.forkId}:${vote.name}`, vote, waiters: [] });
        const entries: ChoiceInput[] = changed ? [{ name: vote.name, kind: 'knockout', ref: vote.forkId, value: { choice: vote.choice } }] : [];
        return Promise.all([saved, this.logAll(entries)]).then(() => undefined);
      },
      addSuggestion: s => {
        const saved = this.add({ kind: 'op', key: null, run: () => base.addSuggestion(s), waiters: [] });
        return Promise.all([saved, this.logAll([{ name: s.name, kind: 'suggest', ref: s.area, value: { title: s.title, note: s.note } }])]).then(() => undefined);
      },
      saveCrewStays: (name, patch) => this.add({ kind: 'crew', key: `c:${name}`, name, patch, waiters: [] }),
      addPlaceSuggestion: s => this.add({ kind: 'op', key: null, run: () => base.addPlaceSuggestion(s), waiters: [] }),
      setPlaceStatus: (id, status) => this.add({ kind: 'place', key: `p:${id}`, id, status, waiters: [] }),
      saveTripAdmin: (name, patch) => this.add({ kind: 'trip', key: `t:${name}`, name, patch, waiters: [] }),
      saveStaysAdmin: patch => this.add({ kind: 'admin', key: 'a:admin', patch, waiters: [] }),
      saveTripSettings: patch => this.saves.saveTripSettings(patch).then(() => undefined),
      saveTraveller: (name, patch) => this.saves.saveTraveller(name, patch).then(() => undefined),
      saveBookingClaim: (itemId, owner) => this.saves.saveBookingClaim(itemId, owner).then(() => undefined),
      setSuggestionStatus: (id, status) => this.add({ kind: 'sugg', key: `s:${id}`, id, status, waiters: [] }),
      logChoice: c => this.logAll([c]),
      loadLog: () => base.loadLog(),
      // Not queued: a failed complaint must reach the screen, not sit in the retry queue and flag every later save as unsaved.
      addComplaint: c => base.addComplaint(c),
      loadComplaints: () => base.loadComplaints(),
    };
  }

  /** Runs one pass over everything queued or failed. Resolves true when no choice is left unsaved (log entries may still wait). */
  flush(): Promise<boolean> {
    if (!this.running) {
      this.running = true;
      this.current = this.drain();
    }
    return this.current;
  }

  /** Retries whatever failed when the device comes back online or the page is shown again. Returns the teardown. */
  watch(): () => void {
    const retry = () => { if (this.queue.length > 0) void this.flush(); };
    const shown = () => { if (document.visibilityState === 'visible') retry(); };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', shown);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', shown);
    };
  }

  /**
   * Queues log writes into the one shared log job, so failed entries wait together and a retry costs one
   * request. Each entry is dropped once written, so a retry never repeats one.
   */
  private logAll(todo: ChoiceInput[]): Promise<void> {
    if (todo.length === 0) return Promise.resolve();
    return this.add({ kind: 'log', key: 'log', entries: [...todo], waiters: [] });
  }

  private add(job: Job): Promise<void> {
    return this.addOk(job).then(() => undefined);
  }

  private addOk(job: Job): Promise<boolean> {
    const done = new Promise<boolean>(res => job.waiters.push(res));
    const same = job.key === null ? undefined : this.queue.find(j => j.key === job.key);
    if (same) merge(same, job); else this.queue.push(job);
    void this.flush();
    return done;
  }

  private exec(j: Job): Promise<void> {
    if (j.kind === 'resp') return this.base.saveResponse(j.name, j.patch);
    if (j.kind === 'crew') return this.base.saveCrewStays(j.name, j.patch);
    if (j.kind === 'trip') return this.base.saveTripAdmin(j.name, j.patch);
    if (j.kind === 'admin') return this.base.saveStaysAdmin(j.patch);
    if (j.kind === 'settings') return this.base.saveTripSettings?.(j.patch) ?? Promise.resolve();
    if (j.kind === 'traveller') return this.base.saveTraveller?.(j.name, j.patch) ?? Promise.resolve();
    if (j.kind === 'claim') return this.base.saveBookingClaim?.(j.itemId, j.owner) ?? Promise.resolve();
    if (j.kind === 'vote') return this.base.vote(j.vote);
    if (j.kind === 'log') return this.writeLog(j.entries);
    if (j.kind === 'sugg') return this.base.setSuggestionStatus(j.id, j.status);
    if (j.kind === 'place') return this.base.setPlaceStatus(j.id, j.status);
    return j.run();
  }

  private async writeLog(entries: ChoiceInput[]): Promise<void> {
    while (entries.length > 0) {
      await this.base.logChoice(entries[0]);
      entries.shift();
    }
  }

  private async drain(): Promise<boolean> {
    const failed: Job[] = [];
    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift() as Job;
        const older = failed.findIndex(f => f.key !== null && f.key === job.key);
        if (older >= 0) merge(job, failed.splice(older, 1)[0], true);
        let stored = true;
        try {
          await this.exec(job);
        } catch (e) {
          stored = false;
          if ((job.kind === 'settings' || job.kind === 'admin') && refused(e)) this.hooks.onAdminDenied?.(job.kind);
          else failed.push(job);
        }
        job.waiters.splice(0).forEach(w => w(stored));
      }
    } finally {
      this.queue.unshift(...failed);
      this.running = false;
    }
    // A failed log write loses no choice (the response row holds them all), so it stays queued but raises nothing.
    const unsaved = failed.filter(j => j.kind !== 'log').length;
    if (unsaved > 0) {
      this.dirty = true;
      this.hooks.onFail();
    } else if (this.dirty) {
      this.dirty = false;
      this.hooks.onClear();
    }
    return unsaved === 0;
  }
}

/** Folds `from` into `into`. The newer job wins field by field; `intoIsNewer` says which one that is. */
function merge(into: Job, from: Job, intoIsNewer = false): void {
  if (into.kind === 'resp' && from.kind === 'resp') {
    into.patch = intoIsNewer ? { ...from.patch, ...into.patch } : { ...into.patch, ...from.patch };
  } else if (into.kind === 'crew' && from.kind === 'crew') {
    into.patch = intoIsNewer ? { ...from.patch, ...into.patch } : { ...into.patch, ...from.patch };
  } else if (into.kind === 'trip' && from.kind === 'trip') {
    into.patch = intoIsNewer ? mergeAdminItems(from.patch, into.patch) : mergeAdminItems(into.patch, from.patch);
  } else if (into.kind === 'admin' && from.kind === 'admin') {
    into.patch = intoIsNewer ? mergeAdmin(from.patch, into.patch) : mergeAdmin(into.patch, from.patch);
  } else if (into.kind === 'settings' && from.kind === 'settings') {
    into.patch = intoIsNewer ? { ...from.patch, ...into.patch } : { ...into.patch, ...from.patch };
  } else if (into.kind === 'traveller' && from.kind === 'traveller') {
    into.patch = intoIsNewer ? { ...from.patch, ...into.patch } : { ...into.patch, ...from.patch };
  } else if (into.kind === 'claim' && from.kind === 'claim' && !intoIsNewer) {
    into.owner = from.owner;
  } else if (into.kind === 'vote' && from.kind === 'vote' && !intoIsNewer) {
    into.vote = from.vote;
  } else if (into.kind === 'sugg' && from.kind === 'sugg' && !intoIsNewer) {
    into.status = from.status;
  } else if (into.kind === 'place' && from.kind === 'place' && !intoIsNewer) {
    into.status = from.status;
  } else if (into.kind === 'log' && from.kind === 'log') {
    into.entries = intoIsNewer ? [...from.entries, ...into.entries] : [...into.entries, ...from.entries];
  }
  into.waiters.push(...from.waiters);
}
