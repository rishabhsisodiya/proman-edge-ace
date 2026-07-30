import { BUSINESS_HOURS } from './sla-policy.constants';

/** "YYYY-MM-DD" from local date components — matches HolidayService's dateKey(). */
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Adds `hours` of business time (08:00-18:00 IST, Mon-Sat) to `from`, skipping
 * any date present in `holidayDates` (FSD §14.3 — "public holidays excluded")
 * exactly like it already skips weekly off-days. Callers load the current
 * holiday set once per calculation via HolidayService.listDateSet().
 */
export function addBusinessHours(from: Date, hours: number, holidayDates?: Set<string>): Date {
  const { start, end, workDays } = BUSINESS_HOURS;
  const cursor = new Date(from);
  let remaining = hours;
  const isHoliday = (d: Date) => holidayDates?.has(localDateKey(d)) ?? false;

  // Clamp starting point into the business window
  if (cursor.getHours() < start) cursor.setHours(start, 0, 0, 0);
  if (cursor.getHours() >= end) {
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(start, 0, 0, 0);
  }

  while (remaining > 0) {
    if (!workDays.includes(cursor.getDay()) || isHoliday(cursor)) {
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
