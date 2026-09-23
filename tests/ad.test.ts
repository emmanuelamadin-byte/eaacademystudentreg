import { beforeEach, describe, expect, it, vi } from "vitest";
import { videoAdSchema, adServeSchema } from "../src/server/schemas";
import type { AcademyUser, VideoAd } from "../src/lib/types";
import type { AuthToken } from "../src/server/supabase";

const state = vi.hoisted(() => ({
  actor: {} as AcademyUser,
  documents: new Map<string, Record<string, unknown>>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../src/server/ai", () => ({ askAI: vi.fn() }));
vi.mock("../src/server/payments", () => ({
  checkout: vi.fn(),
  verifyPayment: vi.fn(),
  manageSubscription: vi.fn(),
}));

vi.mock("../src/server/supabase", async () => {
  const { ApiError } = await import("../src/server/policy");
  const ref = (path: string) => ({
    path,
    id: path.split("/").pop(),
    get: async () => ({
      id: path.split("/").pop(),
      exists: state.documents.has(path),
      data: () => state.documents.get(path),
    }),
    create: async (data: Record<string, unknown>) => {
      if (state.documents.has(path)) throw new Error("exists");
      state.documents.set(path, data);
    },
    set: async (data: Record<string, unknown>) =>
      state.documents.set(path, data),
    update: async (data: Record<string, unknown>) =>
      state.documents.set(path, { ...state.documents.get(path), ...data }),
    delete: async () => state.documents.delete(path),
  });

  const collection = (
    name: string,
    filters: [string, unknown][] = [],
  ): Record<string, unknown> => ({
    doc: (id = "generated") => ref(`${name}/${id}`),
    where: (field: string, _operator: string, value: unknown) =>
      collection(name, [...filters, [field, value]]),
    get: async () => ({
      docs: [...state.documents.entries()]
        .filter(
          ([path, value]) =>
            path.startsWith(`${name}/`) &&
            filters.every(([field, expected]) => value[field] === expected),
        )
        .map(([path, value]) => ({
          id: path.split("/").pop(),
          exists: true,
          data: () => value,
        })),
    }),
  });

  const store = {
    collection,
  };

  return {
    db: () => store,
    actor: async () => state.actor,
    document: async (name: string, id: string) => {
      const data = state.documents.get(`${name}/${id}`);
      if (!data) throw new ApiError(404, "Not found.");
      return data;
    },
    limit: async () => {},
  };
});
import { dispatch } from "../src/server/academy";

describe("Video Ad Engine", () => {
  const token = {
    claims: { sub: "test-user-id" },
    token: "mock-token",
  } as unknown as AuthToken;

  const adminUser: AcademyUser = {
    id: "admin-1",
    email: "emmanuelamadin@gmail.com",
    name: "Admin User",
    role: "Admin",
    membershipPlan: "Premium",
    enrolledClassId: "system-dev",
    enrolledAt: "2026-01-01T00:00:00.000Z",
  };

  const studentUser: AcademyUser = {
    id: "student-1",
    email: "student@eaacademy.com",
    name: "Free Student",
    role: "Student",
    membershipPlan: "Free",
    enrolledClassId: "creative-media",
    enrolledAt: "2026-01-01T00:00:00.000Z",
  };

  beforeEach(() => {
    state.documents.clear();
    state.actor = studentUser;
  });

  describe("Schema Validation", () => {
    it("validates valid ad payload and applies defaults", () => {
      const parsed = videoAdSchema.parse({
        title: "Master Premiere Pro in 30 Days",
        mediaUrl: "https://example.com/ad-video.mp4",
        ctaText: "Enroll Now",
        destinationUrl: "/shop/premiere-pro",
      });

      expect(parsed.title).toBe("Master Premiere Pro in 30 Days");
      expect(parsed.mediaType).toBe("banner");
      expect(parsed.skipDurationSeconds).toBe(5);
      expect(parsed.priority).toBe("normal");
      expect(parsed.active).toBe(true);
      expect(parsed.targetTracks).toEqual([]);
    });

    it("rejects invalid destination URL", () => {
      expect(() =>
        videoAdSchema.parse({
          title: "Invalid URL Ad",
          mediaUrl: "https://example.com/video.mp4",
          destinationUrl: "http://insecure-link.com",
        }),
      ).toThrow();
    });
  });

  describe("Ad Server Actions & Policy Boundaries", () => {
    it("rejects non-admin from creating or saving an ad", async () => {
      state.actor = studentUser;

      await expect(
        dispatch(token, "ad.admin.save", {
          ad: {
            title: "Student Ad Attempt",
            mediaUrl: "https://example.com/banner.jpg",
            ctaText: "Click",
            destinationUrl: "/app/membership",
          },
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("allows admin to create, list, and delete ads", async () => {
      state.actor = adminUser;

      // 1. Create ad
      const saveRes = (await dispatch(token, "ad.admin.save", {
        ad: {
          title: "Sponsor Camera Gear",
          subtitle: "Get 15% discount with code EA15",
          mediaType: "banner",
          mediaUrl: "https://example.com/camera-banner.jpg",
          ctaText: "Claim Discount",
          destinationUrl: "https://sponsorgear.com/deal",
          priority: "high",
          active: true,
          targetTracks: ["video-editing"],
          skipDurationSeconds: 5,
        },
      })) as { success: boolean; ad: VideoAd };

      expect(saveRes.success).toBe(true);
      expect(saveRes.ad.id).toBeDefined();
      expect(saveRes.ad.title).toBe("Sponsor Camera Gear");

      // 2. List ads
      const listRes = (await dispatch(token, "ad.admin.list", {})) as {
        ads: VideoAd[];
      };
      expect(listRes.ads.length).toBe(1);
      expect(listRes.ads[0].title).toBe("Sponsor Camera Gear");

      // 3. Delete ad
      const delRes = (await dispatch(token, "ad.admin.delete", {
        id: saveRes.ad.id,
      })) as { success: boolean };
      expect(delRes.success).toBe(true);

      const listAfter = (await dispatch(token, "ad.admin.list", {})) as {
        ads: VideoAd[];
      };
      expect(listAfter.ads.length).toBe(0);
    });

    it("exempts staff and active premium members from seeing ads", async () => {

      // Staff (Admin)
      state.actor = adminUser;
      const adminRes = (await dispatch(token, "ad.serve", {
        trackId: "video-editing",
      })) as { hasAd: boolean };
      expect(adminRes.hasAd).toBe(false);

      // Active Premium Student
      state.actor = {
        ...studentUser,
        membershipPlan: "Premium",
        premiumGranted: true,
      };
      const premiumRes = (await dispatch(token, "ad.serve", {
        trackId: "video-editing",
      })) as { hasAd: boolean };
      expect(premiumRes.hasAd).toBe(false);
    });

    it("exempts students who purchased the standalone course", async () => {
      state.actor = studentUser; // Free student

      // Mark course as purchased
      state.documents.set("shopPurchases/student-1_course-123", {
        id: "purchase-1",
        studentId: studentUser.id,
        itemId: "course-123",
      });

      const res = (await dispatch(token, "ad.serve", {
        courseId: "course-123",
      })) as { hasAd: boolean };
      expect(res.hasAd).toBe(false);
    });

    it("serves house fallback ad to free students when no custom ads exist", async () => {
      state.actor = studentUser;

      const res = (await dispatch(token, "ad.serve", {
        trackId: "video-editing",
      })) as { hasAd: boolean; ad: VideoAd };

      expect(res.hasAd).toBe(true);
      expect(res.ad.id).toBe("house-premium");
      expect(res.ad.title).toContain("1-on-1 Mentorship");
      expect(res.ad.destinationUrl).toBe("/app/membership");
      expect(res.ad.skipDurationSeconds).toBe(5);
    });

    it("serves active targeted custom ad and tracks impressions and clicks", async () => {
      state.actor = studentUser;

      // Add custom active ad in DB
      state.documents.set("videoAds/sponsor-deal-1", {
        id: "sponsor-deal-1",
        title: "Exclusive Video Plugins",
        subtitle: "Enhance your timeline",
        mediaType: "video",
        mediaUrl: "https://example.com/ad-clip.mp4",
        ctaText: "Download",
        destinationUrl: "https://plugins.com/ea",
        active: true,
        priority: "high",
        targetTracks: ["video-editing"],
        skipDurationSeconds: 5,
        impressionsCount: 10,
        clicksCount: 2,
      });

      // 1. Serve ad
      const res = (await dispatch(token, "ad.serve", {
        trackId: "video-editing",
      })) as { hasAd: boolean; ad: VideoAd };

      expect(res.hasAd).toBe(true);
      expect(res.ad.id).toBe("sponsor-deal-1");
      expect(res.ad.title).toBe("Exclusive Video Plugins");

      // Verify impression increment
      const updatedAd = state.documents.get("videoAds/sponsor-deal-1");
      expect(updatedAd?.impressionsCount).toBe(11);

      // 2. Track click
      const clickRes = (await dispatch(token, "ad.click", {
        id: "sponsor-deal-1",
      })) as { success: boolean };
      expect(clickRes.success).toBe(true);

      const afterClick = state.documents.get("videoAds/sponsor-deal-1");
      expect(afterClick?.clicksCount).toBe(3);
    });
  });
});
