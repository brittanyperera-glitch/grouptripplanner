import { fireEvent, screen } from '@testing-library/react';

/** Opens the header Menu (Change days or pace, Not you?, Start over) unless it is already open. */
export function openMenu(): void {
  const menu = screen.getByRole('button', { name: 'Menu' });
  if (menu.getAttribute('aria-expanded') !== 'true') fireEvent.click(menu);
}
