import { beforeEach, describe, expect, it } from 'vitest';
import { MUTE_KEY } from '../components/sound';
import { EPOCH_KEY } from '../store/fresh';
import { clearStaleTp, restoreTp, snapshotTp } from './deviceState';

const dump = () => Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)]));
beforeEach(() => localStorage.clear());

describe('deviceState', () => {
  it('snapshot then restore returns storage to the snapshot, trip key untouched', () => {
    localStorage.setItem('tp-trip-key', 'secret');
    localStorage.setItem('tp:a', '1');
    localStorage.setItem('tp:b', '2');
    const snap = snapshotTp();
    expect(snap).toEqual({ 'tp:a': '1', 'tp:b': '2' });
    localStorage.setItem('tp:a', 'changed');
    localStorage.removeItem('tp:b');
    localStorage.setItem('tp:c', '3');
    restoreTp(snap);
    expect(dump()).toEqual({ 'tp-trip-key': 'secret', 'tp:a': '1', 'tp:b': '2' });
  });

  it('clearStaleTp keeps mute and epoch keys and the trip key', () => {
    localStorage.setItem('tp-trip-key', 'secret');
    localStorage.setItem(MUTE_KEY, '1');
    localStorage.setItem(EPOCH_KEY, 'e');
    localStorage.setItem('tp:name', 'x');
    clearStaleTp();
    expect(dump()).toEqual({ 'tp-trip-key': 'secret', [MUTE_KEY]: '1', [EPOCH_KEY]: 'e' });
  });
});
