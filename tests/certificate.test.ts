import { describe, expect, it } from "vitest";
import {
  getLinkedInCertUrl,
  getLinkedInShareUrl,
  getCertificateTitle,
  formatCertificateDate,
} from "../src/lib/certificate";

describe("Certificate & LinkedIn Integration (P2)", () => {
  const sampleCert = {
    certName: "Systems & Development — Professional Certificate",
    certId: "ea-cert-9988-uuid",
    certUrl: "https://student.cleanbrandagency.com/verify/ea-cert-9988-uuid",
    issuedAt: "2026-06-15T10:00:00Z",
  };

  it("builds a fully compliant 1-click LinkedIn Add-to-Profile URL", () => {
    const url = getLinkedInCertUrl(sampleCert);
    expect(url).toContain("https://www.linkedin.com/profile/add?");
    
    const parsed = new URL(url);
    expect(parsed.searchParams.get("startTask")).toBe("CERTIFICATION_NAME");
    expect(parsed.searchParams.get("name")).toBe(sampleCert.certName);
    expect(parsed.searchParams.get("organizationName")).toBe("Emmanuel Amadin Academy");
    expect(parsed.searchParams.get("issueYear")).toBe("2026");
    expect(parsed.searchParams.get("issueMonth")).toBe("6");
    expect(parsed.searchParams.get("certId")).toBe(sampleCert.certId);
    expect(parsed.searchParams.get("certUrl")).toBe(sampleCert.certUrl);
  });

  it("builds an official LinkedIn feed share URL", () => {
    const shareUrl = getLinkedInShareUrl(sampleCert.certUrl);
    expect(shareUrl).toContain("https://www.linkedin.com/sharing/share-offsite/?url=");
    expect(shareUrl).toContain(encodeURIComponent(sampleCert.certUrl));
  });

  it("returns appropriate certificate titles based on career track", () => {
    expect(getCertificateTitle("system-dev")).toBe("Systems & Development — Professional Certificate");
    expect(getCertificateTitle("creative-media")).toBe("Creative Media Studio — Professional Certificate");
    expect(getCertificateTitle("business-growth")).toBe("Business Growth & Wealth — Professional Certificate");
    expect(getCertificateTitle("unknown-track")).toBe("Professional Digital Skills Certificate");
  });

  it("formats certificate dates into formal academic locale strings", () => {
    const formatted = formatCertificateDate("2026-09-08T12:00:00Z");
    expect(formatted).toContain("2026");
    expect(formatted).toContain("September");
    expect(formatCertificateDate("invalid-date")).toBe("Recently Issued");
  });
});
