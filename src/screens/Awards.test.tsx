import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import copy from '../content/awards.json';
import type { Award } from '../lib/awards';
import Awards from './Awards';

const awards: Award[] = [
  { id: 'most-enthusiastic', winners: ['Brittany'], value: 3, unit: 'Keens' },
  { id: 'poseidon', winners: ['Alex', 'Saulie'], value: 2, unit: 'sea picks' },
];
const c = copy as Record<string, { title: string; line: string }>;

describe('Awards screen', () => {
  it('renders a card per award with title, winner names and the filled line', () => {
    render(<Awards awards={awards} onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByText(c['most-enthusiastic'].title)).toBeInTheDocument();
    expect(screen.getByText(c.poseidon.title)).toBeInTheDocument();
    expect(screen.getByText('Brittany')).toBeInTheDocument();
    expect(screen.getByText('Alex and Saulie')).toBeInTheDocument();
    expect(screen.getByText(c.poseidon.line.replace('{value}', '2').replace('{unit}', 'sea picks'))).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\{value\}|\{unit\}/);
  });
  it('Close and Escape call onClose', () => {
    const onClose = vi.fn();
    render(<Awards awards={awards} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
