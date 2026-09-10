import { describe, expect, it } from "vitest";
import { needsProfileBootstrap } from "../src/lib/profile-bootstrap";
import type { AcademyUser } from "../src/lib/types";

const completeStudent: AcademyUser = {
  id: "student",
  name: "Student",
  email: "student@example.com",
  role: "Student",
  enrolledClassId: "system-dev",
  membershipPlan: "Free",
  phoneNumber: "+2348012345678",
  enrolledAt: "2026-01-01T00:00:00.000Z",
};

describe("profile bootstrap", () => {
  it("bootstraps missing and partial student profiles", () => {
    expect(needsProfileBootstrap(null)).toBe(true);
    expect(
      needsProfileBootstrap({ ...completeStudent, phoneNumber: undefined }),
    ).toBe(true);
    expect(
      needsProfileBootstrap({
        ...completeStudent,
        enrolledClassId: undefined,
      } as unknown as AcademyUser),
    ).toBe(true);
  });

  it("does not bootstrap complete students or staff", () => {
    expect(needsProfileBootstrap(completeStudent)).toBe(false);
    expect(
      needsProfileBootstrap({
        ...completeStudent,
        role: "Admin",
        phoneNumber: undefined,
      }),
    ).toBe(false);
  });
});
