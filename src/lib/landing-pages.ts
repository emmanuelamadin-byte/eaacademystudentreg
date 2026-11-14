import { z } from "zod";
import type { ShopItem } from "./types";

export const landingSectionTypes = [
  "hero",
  "benefits",
  "audience",
  "contents",
  "creator",
  "testimonials",
  "bonuses",
  "offer",
  "faq",
  "closing",
] as const;
export const landingTemplates = {
  course: "Course Sales",
  video: "Video Sales",
  product: "Digital Product Showcase",
} as const;

// Only public images and approved video embeds are rendered; never raw HTML.
const media = z
  .string()
  .trim()
  .max(2000)
  .default("")
  .refine((value) => {
    if (!value) return true;
    if (/^\/(?!\/)[a-zA-Z0-9/_-]+\.(png|jpe?g|webp)$/i.test(value)) return true;
    if (/^\/api\/upload\?path=uploads%2F/i.test(value)) return true;
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Use an HTTPS media URL or an uploaded image.");
export const landingSectionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  type: z.enum(landingSectionTypes),
  visible: z.boolean().default(true),
  heading: z.string().trim().max(250).default(""),
  body: z.string().trim().max(6000).default(""),
  imageUrl: media,
  videoUrl: media,
  items: z
    .array(
      z.object({
        title: z.string().trim().max(250),
        text: z.string().trim().max(2000).default(""),
      }),
    )
    .max(30)
    .default([]),
});
export const landingDocumentSchema = z
  .object({
    template: z.enum(["course", "video", "product"]),
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#002751"),
    buttonLabel: z.string().trim().min(1).max(60),
    seoTitle: z.string().trim().max(180).default(""),
    seoDescription: z.string().trim().max(300).default(""),
    socialImage: media,
    sections: z.array(landingSectionSchema).min(2).max(25),
  })
  .superRefine((value, context) => {
    const ids = value.sections.map((section) => section.id);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        message: "Section identifiers must be unique.",
      });
    for (const type of ["hero", "offer"] as const) {
      if (
        value.sections.filter((s) => s.type === type).length !== 1 ||
        !value.sections.find((s) => s.type === type)?.visible
      )
        context.addIssue({
          code: "custom",
          message: `Keep exactly one visible ${type} section.`,
        });
    }
  });
export type LandingDocument = z.infer<typeof landingDocumentSchema>;
export type LandingSection = z.infer<typeof landingSectionSchema>;
export type LandingPageRecord = {
  id: string;
  item_id: string;
  name: string;
  slug: string;
  draft: LandingDocument;
  published: LandingDocument | null;
  published_at: string | null;
  version: number;
  updated_at: string;
};
export type CampaignMetrics = {
  visits: number;
  clicks: number;
  checkouts: number;
  payments: number;
  accessed: number;
  revenue: number;
  receiptFailures: number;
  unclaimed: number;
};
export function newLandingSection(
  type: LandingSection["type"],
  id: string,
): LandingSection {
  const headings: Record<LandingSection["type"], string> = {
    hero: "",
    benefits: "What you’ll be able to do",
    audience: "Made for you",
    contents: "What’s included",
    creator: "Meet your creator",
    testimonials: "What learners say",
    bonuses: "Included bonuses",
    offer: "Make your next move",
    faq: "Your questions, answered",
    closing: "Ready to get started?",
  };
  return {
    id,
    type,
    visible: true,
    heading: headings[type],
    body: "",
    imageUrl: "",
    videoUrl: "",
    items: [],
  };
}
export function createLandingDocument(
  item: ShopItem,
  template: LandingDocument["template"],
): LandingDocument {
  const types: LandingSection["type"][] =
    template === "product"
      ? [
          "hero",
          "contents",
          "benefits",
          "audience",
          "creator",
          "offer",
          "faq",
          "closing",
        ]
      : [
          "hero",
          "benefits",
          "audience",
          "contents",
          "creator",
          "offer",
          "faq",
          "closing",
        ];
  const sections = types.map((type) => newLandingSection(type, type));
  Object.assign(sections[0], {
    heading: item.title,
    body: item.subtitle,
    imageUrl: item.thumbnailUrl || "",
    videoUrl: item.previewVideoUrl || "",
  });
  const benefits = sections.find((s) => s.type === "benefits")!;
  benefits.items = item.whatYouWillLearn.map((title) => ({ title, text: "" }));
  sections.find((s) => s.type === "audience")!.items = (
    item.targetAudience || []
  ).map((title) => ({ title, text: "" }));
  Object.assign(
    sections.find((s) => s.type === "creator")!,
    { heading: "Learn with EA Academy", body: "", visible: false },
  );
  sections.find((s) => s.type === "offer")!.body = item.description;
  sections.find((s) => s.type === "faq")!.visible = false;
  return {
    template,
    accent: "#002751",
    buttonLabel:
      item.type === "course" ? "Get this course" : "Get instant access",
    seoTitle: item.title,
    seoDescription: item.subtitle,
    socialImage: item.thumbnailUrl || "",
    sections,
  };
}
export function validateLandingPublication(document: LandingDocument) {
  landingDocumentSchema.parse(document);
  if (!document.sections.find((s) => s.type === "hero")?.heading.trim())
    throw new Error("Add a headline before publishing.");
  for (const section of document.sections.filter((s) => s.visible)) {
    if (
      ["testimonials", "bonuses", "faq"].includes(section.type) &&
      !section.items.length
    )
      throw new Error(`Add content to ${section.type} or hide the section.`);
    if (
      section.items.some(
        (entry) =>
          !entry.title.trim() ||
          (["testimonials", "faq"].includes(section.type) &&
            !entry.text.trim()),
      )
    )
      throw new Error(
        `Complete the entries in ${section.type} before publishing.`,
      );
  }
}

export function normalizePurchaseEmail(value: string) {
  // Do not strip dots or plus-addressing: the verified Google email must match.
  return value.trim().toLowerCase();
}

export function landingButtonColors(accent: string) {
  const channels = [1, 3, 5].map(
    (start) => parseInt(accent.slice(start, start + 2), 16) / 255,
  );
  const luminance = channels.reduce(
    (sum, channel, i) =>
      sum +
      (channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4) *
        [0.2126, 0.7152, 0.0722][i],
    0,
  );
  if (1.05 / (luminance + 0.05) >= 4.5)
    return { background: accent, text: "#ffffff" };
  // For light accents use deep charcoal; in the small mid-tone contrast gap,
  // darken the button slightly so white labels remain readable.
  if ((luminance + 0.05) / 0.056 >= 4.5)
    return { background: accent, text: "#101419" };
  const darker = `#${channels
    .map((channel) =>
      Math.round(channel * 204)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
  return { background: darker, text: "#ffffff" };
}
