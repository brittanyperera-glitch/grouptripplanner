import { createContext, useContext } from 'react';

// Lets the plan views open the Trip admin page without owning the overlay state.
export const AdminNav = createContext<(() => void) | null>(null);
export const useOpenAdmin = () => useContext(AdminNav);
