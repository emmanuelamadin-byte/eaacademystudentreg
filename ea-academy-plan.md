# EA Academy implementation plan

Build every requested product area from an empty workspace using Next.js App Router, React, TypeScript, Tailwind, Supabase, Paystack, and Gemini. No seed users, invented results, or demo services. Curriculum is authored after setup. Premium is NGN 3,000 monthly. Only the verified owner email may become Admin; instructors are appointed by that owner. Student track choice is immutable. Ratings use 0–100; AI suggestions are advisory.

## Architecture and ownership
- Root: scaffold, shared types, Supabase client/auth/hooks, shared styling, public site, authentication, application shell, billing, donations, PWA, integration validation and documentation.
- Backend specialist: server authorization/validation, API action dispatcher, Paystack checkout/verification/webhooks, Gemini, upload endpoints, Supabase RLS/Storage policies, security tests.
- Learning specialist: dashboard, track curriculum, lesson player/sandbox/tutor/discussion, assignments with offline drafts and attachments, printable/verifiable learning record.
- Administration/community specialist: admin overview, users, course editor, submissions grading, announcements, settings, community discussions/showcase/calendar.

## Shared contract
Client `useAcademy()` from `@/components/academy-provider` gives `{ user, authUser, loading, configured, error, signOut, refreshProfile }`. `user` is AcademyUser or null. Client `api<T>(action, payload?)` from `@/lib/api` sends authenticated POST `/api/academy` with `{action, ...payload}` and returns JSON `data`; throws readable errors. `useRecords<T>(collectionName, filters?: [field, operator, value][], enabled?: boolean)` from `@/lib/hooks` gives `{ data, loading, error }`; stable filters internally. Data has document id added. `useRecord<T>(collectionName,id,enabled?)` similar. All private reads are RLS scoped. Types in `src/lib/types.ts`.

UI feature components export default and accept `{ section: string, id?: string }`. Root router serves `/app/[...path]`: learning sections dashboard, tracks, lesson, assignments, transcript; admin sections admin, users, courses, submissions, notifications, settings; community sections community, showcase, sessions. Public `/`, `/tracks`, `/pricing`, `/donate`, `/login`, `/signup`; app billing/account also root owned.

## Collections
users, modules (public metadata), lessons (protected full content; client reads through lesson.get API), assignments, submissions, progress (document id uid_lessonId), notifications, discussions, comments, projects, votes, sessions, donations (public recognition only), payments (private), settings/public, transcripts (public minimal verification).

## API actions
- profile.ensure {name?, enrolledClassId?}; profile.update {name}; users.update {id, role?: Student|Instructor, enrolledClassId?, premiumGranted?, instructorTrackIds?}
- lesson.get {id}; module.save {module}; module.delete {id}; lesson.save {lesson}; lesson.delete {id}; assignment.save {assignment}; assignment.delete {id}; progress.complete {lessonId}
- submission.save {submission}; submission.grade {id,grade,feedback,lineFeedback?,rubric?}; submission.review {id}
- discussion.create {title,body,classId,lessonId?}; comment.create {parentId,body}; project.create {title,description,url,classId}; project.vote {id}; community.delete {collection,id}
- session.save {session}; session.delete {id}; notification.send {title,message,targetTrack,priority,actionScreen?}; settings.save {settings}
- ai.ask {mode: tutor|review|curriculum, prompt, code?, lessonId?}; billing.checkout {kind: premium|donation, amount?:NGN, donorName?, anonymous?, recurring?:boolean}; billing.verify {reference}; billing.manage {}; transcript.issue {}
- POST `/api/upload` multipart field file with authenticated Bearer token; returns `{data:{url,path,name}}`. Backend enforces owner paths and size/type limits. Attachments use authenticated download API if necessary; coordinate returned URL.

## Verification
Install dependencies, typecheck, lint, security unit tests, production build, local browser flows and responsive checks. Verify missing-configuration states honestly. Real authentication, billing, uploads, AI and notifications need the user's credentials and deployed rules. Never report those externally verified until configured and tested.
