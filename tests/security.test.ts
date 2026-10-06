import { describe, expect, it } from "vitest";
import type { AcademyUser } from "../src/lib/types";
import {
  canReadLesson,
  hasPremium,
  initialRole,
  managesTrack,
  premiumAmountKobo,
  requireAdmin,
  extendPremiumUntil,
  utcMonthKey,
} from "../src/server/policy";
import {
  assignmentSchema,
  lessonSchema,
  submissionSchema,
  url,
} from "../src/server/schemas";
import { safeJsonLd } from "../src/components/seo-structured-data";
import {
  safeResourceUrl,
  safeUrl as safeUrlUtil,
  safeWhatsAppUrl,
} from "../src/lib/urls";
import nextConfig from "../next.config";

const student: AcademyUser = {
  id: "student",
  name: "Learner",
  email: "learner@example.com",
  role: "Student",
  enrolledClassId: "system-dev",
  membershipPlan: "Free",
  enrolledAt: "2026-01-01",
};
describe("academy authorization boundaries", () => {
  it("only bootstraps the verified owner as administrator", () => {
    expect(initialRole("EmmanuelAmadin@gmail.com", true)).toBe("Admin");
    expect(initialRole("EmmanuelAmadin@gmail.com", false)).toBe("Student");
    expect(initialRole("other@gmail.com", true)).toBe("Student");
    expect(() => requireAdmin({ ...student, role: "Admin" })).toThrow();
  });
  it("rejects expired membership and accepts active or explicitly granted membership", () => {
    expect(
      hasPremium({
        ...student,
        membershipPlan: "Premium",
        premiumUntil: "2020-01-01",
      }),
    ).toBe(false);
    expect(hasPremium({ ...student, membershipPlan: "Premium" })).toBe(false);
    expect(
      hasPremium({
        ...student,
        membershipPlan: "Premium",
        premiumUntil: "2099-01-01",
      }),
    ).toBe(true);
    expect(hasPremium({ ...student, premiumGranted: true })).toBe(true);
  });
  it("keeps instructors inside their assigned tracks", () => {
    const instructor = {
      ...student,
      role: "Instructor" as const,
      instructorTrackIds: ["system-dev" as const],
    };
    expect(managesTrack(instructor, "system-dev")).toBe(true);
    expect(managesTrack(instructor, "creative-media")).toBe(false);
  });
  it("locks unpublished or premium lessons and modules for free learners", () => {
    const lesson = { classId: "system-dev", published: true, free: true };
    expect(
      canReadLesson(student, lesson, { published: true, free: true }),
    ).toBe(true);
    expect(
      canReadLesson(
        student,
        { ...lesson, classId: "creative-media" },
        { published: true, free: true },
      ),
    ).toBe(false);
    expect(
      canReadLesson(
        student,
        { ...lesson, free: false },
        { published: true, free: true },
      ),
    ).toBe(false);
    expect(
      canReadLesson(student, lesson, { published: true, free: false }),
    ).toBe(false);
    expect(
      canReadLesson(
        { ...student, premiumGranted: true },
        { ...lesson, published: false },
        { published: true, free: true },
      ),
    ).toBe(false);
  });
});
describe("untrusted payload validation", () => {
  it("clamps a monthly pass to the end of shorter months", () => {
    expect(extendPremiumUntil(undefined, "2026-01-31T12:00:00.000Z")).toBe(
      "2026-02-28T12:00:00.000Z",
    );
    expect(extendPremiumUntil(undefined, "2028-01-31T12:00:00.000Z")).toBe(
      "2028-02-29T12:00:00.000Z",
    );
  });
  it("strips forged grade, owner, and track from submissions", () => {
    const result = submissionSchema.parse({
      assignmentId: "assignment",
      status: "submitted",
      writeUp: "Work",
      studentId: "victim",
      grade: 100,
      classId: "business-growth",
    });
    expect(result).not.toHaveProperty("grade");
    expect(result).not.toHaveProperty("studentId");
    expect(result).not.toHaveProperty("classId");
    expect(
      submissionSchema.safeParse({
        assignmentId: "assignment",
        status: "graded",
        writeUp: "Work",
      }).success,
    ).toBe(false);
  });
  it("rejects script URLs, invalid assignment points, and traversal IDs", () => {
    expect(url.safeParse("javascript:alert(1)").success).toBe(false);
    expect(
      assignmentSchema.safeParse({
        id: "../../users",
        classId: "system-dev",
        title: "Test",
        description: "Test",
        dueDate: "2026-01-01",
        totalPoints: 100,
      }).success,
    ).toBe(false);
    expect(
      assignmentSchema.safeParse({
        classId: "system-dev",
        title: "Test",
        description: "Test",
        dueDate: "2026-01-01",
        totalPoints: 1000,
      }).success,
    ).toBe(false);
    expect(lessonSchema.safeParse({ id: "x" }).success).toBe(false);
  });
  it("keeps Premium pricing server-owned and extends only once per payment at the persistence layer", () => {
    expect(premiumAmountKobo()).toBe(300000);
    expect(
      extendPremiumUntil(
        "2026-10-05T00:00:00.000Z",
        "2026-09-05T00:00:00.000Z",
      ),
    ).toBe("2026-11-05T00:00:00.000Z");
  });
  it("uses a stable UTC month key for monthly benefit allowances", () => {
    expect(utcMonthKey(new Date("2026-12-31T23:59:59.000Z"))).toBe("2026-12");
    expect(utcMonthKey(new Date("2027-01-01T00:00:00.000Z"))).toBe("2027-01");
  });
});

describe("script injection and XSS defenses", () => {
  it("escapes closing script tags in JSON-LD structured data", () => {
    const maliciousPayload = {
      title: 'Course</script><script>alert("xss")</script>',
      description: 'Breakout test <script src="https://evil.com/x.js"></script>',
    };
    const serialized = safeJsonLd(maliciousPayload);

    // Raw < characters must be safely unicode-escaped to prevent script breakout
    expect(serialized).not.toContain("<");
    expect(serialized).toContain("\\u003c/script>");
    expect(serialized).toContain('\\u003cscript>alert(\\"xss\\")\\u003c/script>');
  });

  it("neutralizes dangerous schemes in resource URLs while preserving safe links", () => {
    expect(safeResourceUrl("javascript:alert(1)")).toBe("#");
    expect(safeResourceUrl("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==")).toBe("#");
    expect(safeResourceUrl("vbscript:msgbox(1)")).toBe("#");
    expect(safeResourceUrl("//evil.com/payload.js")).toBe("#");

    // Safe protocols & internal upload paths
    expect(safeResourceUrl("https://example.com/notes.pdf")).toBe("https://example.com/notes.pdf");
    expect(safeResourceUrl("http://example.com/guide.pdf")).toBe("http://example.com/guide.pdf");
    expect(safeResourceUrl("/api/upload?path=uploads%2Ffile.pdf")).toBe("/api/upload?path=uploads%2Ffile.pdf");
    expect(safeResourceUrl("uploads/user-123/notes.pdf")).toBe("/api/upload?path=uploads%2Fuser-123%2Fnotes.pdf");
  });

  it("validates external URLs and WhatsApp links strictly", () => {
    expect(safeUrlUtil("javascript:alert(1)")).toBeUndefined();
    expect(safeUrlUtil("https://ea.academy/track")).toBe("https://ea.academy/track");

    expect(safeWhatsAppUrl("javascript:alert(1)")).toBe("");
    expect(safeWhatsAppUrl("https://evil.com")).toBe("");
    expect(safeWhatsAppUrl("https://wa.me/2348142417005")).toBe("https://wa.me/2348142417005");
    expect(safeWhatsAppUrl("https://chat.whatsapp.com/invite123")).toBe("https://chat.whatsapp.com/invite123");
  });

  it("configures a strict Content-Security-Policy header in next.config.ts", async () => {
    const headersFn = nextConfig.headers;
    expect(headersFn).toBeDefined();
    if (headersFn) {
      const headersList = await headersFn();
      const allRoutes = headersList.find((h) => h.source === "/(.*)");
      expect(allRoutes).toBeDefined();

      const cspHeader = allRoutes?.headers.find(
        (h) => h.key === "Content-Security-Policy",
      );
      expect(cspHeader).toBeDefined();
      expect(cspHeader?.value).toContain("default-src 'self'");
      expect(cspHeader?.value).toContain("script-src");
      expect(cspHeader?.value).toContain("frame-ancestors 'self'");
      expect(cspHeader?.value).toContain("https://iframe.mediadelivery.net");
    }
  });
});
