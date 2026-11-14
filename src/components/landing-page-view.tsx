import Link from "next/link";
import type { CSSProperties } from "react";
import type { LandingDocument, LandingSection } from "@/lib/landing-pages";
import { landingButtonColors } from "@/lib/landing-pages";
import type { ShopItem } from "@/lib/types";
import { safeResourceUrl } from "@/lib/urls";
import { getVideoEmbed } from "@/lib/video";
import { CampaignBuyButton, CampaignVisit } from "./campaign-actions";

function Media({ section }: { section: LandingSection }) {
  const video = section.videoUrl ? getVideoEmbed(section.videoUrl) : null;
  if (video?.embedUrl)
    return (
      <div className="offer-media">
        {video.isDirectVideo ? (
          <video
            src={video.embedUrl}
            controls
            preload="none"
            poster={
              section.imageUrl ? safeResourceUrl(section.imageUrl) : undefined
            }
          />
        ) : (
          <iframe
            src={video.embedUrl}
            title={section.heading || "Product preview"}
            loading="lazy"
            allow="fullscreen; picture-in-picture"
            allowFullScreen
          />
        )}
      </div>
    );
  if (section.imageUrl)
    return (
      <div className="offer-media">
        <img
          src={safeResourceUrl(section.imageUrl)}
          alt={section.heading || "Product preview"}
          loading="lazy"
        />
      </div>
    );
  return null;
}
function ExtraPoints({ section }: { section: LandingSection }) {
  if (!section.items.length) return null;
  return (
    <ul className="offer-included">
      {section.items.map((entry, index) => (
        <li key={index}>
          <strong>{entry.title}</strong>
          {entry.text && <> — {entry.text}</>}
        </li>
      ))}
    </ul>
  );
}
export function LandingPageView({
  document,
  item,
  campaignId,
  preview = false,
}: {
  document: LandingDocument;
  item: ShopItem;
  campaignId?: string;
  preview?: boolean;
}) {
  const buttonColors = landingButtonColors(document.accent);
  const buy = (
    <CampaignBuyButton
      campaignId={campaignId}
      itemId={item.id}
      label={document.buttonLabel}
      preview={preview}
    />
  );
  const price = (
    <div className="offer-price">
      <strong>₦{item.price.toLocaleString("en-NG")}</strong>
      {item.compareAtPrice && item.compareAtPrice > item.price ? (
        <del>₦{item.compareAtPrice.toLocaleString("en-NG")}</del>
      ) : null}
      <span>One-time payment</span>
    </div>
  );
  return (
    <div
      className={`offer-page offer-template-${document.template}`}
      style={
        {
          "--offer-accent": buttonColors.background,
          "--offer-button-text": buttonColors.text,
        } as CSSProperties
      }
    >
      {!preview && campaignId && (
        <CampaignVisit
          campaignId={campaignId}
          itemId={item.id}
          title={item.title}
          price={item.price}
        />
      )}
      <header className="offer-header">
        <Link href="/" className="offer-brand">
          EA<span>ACADEMY</span>
        </Link>
        <span>Practical skills. Lasting possibilities.</span>
        <a href="#offer-purchase">
          View the offer <span aria-hidden="true">↗</span>
        </a>
      </header>
      <main id={preview ? undefined : "main-content"}>
        {document.sections
          .filter((s) => s.visible)
          .map((section) => {
            if (section.type === "hero")
              return (
                <section key={section.id} className="offer-hero offer-wrap">
                  <div>
                    <p className="offer-eyebrow">
                      {item.type === "course"
                        ? "THE NEXT CHAPTER IN YOUR LEARNING"
                        : "A RESOURCE FOR YOUR NEXT BIG IDEA"}
                    </p>
                    <h1>{section.heading}</h1>
                    <p className="offer-lead">{section.body}</p>
                    <ExtraPoints section={section} />
                    {buy}
                    <p className="offer-assurance">
                      Pay securely with Paystack. Access with Google after
                      payment.
                    </p>
                  </div>
                  <Media section={section} />
                </section>
              );
            if (section.type === "offer")
              return (
                <section
                  key={section.id}
                  id="offer-purchase"
                  className="offer-purchase"
                >
                  <div className="offer-wrap offer-purchase-grid">
                    <div>
                      <p className="offer-eyebrow">YOUR NEXT STEP</p>
                      <h2>{section.heading}</h2>
                      <p className="offer-copy">{section.body}</p>
                      <Media section={section} />
                      <ExtraPoints section={section} />
                      <ul className="offer-included">
                        {(item.type === "digital_product"
                          ? item.includes || []
                          : item.whatYouWillLearn
                        ).map((text, index) => (
                          <li key={index}>{text}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="offer-price-panel">
                      <span>{item.title}</span>
                      {price}
                      {buy}
                      <p>
                        Secure payment ·{" "}
                        {item.type === "course"
                          ? "Access in your course library"
                          : "Download in your library"}
                      </p>
                      {item.type === "course" && item.includedInPremium && (
                        <p>
                          Already a Premium member?{" "}
                          <Link href={`/app/learn-course/${item.id}`}>
                            Open this included course
                          </Link>
                          .
                        </p>
                      )}
                    </div>
                  </div>
                </section>
              );
            if (section.type === "closing")
              return (
                <section key={section.id} className="offer-closing offer-wrap">
                  <h2>{section.heading}</h2>
                  <p className="offer-copy">{section.body}</p>
                  <Media section={section} />
                  <ExtraPoints section={section} />
                  {buy}
                </section>
              );
            return (
              <section
                key={section.id}
                className={`offer-section offer-wrap offer-section-${section.type}`}
              >
                <div className="offer-section-heading">
                  <p className="offer-eyebrow">
                    {section.type === "faq"
                      ? "GOOD TO KNOW"
                      : section.type === "testimonials"
                        ? "REAL EXPERIENCES"
                        : "BUILT AROUND YOU"}
                  </p>
                  <h2>{section.heading}</h2>
                  {section.body && <p className="offer-copy">{section.body}</p>}
                </div>
                <Media section={section} />
                {section.type === "contents" &&
                  (item.type === "course" ? (
                    <div className="offer-curriculum">
                      {item.curriculum?.map((module, index) => (
                        <details key={module.id}>
                          <summary>
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            {module.title}
                            <small>{module.lessons.length} lessons</small>
                          </summary>
                          <ul>
                            {module.lessons.map((lesson) => (
                              <li key={lesson.id}>
                                {lesson.title}
                                <span>{lesson.duration}</span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ))}
                    </div>
                  ) : (
                    <div className="offer-list">
                      {(item.includes || []).map((title, index) => (
                        <div key={index}>
                          <span className="offer-list-number">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <h3>{title}</h3>
                        </div>
                      ))}
                    </div>
                  ))}
                {section.type === "faq" ? (
                  <div className="offer-faq">
                    {section.items.map((entry, index) => (
                      <details key={index}>
                        <summary>{entry.title}</summary>
                        <p>{entry.text}</p>
                      </details>
                    ))}
                  </div>
                ) : (
                  <div className="offer-list">
                    {section.items.map((entry, index) => (
                      <div key={index}>
                        {section.type !== "testimonials" && (
                          <span className="offer-list-number">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                        )}
                        <h3>{entry.title}</h3>
                        {entry.text && <p>{entry.text}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
      </main>
      <footer className="offer-footer">
        <div className="offer-brand">
          EA<span>ACADEMY</span>
        </div>
        <p>Build something that moves you forward.</p>
        <nav aria-label="Purchase information">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <a
            href={
              process.env.NEXT_PUBLIC_DIRECT_WHATSAPP_URL ||
              "https://wa.me/2348142417005"
            }
          >
            Contact support
          </a>
        </nav>
      </footer>
      {!preview && (
        <div className="offer-mobile-buy">
          <strong>₦{item.price.toLocaleString("en-NG")}</strong>
          {buy}
        </div>
      )}
    </div>
  );
}
