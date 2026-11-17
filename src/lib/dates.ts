// Dates in this app are 'YYYY-MM-DD' strings read as UTC midnight, so the formatter must also be UTC.
export const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const WEEKDAY_DAY_MONTH = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
