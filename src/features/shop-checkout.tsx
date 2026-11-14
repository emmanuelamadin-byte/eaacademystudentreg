"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAcademy } from "@/components/academy-provider";
import { shopApi } from "@/lib/campaign-tracking";
import { normalizePurchaseEmail } from "@/lib/landing-pages";
import { getSupabase } from "@/lib/supabase";
import { safeResourceUrl } from "@/lib/urls";
import { trackTikTokEvent } from "@/lib/tiktok";
import type { ShopItem } from "@/lib/types";

const supportUrl =
  process.env.NEXT_PUBLIC_DIRECT_WHATSAPP_URL || "https://wa.me/2348142417005";
export function ShopCheckout({ item }: { item: ShopItem }) {
  const { authUser, user, loading, signOut } = useAcademy();
  const router = useRouter();
  const search = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (authUser?.email) setEmail(authUser.email);
    if (authUser)
      setName(
        (previous) =>
          previous || user?.name || authUser.user_metadata?.full_name || "",
      );
  }, [authUser, user?.name]);
  async function pay() {
    setBusy(true);
    setError("");
    try {
      const utm = Object.fromEntries(
        [
          "utm_source",
          "utm_medium",
          "utm_campaign",
          "utm_content",
          "utm_term",
        ].flatMap((key) =>
          search.get(key) ? [[key, search.get(key)!.slice(0, 150)]] : [],
        ),
      );
      const result = await shopApi<{
        authorizationUrl?: string;
        accessUrl?: string;
        reference?: string;
      }>("checkout", {
        itemId: item.id,
        expectedPrice: item.price,
        name: name.trim(),
        email: normalizePurchaseEmail(email),
        campaignId: search.get("campaign") || undefined,
        visitId: search.get("visit") || undefined,
        utm,
      });
      if (result.accessUrl) {
        router.push(result.accessUrl);
        return;
      }
      if (!result.authorizationUrl)
        throw new Error("Checkout did not open. Please try again.");
      if (result.reference) {
        try {
          sessionStorage.setItem(
            `ea-purchase-email:${result.reference}`,
            normalizePurchaseEmail(email),
          );
        } catch {
          /* Optional reminder only. */
        }
        trackTikTokEvent("InitiateCheckout", {
          value: item.price,
          currency: "NGN",
          content_id: item.id,
          content_name: item.title,
          content_type: "product",
          event_id: `checkout_${result.reference}`,
        });
      }
      window.location.assign(result.authorizationUrl);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Checkout could not open.",
      );
      setBusy(false);
    }
  }
  function next(event: FormEvent) {
    event.preventDefault();
    setError("");
    setEmail(normalizePurchaseEmail(email));
    setReview(true);
  }
  return (
    <main id="main-content" className="commerce-checkout">
      <Link href="/" className="offer-brand">
        EA<span>ACADEMY</span>
      </Link>
      <div className="checkout-grid">
        <aside className="checkout-summary">
          <p className="offer-eyebrow">YOUR NEXT STEP STARTS HERE</p>
          <h1>{item.title}</h1>
          <p>{item.subtitle}</p>
          {item.thumbnailUrl && (
            <img src={safeResourceUrl(item.thumbnailUrl)} alt={item.title} />
          )}
          <div className="checkout-total">
            <span>One-time payment</span>
            <strong>₦{item.price.toLocaleString("en-NG")}</strong>
          </div>
          <p>
            Pay securely with Paystack. Find your{" "}
            {item.type === "course" ? "course" : "download"} in your library
            after Google sign-in.
          </p>
          <Link href={`/shop/${item.slug}`}>Back to product</Link>
        </aside>
        <section className="checkout-form-panel">
          <p className="offer-eyebrow">
            {review ? "02 / REVIEW & PAY" : "01 / YOUR PURCHASE DETAILS"}
          </p>
          <h2>
            {review ? "Check your access email." : "You’re one step closer."}
          </h2>
          <p>
            Pay first. Continue with Google afterwards to access your purchase.
          </p>
          {loading ? (
            <div className="commerce-skeleton" role="status">
              Checking your account…
            </div>
          ) : review ? (
            <div className="checkout-review">
              <dl>
                <dt>Name</dt>
                <dd>{name}</dd>
                <dt>Google email for access</dt>
                <dd>{normalizePurchaseEmail(email)}</dd>
                <dt>Amount</dt>
                <dd>₦{item.price.toLocaleString("en-NG")}</dd>
              </dl>
              <p className="checkout-note">
                Use this same Google email after payment. Check the spelling now
                so your purchase reaches the right account.
              </p>
              <button
                className="offer-button"
                type="button"
                disabled={busy}
                onClick={() => void pay()}
              >
                {busy
                  ? "Opening secure checkout…"
                  : `Pay ₦${item.price.toLocaleString("en-NG")} with Paystack`}
              </button>
              <button
                className="commerce-text-button"
                type="button"
                disabled={busy}
                onClick={() => setReview(false)}
              >
                Edit purchase details
              </button>
            </div>
          ) : (
            <form onSubmit={next} className="commerce-form">
              <label>
                Your name
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={150}
                  required
                />
              </label>
              <label>
                Google email for purchase access
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  readOnly={Boolean(authUser)}
                  maxLength={254}
                  required
                  aria-describedby="google-email-help"
                />
              </label>
              <p id="google-email-help">
                Use the email of the Google account you’ll sign in with after
                payment. No sign-in is needed to pay.
              </p>
              {authUser && (
                <button
                  className="commerce-text-button"
                  type="button"
                  onClick={async () => {
                    await signOut();
                    setEmail("");
                  }}
                >
                  Use another Google account
                </button>
              )}
              <button className="offer-button" type="submit">
                Review purchase <span aria-hidden="true">→</span>
              </button>
            </form>
          )}
          {error && (
            <p className="commerce-error" role="alert">
              {error}
            </p>
          )}
          <p className="checkout-legal">
            By continuing, you agree to our <Link href="/terms">Terms</Link> and{" "}
            <Link href="/privacy">Privacy Policy</Link>. Need a hand?{" "}
            <a href={supportUrl}>Contact support</a>.
          </p>
        </section>
      </div>
    </main>
  );
}

type PaymentStatus = {
  reference: string;
  status: string;
  itemId: string;
  itemTitle: string;
  itemType: string;
};
export function ShopPurchaseRecovery() {
  const search = useSearchParams();
  const reference = search.get("reference") || search.get("trxref") || "";
  const { authUser, loading, refreshProfile, signOut } = useAcademy();
  const router = useRouter();
  const [paymentResult, setPayment] = useState<PaymentStatus | null>(null);
  const payment = paymentResult?.reference === reference ? paymentResult : null;
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [emailReminder, setEmailReminder] = useState("");
  const attempted = useRef("");
  const check = useCallback(async () => {
    if (!reference) {
      setError(
        "Open the purchase link in your receipt email, or contact support with your payment reference.",
      );
      return;
    }
    setChecking(true);
    setError("");
    try {
      setPayment(await shopApi<PaymentStatus>("payment-status", { reference }));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not check payment.",
      );
    } finally {
      setChecking(false);
    }
  }, [reference]);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    try {
      setEmailReminder(
        sessionStorage.getItem(`ea-purchase-email:${reference}`) || "",
      );
    } catch {
      /* Do not depend on browser storage for recovery. */
    }
    async function poll() {
      if (!reference) {
        setError(
          "Open the purchase link in your receipt email, or contact support with your reference.",
        );
        return;
      }
      setChecking(true);
      try {
        const result = await shopApi<PaymentStatus>("payment-status", {
          reference,
        });
        if (cancelled) return;
        setPayment(result);
        setError("");
        if (result.status === "pending" && ++attempts < 6)
          timer = setTimeout(poll, 5000);
      } catch (cause) {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not confirm payment.",
          );
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    void poll();
    const oauthError = search.get("error_description");
    if (oauthError)
      setError(
        "Google sign-in was cancelled or could not finish. Your confirmed payment remains saved; try signing in again.",
      );
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [reference, search]);
  const openPurchase = useCallback(async () => {
    if (!payment || payment.status !== "success") return;
    setBusy(true);
    setError("");
    try {
      await shopApi("claim", { reference });
      await refreshProfile();
      router.replace(
        payment.itemType === "course"
          ? `/app/learn-course/${encodeURIComponent(payment.itemId)}`
          : `/app/library?purchased=${encodeURIComponent(payment.itemId)}`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not open your purchase.",
      );
      setBusy(false);
    }
  }, [payment, reference, refreshProfile, router]);
  useEffect(() => {
    const key = `${authUser?.id}:${reference}`;
    if (
      !loading &&
      authUser &&
      payment?.status === "success" &&
      attempted.current !== key
    ) {
      attempted.current = key;
      void openPurchase();
    }
  }, [loading, authUser, reference, payment?.status, openPurchase]);
  async function google() {
    setBusy(true);
    setError("");
    try {
      const supabase = getSupabase();
      if (!supabase)
        throw new Error("Google sign-in is temporarily unavailable.");
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${location.origin}/checkout/complete?reference=${encodeURIComponent(reference)}`,
          queryParams: {
            prompt: "select_account",
            ...(emailReminder ? { login_hint: emailReminder } : {}),
          },
        },
      });
      if (error) throw error;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not open Google.",
      );
      setBusy(false);
    }
  }
  const paid = payment?.status === "success";
  return (
    <main id="main-content" className="commerce-recovery">
      <Link href="/" className="offer-brand">
        EA<span>ACADEMY</span>
      </Link>
      <section className="recovery-panel">
        <div className="recovery-mark" aria-hidden="true">
          {paid ? "✓" : "…"}
        </div>
        <p className="offer-eyebrow">
          {paid ? "YOUR PURCHASE IS SAVED" : "PAYMENT STATUS"}
        </p>
        <h1>
          {paid
            ? "Payment received."
            : checking
              ? "Checking your payment…"
              : payment?.status === "pending"
                ? "Your payment is processing."
                : "Let’s check your purchase."}
        </h1>
        {payment && (
          <p>
            <strong>{payment.itemTitle}</strong>
          </p>
        )}
        {paid ? (
          <>
            <p>
              Continue with Google using the email you entered at checkout
              {emailReminder ? (
                <>
                  : <strong>{emailReminder}</strong>
                </>
              ) : (
                "."
              )}{" "}
              Your {payment.itemType === "course" ? "course" : "download"} will
              be ready in your library.
            </p>
            <p>
              You do not need to pay again. We’ll email your receipt and a link
              to return here.
            </p>
            {loading ? (
              <p role="status">Checking your Google account…</p>
            ) : authUser ? (
              <>
                <p>
                  Signed in as <strong>{authUser.email}</strong>
                </p>
                <button
                  type="button"
                  className="offer-button"
                  disabled={busy}
                  onClick={() => void openPurchase()}
                >
                  {busy ? "Opening your purchase…" : "Open my purchase"}
                </button>
                <button
                  className="commerce-text-button"
                  disabled={busy}
                  type="button"
                  onClick={async () => {
                    await signOut();
                    setError("");
                  }}
                >
                  Switch Google account
                </button>
              </>
            ) : (
              <button
                type="button"
                className="offer-button"
                disabled={busy}
                onClick={() => void google()}
              >
                {busy ? "Opening Google…" : "Continue with Google"}
              </button>
            )}
          </>
        ) : (
          <>
            <p>
              {payment?.status === "pending"
                ? "Bank transfers can take a little longer. Your purchase will be saved once payment is confirmed. Check again before making another payment."
                : "If you completed a payment, check its status again or use the link in your receipt email."}
            </p>
            <button
              className="offer-button"
              type="button"
              disabled={checking || !reference}
              onClick={() => void check()}
            >
              {checking ? "Checking…" : "Check payment status"}
            </button>
          </>
        )}
        {error && (
          <p className="commerce-error" role="alert">
            {error}
          </p>
        )}
        {reference && (
          <p className="recovery-reference">Reference: {reference}</p>
        )}
        <p className="checkout-legal">
          <a href={supportUrl}>Contact support</a> if you used the wrong
          purchase email. Keep your payment reference.
        </p>
      </section>
    </main>
  );
}
