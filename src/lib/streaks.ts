export type WeekActivity = {
  date: string;
  day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  active: boolean;
};

export type StreakSummary = {
  currentStreak: number;
  longestStreak: number;
  week: WeekActivity[];
};

export type StreakOptions = {
  timeZone: string;
  now?: Date | string;
};

const DAY_NAMES: WeekActivity["day"][] = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

function calendarDateKey(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function calendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function shiftDate(value: string, days: number) {
  const date = calendarDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Calculates learning streaks using the student's calendar timezone.
 * A streak remains current until the end of the day after the last activity.
 */
export function calculateStreak(
  completedAt: readonly (Date | string)[],
  { timeZone, now = new Date() }: StreakOptions,
): StreakSummary {
  const currentTime = now instanceof Date ? new Date(now) : new Date(now);
  if (Number.isNaN(currentTime.valueOf())) throw new RangeError("Invalid current date.");

  // Formatting once validates the supplied IANA timezone as well as producing today.
  const today = calendarDateKey(currentTime, timeZone);
  const activityDays = new Set<string>();
  for (const value of completedAt) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.valueOf())) continue;
    const key = calendarDateKey(date, timeZone);
    if (key <= today) activityDays.add(key);
  }

  const yesterday = shiftDate(today, -1);
  let cursor = activityDays.has(today)
    ? today
    : activityDays.has(yesterday)
      ? yesterday
      : null;
  let currentStreak = 0;
  while (cursor && activityDays.has(cursor)) {
    currentStreak += 1;
    cursor = shiftDate(cursor, -1);
  }

  const orderedDays = [...activityDays].sort();
  let longestStreak = 0;
  let run = 0;
  let previous: string | undefined;
  for (const day of orderedDays) {
    run = previous && shiftDate(previous, 1) === day ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previous = day;
  }

  const weekday = calendarDate(today).getUTCDay();
  const monday = shiftDate(today, -((weekday + 6) % 7));
  const week = DAY_NAMES.map((day, index) => {
    const date = shiftDate(monday, index);
    return { date, day, active: activityDays.has(date) };
  });

  return { currentStreak, longestStreak, week };
}
