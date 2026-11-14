"use client";
import { useCallback, useEffect, useState } from "react";
import { api, uploadFile } from "@/lib/api";
import type { ShopItem } from "@/lib/types";
import { landingPagesEnabled } from "@/lib/commerce-flags";
import {
  createLandingDocument,
  landingTemplates,
  landingSectionTypes,
  newLandingSection,
  type LandingPageRecord,
  type LandingDocument,
  type LandingSection,
  type CampaignMetrics,
} from "@/lib/landing-pages";
import { LandingPageView } from "@/components/landing-page-view";

type EditorPage = Omit<LandingPageRecord, "id" | "updated_at"> & {
  id?: string;
  updated_at?: string;
};
const draftSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
const human = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const safeAI = ["hero", "benefits", "audience", "offer", "faq", "closing"];
export function LandingPageStudio({
  itemId,
  onDirtyChange,
}: {
  itemId: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [item, setItem] = useState<ShopItem | null>(null);
  const [pages, setPages] = useState<LandingPageRecord[]>([]);
  const [page, setPage] = useState<EditorPage | null>(null);
  const [selected, setSelected] = useState("hero");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(false);
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);
  const [audience, setAudience] = useState("");
  const [outcome, setOutcome] = useState("");
  const [tone, setTone] = useState("clear");
  const [suggestions, setSuggestions] = useState<LandingSection[] | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [addType, setAddType] = useState<LandingSection["type"]>("benefits");
  const load = useCallback(async () => {
    const [product, records] = await Promise.all([
      api<ShopItem>("shop.admin.get", { id: itemId }),
      api<LandingPageRecord[]>("landing.admin.list", { itemId }),
    ]);
    setItem(product);
    setPages(records);
  }, [itemId]);
  useEffect(() => {
    if (!landingPagesEnabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void load()
      .catch((cause) => {
        if (!cancelled) setError(cause.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  function changed(next: EditorPage) {
    setPage(next);
    setDirty(true);
    setMessage("");
    setSuggestions(null);
  }
  function updateDocument(value: Partial<LandingDocument>) {
    if (page) changed({ ...page, draft: { ...page.draft, ...value } });
  }
  function updateSection(id: string, update: Partial<LandingSection>) {
    if (page)
      updateDocument({
        sections: page.draft.sections.map((s) =>
          s.id === id ? { ...s, ...update } : s,
        ),
      });
  }
  function open(record: EditorPage) {
    if (dirty && !confirm("Discard unsaved changes to this landing page?"))
      return;
    setPage(structuredClone(record));
    setSelected(record.draft.sections[0].id);
    setDirty(false);
    setError("");
    setMessage("");
    setMetrics(null);
    setSuggestions(null);
  }
  function create(template: LandingDocument["template"] = "course") {
    if (!item) return;
    const suffix = crypto.randomUUID().slice(0, 6);
    open({
      item_id: itemId,
      name: `${item.title} campaign`,
      slug: `${draftSlug(item.title) || "offer"}-${suffix}`,
      draft: createLandingDocument(item, template),
      published: null,
      published_at: null,
      version: 1,
    });
  }
  async function save() {
    if (!page) return null;
    const saved = await api<LandingPageRecord>("landing.admin.save", {
      id: page.id,
      itemId,
      name: page.name,
      slug: page.slug,
      document: page.draft,
      version: page.version,
    });
    setPage(saved);
    setDirty(false);
    setPages((rows) => [saved, ...rows.filter((p) => p.id !== saved.id)]);
    return saved;
  }
  async function action(kind: "save" | "publish" | "unpublish" | "metrics") {
    if (!page) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (kind === "metrics") {
        if (!page.id) throw new Error("Save the campaign to view reporting.");
        setMetrics(
          await api<CampaignMetrics>("landing.admin.metrics", { id: page.id }),
        );
        return;
      }
      let saved = page;
      if (kind !== "unpublish") saved = (await save())!;
      if (kind !== "save") {
        if (!saved.id) throw new Error("Save this page first.");
        const updated = await api<LandingPageRecord>(`landing.admin.${kind}`, {
          id: saved.id,
          version: saved.version,
        });
        setPage(updated);
        setDirty(false);
        setPages((rows) => [
          updated,
          ...rows.filter((p) => p.id !== updated.id),
        ]);
      }
      setMessage(
        kind === "save"
          ? "Draft saved. The published page has not changed."
          : kind === "publish"
            ? "Published. Your campaign link is ready to share."
            : "Unpublished. Your draft is saved.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This change could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function generate(sectionType?: string) {
    if (!page) return;
    setAiBusy(true);
    setError("");
    setSuggestions(null);
    try {
      const saved = dirty || !page.id ? await save() : page;
      const result = await api<{ sections: LandingSection[] }>(
        "landing.admin.generate",
        { id: saved!.id, audience, outcome, tone, sectionType },
      );
      setSuggestions(result.sections);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "AI draft could not be created. You can keep editing manually.",
      );
    } finally {
      setAiBusy(false);
    }
  }
  function applySuggestions() {
    if (!page || !suggestions) return;
    const next = [...page.draft.sections];
    for (const suggestion of suggestions) {
      const index = next.findIndex((s) => s.type === suggestion.type);
      if (index >= 0)
        next[index] = {
          ...next[index],
          heading: suggestion.heading,
          body: suggestion.body,
          items: suggestion.items,
        };
      else next.push({ ...suggestion, id: crypto.randomUUID() });
    }
    updateDocument({ sections: next });
    setSuggestions(null);
  }
  function reorder(index: number, direction: number) {
    if (
      !page ||
      index + direction < 0 ||
      index + direction >= page.draft.sections.length
    )
      return;
    const sections = [...page.draft.sections];
    [sections[index], sections[index + direction]] = [
      sections[index + direction],
      sections[index],
    ];
    updateDocument({ sections });
  }
  async function imageUpload(file: File, field: "imageUrl" | "socialImage") {
    if (!file.type.startsWith("image/")) {
      setError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const result = await uploadFile(file);
      if (field === "socialImage") updateDocument({ socialImage: result.url });
      else updateSection(selected, { imageUrl: result.url });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }
  if (!landingPagesEnabled)
    return (
      <div className="landing-studio-note">
        <h3>Landing pages are ready for setup</h3>
        <p>
          Apply the commerce migration and enable the landing-pages feature flag
          to start creating campaigns.
        </p>
      </div>
    );
  if (loading)
    return (
      <div className="commerce-skeleton" role="status">
        Loading your landing-page studio…
      </div>
    );
  const section = page?.draft.sections.find((s) => s.id === selected);
  const locked = busy || aiBusy || uploading;
  return (
    <section className="landing-studio">
      <div className="landing-studio-heading">
        <div>
          <p className="offer-eyebrow">LANDING PAGE STUDIO</p>
          <h2>Your product. A better first impression.</h2>
          <p>
            Create a focused page for every audience, with the same product and
            store price.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!item || locked}
          onClick={() =>
            create(item?.type === "digital_product" ? "product" : "course")
          }
        >
          + Create landing page
        </button>
      </div>
      {error && (
        <p className="commerce-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="commerce-success" role="status">
          {message}
        </p>
      )}
      <div className="landing-campaign-list">
        {pages.map((record) => (
          <button
            type="button"
            key={record.id}
            disabled={locked}
            onClick={() => open(record)}
            className={page?.id === record.id ? "selected" : ""}
          >
            <strong>{record.name}</strong>
            <span>
              {record.published ? "Published" : "Draft"} · /offer/{record.slug}
            </span>
          </button>
        ))}
      </div>
      {!page && (
        <div className="landing-empty">
          <span className="landing-empty-line" />
          <h3>A page built around the reason people buy.</h3>
          <p>
            Choose a template, tell your product’s story, and share a dedicated
            campaign link.
          </p>
          <div className="landing-template-options">
            {Object.entries(landingTemplates).map(([key, label]) => (
              <button
                type="button"
                key={key}
                disabled={!item}
                onClick={() => create(key as LandingDocument["template"])}
              >
                <span>{label}</span>
                <small>
                  {key === "video"
                    ? "Let your preview lead the story"
                    : key === "product"
                      ? "Showcase the resource and what’s inside"
                      : "Lead with outcomes and your curriculum"}
                </small>
              </button>
            ))}
          </div>
          {error && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setError("");
                void load().catch((cause) => setError(cause.message));
              }}
            >
              Try loading again
            </button>
          )}
        </div>
      )}
      {page && item && (
        <>
          <div className="landing-editor-toolbar">
            <span className="studio-status-pill">
              {page.published ? "Live page + editable draft" : "Draft"}
              {dirty ? " · Unsaved changes" : ""}
            </span>
            <div>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                disabled={locked}
                onClick={() => {
                  open({
                    ...structuredClone(page),
                    id: undefined,
                    name: `${page.name} copy`,
                    slug: `${page.slug.slice(0, 100)}-${crypto.randomUUID().slice(0, 6)}`,
                    published: null,
                    published_at: null,
                    version: 1,
                  });
                }}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                disabled={locked || !page.id}
                onClick={() => void action("metrics")}
              >
                View reporting
              </button>
              {page.published && (
                <>
                  <a
                    className="btn btn-secondary btn-small"
                    href={`/offer/${page.slug}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open live page ↗
                  </a>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    disabled={locked || dirty}
                    onClick={() => void action("unpublish")}
                  >
                    Unpublish
                  </button>
                </>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-small"
                disabled={locked}
                onClick={() => void action("save")}
              >
                {busy ? "Saving…" : "Save draft"}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-small"
                disabled={locked}
                onClick={() => void action("publish")}
              >
                {page.published ? "Publish changes" : "Publish page"}
              </button>
            </div>
          </div>
          {metrics && (
            <div className="landing-metrics">
              <div>
                <span>Visits</span>
                <strong>{metrics.visits}</strong>
              </div>
              <div>
                <span>Purchase clicks</span>
                <strong>{metrics.clicks}</strong>
              </div>
              <div>
                <span>Checkouts</span>
                <strong>{metrics.checkouts}</strong>
              </div>
              <div>
                <span>Payments</span>
                <strong>{metrics.payments}</strong>
              </div>
              <div>
                <span>Accessed</span>
                <strong>{metrics.accessed}</strong>
              </div>
              <div>
                <span>Revenue</span>
                <strong>₦{metrics.revenue.toLocaleString("en-NG")}</strong>
              </div>
              <div>
                <span>Conversion</span>
                <strong>
                  {metrics.visits
                    ? ((metrics.payments / metrics.visits) * 100).toFixed(1)
                    : "0"}
                  %
                </strong>
              </div>
              <p>
                {metrics.unclaimed} paid purchases awaiting access ·{" "}
                {metrics.receiptFailures} receipt delivery failures. Visits and
                clicks count once per browser session per campaign; blocked
                tracking can reduce measured visits.
              </p>
            </div>
          )}
          <div className="landing-editor-grid">
            <fieldset className="landing-controls" disabled={locked}>
              <legend className="sr-only">Landing page settings</legend>
              <details className="landing-control-group" open>
                <summary>Campaign & appearance</summary>
                <div className="commerce-form">
                  <label>
                    Internal campaign name
                    <input
                      value={page.name}
                      maxLength={150}
                      onChange={(e) =>
                        changed({ ...page, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Campaign link
                    <span className="landing-slug-prefix">/offer/</span>
                    <input
                      value={page.slug}
                      readOnly={Boolean(page.published_at)}
                      maxLength={120}
                      onChange={(e) =>
                        changed({ ...page, slug: draftSlug(e.target.value) })
                      }
                    />
                  </label>
                  {page.published_at && (
                    <small>
                      Duplicate a published campaign to use a new link.
                    </small>
                  )}
                  <label>
                    Template
                    <select
                      value={page.draft.template}
                      onChange={(e) =>
                        updateDocument({
                          template: e.target
                            .value as LandingDocument["template"],
                        })
                      }
                    >
                      {Object.entries(landingTemplates).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Accent color
                    <input
                      type="color"
                      value={page.draft.accent}
                      onChange={(e) =>
                        updateDocument({ accent: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Purchase button label
                    <input
                      value={page.draft.buttonLabel}
                      maxLength={60}
                      onChange={(e) =>
                        updateDocument({ buttonLabel: e.target.value })
                      }
                    />
                  </label>
                  <p className="checkout-note">
                    Live store price: ₦{item.price.toLocaleString("en-NG")}.
                    Change the price in product settings to update every
                    campaign.
                  </p>
                </div>
              </details>
              <details className="landing-control-group" open>
                <summary>Page sections</summary>
                <ol className="landing-section-order">
                  {page.draft.sections.map((entry, index) => (
                    <li
                      key={entry.id}
                      className={entry.id === selected ? "selected" : ""}
                    >
                      <button
                        type="button"
                        className="landing-section-select"
                        onClick={() => setSelected(entry.id)}
                      >
                        {human(entry.type)}
                        {!entry.visible && <small>Hidden</small>}
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${entry.type} up`}
                        disabled={index === 0}
                        onClick={() => reorder(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${entry.type} down`}
                        disabled={index === page.draft.sections.length - 1}
                        onClick={() => reorder(index, 1)}
                      >
                        ↓
                      </button>
                    </li>
                  ))}
                </ol>
                <div className="landing-add-section">
                  <select
                    aria-label="Section to add"
                    value={addType}
                    onChange={(e) =>
                      setAddType(e.target.value as LandingSection["type"])
                    }
                  >
                    {landingSectionTypes
                      .filter((type) => !["hero", "offer"].includes(type))
                      .map((type) => (
                        <option key={type} value={type}>
                          {human(type)}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    disabled={page.draft.sections.length >= 25}
                    onClick={() => {
                      const section = newLandingSection(
                        addType,
                        crypto.randomUUID(),
                      );
                      updateDocument({
                        sections: [...page.draft.sections, section],
                      });
                      setSelected(section.id);
                    }}
                  >
                    Add section
                  </button>
                </div>
              </details>
              {section && (
                <div className="landing-control-group commerce-form">
                  <h3>Edit {human(section.type)}</h3>
                  {!["hero", "offer"].includes(section.type) && (
                    <label className="landing-checkbox">
                      <input
                        type="checkbox"
                        checked={section.visible}
                        onChange={(e) =>
                          updateSection(selected, { visible: e.target.checked })
                        }
                      />
                      Show this section
                    </label>
                  )}
                  <label>
                    Heading
                    <input
                      value={section.heading}
                      maxLength={250}
                      onChange={(e) =>
                        updateSection(selected, { heading: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Body copy
                    <textarea
                      value={section.body}
                      maxLength={6000}
                      rows={5}
                      onChange={(e) =>
                        updateSection(selected, { body: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Image URL
                    <input
                      value={section.imageUrl}
                      onChange={(e) =>
                        updateSection(selected, { imageUrl: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Upload an image
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        if (e.target.files?.[0])
                          void imageUpload(e.target.files[0], "imageUrl");
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <label>
                    Preview video URL
                    <input
                      value={section.videoUrl}
                      onChange={(e) =>
                        updateSection(selected, { videoUrl: e.target.value })
                      }
                    />
                  </label>
                  {section.type === "contents" && (
                    <p>
                      The product’s curriculum or included files are displayed
                      automatically. Extra points below are optional.
                    </p>
                  )}
                  {section.items.map((entry, index) => (
                    <div className="landing-entry" key={index}>
                      <label>
                        {section.type === "faq"
                          ? "Question"
                          : section.type === "testimonials"
                            ? "Customer name / attribution"
                            : "Title"}
                        <input
                          value={entry.title}
                          maxLength={250}
                          onChange={(e) =>
                            updateSection(selected, {
                              items: section.items.map((it, i) =>
                                i === index
                                  ? { ...it, title: e.target.value }
                                  : it,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        {section.type === "faq"
                          ? "Answer"
                          : section.type === "testimonials"
                            ? "Real customer quote"
                            : "Details"}
                        <textarea
                          rows={3}
                          value={entry.text}
                          maxLength={2000}
                          onChange={(e) =>
                            updateSection(selected, {
                              items: section.items.map((it, i) =>
                                i === index
                                  ? { ...it, text: e.target.value }
                                  : it,
                              ),
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="commerce-text-button"
                        onClick={() =>
                          updateSection(selected, {
                            items: section.items.filter((_, i) => i !== index),
                          })
                        }
                      >
                        Remove entry
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    disabled={section.items.length >= 30}
                    onClick={() =>
                      updateSection(selected, {
                        items: [...section.items, { title: "", text: "" }],
                      })
                    }
                  >
                    + Add {section.type === "faq" ? "question" : "entry"}
                  </button>
                  {!["hero", "offer"].includes(section.type) && (
                    <button
                      type="button"
                      className="commerce-text-button"
                      onClick={() => {
                        updateDocument({
                          sections: page.draft.sections.filter(
                            (s) => s.id !== selected,
                          ),
                        });
                        setSelected("hero");
                      }}
                    >
                      Remove section
                    </button>
                  )}
                </div>
              )}
              <details className="landing-control-group">
                <summary>Search & social sharing</summary>
                <div className="commerce-form">
                  <label>
                    Page title
                    <input
                      value={page.draft.seoTitle}
                      maxLength={180}
                      onChange={(e) =>
                        updateDocument({ seoTitle: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      rows={3}
                      value={page.draft.seoDescription}
                      maxLength={300}
                      onChange={(e) =>
                        updateDocument({ seoDescription: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Sharing image URL
                    <input
                      value={page.draft.socialImage}
                      onChange={(e) =>
                        updateDocument({ socialImage: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Upload sharing image
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        if (e.target.files?.[0])
                          void imageUpload(e.target.files[0], "socialImage");
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <small>
                    Campaign pages are shareable and excluded from search
                    indexing by default.
                  </small>
                </div>
              </details>
            </fieldset>
            <div className="landing-preview-column">
              <div className="landing-preview-toolbar">
                <span>Live draft preview · purchase disabled</span>
                <div>
                  <button
                    type="button"
                    aria-pressed={!mobile}
                    onClick={() => setMobile(false)}
                  >
                    Desktop
                  </button>
                  <button
                    type="button"
                    aria-pressed={mobile}
                    onClick={() => setMobile(true)}
                  >
                    Mobile
                  </button>
                </div>
              </div>
              <div
                className={`landing-preview-frame ${mobile ? "mobile" : ""}`}
              >
                <LandingPageView document={page.draft} item={item} preview />
              </div>
              <section className="landing-ai-panel">
                <p className="offer-eyebrow">A STARTING POINT, IN YOUR VOICE</p>
                <h3>Draft the story with AI.</h3>
                <p>
                  Describe your audience and the outcome. Review every claim
                  before publishing.
                </p>
                <div className="commerce-form">
                  <label>
                    Who is this for?
                    <textarea
                      rows={2}
                      value={audience}
                      maxLength={800}
                      onChange={(e) => setAudience(e.target.value)}
                      placeholder="e.g. Small business owners creating their first product photos"
                    />
                  </label>
                  <label>
                    What should they be able to do?
                    <textarea
                      rows={2}
                      value={outcome}
                      maxLength={800}
                      onChange={(e) => setOutcome(e.target.value)}
                    />
                  </label>
                  <label>
                    Tone
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                    >
                      <option value="clear">Clear & direct</option>
                      <option value="energetic">Energetic</option>
                      <option value="professional">Professional</option>
                    </select>
                  </label>
                  <div className="landing-ai-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={locked || !audience.trim() || !outcome.trim()}
                      onClick={() => void generate()}
                    >
                      {aiBusy ? "Drafting…" : "Generate page copy"}
                    </button>
                    {section && safeAI.includes(section.type) && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={locked || !audience.trim() || !outcome.trim()}
                        onClick={() => void generate(section.type)}
                      >
                        Draft selected section
                      </button>
                    )}
                  </div>
                </div>
                {suggestions && (
                  <div className="landing-ai-review">
                    <h4>Review suggested changes</h4>
                    <p>
                      Your page will change only when you apply this draft.
                      Testimonials, bonuses, and credentials are always supplied
                      by you.
                    </p>
                    {suggestions.map((suggestion) => (
                      <div key={suggestion.id}>
                        <strong>
                          {human(suggestion.type)}: {suggestion.heading}
                        </strong>
                        <p>{suggestion.body}</p>
                        {suggestion.items.map((entry, i) => (
                          <p key={i}>
                            {entry.title}
                            {entry.text ? ` — ${entry.text}` : ""}
                          </p>
                        ))}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={applySuggestions}
                    >
                      Apply to draft
                    </button>
                    <button
                      type="button"
                      className="commerce-text-button"
                      onClick={() => setSuggestions(null)}
                    >
                      Discard suggestions
                    </button>
                  </div>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
