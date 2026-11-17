/** "A, B and C". Area names can hold "and" themselves, so a comma list reads clearer than "A and B and C". */
export const andList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs.join(''));
