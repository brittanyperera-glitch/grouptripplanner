import { createContext, useContext } from 'react';

// Lets the waiting screen jump to the Guide tab without owning the tab state.
export const GuideNav = createContext<(() => void) | null>(null);
export const useOpenGuide = () => useContext(GuideNav);
