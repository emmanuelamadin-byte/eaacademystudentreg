import Link from "next/link";
import { PublicHeader, PublicFooter } from "@/components/public-site";
export default function Page() {
  return (
    <>
      <PublicHeader />
      <main className="container prose-page">
        <span className="eyebrow">LEARNING TOGETHER</span>
        <h1>Membership terms</h1>
        <h2>Your account and primary track</h2>
        <p>
          Provide accurate account information and keep your login secure. You
          choose your primary track when you sign up. Students cannot change
          that selection themselves; contact the administrator if a correction
          is needed.
        </p>
        <h2>Free and Premium access</h2>
        <p>
          Free includes published introductory modules, starter assignments,
          limited AI tutoring, and community access. Premium costs ₦3,000 per month and unlocks
          published content across all three tracks, instructor reviews, AI
          assistance, and live mentor sessions as they become available. Check
          the <Link href="/tracks">published curriculum</Link> before
          subscribing.
        </p>
        <h2>Payments and renewal</h2>
        <p>
          Payments are processed through Paystack in Nigerian naira. At
          checkout, choose automatic monthly renewal or a one-month pass.
          Automatic renewal continues until cancelled using the subscription
          management link in your billing workspace. Cancelling renewal leaves
          your already-paid access available until expiry. Contact the
          administrator about payment errors or refund requests.
        </p>
        <h2>Learning and feedback</h2>
        <p>
          Instructors assess submitted work on a 0–100 scale. AI suggestions are
          educational guidance and may contain mistakes; instructors choose
          final ratings. Learning records show activity and ratings recorded by
          the academy. Participation does not guarantee employment, income,
          academic accreditation, or a degree.
        </p>
        <h2>Community and original work</h2>
        <p>
          Be respectful in discussions and reviews. Submit your own work and
          credit sources and collaborators. Share only content you have
          permission to publish. The administrator may remove abusive,
          misleading, or unauthorized community content.
        </p>
        <h2>Scholarship contributions</h2>
        <p>
          Donations are one-time contributions to the academy’s scholarship
          fund. A contribution does not automatically enroll a particular
          beneficiary. The administrator manages sponsored access. Choose
          anonymous recognition if you do not want your name on the public donor
          wall.
        </p>
        <h2>Service availability</h2>
        <p>
          Published lessons can be updated by instructors. Offline access
          depends on content saved on your device, available browser storage,
          and your membership. AI, streaming video, uploads, payments, and live
          sessions need an internet connection.
        </p>
      </main>
      <PublicFooter />
    </>
  );
}
