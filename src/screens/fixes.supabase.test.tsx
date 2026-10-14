import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocalStore } from '../store/local';
import { AppProvider } from '../state';
import Waiting from './Waiting';

vi.mock('../store', async orig => ({ ...(await orig<typeof import('../store')>()), isLocal: false }));

describe('demo votes button', () => {
  it('is never rendered when the store is not local', async () => {
    render(<AppProvider store={new LocalStore()}><Waiting /></AppProvider>);
    await screen.findByText(/of 5 done/);
    expect(screen.queryByRole('button', { name: /sample votes/ })).toBeNull();
  });
});
