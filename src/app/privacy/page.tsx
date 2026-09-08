import { PublicHeader, PublicFooter } from "@/components/public-site";
export default function Page() {
  return (
    <>
      <PublicHeader />
      <main className="container prose-page">
        <span className="eyebrow">YOUR ACCOUNT. YOUR WORK.</span>
        <h1>Privacy & your data</h1>
        <p>
          EA Academy uses your account details and learning activity to provide
          its teaching, community, and membership services.
        </p>
        <h2>Information the academy uses</h2>
        <p>
          Your profile includes your name, Google account email, country, phone
          number, birthday month and day, primary track, role, and membership
          status. Lessons you complete, assignment submissions, instructor
          feedback, payment records, and posts are stored to support your
          learning.
        </p>
        <h2>Who can see your work</h2>
        <p>
          Your submissions and learning activity are accessible to you, the
          academy administrator, and authorized instructors. Community posts,
          project showcases, and comments are visible to signed-in members.
          Published donor recognition is public; anonymous contributions hide
          the donor’s name.
        </p>
        <h2>Connected services</h2>
        <p>
          Supabase provides account authentication, database storage, file
          storage, and notifications. Paystack processes payments; the academy
          does not collect your card number. When you request AI assistance,
          your question, submitted code, and relevant lesson context are sent to
          Google’s Gemini service. Video providers receive connection
          information when you play their embedded videos.
        </p>
        <p>
          If you enable external notifications, Resend processes email delivery
          and Meta processes WhatsApp delivery. EA Academy records your channel
          preferences, WhatsApp consent, delivery status, and opt-out choices so
          messages are expected and are not duplicated.
        </p>
        <h2>Saved work on your device</h2>
        <p>
          The academy stores previously opened lesson notes, drafts, and pending
          changes on your device to support offline learning. Browser storage
          can remain after sign-out. Use a personal device for offline access,
          or clear this site’s browser data before sharing a device.
        </p>
        <h2>Email and WhatsApp choices</h2>
        <p>
          You can enable or disable email updates, birthday emails, WhatsApp
          updates, and WhatsApp birthday wishes from Account settings. WhatsApp
          messaging remains disabled until you actively consent. Turning it off
          records the opt-out and prevents new WhatsApp broadcasts.
        </p>
        <h2>Notifications and public records</h2>
        <p>
          Device notifications are optional and require browser permission. You
          can turn them off in browser settings. Creating a verified learning
          record publishes your name and a snapshot of learning results at a
          unique link. Anyone you share that link with can view it.
        </p>
        <h2>Account questions</h2>
        <p>
          Contact the academy administrator through the cohort lounge for
          questions about your account, corrections, or removal of your
          information. Do not share payment credentials or sensitive personal
          information in public discussions.
        </p>
      </main>
      <PublicFooter />
    </>
  );
}
