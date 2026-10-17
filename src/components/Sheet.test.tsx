import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Sheet from './Sheet';

afterEach(() => cleanup());

function Host({ onClose = () => undefined }: { onClose?(): void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>opener</button>
      {open && <Sheet title="Add a thing" closeLabel="Cancel" footer={<button>Save</button>} onClose={() => { onClose(); setOpen(false); }}><input aria-label="field" /></Sheet>}
    </>
  );
}

describe('Sheet', () => {
  it('is a modal dialog labelled by its title, with focus moved inside', () => {
    render(<Host />);
    const opener = screen.getByText('opener');
    opener.focus();
    fireEvent.click(opener);
    const dlg = screen.getByRole('dialog', { name: 'Add a thing' });
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(dlg.contains(document.activeElement)).toBe(true);
  });

  it('Esc closes it', () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    screen.getByText('opener').focus();
    fireEvent.click(screen.getByText('opener'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('hands focus back to the opener when it closes', () => {
    render(<Host />);
    const opener = screen.getByText('opener');
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
