import { createContext, useContext } from 'react';

// Lets the group plan jump to the Stays tab without owning the tab state.
export const StaysNav = createContext<(() => void) | null>(null);
export const useOpenStays = () => useContext(StaysNav);
