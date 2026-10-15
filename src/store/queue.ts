import { diffResponse } from './choices';
import type { ChoiceInput, Person, Response, Store, Vote } from '../types';

type Patch = Partial<Omit<Response, 'name'>>;
type Job =
  | { kind: 'resp'; key: string; name: Person; patch: Patch; waiters: Array<() => void> }
  | { kind: 'vote'; key: string; vote: Vote; waiters: Array<() => void> }
  | { kind: 'log'; key: 'log'; entries: ChoiceInput[]; waiters: Array<() => void> }
  | { kind: 'op'; key: null; run: () => Promise<void>; waiters: Array<() => void> };

interface Hooks { onFail(): void; onClear(): void }

/**
 * Wraps a Store so writes never run in parallel. Saves for one person and votes for one fork
 * coalesce into the latest value, so a failed save is never replayed over a newer one.
 */
export class WriteQueue {
  readonly store: Store;
  private queue: Job[] = [];
  private running = false;
  private current: Promise<boolean> = Promise.resolve(true);
  private dirty = false;
  // What was last stored, so each save is logged as the choices it adds. Seeded once from the base store.
  private known = new Map<Person, Response>();
  private lastVote = new Map<string, 'a' | 'b'>();

  constructor(private base: Store, private hooks: Hooks) {
    void base.load().then(s => {
      for (const r of Object.values(s.responses)) if (r && !this.known.has(r.name)) this.known.set(r.name, r);
      for (const v of s.votes) if (!this.lastVote.has(`${v.forkId}:${v.name}`)) this.lastVote.set(`${v.forkId}:${v.name}`, v.choice);
    }).catch(() => undefined);
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
      setSuggestionStatus: (id, st) => this.add({ kind: 'op', key: null, run: () => base.setSuggestionStatus(id, st), waiters: [] }),
      logChoice: c => this.logAll([c]),
      loadLog: () => base.loadLog(),
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

  /**
   * Queues log writes into the one shared log job, so failed entries wait together and a retry costs one
   * request. Each entry is dropped once written, so a retry never repeats one.
   */
  private logAll(todo: ChoiceInput[]): Promise<void> {
    if (todo.length === 0) return Promise.resolve();
    return this.add({ kind: 'log', key: 'log', entries: [...todo], waiters: [] });
  }

  private add(job: Job): Promise<void> {
    const done = new Promise<void>(res => job.waiters.push(res));
    const same = job.key === null ? undefined : this.queue.find(j => j.key === job.key);
    if (same) merge(same, job); else this.queue.push(job);
    void this.flush();
    return done;
  }

  private exec(j: Job): Promise<void> {
    if (j.kind === 'resp') return this.base.saveResponse(j.name, j.patch);
    if (j.kind === 'vote') return this.base.vote(j.vote);
    if (j.kind === 'log') return this.writeLog(j.entries);
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
        try {
          await this.exec(job);
        } catch {
          failed.push(job);
        }
        job.waiters.splice(0).forEach(w => w());
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
  } else if (into.kind === 'vote' && from.kind === 'vote' && !intoIsNewer) {
    into.vote = from.vote;
  } else if (into.kind === 'log' && from.kind === 'log') {
    into.entries = intoIsNewer ? [...from.entries, ...into.entries] : [...into.entries, ...from.entries];
  }
  into.waiters.push(...from.waiters);
}
