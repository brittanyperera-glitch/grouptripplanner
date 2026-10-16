// Split from walkthrough.ts because that imports JSON, which the Node-run e2e specs cannot load.
export const WALKTHROUGH_KEY = 'tp:walkthrough-day';

/** Local calendar date, YYYY-MM-DD (not UTC, so late evening does not roll to tomorrow). */
export const todayKey = (now: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};
