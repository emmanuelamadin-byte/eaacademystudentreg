import { describe, expect, it } from "vitest";
import {
  createLandingDocument,
  landingDocumentSchema,
  normalizePurchaseEmail,
  validateLandingPublication,
  landingButtonColors,
} from "../src/lib/landing-pages";
import type { ShopItem } from "../src/lib/types";
import { rowFromDatabase } from "../src/lib/supabase-data";
import { buildUnifiedRevenueLedger } from "../src/lib/revenue";

export const product: ShopItem = {
  id: "photo-guide",
  type: "digital_product",
  title: "Product photography field guide",
  slug: "photo-guide",
  subtitle: "Plan and shoot your first product collection.",
  description: "A practical guide.",
  price: 7500,
  thumbnailUrl: "",
  category: "Creative",
  tags: [],
  published: true,
  whatYouWillLearn: ["Build a shot list"],
  includes: ["Photography handbook"],
  createdAt: "2026-11-14T08:00:00Z",
  updatedAt: "2026-11-14T08:00:00Z",
  fileUrl: "/api/upload?path=paid-secret.pdf",
};
describe("landing page documents", () => {
  it("keeps button labels readable with light and dark theme colors", () => {
    expect(landingButtonColors("#002751").text).toBe("#ffffff");
    expect(landingButtonColors("#ffffff").text).toBe("#101419");
  });
  it("seeds useful content without embedding prices or paid download URLs", () => {
    const document = createLandingDocument(product, "product");
    expect(landingDocumentSchema.safeParse(document).success).toBe(true);
    expect(document.sections[0].heading).toBe(product.title);
    expect(JSON.stringify(document)).not.toContain(product.fileUrl);
    expect(JSON.stringify(document)).not.toContain("7500");
    expect(() => validateLandingPublication(document)).not.toThrow();
  });
  it("requires a headline and one visible hero and offer", () => {
    const document = createLandingDocument(product, "product");
    document.sections[0].heading = "";
    expect(() => validateLandingPublication(document)).toThrow(/headline/);
    document.sections[0].visible = false;
    expect(landingDocumentSchema.safeParse(document).success).toBe(false);
  });
  it("rejects script URLs, invalid colors, duplicate section IDs, and empty proof sections", () => {
    const document = createLandingDocument(product, "product");
    expect(
      landingDocumentSchema.safeParse({
        ...document,
        accent: "red;display:none",
      }).success,
    ).toBe(false);
    expect(
      landingDocumentSchema.safeParse({
        ...document,
        socialImage: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      landingDocumentSchema.safeParse({
        ...document,
        sections: [...document.sections, document.sections[1]],
      }).success,
    ).toBe(false);
    document.sections.push({
      id: "proof",
      type: "testimonials",
      visible: true,
      heading: "Proof",
      body: "",
      imageUrl: "",
      videoUrl: "",
      items: [],
    });
    expect(() => validateLandingPublication(document)).toThrow(/testimonials/);
  });
  it("normalizes case and whitespace without treating different Google addresses as equal", () => {
    expect(normalizePurchaseEmail("  Creator@Gmail.com ")).toBe(
      "creator@gmail.com",
    );
    expect(normalizePurchaseEmail("creator+shop@gmail.com")).not.toBe(
      normalizePurchaseEmail("creator@gmail.com"),
    );
  });
});
describe("purchase-only data and reporting", () => {
  it("keeps an unassigned primary track explicit and maps purchase-only state", () => {
    expect(
      rowFromDatabase("users", {
        id: "buyer",
        primary_track: null,
        enrollment_status: "purchase_only",
      }),
    ).toMatchObject({
      enrolledClassId: null,
      enrollmentStatus: "purchase_only",
    });
  });
  it("counts unclaimed digital purchases in revenue and deduplicates claimed entitlements", () => {
    const payment = {
      id: "ref",
      reference: "ref",
      kind: "shop_item" as const,
      status: "success",
      amount: 7500,
      createdAt: product.createdAt,
      itemId: product.id,
      itemTitle: product.title,
      itemType: product.type,
      buyerName: "Buyer",
      buyerEmail: "buyer@gmail.com",
    };
    const ledger = buildUnifiedRevenueLedger({ payments: [payment] });
    expect(ledger[0]).toMatchObject({
      stream: "digital_product",
      customerEmail: "buyer@gmail.com",
      amount: 7500,
    });
    const claimed = buildUnifiedRevenueLedger({
      payments: [{ ...payment, studentId: "buyer" }],
      shopPurchases: [
        {
          id: "buyer_photo-guide",
          studentId: "buyer",
          studentEmail: "buyer@gmail.com",
          studentName: "Buyer",
          itemId: product.id,
          itemTitle: product.title,
          itemSlug: product.slug,
          itemType: product.type,
          amount: 7500,
          paymentReference: "ref",
          purchasedAt: product.createdAt,
        },
      ],
    });
    expect(claimed).toHaveLength(1);
    expect(claimed[0].amount).toBe(7500);
  });
});
