import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStore } from '../store/local';
import Raw from './Raw';

beforeEach(() => { localStorage.clear(); window.location.hash = ''; });

describe('Raw choice history page', () => {
  it('renders nothing without the right secret', async () => {
    const store = new LocalStore();
    await store.logChoice({ name: 'Alex', kind: 'days', ref: null, value: { days: 9, flex: false } });
    window.location.hash = '#/raw-wrong';
    const { container } = render(<Raw store={store} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows one table per friend and a CSV button with the right secret', async () => {
    const store = new LocalStore();
    await store.logChoice({ name: 'Alex', kind: 'days', ref: null, value: { days: 9, flex: false } });
    window.location.hash = '#/raw-tp-raw-local';
    render(<Raw store={store} />);
    expect(await screen.findByText('9 days')).toBeInTheDocument();
    expect(screen.getAllByRole('table')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeInTheDocument();
  });
});
