// Rupees per pound: mid-market, late July / early August 2026 quotes clustered at 450 to 452
// (pluang.com, currencyconvert.online). Approximate on purpose: the app says "about".
export const LKR_PER_GBP = 450;

const pounds = (lkr) => {
  const v = lkr / LKR_PER_GBP;
  if (v >= 10) return String(Math.round(v));
  const r = Math.max(0.5, Math.round(v * 2) / 2);
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
};
const num = (s) => Number(s.replace(/,/g, ''));

/** "LKR 1,500-2,500" -> "LKR 1,500-2,500 (~£3.50-5.50)"; amounts under £1 read "(under £1)". */
export function withGbp(fee) {
  return fee.replace(/LKR (\d{1,3}(?:,\d{3})*)(?:-(\d{1,3}(?:,\d{3})*))?(\+)?/g, (m, a, b) => {
    const lo = num(a), hi = b ? num(b) : null;
    if ((hi ?? lo) / LKR_PER_GBP < 1) return `${m} (under £1)`;
    return `${m} (~£${pounds(lo)}${hi ? `-${pounds(hi)}` : ''})`;
  });
}
