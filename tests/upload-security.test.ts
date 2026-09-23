import { describe, expect, it } from "vitest";
import {
  ALLOWED_UPLOAD_TYPES,
  DANGEROUS_EXT_REGEX,
  hasExpectedSignature,
  inspectFileContent,
  MAX_ATTACHMENTS_PER_SUBMISSION,
  MAX_FILE_BYTES,
  sanitizeFilename,
} from "../src/server/upload-security";
import { submissionSchema, url } from "../src/server/schemas";
import { ApiError } from "../src/server/policy";

describe("upload security and anti-malware verification", () => {
  describe("file extension and limit constants", () => {
    it("enforces 5MB max file size and max 5 attachments", () => {
      expect(MAX_FILE_BYTES).toBe(5 * 1024 * 1024);
      expect(MAX_ATTACHMENTS_PER_SUBMISSION).toBe(5);
    });

    it("only permits verified document and image extensions", () => {
      const allowed = Object.keys(ALLOWED_UPLOAD_TYPES);
      expect(allowed).toEqual([
        ".pdf",
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".doc",
        ".docx",
      ]);
      expect(allowed.includes(".exe")).toBe(false);
      expect(allowed.includes(".sh")).toBe(false);
      expect(allowed.includes(".php")).toBe(false);
      expect(allowed.includes(".svg")).toBe(false);
      expect(allowed.includes(".html")).toBe(false);
      expect(allowed.includes(".zip")).toBe(false);
    });
  });

  describe("filename sanitization", () => {
    it("preserves clean filenames with safe extensions", () => {
      expect(sanitizeFilename("my-project-assignment.pdf", ".pdf")).toBe(
        "my-project-assignment.pdf",
      );
      expect(sanitizeFilename("screenshot_final.png", ".png")).toBe(
        "screenshot_final.png",
      );
    });

    it("strips path traversal and control characters", () => {
      expect(sanitizeFilename("../../etc/passwd.pdf", ".pdf")).toBe("passwd.pdf");
      expect(sanitizeFilename("..\\..\\Windows\\calc.pdf", ".pdf")).toBe(
        "calc.pdf",
      );
      expect(sanitizeFilename("my\0secret\x07file.docx", ".docx")).toBe(
        "mysecretfile.docx",
      );
    });

    it("blocks double extension attacks concealing executables or scripts", () => {
      expect(() => sanitizeFilename("homework.exe.pdf", ".pdf")).toThrow(
        ApiError,
      );
      expect(() => sanitizeFilename("avatar.php.png", ".png")).toThrow(
        ApiError,
      );
      expect(() => sanitizeFilename("notes.sh.docx", ".docx")).toThrow(
        ApiError,
      );
      expect(() => sanitizeFilename("exploit.bat.jpg", ".jpg")).toThrow(
        ApiError,
      );
      expect(() => sanitizeFilename("payload.js.pdf", ".pdf")).toThrow(
        ApiError,
      );
    });

    it("safely handles multi-part versioned dots without dangerous extensions", () => {
      expect(sanitizeFilename("assignment.v1.draft.pdf", ".pdf")).toBe(
        "assignment_v1_draft.pdf",
      );
    });
  });

  describe("file signature & magic bytes validation", () => {
    it("validates PDF magic header", () => {
      const validPdf = Buffer.from("%PDF-1.7 header content here");
      expect(hasExpectedSignature(".pdf", validPdf)).toBe(true);
      const fakePdf = Buffer.from("NOT_A_PDF header");
      expect(hasExpectedSignature(".pdf", fakePdf)).toBe(false);
    });

    it("validates PNG magic header", () => {
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
      ]);
      expect(hasExpectedSignature(".png", pngHeader)).toBe(true);
      expect(hasExpectedSignature(".png", Buffer.from("GIF89a..."))).toBe(false);
    });

    it("validates JPEG magic header", () => {
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      expect(hasExpectedSignature(".jpg", jpegHeader)).toBe(true);
      expect(hasExpectedSignature(".jpeg", jpegHeader)).toBe(true);
    });

    it("validates WebP magic header", () => {
      const webpHeader = Buffer.concat([
        Buffer.from("RIFF"),
        Buffer.alloc(4),
        Buffer.from("WEBP"),
      ]);
      expect(hasExpectedSignature(".webp", webpHeader)).toBe(true);
      expect(hasExpectedSignature(".webp", Buffer.from("RIFF1234FAIL"))).toBe(
        false,
      );
    });

    it("validates DOC and DOCX signatures", () => {
      const docHeader = Buffer.from([
        0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00,
      ]);
      expect(hasExpectedSignature(".doc", docHeader)).toBe(true);

      const docxData = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        Buffer.from("[Content_Types].xml"),
        Buffer.from("word/document.xml"),
      ]);
      expect(hasExpectedSignature(".docx", docxData)).toBe(true);

      const fakeDocx = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      expect(hasExpectedSignature(".docx", fakeDocx)).toBe(false);
    });
  });

  describe("deep anti-malware and script inspection", () => {
    it("rejects Windows PE executable binaries (MZ)", () => {
      const peBinary = Buffer.concat([
        Buffer.from("MZ"),
        Buffer.alloc(100, 0x90),
      ]);
      expect(() => inspectFileContent(".pdf", peBinary)).toThrow(
        /Windows PE/,
      );
      expect(() => inspectFileContent(".png", peBinary)).toThrow(
        /Windows PE/,
      );
    });

    it("rejects Linux ELF binaries", () => {
      const elfBinary = Buffer.concat([
        Buffer.from([0x7f, 0x45, 0x4c, 0x46]), // \x7fELF
        Buffer.alloc(50),
      ]);
      expect(() => inspectFileContent(".pdf", elfBinary)).toThrow(/Linux ELF/);
    });

    it("rejects Mach-O / Java bytecode executables", () => {
      const javaBytecode = Buffer.concat([
        Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
        Buffer.alloc(20),
      ]);
      expect(() => inspectFileContent(".docx", javaBytecode)).toThrow(
        /bytecodes/,
      );
    });

    it("rejects Unix shell script shebangs", () => {
      const shellScript = Buffer.from("#!/bin/bash\nrm -rf /");
      expect(() => inspectFileContent(".pdf", shellScript)).toThrow(
        /Executable script/,
      );
    });

    it("rejects PDFs with embedded /JavaScript actions", () => {
      const maliciousPdf = Buffer.from(
        "%PDF-1.7\n1 0 obj\n<< /Type /Action /S /JavaScript /JS (app.alert(1);) >>\nendobj\ntrailer\n<<>>\n%%EOF",
      );
      expect(() => inspectFileContent(".pdf", maliciousPdf)).toThrow(
        /active scripts/,
      );
    });

    it("rejects PDFs with obfuscated hex-encoded /Java#53cript", () => {
      const obfuscatedPdf = Buffer.from(
        "%PDF-1.7\n1 0 obj\n<< /Type /Action /S /Java#53cript >>\nendobj\n%%EOF",
      );
      expect(() => inspectFileContent(".pdf", obfuscatedPdf)).toThrow(
        /active scripts/,
      );
    });

    it("rejects PDFs with dangerous /Launch actions", () => {
      const launchPdf = Buffer.from(
        "%PDF-1.7\n1 0 obj\n<< /Type /Action /S /Launch /F (calc.exe) >>\nendobj\n%%EOF",
      );
      expect(() => inspectFileContent(".pdf", launchPdf)).toThrow(
        /active scripts/,
      );
    });

    it("rejects PDFs with /EmbeddedFiles payloads", () => {
      const embeddedPdf = Buffer.from(
        "%PDF-1.7\n1 0 obj\n<< /Names << /EmbeddedFiles 2 0 R >> >>\nendobj\n%%EOF",
      );
      expect(() => inspectFileContent(".pdf", embeddedPdf)).toThrow(
        /active scripts/,
      );
    });

    it("allows clean benign PDFs", () => {
      const cleanPdf = Buffer.from(
        "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\ntrailer\n<< /Root 1 0 R >>\n%%EOF",
      );
      expect(() => inspectFileContent(".pdf", cleanPdf)).not.toThrow();
    });

    it("rejects Word documents containing macro streams or vbaProject.bin", () => {
      const macroDocx = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        Buffer.from("[Content_Types].xml word/document.xml word/vbaProject.bin"),
      ]);
      expect(() => inspectFileContent(".docx", macroDocx)).toThrow(
        /Macro-enabled/,
      );

      const legacyMacroDoc = Buffer.concat([
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
        Buffer.from("Binary content with VBA macros inside"),
      ]);
      expect(() => inspectFileContent(".doc", legacyMacroDoc)).toThrow(
        /Word documents containing macros/,
      );
    });

    it("rejects polyglot images with embedded HTML/script tags", () => {
      const polyglotPng = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from("IHDR...<script>alert('xss')</script>...IEND"),
      ]);
      expect(() => inspectFileContent(".png", polyglotPng)).toThrow(
        /embedded script content/,
      );

      const phpJpeg = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
        Buffer.from("JFIF...<?php passthru($_GET['cmd']); ?>"),
      ]);
      expect(() => inspectFileContent(".jpg", phpJpeg)).toThrow(
        /embedded script content/,
      );

      const eventWebp = Buffer.concat([
        Buffer.from("RIFF"),
        Buffer.alloc(4),
        Buffer.from("WEBP"),
        Buffer.from("<img src=x onerror=alert(1)>"),
      ]);
      expect(() => inspectFileContent(".webp", eventWebp)).toThrow(
        /embedded script content/,
      );
    });

    it("allows clean valid images", () => {
      const cleanPng = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(64, 0x55),
      ]);
      expect(() => inspectFileContent(".png", cleanPng)).not.toThrow();
    });
  });

  describe("submissionSchema limits and validation", () => {
    it("accepts up to 5 attachments and rejects 6 attachments", () => {
      const valid = submissionSchema.safeParse({
        assignmentId: "task-1",
        writeUp: "My solution write-up",
        attachments: [
          "uploads/user/file1.pdf",
          "uploads/user/file2.pdf",
          "uploads/user/file3.png",
          "uploads/user/file4.docx",
          "uploads/user/file5.jpg",
        ],
        status: "submitted",
      });
      expect(valid.success).toBe(true);

      const tooMany = submissionSchema.safeParse({
        assignmentId: "task-1",
        writeUp: "My solution write-up",
        attachments: [
          "uploads/user/file1.pdf",
          "uploads/user/file2.pdf",
          "uploads/user/file3.png",
          "uploads/user/file4.docx",
          "uploads/user/file5.jpg",
          "uploads/user/file6.pdf",
        ],
        status: "submitted",
      });
      expect(tooMany.success).toBe(false);
    });

    it("caps write-up at 10,000 characters", () => {
      const exact10k = submissionSchema.safeParse({
        assignmentId: "task-1",
        writeUp: "a".repeat(10000),
        status: "submitted",
      });
      expect(exact10k.success).toBe(true);

      const over10k = submissionSchema.safeParse({
        assignmentId: "task-1",
        writeUp: "a".repeat(10001),
        status: "submitted",
      });
      expect(over10k.success).toBe(false);
    });

    it("requires public HTTPS URLs and blocks private SSRF hosts", () => {
      expect(url.safeParse("https://github.com/student/project").success).toBe(
        true,
      );
      expect(url.safeParse("http://github.com/student/project").success).toBe(
        false,
      );
      expect(url.safeParse("https://localhost:3000").success).toBe(false);
      expect(url.safeParse("https://127.0.0.1:8080").success).toBe(false);
      expect(url.safeParse("https://192.168.1.1").success).toBe(false);
      expect(url.safeParse("https://10.0.0.1/admin").success).toBe(false);
      expect(url.safeParse("https://metadata.google.internal").success).toBe(
        false,
      );
    });
  });
});
