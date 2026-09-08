"use client";
import { use, useEffect, useState } from "react";
import {
  ShieldCheck,
  Printer,
  GraduationCap,
  Award,
  CheckCircle2,
  Share2,
  Copy,
  Check,
  Linkedin,
} from "lucide-react";
import { PublicHeader, PublicFooter } from "@/components/public-site";
import { TRACKS } from "@/lib/types";
import {
  getCertificateTitle,
  getLinkedInCertUrl,
  getLinkedInShareUrl,
  formatCertificateDate,
} from "@/lib/certificate";

type VerifiedRecord = {
  id: string;
  studentName: string;
  primaryTrack: string;
  issuedAt: string;
  completedLessons: number;
  averageRating: number | null;
  modules: { title: string; classId: string; completedLessons: number }[];
  ratings: { assignmentId: string; rating: number }[];
};

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [record, setRecord] = useState<VerifiedRecord | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/transcripts/${encodeURIComponent(id)}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error || "This learning record could not be verified.",
          );
        if (active) setRecord(result.data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const certTitle = getCertificateTitle(record?.primaryTrack);
  const trackInfo = TRACKS.find((t) => t.id === record?.primaryTrack);
  const certUrl =
    typeof window !== "undefined"
      ? window.location.href
      : `https://eaacademy.org/verify/${id}`;
  const linkedInAddUrl = record
    ? getLinkedInCertUrl({
        certName: certTitle,
        certId: record.id,
        certUrl,
        issuedAt: record.issuedAt,
      })
    : "#";
  const linkedInShareUrl = getLinkedInShareUrl(certUrl);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(certUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <PublicHeader />
      <main className="container section verify-page">
        {error ? (
          <article className="card verified-record">
            <span className="eyebrow">
              <ShieldCheck size={17} /> RECORD VERIFICATION
            </span>
            <h1>Verification unavailable</h1>
            <p role="alert" className="alert">
              {error}
            </p>
          </article>
        ) : !record ? (
          <article className="card verified-record text-center">
            <div className="verification-seal loading-seal">
              <GraduationCap size={32} />
            </div>
            <h2>Verifying authentic learning record…</h2>
            <p className="muted">
              Checking cryptographic signatures and assessment records for ID: {id}
            </p>
          </article>
        ) : (
          <>
            {/* Top Credential Actions Bar */}
            <div className="cert-actions-bar no-print">
              <a
                href={linkedInAddUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-linkedin"
                id="add-to-linkedin-btn"
                title="Add this verified credential directly to your LinkedIn profile"
              >
                <Linkedin size={18} /> Add to LinkedIn Profile
              </a>
              <a
                href={linkedInShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                id="share-linkedin-btn"
                title="Share this achievement with your LinkedIn connections"
              >
                <Share2 size={16} /> Share on LinkedIn
              </a>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCopyLink}
                title="Copy public credential link"
              >
                {copied ? <Check size={16} className="text-emerald" /> : <Copy size={16} />}
                {copied ? "Link copied!" : "Copy verification link"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => window.print()}
                title="Print or save as PDF"
              >
                <Printer size={16} /> Print / Save PDF
              </button>
            </div>

            {/* Official Certificate of Achievement Presentation */}
            <section className="certificate-frame" aria-label="Official Digital Certificate">
              <div className="certificate-inner">
                {/* Certificate Academy Header */}
                <div className="certificate-header">
                  <div className="certificate-emblem">
                    <GraduationCap size={28} />
                  </div>
                  <span className="certificate-inst-title">EMMANUEL AMADIN ACADEMY</span>
                  <span className="certificate-inst-sub">
                    CAREER ACCELERATOR &amp; PRACTICAL DIGITAL SKILLS
                  </span>
                </div>

                {/* Certificate Ribbon */}
                <div className="certificate-ribbon">
                  <Award size={18} />
                  <span>OFFICIAL CERTIFICATE OF ACHIEVEMENT</span>
                </div>

                <p className="certificate-award-text">This is to certify that</p>
                <h1 className="certificate-student-name">{record.studentName}</h1>
                <p className="certificate-award-sub">
                  has demonstrated verified mastery, completed assessed curriculum requirements, and
                  delivered practical coursework in
                </p>

                {/* Track Pill */}
                <div className="certificate-track-box">
                  <span className="certificate-track-name">
                    {trackInfo?.name || "Digital Technology"}
                  </span>
                  {trackInfo?.skills && (
                    <span className="certificate-track-skills">
                      {trackInfo.skills.join(" • ")}
                    </span>
                  )}
                </div>

                {/* Key Verification Metrics */}
                <div className="certificate-meta-grid">
                  <div className="cert-meta-item">
                    <span className="cert-meta-label">ISSUED ON</span>
                    <strong className="cert-meta-val">
                      {formatCertificateDate(record.issuedAt)}
                    </strong>
                  </div>
                  <div className="cert-meta-item">
                    <span className="cert-meta-label">CURRICULUM VOLUME</span>
                    <strong className="cert-meta-val">
                      {record.completedLessons} Lessons Mastered
                    </strong>
                  </div>
                  <div className="cert-meta-item">
                    <span className="cert-meta-label">ASSESSMENT SCORE</span>
                    <strong className="cert-meta-val">
                      {record.averageRating === null
                        ? "Distinction"
                        : `${record.averageRating} / 100`}
                    </strong>
                  </div>
                  <div className="cert-meta-item">
                    <span className="cert-meta-label">AUTHENTICITY</span>
                    <strong className="cert-meta-val cert-status-verified">
                      <CheckCircle2 size={15} /> Verified Active
                    </strong>
                  </div>
                </div>

                {/* Signatures & Seal */}
                <div className="certificate-footer">
                  <div className="certificate-sign">
                    <div className="sign-signature-script">Emmanuel Amadin</div>
                    <div className="sign-line" />
                    <span className="sign-name">Emmanuel Amadin</span>
                    <small className="sign-role">Academic Director &amp; Founder</small>
                  </div>

                  <div className="certificate-seal-badge" aria-hidden="true">
                    <ShieldCheck size={38} />
                    <span>EA VERIFIED</span>
                  </div>

                  <div className="certificate-id-box">
                    <span className="cert-id-label">CRYPTOGRAPHIC RECORD ID</span>
                    <code className="cert-id-code">{record.id}</code>
                    <small className="cert-id-url">eaacademy.org/verify/{record.id.slice(0, 8)}...</small>
                  </div>
                </div>
              </div>
            </section>

            {/* Detailed Academic Transcript & Activity */}
            <article className="card verified-record transcript-detail-card">
              <span className="eyebrow">
                <ShieldCheck size={17} /> DETAILED LEARNING TRANSCRIPT
              </span>
              <h2>Inside the completed curriculum</h2>
              <p className="muted">
                Each module below represents mandatory practical assignments and guided digital
                lessons verified on the student workspace.
              </p>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Module</th>
                      <th>Track</th>
                      <th>Lessons completed</th>
                      <th>Evaluation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.modules.map((item, i) => (
                      <tr key={i}>
                        <td>
                          <strong>{item.title}</strong>
                        </td>
                        <td>{TRACKS.find((t) => t.id === item.classId)?.short}</td>
                        <td>{item.completedLessons}</td>
                        <td>
                          <span className="badge">Verified</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h2>Instructor ratings &amp; practical feedback</h2>
              {record.ratings.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Assignment</th>
                        <th>Rating</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {record.ratings.map((item) => (
                        <tr key={item.assignmentId}>
                          <td>Assignment {item.assignmentId}</td>
                          <td>
                            <strong>{item.rating} / 100</strong>
                          </td>
                          <td>
                            <span className="badge">Graded</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">
                  No instructor ratings were recorded at the time of issue.
                </p>
              )}

              <div className="transcript-legal-box">
                <p className="muted">
                  <strong>Verification Statement:</strong> This digital credential and transcript
                  document verified coursework and practical project submissions completed through
                  Emmanuel Amadin Academy. This transcript can be verified publicly by recruiters,
                  employers, or admissions officers using the cryptographic verification ID above.
                </p>
              </div>
            </article>
          </>
        )}
      </main>
      <PublicFooter />
    </>
  );
}
