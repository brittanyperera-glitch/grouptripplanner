import type { Release } from '../lib/release';

// A made-up example trip for the guest demo, built from the example crew's picks in seed.ts. It must never be copied from
// src/content/release.json: a public visitor sees this, never the real group's route.
export const GUEST_RELEASE: Release = {
  days: 9,
  pace: 1,
  items: ['sigiriya', 'dambulla', 'tooth', 'tea', 'train', 'ellarock', 'ninearch', 'galle', 'surf', 'hiriketiya', 'kottu', 'coconut'],
  ruledOut: [],
};
