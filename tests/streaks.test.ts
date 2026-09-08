import { describe, expect, it } from "vitest";
import { calculateStreak } from "../src/lib/streaks";

const timeZone = "America/Vancouver";
// 11:30 PM on Tuesday, 8 September in the student's timezone.
const now = "2026-09-09T06:30:00.000Z";
const calculate = (dates: string[]) =>
  calculateStreak(dates, { timeZone, now });

describe("student learning streaks", () => {
  it("returns currentStreak 1 if active today only", () => {
    expect(calculate(["2026-09-08T18:00:00.000Z"]).currentStreak).toBe(1);
  });

  it("returns currentStreak 3 for today, yesterday, and two days ago", () => {
    expect(
      calculate([
        "2026-09-08T18:00:00.000Z",
        "2026-09-07T18:00:00.000Z",
        "2026-09-06T18:00:00.000Z",
      ]).currentStreak,
    ).toBe(3);
  });

  it("keeps a two-day streak alive when last active yesterday", () => {
    expect(
      calculate([
        "2026-09-07T18:00:00.000Z",
        "2026-09-06T18:00:00.000Z",
      ]).currentStreak,
    ).toBe(2);
  });

  it("resets currentStreak when the last activity was at least two days ago", () => {
    expect(calculate(["2026-09-06T18:00:00.000Z"]).currentStreak).toBe(0);
  });

  it("does not double-count lessons completed on the same local date", () => {
    const result = calculate([
      "2026-09-08T08:00:00.000Z",
      "2026-09-08T18:00:00.000Z",
      "2026-09-09T05:00:00.000Z",
    ]);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
  });

  it("populates the current week from Monday through Sunday", () => {
    const result = calculate([
      "2026-09-07T18:00:00.000Z",
      "2026-09-08T18:00:00.000Z",
    ]);
    expect(result.week).toHaveLength(7);
    expect(result.week.map((item) => item.day)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(result.week.map((item) => item.date)).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
    expect(result.week.map((item) => item.active)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("calculates the longest historical streak across gaps", () => {
    const result = calculate([
      "2026-08-20T18:00:00.000Z",
      "2026-08-21T18:00:00.000Z",
      "2026-08-22T18:00:00.000Z",
      "2026-08-23T18:00:00.000Z",
      "2026-08-27T18:00:00.000Z",
      "2026-08-28T18:00:00.000Z",
      "2026-09-08T18:00:00.000Z",
    ]);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(4);
  });

  it("uses the student's timezone at the UTC date boundary", () => {
    const result = calculateStreak(["2026-09-09T05:45:00.000Z"], {
      timeZone: "America/Vancouver",
      now: "2026-09-09T06:30:00.000Z",
    });
    expect(result.week.find((item) => item.date === "2026-09-08")?.active).toBe(
      true,
    );
    expect(result.currentStreak).toBe(1);
  });
});
