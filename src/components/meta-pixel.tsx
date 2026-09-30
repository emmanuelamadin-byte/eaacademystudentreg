"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { useAcademy } from "@/components/academy-provider";
import { isPremium } from "@/lib/types";
import {
  META_PIXEL_ID,
  hasPremiumBeenTrackedInBrowser,
  identifyMetaUser,
  trackMetaEvent,
} from "@/lib/meta";

const SEEN_FREE_STORAGE_PREFIX = "ea_meta_seen_free_";

export function MetaPixel() {
  const pathname = usePathname();
  const { user, authUser } = useAcademy();
  const isFirstRender = useRef(true);

  useEffect(() => {
    const email = user?.email || authUser?.email;
    const phone = user?.phoneNumber;
    const externalId = user?.id || authUser?.id;
    if (email || phone || externalId) {
      identifyMetaUser({
        email,
        phone_number: phone,
        external_id: externalId,
      });
    }
  }, [user?.id, user?.email, user?.phoneNumber, authUser?.id, authUser?.email]);

  // Fallback recovery: if a student upgraded via Paystack (e.g. bank transfer webhook)
  // while the redirect tab was closed, fire Purchase + Subscribe the moment they return as Premium.
  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return;
    const premium = isPremium(user);

    try {
      if (!premium) {
        localStorage.setItem(`${SEEN_FREE_STORAGE_PREFIX}${user.id}`, "1");
        return;
      }

      // Skip if we are currently on /app/billing with a Paystack reference in the URL,
      // since Billing's own verification effect will fire the event with the exact reference.
      const search = new URLSearchParams(window.location.search);
      if (search.get("reference") || search.get("trxref")) {
        return;
      }

      const wasSeenAsFree = Boolean(
        localStorage.getItem(`${SEEN_FREE_STORAGE_PREFIX}${user.id}`),
      );
      if (wasSeenAsFree && !hasPremiumBeenTrackedInBrowser(user.id)) {
        trackMetaEvent("Purchase", {
          event_id: `purchase_premium_${user.id}`,
          value: 3000,
          currency: "NGN",
          content_id: "ea-academy-premium",
          content_type: "product",
          content_name: "EA Academy Premium Membership",
          content_category: "Membership",
          user_id: user.id,
        });
      }
    } catch {
      // Ignore storage errors
    }
  }, [user, pathname]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    window.fbq?.("track", "PageView");
  }, [pathname]);

  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${META_PIXEL_ID}');
          fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}
