import { describe, expect, it } from "vitest";
import {
  clientSelectionFor,
  collectionSpec,
  documentFilters,
  rowFromDatabase,
} from "../src/lib/supabase-data";

describe("Supabase singleton settings mapping", () => {
  it("maps the application document names to the boolean singleton key", () => {
    expect(collectionSpec("settings", "public").table).toBe(
      "platform_settings",
    );
    expect(collectionSpec("settings", "community").table).toBe(
      "community_settings",
    );
    expect(documentFilters("settings", "public")).toEqual({ id: true });
    expect(documentFilters("settings", "community")).toEqual({ id: true });
  });

  it("normalizes nullable settings and Postgres numeric strings", () => {
    expect(
      rowFromDatabase("settings", {
        id: true,
        announcement: null,
        scholarship_goal: "0.00",
        scholarship_cost: "3000.00",
      }),
    ).toMatchObject({
      announcement: undefined,
      scholarshipGoal: 0,
      scholarshipCost: 3000,
    });
  });
});

describe("Supabase browser selections", () => {
  it("requests only granted lesson metadata from public roles", () => {
    const lessonSelection = clientSelectionFor("lessons");
    expect(lessonSelection).not.toContain("*");
    expect(lessonSelection).toContain("title");
    expect(lessonSelection).not.toContain("video_url");
    expect(lessonSelection).not.toContain("content");
    expect(lessonSelection).not.toContain("solution_code");
  });

  it("does not expand protected lesson fields in module queries", () => {
    const moduleSelection = clientSelectionFor("modules");
    expect(moduleSelection).toContain("lessons(id,module_id,track_id,title");
    expect(moduleSelection).not.toContain("lessons(*)");
    expect(moduleSelection).not.toContain("video_url");
  });
});
