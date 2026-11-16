import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stayCtx } from '../lib/stayflow';
import { AppProvider } from '../state';
import { LocalStore } from '../store/local';
import type { AppState, Plan, PlaceSuggestion } from '../types';
import StayVote from './StayVote';

const day = (n: number) => ({ n, area: 'Ella' as const, entries: [], spare: 0, rainSlack: false });
const plan: Plan = { route: ['AIR'], areas: ['Ella'], chosen: [], dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0, days: [day(1), day(2)] };
const place = (id: string): PlaceSuggestion => ({ id, name: 'Alex', area: 'Ella', kind: 'stay', title: `Stay ${id}`, status: 'live', createdAt: `2026-10-1${id.slice(-1)}` });
const state = (fallen: { id: string; area: 'Ella'; at: string }[]): AppState => ({
  responses: {}, suggestions: [], votes: [],
  stays: { crew: {}, suggestions: ['a1', 'a2', 'a3'].map(place), admin: { pins: [], scouts: {}, closed: [], fallen } },
});

afterEach(() => cleanup());

describe('the head to head page when a stay has fallen through', () => {
  it('names the area as being replaced, with no vote and no empty-page message', async () => {
    const ctx = stayCtx(state([{ id: 'a1', area: 'Ella', at: '2026-11-01T10:00' }]), 'Alex', plan);
    render(<AppProvider store={new LocalStore()}><StayVote ctx={ctx} onBack={() => {}} /></AppProvider>);
    expect(await screen.findByText('Ella: Brittany is finding a replacement')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Stay vote: Ella' })).toBeNull();
    expect(screen.queryByText(/Nothing/i)).toBeNull();
  });
});
