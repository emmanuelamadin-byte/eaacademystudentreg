import { TRACKS } from "./types";

export interface LinkedInCertOptions {
  certName: string;
  certId: string;
  certUrl: string;
  issuedAt: string;
  organizationName?: string;
}

/**
 * Generates an official LinkedIn "Add Certification" URL with all required fields pre-filled.
 */
export function getLinkedInCertUrl({
  certName,
  certId,
  certUrl,
  issuedAt,
  organizationName = "Emmanuel Amadin Academy",
}: LinkedInCertOptions): string {
  const date = new Date(issuedAt);
  const validDate = isNaN(date.getTime()) ? new Date() : date;
  const issueYear = validDate.getFullYear();
  const issueMonth = validDate.getMonth() + 1; // 1-indexed for LinkedIn

  const params = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: certName,
    organizationName,
    issueYear: String(issueYear),
    issueMonth: String(issueMonth),
    certUrl,
    certId,
  });

  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}

/**
 * Generates a 1-click LinkedIn feed share URL for broadcasting achievements to connections.
 */
export function getLinkedInShareUrl(certUrl: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(certUrl)}`;
}

/**
 * Returns the human-readable professional title for a track certificate.
 */
export function getCertificateTitle(trackId?: string): string {
  const track = TRACKS.find((t) => t.id === trackId);
  if (!track) return "Professional Digital Skills Certificate";
  return `${track.name} — Professional Certificate`;
}

/**
 * Formats an ISO or timestamp string into an official academic issuance date string.
 */
export function formatCertificateDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Recently Issued";
  return d.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
