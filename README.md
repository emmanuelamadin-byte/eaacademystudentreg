# EA Academy

Full-stack learning and career platform built with Next.js 16, React 19, TypeScript, Tailwind CSS 4, Supabase, Paystack, and Gemini. The app contains no demo accounts, seed curriculum, invented testimonials, or simulated service responses.

## Start locally

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open http://127.0.0.1:3000. The public site works without credentials. Authentication and private workspaces show a setup notice until Supabase is configured. API requests fail explicitly when their service is not configured.

## Connect your services

Fill `.env.local` using `.env.example`. Never commit credentials. Use your hosting provider’s secret settings for deployment.

### Supabase

1. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the server-only `SUPABASE_SECRET_KEY` in `.env.local`.
2. Enable Google under Authentication → Providers and add localhost plus the production domain to the redirect allow list. Google is the academy's only sign-in method.
3. Keep Row Level Security enabled on every exposed table. Client reads are scoped by RLS; privileged mutations run through authenticated server endpoints.
4. Use the private `assignment-attachments` Storage bucket. It allows PDF, JPG, PNG, WebP, DOC, and DOCX files up to 5 MB.

Students cannot modify roles, tracks, membership, or grades. Lesson content is delivered through an authorization-checked API; reference solutions are available only to assigned instructors and the owner. Uploaded submissions use private object paths and authenticated downloads.

### Sole administrator

Sign in using **EmmanuelAmadin@gmail.com** through Google. The verified owner email is the only account eligible for Admin.

The owner appoints instructors and their permitted tracks in People & permissions, grants sponsored access, and can correct enrollment. Students cannot change their own primary track. No UI or API can appoint a second administrator. Avoid manually changing protected profile roles in the database.

### Paystack

- Set `PAYSTACK_SECRET_KEY` to the test key during verification, then the live key at launch.
- Create a **monthly, NGN 3,000** plan in Paystack and set `PAYSTACK_MONTHLY_PLAN_CODE`. Paystack amounts are in kobo: **300000**.
- Set `NEXT_PUBLIC_APP_URL` to your actual HTTPS website origin for deployed checkout.
- Configure the webhook as `https://YOUR-DOMAIN/api/paystack/webhook` for the matching test/live environment.
- Recurring checkout uses cards. The separate one-month payment option supports cards and Paystack bank transfers where enabled on your account. Donations are one-time NGN payments.
- The server verifies currency, amount, owner, and recurring plan before granting access. A transaction reference can be credited only once. Premium expiry is checked on every protected content request. Cancellation stops renewal without deleting already-paid access.
- Subscription management opens Paystack’s hosted management page. First subscription creation and payment events can arrive out of order; the management endpoint can recover the subscription through the verified customer binding.

### Gemini

Set `GEMINI_API_KEY` from Google AI Studio. Set `GEMINI_MODEL` to a model enabled for your project. Tutor responses, curriculum drafts, reviews, and exercise tests are generated server-side. The API key is never sent to the browser. AI ratings are advisory; only instructors can publish final 0–100 ratings. Generated tests are previewed and run in the isolated browser sandbox, not on the server.

### Email and WhatsApp broadcasts

- Configure the Resend and Meta Cloud API values listed in `.env.example`. They are server-only and must never use the `NEXT_PUBLIC_` prefix.
- In Resend, use the production URL `https://YOUR-DOMAIN/api/webhooks/resend` and copy its signing secret into `RESEND_WEBHOOK_SECRET`.
- In the Meta app, use `https://YOUR-DOMAIN/api/webhooks/whatsapp` as the callback URL and the same private value stored in `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Subscribe to message status updates.
- The WhatsApp broadcast template must accept the title as body variable 1 and message as body variable 2. The birthday template accepts the student's first name as body variable 1.
- Invoke `POST https://YOUR-DOMAIN/api/automation/messages` every five minutes with `Authorization: Bearer YOUR_AUTOMATION_SECRET`. The worker publishes scheduled in-app messages, queues birthday wishes during the 9:00 hour in each student's timezone, retries recoverable deliveries, and refuses duplicate birthday sends.
- WhatsApp remains opt-in only. A stored phone number is not treated as consent. Students control email, birthday, and WhatsApp preferences from Account settings.
- The private broadcast and delivery tables are inaccessible to browser roles. Only the authenticated Admin API and scheduled worker use the service role.

## Publish your curriculum

1. Open Course studio and choose a track.
2. Add its real instructor details under Public instructor profile.
3. Create a module, assign its order, and choose Free or Premium access.
4. Add lessons with video URLs, Markdown notes, starter JavaScript, optional instructor-only reference solutions, and HTTPS resource links. YouTube, Vimeo, and direct video files are supported.
5. Publish both the module and its lessons. A lesson is free only when both the module and lesson are marked free.
6. Create assignments, deadlines, and capstone milestones. Students can submit links, Markdown write-ups, and private attachments; staff review and grade within assigned tracks.

Curriculum changes and in-app announcements update through Supabase Realtime. Community tools support track discussions, replies, project showcases, votes, moderation, live sessions, recordings, monthly portfolio critiques, and calendar downloads. Private meeting and recording links require Premium or staff access.

## Offline and PWA behavior

- Static application assets and the workspace shell are cached by the service worker.
- Opened learning content and drafts are retained locally for offline continuity.
- Opened lesson notes and exercises are saved per user on the device. Streamed videos and AI still require a connection; video downloads depend on the host.
- Assignment drafts auto-save locally. Explicit offline submissions and completion events queue per user and retry upon reconnection. Stale drafts cannot overwrite work that is under review or graded. Attachment uploads need a connection.
- Offline submission time is the time the server receives the submission; the UI explains this before queuing.
- Browser/device storage can be cleared or evicted, so offline storage is not a backup. Saved work remains on the device after logout; clear site data on shared devices.
- Installability requires HTTPS outside localhost. On iOS, install through Safari’s Share → Add to Home Screen. In-app announcements update through Supabase Realtime.

## Validation

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Tests cover role bootstrapping, instructor scopes, Premium content access, forged submissions, private attachments, stale offline drafts, request size limits, monthly expiry, payment ownership and amounts, webhook HMAC validation, repeated verification, anonymous donations, and renewal plan binding. They use isolated in-memory test doubles; they do not replace live Supabase, payment, OAuth, or storage verification.

Before launch, verify real sign-up, owner/instructor/student access, publishing, uploads, payment success/cancellation/renewal, and AI in the target environment. Review account recovery, privacy text, donation administration, and membership terms for the academy’s actual operations.

## Deployment

Deploy as a Node.js Next.js application on a host supporting Next.js 16 and your chosen request size. Use Node.js 22 or newer. Run `npm ci`, `npm run build`, and `npm run start`. The start script binds locally; set the hostname to `0.0.0.0` when your hosting platform requires it. On managed Next.js hosting, use the platform’s native build/start integration.

The upload API permits 5 MB per file. Some serverless hosts impose a smaller request limit; use a host that permits this size, or lower the application limit to match before launch. No hosting deployment or external configuration is performed automatically.

Server secrets are mandatory for the associated service. Public environment values are embedded at build time, so rebuild after changing them. Database migrations and RLS policies are managed in Supabase separately from deploying the Next.js app.

## Source map

- `src/components`: site, navigation, authentication provider, and PWA controls
- `src/features`: learning, assignments, staff tools, community, account, billing, and donations
- `src/server`: authorization, validation, Supabase access, AI, and payment services
- `src/app/api`: authenticated action API, uploads, payment webhook, public catalog counts, and learning record verification
- `.env.example`: every required configuration variable

Official service documentation: [Supabase with Next.js](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs), [Paystack subscriptions](https://paystack.com/docs/payments/subscriptions/), [Paystack webhooks](https://paystack.com/docs/payments/webhooks/), [Gemini keys](https://ai.google.dev/gemini-api/docs/api-key).
