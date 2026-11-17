import { describe, expect, it } from 'vitest';
import { andList as fromDayParts } from '../screens/dayParts';
import { andList as fromStayflow } from './stayflow';
import { andList } from './text';

describe('andList', () => {
  it('joins with commas and a last "and", and leaves one or none alone', () => {
    expect(andList([])).toBe('');
    expect(andList(['Ella'])).toBe('Ella');
    expect(andList(['Alex', 'Saulie'])).toBe('Alex and Saulie');
    expect(andList(['Ella', 'Kandy and Knuckles', 'Colombo'])).toBe('Ella, Kandy and Knuckles and Colombo');
  });
  it('is the one helper the other modules re-export', () => {
    expect(fromStayflow).toBe(andList);
    expect(fromDayParts).toBe(andList);
  });
});
