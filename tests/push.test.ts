import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AcademyUser } from "../src/lib/types";

const mockTokens = new Map<string, Record<string, unknown>>();

vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async () => ({ statusCode: 201 })),
  },
}));

vi.mock("../src/server/supabase", () => {
  const adminClient = () => ({
    from: (table: string) => {
      if (table === "push_tokens") {
        return {
          upsert: async (row: Record<string, unknown>) => {
            mockTokens.set(String(row.token_hash), row);
            return { error: null };
          },
          delete: () => ({
            eq: (col1: string, val1: string) => ({
              eq: (col2: string, val2: string) => {
                if (col1 === "token_hash" && col2 === "student_id") {
                  const existing = mockTokens.get(val1);
                  if (existing && existing.student_id === val2) {
                    mockTokens.delete(val1);
                  }
                }
                return Promise.resolve({ error: null });
              },
            }),
            in: async (col: string, vals: string[]) => {
              if (col === "token_hash") {
                vals.forEach((v) => mockTokens.delete(v));
              }
              return { error: null };
            },
          }),
          select: () => {
            const rows = Array.from(mockTokens.values());
            const queryObj: Record<string, unknown> = {
              eq: (col: string, val: string) => {
                const filtered = rows.filter((r) => r[col] === val);
                return Promise.resolve({ data: filtered, error: null });
              },
              then: (resolve: (val: { data: unknown[]; error: null }) => void) =>
                Promise.resolve({ data: rows, error: null }).then(resolve),
            };
            return queryObj;
          },
        };
      }
      return {
        select: () => Promise.resolve({ data: [], error: null }),
      };
    },
  });

  return {
    adminClient,
    db: () => ({}),
  };
});

import {
  hashEndpoint,
  savePushToken,
  removePushToken,
  sendPushToAudience,
} from "../src/server/push";
import webpush from "web-push";

const mockUser: AcademyUser = {
  id: "student-123",
  name: "Student",
  email: "student@example.com",
  role: "Student",
  enrolledClassId: "system-dev",
  membershipPlan: "Free",
  enrolledAt: "2026-01-01",
};

const mockSubscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/sample-token-123",
  keys: {
    p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9t0A3qcVIi61m13N_P8q4eQ",
    auth: "tBHItJI5svbpez7KI4CCXg",
  },
};

describe("Native Push Notifications", () => {
  beforeEach(() => {
    mockTokens.clear();
    vi.clearAllMocks();
  });

  it("hashes endpoints consistently", () => {
    const hash1 = hashEndpoint(mockSubscription.endpoint);
    const hash2 = hashEndpoint(mockSubscription.endpoint);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex string
  });

  it("saves valid push subscription tokens for a student", async () => {
    const res = await savePushToken(mockUser, mockSubscription);
    expect(res.success).toBe(true);

    const tokenHash = hashEndpoint(mockSubscription.endpoint);
    expect(mockTokens.has(tokenHash)).toBe(true);
    expect(mockTokens.get(tokenHash)).toMatchObject({
      student_id: mockUser.id,
      track_id: "system-dev",
    });
  });

  it("rejects subscriptions with missing endpoint or keys", async () => {
    // @ts-expect-error test invalid payload
    await expect(savePushToken(mockUser, { endpoint: "" })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("removes push token when student unsubscribes", async () => {
    await savePushToken(mockUser, mockSubscription);
    const tokenHash = hashEndpoint(mockSubscription.endpoint);
    expect(mockTokens.has(tokenHash)).toBe(true);

    await removePushToken(mockUser, mockSubscription.endpoint);
    expect(mockTokens.has(tokenHash)).toBe(false);
  });

  it("sends push notification to audience and cleans up expired tokens", async () => {
    await savePushToken(mockUser, mockSubscription);

    // Mock sendNotification success
    const result = await sendPushToAudience("all", undefined, {
      title: "New Announcement",
      message: "Check out the new design challenge!",
      url: "/app/dashboard",
    });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);

    // Now test token cleanup when push service returns 410 Gone (expired)
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce({
      statusCode: 410,
      message: "Subscription expired",
    });

    const failResult = await sendPushToAudience("all", undefined, {
      title: "Another Announcement",
      message: "Expired test",
    });

    expect(failResult.sent).toBe(0);
    expect(failResult.failed).toBe(1);
    // Token should have been pruned
    const tokenHash = hashEndpoint(mockSubscription.endpoint);
    expect(mockTokens.has(tokenHash)).toBe(false);
  });
});
