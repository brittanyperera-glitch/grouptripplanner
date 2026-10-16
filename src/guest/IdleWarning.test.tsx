import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IdleWarning } from './IdleWarning';

describe('IdleWarning', () => {
  it('renders both buttons and each calls its prop', async () => {
    const onStay = vi.fn(), onFinish = vi.fn();
    render(<IdleWarning onStay={onStay} onFinish={onFinish} />);
    expect(screen.getByRole('alertdialog', { name: 'Still there?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: "I'm still here" }));
    expect(onStay).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Finish now' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
