import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLandingDocument,
  type LandingPageRecord,
} from "../src/lib/landing-pages";
import type { AcademyUser, ShopItem } from "../src/lib/types";

const state = vi.hoisted(() => ({
  table: {} as Record<string, ReturnType<typeof vi.fn>>,
  read: null as unknown,
  written: null as unknown,
  writing: false,
  productPublished: true,
}));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/commerce-flags", () => ({
  landingPagesEnabled: true,
  purchaseFirstEnabled: true,
}));
vi.mock("../src/server/supabase", () => ({
  adminClient: () => ({ from: () => state.table }),
  limit: vi.fn(),
  db: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists: true,
          data: () => ({
            published: state.productPublished,
            slug: "photo-guide",
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("../src/server/academy", () => ({
  getPublicShopItem: vi
    .fn()
    .mockResolvedValue({ id: "guide", title: "Guide", published: true }),
}));
vi.mock("../src/server/ai", () => ({ generateLandingCopy: vi.fn() }));
vi.mock("../src/server/bunny", () => ({
  cleanBunnyUrl: (url: string) => url,
  signBunnyEmbedUrl: (url: string) => url,
}));
import {
  getPublicLandingPage,
  landingAdmin,
} from "../src/server/landing-pages";

const admin: AcademyUser = {
  id: "admin",
  role: "Admin",
  email: "emmanuelamadin@gmail.com",
  name: "Admin",
  enrolledClassId: "system-dev",
  membershipPlan: "Free",
  enrolledAt: "2026-11-14",
};
const item: ShopItem = {
  id: "guide",
  slug: "photo-guide",
  type: "digital_product",
  title: "Guide",
  subtitle: "A useful guide",
  description: "Description",
  price: 7500,
  category: "Creative",
  tags: [],
  thumbnailUrl: "",
  whatYouWillLearn: [],
  published: true,
  createdAt: "2026-11-14",
  updatedAt: "2026-11-14",
};
const pageId = "33333333-3333-4333-8333-333333333333";
let record: LandingPageRecord;
beforeEach(() => {
  const draft = createLandingDocument(item, "product");
  const published = structuredClone(draft);
  published.sections[0].heading = "Published headline";
  draft.sections[0].heading = "Private draft headline";
  record = {
    id: pageId,
    item_id: item.id,
    name: "Campaign",
    slug: "campaign",
    draft,
    published,
    published_at: "2026-11-14",
    updated_at: "2026-11-14",
    version: 4,
  };
  state.read = record;
  state.written = record;
  state.writing = false;
  state.productPublished = true;
  const table: typeof state.table = {};
  for (const key of ["select", "eq", "not", "order"])
    table[key] = vi.fn(() => table);
  table.update = vi.fn(() => {
    state.writing = true;
    return table;
  });
  table.single = vi.fn(async () => ({ data: state.read, error: null }));
  table.maybeSingle = vi.fn(async () => ({
    data: state.writing ? state.written : state.read,
    error: null,
  }));
  state.table = table;
});

describe("landing-page publication boundaries", () => {
  it("rejects non-admin draft access before consulting the database", async () => {
    await expect(
      landingAdmin({ ...admin, role: "Student" }, "landing.admin.list", {
        itemId: item.id,
      }),
    ).rejects.toThrow(/administrator/);
    expect(state.table.select).not.toHaveBeenCalled();
  });
  it("saving a draft never writes the published snapshot, even if the caller supplies one", async () => {
    await landingAdmin(admin, "landing.admin.save", {
      id: pageId,
      itemId: item.id,
      name: record.name,
      slug: record.slug,
      version: 4,
      document: record.draft,
      published: record.draft,
    });
    const update = state.table.update.mock.calls[0][0];
    expect(update.draft.sections[0].heading).toBe("Private draft headline");
    expect(update).not.toHaveProperty("published");
    expect(update).not.toHaveProperty("published_at");
  });
  it("rejects stale publication and incomplete or unavailable offers", async () => {
    state.written = null;
    await expect(
      landingAdmin(admin, "landing.admin.publish", { id: pageId, version: 3 }),
    ).rejects.toThrow(/changed/);
    expect(state.table.eq).toHaveBeenCalledWith("version", 3);
    state.table.update.mockClear();
    record.draft.sections[0].heading = "";
    await expect(
      landingAdmin(admin, "landing.admin.publish", { id: pageId, version: 4 }),
    ).rejects.toThrow(/headline/);
    expect(state.table.update).not.toHaveBeenCalled();
    record.draft.sections[0].heading = "Complete headline";
    state.productPublished = false;
    await expect(
      landingAdmin(admin, "landing.admin.publish", { id: pageId, version: 4 }),
    ).rejects.toThrow(/Publish the store product/);
  });
  it("keeps previously published links stable and preserves their history when unpublishing", async () => {
    await expect(
      landingAdmin(admin, "landing.admin.save", {
        id: pageId,
        itemId: item.id,
        name: record.name,
        slug: "changed-link",
        version: 4,
        document: record.draft,
      }),
    ).rejects.toThrow(/original link/);
    await landingAdmin(admin, "landing.admin.unpublish", {
      id: pageId,
      version: 4,
    });
    expect(state.table.update.mock.calls[0][0]).toMatchObject({
      published: null,
    });
    expect(state.table.update.mock.calls[0][0]).not.toHaveProperty(
      "published_at",
    );
  });
  it("public rendering selects the published projection and never returns the draft or buyer content", async () => {
    const page = await getPublicLandingPage("campaign");
    expect(state.table.select).toHaveBeenCalledWith(
      "id,item_id,slug,published,published_at",
    );
    expect(page.document.sections[0].heading).toBe("Published headline");
    expect(JSON.stringify(page)).not.toContain("Private draft headline");
    expect(page).not.toHaveProperty("draft");
    expect(page.item).not.toHaveProperty("fileUrl");
  });
});
