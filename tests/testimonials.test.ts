import { describe, expect, it } from "vitest";
import { STUDENT_STORIES } from "../src/components/public-site";

describe("Student Testimonials & Outcomes (P1)", () => {
  it("provides comprehensive testimonial records across all 3 tracks", () => {
    expect(STUDENT_STORIES.length).toBeGreaterThanOrEqual(3);

    const tracks = STUDENT_STORIES.map((s) => s.track);
    expect(tracks).toContain("Systems & Development");
    expect(tracks).toContain("Creative Media Studio");
    expect(tracks).toContain("Business Growth & Wealth");
  });

  it("contains complete student profile, rating, and tangible outcome proof", () => {
    for (const story of STUDENT_STORIES) {
      expect(story.id).toBeTruthy();
      expect(story.name.trim().length).toBeGreaterThan(3);
      expect(story.role.trim().length).toBeGreaterThan(3);
      expect(story.initials.length).toBe(2);
      expect(story.outcome.trim().length).toBeGreaterThan(5);
      expect(story.quote.trim().length).toBeGreaterThan(30);
      expect(story.rating).toBe(5);
      expect(story.trackColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(story.trackBg).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
