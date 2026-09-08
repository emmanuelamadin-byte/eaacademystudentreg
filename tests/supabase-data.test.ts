import { describe, expect, it } from "vitest";
import {
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
