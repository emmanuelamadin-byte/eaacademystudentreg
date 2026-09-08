import { describe, expect, it } from "vitest";
import {
  formatBirthday,
  isBirthdayToday,
  localDateParts,
} from "../src/lib/birthdays";

describe("birthday helpers", () => {
  const instant = new Date("2026-04-12T23:30:00.000Z");

  it("checks birthdays in the student's timezone", () => {
    expect(
      isBirthdayToday({ month: 4, day: 13 }, "Africa/Lagos", instant),
    ).toBe(true);
    expect(
      isBirthdayToday({ month: 4, day: 12 }, "America/New_York", instant),
    ).toBe(true);
  });

  it("returns stable local date parts", () => {
    expect(localDateParts("Africa/Lagos", instant)).toEqual({
      year: 2026,
      month: 4,
      day: 13,
      hour: 0,
    });
  });

  it("formats month and day without a year", () => {
    expect(formatBirthday({ month: 2, day: 29 })).toBe("29 February");
  });
});
