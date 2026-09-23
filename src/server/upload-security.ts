import path from "node:path";
import { ApiError } from "@/server/policy";

export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_ATTACHMENTS_PER_SUBMISSION = 5;
export const MAX_TOTAL_SUBMISSION_BYTES = 15 * 1024 * 1024; // 15 MB

export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// Dangerous executable, script, and web markup extensions
export const DANGEROUS_EXT_REGEX =
  /\.(exe|bat|cmd|sh|bash|zsh|php|phtml|php[34578]?|js|mjs|cjs|ts|tsx|jsx|vbs|vbe|ps1|ps2|py|pyc|rb|pl|cgi|jar|war|ear|msi|dll|sys|scr|pif|com|hta|cpl|svg|html|htm|xhtml|asp|aspx|jsp|jspx|shtml|cer|crt|wsf|gadget|iso|dmg|app|deb|rpm|apk|bin)$/i;

/**
 * Sanitizes original filename:
 * - Strips directory traversal (../, ..\) and separators.
 * - Strips null bytes and non-printable control characters.
 * - Detects and blocks double extension attacks (e.g. exploit.exe.pdf, file.php.png).
 * - Enforces safe alphanumeric + underscore/hyphen characters and bounded length.
 */
export function sanitizeFilename(originalName: string, expectedExt: string): string {
  if (!originalName || typeof originalName !== "string") {
    return `attachment${expectedExt}`;
  }

  // Strip path traversal and directory structure
  const rawBasename = path.basename(originalName).trim();
  // Strip null bytes and non-printable control characters
  const cleaned = rawBasename.replace(/[\x00-\x1f\x7f]/g, "");

  // Prevent double extension tricks (e.g., malware.pdf.exe, file.php.png, payload.exe.pdf)
  const parts = cleaned.split(".").filter(Boolean);
  if (parts.length > 2) {
    for (let i = 0; i < parts.length - 1; i++) {
      if (DANGEROUS_EXT_REGEX.test(`.${parts[i]}`)) {
        throw new ApiError(
          400,
          "Filenames containing executable or script extensions are not permitted.",
        );
      }
    }
  }

  // Base name without extension
  const rawBase = parts.slice(0, -1).join("_") || "attachment";
  const safeBase = rawBase
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 60);

  return `${safeBase || "attachment"}${expectedExt}`;
}

/**
 * Validates magic numbers and required binary structure for the declared extension.
 */
export function hasExpectedSignature(extension: string, data: Buffer): boolean {
  if (data.length < 4) return false;
  const hex = data.subarray(0, 16).toString("hex").toLowerCase();

  switch (extension) {
    case ".pdf":
      return data.subarray(0, 5).toString("ascii") === "%PDF-";
    case ".png":
      return hex.startsWith("89504e470d0a1a0a");
    case ".jpg":
    case ".jpeg":
      return hex.startsWith("ffd8ff");
    case ".webp":
      return (
        data.length >= 12 &&
        data.subarray(0, 4).toString("ascii") === "RIFF" &&
        data.subarray(8, 12).toString("ascii") === "WEBP"
      );
    case ".doc":
      return hex.startsWith("d0cf11e0a1b11ae1");
    case ".docx":
      return (
        ["504b0304", "504b0506", "504b0708"].some((val) =>
          hex.startsWith(val),
        ) &&
        data.includes(Buffer.from("[Content_Types].xml")) &&
        data.includes(Buffer.from("word/document.xml"))
      );
    default:
      return false;
  }
}

/**
 * Deep file inspection to detect active scripts, malware signatures, macros, and polyglots.
 */
export function inspectFileContent(extension: string, data: Buffer): void {
  if (data.length < 8) {
    throw new ApiError(400, "File is too small or corrupted.");
  }

  // 1. Generic binary executable checks across all uploads
  // Windows PE: "MZ" (0x4d5a)
  if (data.subarray(0, 2).toString("ascii") === "MZ") {
    throw new ApiError(400, "Executable files (Windows PE) are not permitted.");
  }
  // Linux ELF: 0x7f, 'E', 'L', 'F'
  if (data.subarray(0, 4).toString("hex").toLowerCase() === "7f454c46") {
    throw new ApiError(400, "Executable files (Linux ELF) are not permitted.");
  }
  // Mach-O and Java Bytecode: feedface, feedfacf, cffaedfe, cefaedfe, cafebabe
  const magic4 = data.subarray(0, 4).toString("hex").toLowerCase();
  if (
    ["feedface", "feedfacf", "cffaedfe", "cefaedfe", "cafebabe"].includes(
      magic4,
    )
  ) {
    throw new ApiError(
      400,
      "Binary executables or compiled bytecodes are not permitted.",
    );
  }
  // Unix shell shebang: "#!"
  if (data.subarray(0, 2).toString("ascii") === "#!") {
    throw new ApiError(400, "Executable script files are not permitted.");
  }

  // 2. Format-specific deep inspection
  if (extension === ".pdf") {
    // Scan PDF byte stream for active scripting or launch actions
    const pdfText = data.toString("latin1");
    // Normalize PDF hex character escapes (e.g., #53 -> S, #20 -> space)
    const normalized = pdfText.replace(/#([0-9a-fA-F]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );

    const dangerousPdfPatterns = [
      /\/JavaScript\b/i,
      /\/JS\b/i,
      /\/Launch\b/i,
      /\/EmbeddedFiles\b/i,
      /\/SubmitForm\b/i,
      /\/ImportData\b/i,
      /\/RichMedia\b/i,
    ];

    for (const pattern of dangerousPdfPatterns) {
      if (pattern.test(normalized)) {
        throw new ApiError(
          400,
          "PDF contains active scripts or embedded actions, which are not permitted for security reasons.",
        );
      }
    }
  } else if (extension === ".docx") {
    // Detect Word Macro-Enabled documents (.docm) masquerading as .docx, VBA streams, or ActiveX
    if (
      data.includes(Buffer.from("vbaProject.bin")) ||
      data.includes(Buffer.from("vbaData.xml")) ||
      data.includes(Buffer.from("macroEnabled")) ||
      data.includes(Buffer.from("word/activeX"))
    ) {
      throw new ApiError(
        400,
        "Macro-enabled or ActiveX Word documents are not permitted.",
      );
    }
  } else if (extension === ".doc") {
    // Detect legacy Word VBA / Macro streams
    if (
      data.includes(Buffer.from("VBA")) ||
      data.includes(Buffer.from("Macros")) ||
      data.includes(Buffer.from("_VBA_PROJECT"))
    ) {
      throw new ApiError(
        400,
        "Legacy Word documents containing macros are not permitted.",
      );
    }
  } else if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    // Polyglot image detection: detect embedded HTML / PHP / JS code inside image byte streams
    const textSample = data.toString("latin1").toLowerCase();
    const polyglotPatterns = [
      /<script\b/i,
      /javascript:/i,
      /<\?php/i,
      /<%/,
      /<html\b/i,
      /\bonload\s*=/i,
      /\bonerror\s*=/i,
      /document\.cookie/i,
    ];

    for (const pattern of polyglotPatterns) {
      if (pattern.test(textSample)) {
        throw new ApiError(
          400,
          "The uploaded image contains suspicious or embedded script content.",
        );
      }
    }
  }
}
