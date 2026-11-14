import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AcademyUser } from "../src/lib/types";
const state = vi.hoisted(() => ({ user: {} as AcademyUser }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/library",
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("../src/components/academy-provider", () => ({
  useAcademy: () => ({
    user: state.user,
    authUser: { id: "buyer" },
    loading: false,
    configured: true,
    error: null,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));
vi.mock("../src/lib/hooks", () => ({
  useRecords: () => ({ data: [], loading: false, error: null }),
  useOnline: () => true,
}));
import { AppShell } from "../src/components/app-shell";
beforeEach(() => {
  state.user = {
    id: "buyer",
    name: "Buyer",
    email: "buyer@example.com",
    role: "Student",
    enrollmentStatus: "purchase_only",
    enrolledClassId: null,
    membershipPlan: "Free",
    enrolledAt: "2026-11-14",
  };
});
describe("paid buyer navigation", () => {
  it("renders paid content and offers library/account navigation without academy onboarding", () => {
    const html = renderToStaticMarkup(
      createElement(AppShell, null, createElement("p", null, "Purchased content")),
    );
    expect(html).toContain("Purchased content");
    const mobile =
      html.match(/<nav class="mobile-bottom-nav"[\s\S]*?<\/nav>/)?.[0] || "";
    expect(mobile).toContain('href="/app/library"');
    expect(mobile).toContain('href="/app/account"');
    expect(mobile).not.toContain('href="/app/classes"');
    expect(mobile).not.toContain('href="/app/dashboard"');
    expect(mobile).toContain('href="/signup?enroll=1"');
  });
  it("preserves normal academy navigation for enrolled learners", () => {
    state.user = {
      ...state.user,
      enrollmentStatus: "enrolled",
      enrolledClassId: "creative-media",
      phoneNumber: "+2348012345678",
    };
    const html = renderToStaticMarkup(
      createElement(AppShell, null, null),
    );
    const mobile =
      html.match(/<nav class="mobile-bottom-nav"[\s\S]*?<\/nav>/)?.[0] || "";
    expect(mobile).toContain('href="/app/classes"');
    expect(mobile).toContain('href="/app/dashboard"');
  });
});
