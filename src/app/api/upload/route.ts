import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  actor,
  db,
  failure,
  identity,
  limit,
  storageBucket,
} from "@/server/supabase";
import { ApiError, managesTrack } from "@/server/policy";
import { readLimitedBody } from "@/server/request-body";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_FILE_BYTES,
  hasExpectedSignature,
  inspectFileContent,
  sanitizeFilename,
} from "@/server/upload-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await actor(await identity(request));
    await limit(user.id, "upload", 10);
    if (
      Number(request.headers.get("content-length") || 0) >
      MAX_FILE_BYTES + 100000
    )
      throw new ApiError(413, "Files must be 2 MB or smaller.");
    const bytes = await readLimitedBody(request, MAX_FILE_BYTES + 100000);
    const form = await new Response(new Uint8Array(bytes), {
        headers: { "Content-Type": request.headers.get("content-type") || "" },
      }).formData(),
      file = form.get("file");
    if (!(file instanceof File) || !file.size)
      throw new ApiError(400, "Choose a valid file.");
    if (file.size > MAX_FILE_BYTES)
      throw new ApiError(400, "Choose a file up to 2 MB.");
    const extension = path.extname(file.name).toLowerCase(),
      contentType = ALLOWED_UPLOAD_TYPES[extension];
    if (!contentType)
      throw new ApiError(
        400,
        "Use a PDF, JPG, PNG, WebP, DOC, or DOCX file.",
      );
    const safeFilename = sanitizeFilename(file.name, extension);
    const objectPath = `uploads/${user.id}/${randomUUID()}-${safeFilename}`;
    const data = Buffer.from(await file.arrayBuffer());
    if (!hasExpectedSignature(extension, data))
      throw new ApiError(
        400,
        "The file contents do not match the selected file type.",
      );

    // Deep anti-malware, script, executable, and polyglot inspection
    inspectFileContent(extension, data);

    const { error: uploadError } = await storageBucket().upload(
      objectPath,
      data,
      {
        contentType,
        cacheControl: "0",
        upsert: false,
      },
    );
    if (uploadError)
      throw new ApiError(500, "The attachment could not be stored.");
    return Response.json(
      {
        data: {
          url: `/api/upload?path=${encodeURIComponent(objectPath)}`,
          path: objectPath,
          name: safeFilename,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function GET(request: Request) {
  try {
    const objectPath = new URL(request.url).searchParams.get("path");
    if (
      !objectPath ||
      !/^uploads\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._ -]+$/.test(objectPath) ||
      objectPath.includes("..")
    )
      throw new ApiError(400, "Invalid attachment path.");

    const ext = path.extname(objectPath).toLowerCase();
    const isImage = [".png", ".jpg", ".jpeg", ".webp"].includes(ext);

    if (!isImage) {
      const user = await actor(await identity(request));
      const owner = objectPath.split("/")[1];
      if (owner !== user.id && user.role !== "Admin") {
        if (user.role === "Instructor") {
          const submissions = await db()
            .collection("submissions")
            .where("attachments", "array-contains", objectPath)
            .get();
          if (!submissions.docs.some((d) => managesTrack(user, d.data().classId)))
            throw new ApiError(
              403,
              "This attachment is outside your assigned tracks.",
            );
        } else {
          // If uploaded by an Admin or Instructor (e.g. course resources, materials, product files),
          // allow authenticated students to download.
          const ownerDoc = await db().collection("users").doc(owner).get();
          const ownerUser = ownerDoc.data();
          const isStaffUpload =
            ownerUser?.role === "Admin" || ownerUser?.role === "Instructor";
          if (!isStaffUpload) {
            throw new ApiError(403, "This attachment is private.");
          }
        }
      }
    }

    const { data, error: downloadError } = await storageBucket().download(objectPath);
    if (downloadError || !data)
      throw new ApiError(404, "Attachment not found.");

    const rawFilename = objectPath.split("/").pop() || "attachment";
    const downloadName =
      rawFilename.replace(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/,
        "",
      ) || rawFilename;

    if (isImage) {
      const imageContentType =
        ALLOWED_UPLOAD_TYPES[ext] ||
        (ext === ".jpg" ? "image/jpeg" : `image/${ext.replace(".", "")}`);
      return new Response(new Uint8Array(await data.arrayBuffer()), {
        headers: {
          "Content-Type": imageContentType,
          "Content-Disposition": "inline",
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const docContentType =
      ALLOWED_UPLOAD_TYPES[ext] || "application/octet-stream";

    return new Response(new Uint8Array(await data.arrayBuffer()), {
      headers: {
        "Content-Type": docContentType,
        "Content-Disposition": `attachment; filename="${downloadName}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "sandbox; default-src 'none'; frame-ancestors 'none';",
        "X-Frame-Options": "DENY",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
