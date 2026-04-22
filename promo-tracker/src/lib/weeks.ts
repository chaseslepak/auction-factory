import {
  differenceInCalendarDays,
  eachWeekOfInterval,
  endOfISOWeek,
  getISOWeek,
  getISOWeekYear,
  max as dateMax,
  min as dateMin,
  parseISO,
  startOfISOWeek,
  format
} from "date-fns";

export interface WeekSlice {
  isoYear: number;
  isoWeek: number;
  weekStart: string;  // YYYY-MM-DD (Monday)
  daysInPromo: number;
}

/**
 * Split a promo date range into ISO weeks (Mon-Sun) with the number of days the
 * promo overlaps each week. Used to allocate expected lift across weeks for ops.
 */
export function sliceIntoIsoWeeks(startDate: string, endDate: string): WeekSlice[] {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (end < start) return [];
  const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
  return weeks.map((weekMonday) => {
    const weekStart = startOfISOWeek(weekMonday);
    const weekEnd = endOfISOWeek(weekMonday);
    const overlapStart = dateMax([start, weekStart]);
    const overlapEnd = dateMin([end, weekEnd]);
    const daysInPromo = differenceInCalendarDays(overlapEnd, overlapStart) + 1;
    return {
      isoYear: getISOWeekYear(weekStart),
      isoWeek: getISOWeek(weekStart),
      weekStart: format(weekStart, "yyyy-MM-dd"),
      daysInPromo
    };
  });
}

/** Allocate a total in proportion to daysInPromo across weeks, rounding last to exact. */
export function allocateByDays(total: number, slices: WeekSlice[]): number[] {
  const totalDays = slices.reduce((s, w) => s + w.daysInPromo, 0);
  if (totalDays <= 0) return slices.map(() => 0);
  const raw = slices.map((w) => (total * w.daysInPromo) / totalDays);
  const rounded = raw.map(Math.round);
  const diff = total - rounded.reduce((s, n) => s + n, 0);
  if (rounded.length > 0) rounded[rounded.length - 1] += diff;
  return rounded;
}
