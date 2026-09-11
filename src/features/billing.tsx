"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Check,
  ArrowUpRight,
  ShieldCheck,
  Heart,
  ArrowRight,
  LoaderCircle,
  Receipt,
} from "lucide-react";
import { useAcademy } from "@/components/academy-provider";
import { PublicHeader, PublicFooter } from "@/components/public-site";
import { EmptyState, formatNaira } from "@/components/ui";
import { useRecords, useRecord } from "@/lib/hooks";
import { api } from "@/lib/api";
import {
  isPremium,
  type Payment,
  type Donation,
  type PlatformSettings,
} from "@/lib/types";

export function Pricing({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAcademy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recurring, setRecurring] = useState(true);
  const router = useRouter();
  const premium = isPremium(user);
  async function checkout() {
    if (!user) {
      router.push("/signup");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api<{ authorization_url: string }>(
        "billing.checkout",
        { kind: "premium", recurring },
      );
      window.location.assign(result.authorization_url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Checkout could not start.",
      );
      setBusy(false);
    }
  }
  return (
    <>
      {!embedded && <PublicHeader />}
      <main className={embedded ? "" : "container section"}>
        <div className={embedded ? "page-header" : "page-intro centered"}>
          <span className="eyebrow">INVEST IN YOUR NEXT CHAPTER</span>
          <h1>{embedded ? "Your membership" : "Start free. Go further."}</h1>
          <p className="muted">
            A clear path to learning. A simple price for everything.
          </p>
        </div>
        <div className="pricing-grid">
          <section className="pricing-card">
            <span className="eyebrow">THE FIRST STEP</span>
            <h2>Free</h2>
            <p>Find your feet. Discover what’s possible.</p>
            <div className="price">
              ₦0<span>/ always</span>
            </div>
            <Link
              href={user ? "/app/tracks" : "/signup"}
              className="btn btn-secondary"
            >
              {user ? "Explore free lessons" : "Start learning free"}
              <ArrowRight size={17} />
            </Link>
            <ul>
              {[
                "Selected intro lessons in your primary track",
                "Starter assignments for self-guided practice",
                "Community discussions & showcases",
                "Progress tracking",
                "Saved lessons and offline drafts",
                "AI tutor — up to 10 requests daily",
              ].map((x) => (
                <li key={x}>
                  <Check size={17} />
                  {x}
                </li>
              ))}
            </ul>
          </section>
          <section className="pricing-card premium-pricing">
            <span className="recommended-badge">YOUR ALL-ACCESS PASS</span>
            <span className="eyebrow">ROOM TO GROW</span>
            <h2>Premium</h2>
            <p>More access. More practice. More possibility.</p>
            <div className="price">
              ₦3,000<span>/ month</span>
            </div>
            <button
              onClick={checkout}
              className="btn btn-primary"
              disabled={busy || premium}
            >
              {busy ? <LoaderCircle size={17} className="spin" /> : null}
              {premium ? "Your current membership" : "Get Premium"}
              {!premium && <ArrowUpRight size={17} />}
            </button>
            <ul>
              {[
                "Everything in Free",
                "Full access to all three career tracks",
                "AI tutor — up to 80 requests daily",
                "AI code reviews and test generation",
                "Two instructor assignment reviews monthly",
                "Live group mentor sessions and recordings",
                "One portfolio critique monthly",
                "Verified learning record",
              ].map((x) => (
                <li key={x}>
                  <Check size={17} />
                  {x}
                </li>
              ))}
            </ul>
          </section>
        </div>
        {!premium && (
          <div className="payment-preference">
            <label>
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
              />{" "}
              Renew my Premium membership monthly
            </label>
            <p>
              {recurring
                ? "Recurring billing uses supported Paystack subscription payment methods. You can manage or cancel renewal from your account."
                : "Pay once for one month. Card and supported bank transfer options are available at checkout."}
            </p>
          </div>
        )}
        {error && (
          <div role="alert" className="alert alert-error">
            {error}
          </div>
        )}
        <div className="pricing-footnote">
          <ShieldCheck size={17} />
          <span>
            Payments secured by Paystack. All prices are in Nigerian naira.
          </span>
        </div>
        {!embedded && (
          <section className="pricing-faq">
            <h2>A few things to know.</h2>
            {[
              [
                "Can I learn for free?",
                "Yes. Free gives you selected intro lessons, starter assignments, progress tracking, limited AI tutoring, and the community.",
              ],
              [
                "Can I explore other tracks?",
                "Premium unlocks all three tracks. Your primary track stays the one you choose during signup.",
              ],
              [
                "How does monthly billing work?",
                "Premium costs ₦3,000 monthly. Choose automatic renewal or pay for one month at a time. Cancellation stops future renewal; your paid access continues until its expiry.",
              ],
              [
                "How do instructor reviews work?",
                "Premium includes two assignment review requests each calendar month and one new portfolio critique each calendar month. Group mentor sessions are included when scheduled.",
              ],
              [
                "When will the curriculum be available?",
                "Modules and videos appear as instructors publish them. You can inspect the published curriculum before paying.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </section>
        )}
      </main>
      {!embedded && <PublicFooter />}
    </>
  );
}
export default function Billing() {
  const { user, refreshProfile } = useAcademy();
  const search = useSearchParams();
  const reference = search.get("reference") || search.get("trxref");
  const verified = useRef<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: payments, error: paymentsError } = useRecords<Payment>(
    "payments",
    [["studentId", "==", user?.id || ""]],
    !!user,
  );
  const runVerification = (ref: string) => {
    setMessage("Confirming your payment with Paystack…");
    setError("");
    api("billing.verify", { reference: ref })
      .then(() => refreshProfile())
      .then(() => {
        setMessage("Payment confirmed. Your account has been updated.");
        setError("");
        if (typeof window !== "undefined" && window.history?.replaceState) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      })
      .catch((err) => {
        setMessage("");
        setError(err instanceof Error ? err.message : String(err));
        verified.current = null;
      });
  };

  useEffect(() => {
    if (!reference || !user || verified.current === reference) return;
    verified.current = reference;
    runVerification(reference);
  }, [reference, user]);
  async function manage() {
    setBusy(true);
    setError("");
    try {
      const { url } = await api<{ url: string }>("billing.manage");
      location.assign(url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to open subscription settings.",
      );
      setBusy(false);
    }
  }
  return (
    <>
      {message && (
        <div className="alert alert-success" role="status">
          {message}
        </div>
      )}
      {error && (
        <div
          className="alert alert-error"
          role="alert"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <span>{error}</span>
          {reference && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => runVerification(reference)}
            >
              Verify again
            </button>
          )}
        </div>
      )}
      <Pricing embedded />
      {isPremium(user) && (
        <section className="card membership-summary">
          <div>
            <span className="eyebrow">YOUR PREMIUM MEMBERSHIP</span>
            <h3>
              {user?.premiumGranted
                ? "Academy-sponsored access"
                : user?.premiumUntil
                  ? `Access until ${new Date(user.premiumUntil).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}`
                  : "Staff access"}
            </h3>
            <p className="muted">All three career tracks are open to you.</p>
          </div>
          {user?.role === "Student" && !user.premiumGranted && (
            <button
              className="btn btn-secondary"
              onClick={manage}
              disabled={busy}
            >
              Manage subscription <ArrowUpRight size={16} />
            </button>
          )}
        </section>
      )}
      <section className="card scholarship-callout-card">
        <div className="scholarship-callout-content">
          <div className="scholarship-icon-tile">
            <Heart size={24} />
          </div>
          <div>
            <span className="eyebrow">COMMUNITY SCHOLARSHIP FUND</span>
            <h3>Sponsor a fellow student</h3>
            <p className="muted">
              Help make practical digital education accessible to more ambitious learners.
              Contributions support students who need sponsored access to complete their career tracks.
            </p>
          </div>
        </div>
        <Link href="/donate" className="btn btn-secondary scholarship-callout-btn">
          Support a scholar <ArrowRight size={16} />
        </Link>
      </section>
      <section className="card">
        <div className="section-heading">
          <h3>Payment history</h3>
          <Receipt size={20} />
        </div>
        {paymentsError && <p className="alert">{paymentsError}</p>}
        {payments.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {[...payments]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map((p) => (
                    <tr key={p.id}>
                      <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                      <td>
                        {p.kind === "premium"
                          ? "Premium membership"
                          : "Scholarship donation"}
                      </td>
                      <td>{formatNaira(p.amount)}</td>
                      <td>
                        <span className="badge">{p.status}</span>
                      </td>
                      <td>
                        <small>{p.reference || p.id}</small>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Your payment history starts here">
            Completed payments will appear in your account.
          </EmptyState>
        )}
      </section>
    </>
  );
}
export function Donations() {
  const { user, configured } = useAcademy();
  const [sponsored, setSponsored] = useState<number | null>(null);
  useEffect(() => {
    if (!configured) return;
    let active = true;
    fetch("/api/catalog")
      .then(async (response) => {
        if (response.ok) {
          const body = await response.json();
          if (active) setSponsored(body.data.sponsoredStudents);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [configured]);
  const router = useRouter();
  const [amount, setAmount] = useState(3000);
  const [anonymous, setAnonymous] = useState(false);
  const [donorName, setDonorName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { data: donations, error: donationsError } =
    useRecords<Donation>("donations");
  const { data: settings } = useRecord<PlatformSettings>("settings", "public");
  const total = donations.reduce((sum, d) => sum + d.amount, 0);
  const goal = settings?.scholarshipGoal || 0;
  async function give() {
    if (!user) {
      router.push("/signup");
      return;
    }
    if (!Number.isFinite(amount) || amount < 100) {
      setError("Enter a donation of at least ₦100.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api<{ authorization_url: string }>(
        "billing.checkout",
        {
          kind: "donation",
          amount,
          anonymous,
          donorName: donorName || user.name,
        },
      );
      location.assign(data.authorization_url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to start your donation.",
      );
      setBusy(false);
    }
  }
  return (
    <>
      <PublicHeader />
      <main className="container section">
        <div className="donation-layout">
          <div className="donation-story">
            <span className="eyebrow">
              <Heart size={15} /> THE SCHOLARSHIP FUND
            </span>
            <h1>
              Someone’s future
              <br />
              could start
              <br />
              <span>with you.</span>
            </h1>
            <p>
              Ambition is everywhere. Opportunity should be, too. Your
              contribution helps fund access to practical learning at EA
              Academy.
            </p>
            <div className="donation-impact">
              <div>
                <strong>
                  {configured && !donationsError ? formatNaira(total) : "—"}
                </strong>
                <span>contributed to the fund</span>
              </div>
              <div>
                <strong>
                  {configured && !donationsError ? donations.length : "—"}
                </strong>
                <span>contributions received</span>
              </div>
            </div>
            {sponsored !== null && (
              <p className="muted">
                {sponsored}{" "}
                {sponsored === 1
                  ? "student currently has"
                  : "students currently have"}{" "}
                academy-sponsored access.
              </p>
            )}
            {donationsError && (
              <p className="alert">Fund totals are temporarily unavailable.</p>
            )}
            {goal > 0 && (
              <>
                <div className="progress-bar">
                  <span
                    style={{ width: `${Math.min(100, (total / goal) * 100)}%` }}
                  />
                </div>
                <small className="muted">
                  Working toward {formatNaira(goal)}
                </small>
              </>
            )}
            <div className="donation-quote">
              <p>
                A small act of generosity.
                <br />A meaningful new beginning.
              </p>
            </div>
          </div>
          <section className="card donation-form">
            <span className="eyebrow">MAKE ROOM FOR POSSIBILITY</span>
            <h2>Support a scholar.</h2>
            <p className="muted">Choose a one-time contribution in naira.</p>
            <div className="donation-amounts">
              {[1000, 3000, 10000, 25000].map((value) => (
                <button
                  key={value}
                  className={amount === value ? "selected" : ""}
                  onClick={() => setAmount(value)}
                >
                  {formatNaira(value)}
                </button>
              ))}
            </div>
            <label className="field">
              Your contribution (NGN)
              <input
                type="number"
                min="100"
                max="10000000"
                step="1"
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </label>
            <label className="field">
              Name for the donor wall
              <input
                value={donorName}
                onChange={(e) => setDonorName(e.target.value)}
                placeholder={user?.name || "Your name"}
                disabled={anonymous}
                maxLength={100}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
              />{" "}
              Keep my contribution anonymous
            </label>
            {error && (
              <div role="alert" className="alert alert-error">
                {error}
              </div>
            )}
            <button className="btn btn-primary" onClick={give} disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Heart size={17} />
              )}{" "}
              {user
                ? `Contribute ${formatNaira(amount)}`
                : "Sign up to contribute"}
              <ArrowUpRight size={17} />
            </button>
            <p className="pricing-footnote">
              <ShieldCheck size={16} /> Secure checkout with Paystack
            </p>
          </section>
        </div>
        <section className="donor-wall">
          <div className="section-heading">
            <div>
              <span className="eyebrow">PEOPLE MAKING IT POSSIBLE</span>
              <h2>A little generosity goes a long way.</h2>
            </div>
          </div>
          {donations.length ? (
            <div className="grid-3">
              {donations
                .slice()
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 12)
                .map((d) => (
                  <div className="card donor-card" key={d.id}>
                    <Heart size={20} />
                    <strong>
                      {d.anonymous ? "Anonymous supporter" : d.donorName}
                    </strong>
                    <span>{formatNaira(d.amount)}</span>
                  </div>
                ))}
            </div>
          ) : (
            <EmptyState title="Be part of the first chapter">
              The fund’s supporters will be recognized here as contributions
              arrive.
            </EmptyState>
          )}
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
