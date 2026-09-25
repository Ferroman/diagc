/** Calendar dates in the model are `YYYY-MM-DD` strings: readable in a diff,
 * sortable as text, and free of the timezone a `Date` would smuggle in. Parsed
 * as UTC so "2026-02-30" is caught by the round trip (Date.parse would roll it
 * to March 2nd) rather than accepted. Shared by comments (`at`) today and by the
 * plan notation's zones and events next. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_DAY.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}
