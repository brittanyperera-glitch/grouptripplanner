import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Guide from './Guide';

// Brittany 2026-10-15: names of things in the guide's lists are bold; the explanation in brackets is not.
describe('Guide list names', () => {
  it('bolds the name before the bracket, and a whole item with no bracket', () => {
    render(<Guide />);
    fireEvent.click(screen.getByRole('button', { name: 'Food' }));
    const food = screen.getByRole('region', { name: 'Food' });
    const bold = within(food).getAllByText((_, el) => el?.tagName === 'B').map(b => b.textContent);
    expect(bold).toContain('Elawolu roti');
    expect(bold).toContain('Beetroot curry');
    expect(bold.some(t => t?.includes('('))).toBe(false);
    expect(within(food).getByText((_, el) => el?.tagName === 'LI' && el.textContent === 'Elawolu roti (roti parcels of flavoured potato and veggies)')).toBeInTheDocument();
  });
});
