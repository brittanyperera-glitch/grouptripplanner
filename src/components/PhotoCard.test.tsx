import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Item } from '../types';
import { Cover, creditName } from './PhotoCard';

const item: Item = { id: 'a', name: 'Alpha', area: 'Colombo', about: '', hours: 1, slot: 'morning', fee: 'free', sideTrip: 0, photo: 'a', credit: 'Adam Jones from Kelowna, BC, Canada, CC BY-SA 2.0' };

describe('photo credit', () => {
  it('prints nothing over the photo by default, only a small i button', () => {
    render(<Cover item={item} className="photo" named={false} credit />);
    expect(screen.queryByText(/Adam Jones/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Photo credit' })).toBeInTheDocument();
  });

  it('tapping i shows the photographer only, tapping outside closes it', () => {
    render(<Cover item={item} className="photo" named={false} credit />);
    fireEvent.click(screen.getByRole('button', { name: 'Photo credit' }));
    const pop = screen.getByRole('status');
    expect(pop.textContent).toBe('Photo: Adam Jones from Kelowna, BC, Canada');
    expect(pop.textContent).not.toMatch(/CC BY/);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('no i button when the photo has no credit or credit is not requested', () => {
    const { rerender } = render(<Cover item={{ ...item, credit: undefined }} className="photo" credit />);
    expect(screen.queryByRole('button', { name: 'Photo credit' })).toBeNull();
    rerender(<Cover item={item} className="th" />);
    expect(screen.queryByRole('button', { name: 'Photo credit' })).toBeNull();
  });

  it('creditName drops trailing licence notes', () => {
    expect(creditName('Bergentroll, CC0')).toBe('Bergentroll');
    expect(creditName('A.Savin, FAL')).toBe('A.Savin');
    expect(creditName('Pol van den Scheetek…, CC BY 3.0')).toBe('Pol van den Scheetek…');
    expect(creditName('Vis M, private-use only (Unsplash licence / Wikimedia Commons; licence not checked per Brittany)')).toBe('Vis M');
    expect(creditName('Some Person')).toBe('Some Person');
  });
});
