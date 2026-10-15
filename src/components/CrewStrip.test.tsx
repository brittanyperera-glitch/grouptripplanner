import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PEOPLE } from '../types';
import CrewStrip from './CrewStrip';

describe('crew strip', () => {
  it('shows the five selfies, each named', () => {
    render(<CrewStrip />);
    expect(screen.getByRole('list', { name: 'The crew' })).toBeInTheDocument();
    const imgs = screen.getAllByRole('img');
    expect(imgs.map(i => i.getAttribute('src'))).toEqual(PEOPLE.map(p => `/img/players/${p.toLowerCase()}-selfie.png`));
    for (const p of PEOPLE) expect(screen.getByText(p)).toBeInTheDocument();
  });
});
