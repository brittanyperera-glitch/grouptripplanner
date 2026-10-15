import { useEffect, useMemo, useState } from 'react';
import { liveItems } from '../state';
import { getStore } from '../store';
import { choicesToCsv, describeChoice, itemNamer } from '../store/choices';
import { PEOPLE } from '../types';
import type { ChoiceEntry, Item, Store } from '../types';
import './Raw.css';

const SECRET = (import.meta.env.VITE_RAW_KEY as string | undefined) || 'tp-raw-local';

/** True for `#/raw-<secret>` and nothing else. */
export const isRawHash = (hash: string, secret = SECRET) => hash === `#/raw-${secret}`;
export const wantsRaw = (hash: string) => hash.startsWith('#/raw-');

const stamp = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' });
};

function RawTables({ store }: { store?: Store }) {
  const [data, setData] = useState<{ log: ChoiceEntry[]; items: Item[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const s = store ?? getStore();
    Promise.all([s.loadLog(), s.load()])
      .then(([log, state]) => setData({ log, items: liveItems(state) }))
      .catch(() => setFailed(true));
  }, [store]);
  const nameOf = useMemo(() => itemNamer(data?.items ?? []), [data]);

  const download = () => {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([choicesToCsv(data.log, nameOf)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trip-choices.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="raw">
      <header>
        <h1>Every choice, as it was made</h1>
        <button onClick={download} disabled={!data}>Download CSV</button>
      </header>
      {failed && <p>Could not load the log.</p>}
      {!data && !failed && <p>Loading</p>}
      {data && PEOPLE.map(p => {
        const rows = data.log.filter(e => e.name === p).sort((a, b) => a.at.localeCompare(b.at));
        return (
          <section key={p}>
            <h2>{p} <span>{rows.length}</span></h2>
            <table aria-label={p}>
              <thead><tr><th>Time</th><th>What</th><th>Place</th><th>Choice</th></tr></thead>
              <tbody>
                {rows.map(e => {
                  const d = describeChoice(e, nameOf);
                  return <tr key={e.id}><td>{stamp(d.time)}</td><td>{d.what}</td><td>{d.place}</td><td>{d.choice}</td></tr>;
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </main>
  );
}

/** The hidden page: renders nothing unless the hash carries the secret. */
export default function Raw({ store }: { store?: Store }) {
  if (!isRawHash(window.location.hash)) return null;
  return <RawTables store={store} />;
}
