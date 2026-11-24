import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PasswordGate from './PasswordGate';

afterEach(cleanup);

// Audit finding 16: the trip password screen had no way back to the landing screen.
describe('PasswordGate Back', () => {
  it('offers Back when it has somewhere to go, and goes there', () => {
    const onBack = vi.fn();
    render(<PasswordGate onAccept={() => {}} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
  it('has no Back without one', () => {
    render(<PasswordGate onAccept={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });
});
