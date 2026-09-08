export type Birthday = { month: number; day: number };

export function localDateParts(timeZone: string, now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const hourParts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(hourParts.find((part) => part.type === "hour")?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour,
  };
}

export function isBirthdayToday(
  birthday: Birthday | undefined,
  timeZone: string,
  now: Date = new Date(),
) {
  if (!birthday) return false;
  const today = localDateParts(timeZone, now);
  return birthday.month === today.month && birthday.day === today.day;
}

export function formatBirthday(birthday: Birthday) {
  return new Intl.DateTimeFormat("en-NG", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
  }).format(new Date(Date.UTC(2000, birthday.month - 1, birthday.day)));
}
