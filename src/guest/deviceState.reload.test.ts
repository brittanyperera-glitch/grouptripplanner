import { beforeEach, describe, expect, it } from 'vitest';
import { beginGuest, endGuest, GUEST_SNAP_KEY, recoverGuestOnBoot } from './deviceState';

const REAL = { 'tp:me': 'Alex', 'tp:resp:Alex': '{"days":9}', 'tp:howto-seen': '1' };
const preset = () => { localStorage.clear(); for (const [k, v] of Object.entries(REAL)) localStorage.setItem(k, v); localStorage.setItem('tp-trip-key', 'secret'); };
const tp = () => Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('tp:')).map(k => [k, localStorage.getItem(k)]));

beforeEach(preset);

describe('guest sandbox survives a reload or a closed tab', () => {
  it('a reload mid-guest does not overwrite the saved real keys', () => {
    beginGuest();
    expect(tp()['tp:me']).toBeUndefined();
    localStorage.setItem('tp:howto-seen', 'guest');
    beginGuest(); // the page reloads at #/guest: no unmount ran
    endGuest();
    expect(tp()).toEqual(REAL);
    expect(localStorage.getItem(GUEST_SNAP_KEY)).toBeNull();
  });
  it('a closed tab mid-guest is repaired on the next normal start', () => {
    beginGuest();
    localStorage.setItem('tp:me', 'Aunty');
    recoverGuestOnBoot('');
    expect(tp()).toEqual(REAL);
    expect(localStorage.getItem('tp-trip-key')).toBe('secret');
  });
  it('a start at #/guest leaves a saved snapshot alone for GuestRoot to use', () => {
    beginGuest();
    recoverGuestOnBoot('#/guest');
    expect(localStorage.getItem(GUEST_SNAP_KEY)).not.toBeNull();
    expect(tp()['tp:me']).toBeUndefined();
  });
  it('a normal start with no snapshot changes nothing', () => {
    recoverGuestOnBoot('');
    expect(tp()).toEqual(REAL);
  });
});
