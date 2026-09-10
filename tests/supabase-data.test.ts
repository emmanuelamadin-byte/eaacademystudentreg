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

  it("protects digital product download files from client-side browser selections", () => {
    const shopSelection = clientSelectionFor("shopItems");
    expect(shopSelection).not.toContain("*");
    expect(shopSelection).toContain("title");
    expect(shopSelection).toContain("slug");
    expect(shopSelection).toContain("price");
    expect(shopSelection).not.toContain("file_url");
  });
});

describe("Shop Supabase collection mapping & field normalization", () => {
  it("maps shop collections to their corresponding database tables and primary keys", () => {
    expect(collectionSpec("shopItems")).toEqual({
      table: "shop_items",
      primary: ["id"],
    });
    expect(collectionSpec("shopPurchases")).toEqual({
      table: "shop_purchases",
      primary: ["id"],
    });
    expect(collectionSpec("shopCourseProgress")).toEqual({
      table: "shop_course_progress",
      primary: ["id"],
    });
    expect(collectionSpec("shopCertificates")).toEqual({
      table: "shop_certificates",
      primary: ["id"],
    });
  });

  it("normalizes Postgres numeric strings to JavaScript numbers for shop items and purchases", () => {
    const item = rowFromDatabase("shopItems", {
      id: "course-123",
      title: "AI Masterclass",
      price: "15000.00",
      compare_at_price: "25000.00",
      sales_count: "42",
      thumbnail_url: "https://example.com/thumb.jpg",
    });
    expect(item.price).toBe(15000);
    expect(item.compareAtPrice).toBe(25000);
    expect(item.salesCount).toBe(42);
    expect(item.thumbnailUrl).toBe("https://example.com/thumb.jpg");

    const purchase = rowFromDatabase("shopPurchases", {
      id: "std_item_1",
      amount: "15000.00",
      student_id: "00000000-0000-0000-0000-000000000000",
      payment_reference: "ref_123",
    });
    expect(purchase.amount).toBe(15000);
    expect(purchase.paymentReference).toBe("ref_123");
  });
});

