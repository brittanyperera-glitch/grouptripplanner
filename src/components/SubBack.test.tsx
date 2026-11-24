import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SubBack from './SubBack';

describe('SubBack', () => {
  it('shows the label after the arrow', () => {
    render(<SubBack label="To do" onClick={() => {}} />);
    expect(screen.getByRole('button', { name: '‹ To do' })).toBeTruthy();
  });

  it('calls onClick once per click', () => {
    const onClick = vi.fn();
    render(<SubBack label="Route" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
