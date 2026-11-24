import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HqStanding } from './MissionHQ';

const crew = { percent: 40, people: [{ name: 'Alex' as const, done: 1, total: 2 }] };

afterEach(cleanup);

// Kept from the deleted MissionHQ screen's tests: the To do tab's own tests never mount a trip with no start date.
describe('HqStanding', () => {
  it('with no start date says so and shows no countdown digits', () => {
    render(<HqStanding start={null} crew={crew} />);
    expect(screen.getByText('Launch date not set')).toBeInTheDocument();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(document.body.textContent).not.toMatch(/T-\d+d/);
    expect(screen.getByRole('img', { name: 'Crew readiness 40 percent' })).toBeInTheDocument();
  });

  it('with a start date shows the countdown', () => {
    render(<HqStanding start="2099-03-01" crew={crew} />);
    expect(screen.getByRole('timer')).toHaveTextContent(/^T-\d+d \d\d:\d\d:\d\d$/);
    expect(screen.queryByText('Launch date not set')).toBeNull();
  });
});
