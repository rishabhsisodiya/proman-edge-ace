import { BUSINESS_HOURS } from './sla-policy.constants';

/**
 * Adds `hours` of business time (08:00-18:00 IST, Mon-Sat) to `from`.
 * Holiday-list exclusion is a documented TODO (FSD §14.3) — not in MVP.
 */
export function addBusinessHours(from: Date, hours: number): Date {
  const { start, end, workDays } = BUSINESS_HOURS;
  const cursor = new Date(from);
  let remaining = hours;

  // Clamp starting point into the business window
  if (cursor.getHours() < start) cursor.setHours(start, 0, 0, 0);
  if (cursor.getHours() >= end) {
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(start, 0, 0, 0);
  }

  while (remaining > 0) {
    if (!workDays.includes(cursor.getDay())) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(start, 0, 0, 0);
      continue;
    }
    const hoursLeftToday = end - cursor.getHours();
    const step = Math.min(remaining, hoursLeftToday);
    cursor.setHours(cursor.getHours() + step);
    remaining -= step;

    if (remaining > 0) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(start, 0, 0, 0);
    }
  }
  return cursor;
}
