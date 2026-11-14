# Landing pages and purchase-first checkout

The implementation is off by default. Existing shop checkout, memberships, and donations remain available until activation. No production database changes or real payments are performed by the automated tests.

## Activate in a test environment first

1. Back up the database and apply `supabase/migrations/20261114120000_landing_pages_and_guest_shop_checkout.sql` after the existing shop migrations. It adds draft/published campaign records, anonymous request limits, a receipt outbox, nullable account IDs for shop payments, and atomic shop fulfillment/claim functions. Existing membership/donation payments still require an account.
2. Configure the existing Supabase, Google OAuth, Paystack **test** key, application URL, and Resend sender settings. The application URL must be the same origin used by the browser. Add the checkout recovery URL to Supabase's allowed redirect URLs, including query parameters, e.g. `https://your-test-host/checkout/complete**` (and the localhost equivalent for local testing).
3. Set `NEXT_PUBLIC_PURCHASE_FIRST_ENABLED=true` and `NEXT_PUBLIC_LANDING_PAGES_ENABLED=true`, then rebuild/restart. Public flags are compiled into the browser bundle. Keep `SHOP_CHECKOUT_PAUSED=false` for purchases.
4. Keep the existing authenticated `/api/automation/messages` worker running every 5–10 minutes. It now retries receipt delivery. A confirmed purchase is recorded even when email delivery fails. Receipts use provider idempotency keys and database reservation; monitor failed jobs in `shop_receipt_outbox`.
5. As the academy administrator, open **Shop Studio → edit a saved course/product → Landing Pages**. Create a template, edit content, save a draft, and publish. The product must be published, and checkout must be enabled, before a campaign can go live. Campaign URLs are `/offer/[slug]`; store URLs stay unchanged. Previously published campaign slugs are fixed; duplicate a page to create another link.

## Buyer behavior

- Guests enter name and the Google account email they will use for access, review those details, then pay through Paystack. Signed-in buyers use their verified email; existing ownership and included Premium courses open directly without charging again.
- If the store price changes after checkout loads, payment initialization stops and asks the buyer to reload and review the new price. The server never accepts an amount supplied by the browser.
- Successful payments are recorded before an account exists. Webhook and callback verification share a PostgreSQL fulfillment function; repeated confirmations do not create extra payments, sales counts, or entitlements.
- Checkout and recovery routes schedule email/ad follow-up with Next.js `after()`. Payment recording remains synchronous and atomic, while those external services do not delay the buyer's next screen.
- The receipt and Paystack callback return to `/checkout/complete?reference=...`. Public status responses do not expose the buyer's email, account, or download locations. A reference never grants access.
- The server requires a verified Google identity with the same normalized email before claiming purchases. Case and surrounding whitespace are normalized; dots and plus aliases are not rewritten. A different Google account gets an account-switch option. Incorrect purchase emails require support review; there is no automatic ownership transfer.
- New buyers receive a purchase-only profile. My Library, purchased courses, downloads, billing, and account settings work immediately. Joining tracks/community prompts the normal academy enrollment form. No arbitrary career track is assigned. Paid access works even when new academy enrollment is closed.
- An email receipt can be opened on another device. Ordinary sign-in also claims eligible confirmed purchases, so recovery does not depend on browser storage or the original payment tab.
- A second successful charge for the same item is recorded for reconciliation but does not replace the original entitlement. Support should investigate accidental duplicate charges using their separate payment references.

## Campaigns and reporting

Saved drafts are separate from published snapshots. Publishing uses version checks to reject stale editor tabs. Only administrators can read drafts; public pages load through a server projection and use protected shop-content sanitization. Campaign pages default to `noindex` and have editable social metadata.

All pages sell the same store item at its live store price. Product price, entitlement rules, curriculum titles, and included contents are linked to the item. Published sales copy is a snapshot; update and republish copy when changing factual product details. Unpublishing the product also makes its campaigns unavailable.

AI suggestions are grounded in product details, reviewed before application, and never published automatically. Testimonials, bonuses, and credentials are manual. No HTML or scripts can be entered through the builder.

Reporting shows unique browser-session visits/clicks per campaign, successfully initialized checkouts, confirmed orders, accessed orders, revenue, unclaimed orders, and receipt failures. Conversion is confirmed orders / visits. UTM parameters and campaign/visit IDs are recorded on billing intents and survive claiming. Browser storage restrictions, blockers, bot traffic, and multiple devices can affect visit counts; these are directional campaign metrics, not advertising-platform reconciliation. Purchase events use `purchase_<reference>` for deduplication.

## Release checks and operations

- Test a course and a digital download with Paystack test payments. Cover guest checkout, an existing buyer, an included Premium course, delayed transfer/webhook, cancelled Google sign-in, a wrong Google account, email receipt recovery on another device, closed academy enrollment, and repeat callback/webhook delivery.
- Test mobile checkout and public pages, template changes, section ordering/hiding, draft isolation, sharing metadata, AI replacement review, and two editor tabs publishing concurrently.
- Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. `tests/commerce-database.test.ts` runs the migration and PL/pgSQL against isolated PGlite PostgreSQL with a modeled pre-existing Supabase billing/auth schema. It does not validate the remote database schema or simulate multiple independent PostgreSQL connections; perform concurrent webhook/callback checks in staging too.
- Monitor failed checkouts, campaign unclaimed-order counts, receipt failures, webhook logs, and the existing revenue dashboard. Guest payments appear in revenue before their purchase is claimed and are deduplicated against later library entitlements.
- To pause new transactions, set the **server-only** `SHOP_CHECKOUT_PAUSED=true`; confirmed-payment verification, receipt retries, and Google claiming remain active. Unpublish campaigns to stop their traffic. Keep `NEXT_PUBLIC_PURCHASE_FIRST_ENABLED=true` while any guest payments or unclaimed purchases exist; disabling it removes the recovery flow. Do not roll back the additive schema after accepting guest purchases.
- The durable anonymous limiter expects the deployment proxy to set/overwrite `x-forwarded-for` or `x-real-ip`. Raw IP addresses are hashed before use and are not stored in campaign events.

Custom domains, campaign-specific pricing, automated traffic splitting, and freeform layout editing are outside this release.
