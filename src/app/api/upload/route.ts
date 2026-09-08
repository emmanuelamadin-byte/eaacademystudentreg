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
export const runtime = "nodejs";
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function hasExpectedSignature(extension: string, data: Buffer) {
  const hex = data.subarray(0, 12).toString("hex");
  switch (extension) {
    case ".pdf":
      return data.subarray(0, 5).toString() === "%PDF-";
    case ".png":
      return hex.startsWith("89504e470d0a1a0a");
    case ".jpg":
    case ".jpeg":
      return hex.startsWith("ffd8ff");
    case ".webp":
      return (
        data.subarray(0, 4).toString() === "RIFF" &&
        data.subarray(8, 12).toString() === "WEBP"
      );
    case ".doc":
      return hex.startsWith("d0cf11e0a1b11ae1");
    case ".docx":
      return (
        ["504b0304", "504b0506", "504b0708"].some((value) =>
          hex.startsWith(value),
        ) &&
        data.includes(Buffer.from("[Content_Types].xml")) &&
        data.includes(Buffer.from("word/document.xml"))
      );
    default:
      return false;
  }
}
export async function POST(request: Request) {
  try {
    const user = await actor(await identity(request));
    await limit(user.id, "upload", 10);
    if (Number(request.headers.get("content-length") || 0) > MAX_BYTES + 100000)
      throw new ApiError(413, "Files must be 5 MB or smaller.");
    const bytes = await readLimitedBody(request, MAX_BYTES + 100000);
    const form = await new Response(new Uint8Array(bytes), {
        headers: { "Content-Type": request.headers.get("content-type") || "" },
      }).formData(),
      file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > MAX_BYTES)
      throw new ApiError(400, "Choose a file up to 5 MB.");
    const extension = path.extname(file.name).toLowerCase(),
      contentType = TYPES[extension];
    if (!contentType)
      throw new ApiError(
        400,
        "Use a PDF, JPG, PNG, WebP, DOC, or DOCX file.",
      );
    const name =
      file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(-140) ||
      `attachment${extension}`;
    const objectPath = `uploads/${user.id}/${randomUUID()}-${name}`;
    const data = Buffer.from(await file.arrayBuffer());
    if (!hasExpectedSignature(extension, data))
      throw new ApiError(
        400,
        "The file contents do not match the selected file type.",
      );
    const { error: uploadError } = await storageBucket().upload(
      objectPath,
      data,
      {
        contentType,
        cacheControl: "0",
        upsert: false,
      },
    );
    if (uploadError) throw new ApiError(500, "The attachment could not be stored.");
    return Response.json(
      {
        data: {
          url: `/api/upload?path=${encodeURIComponent(objectPath)}`,
          path: objectPath,
          name,
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
    const user = await actor(await identity(request));
    const objectPath = new URL(request.url).searchParams.get("path");
    if (
      !objectPath ||
      !/^uploads\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._ -]+$/.test(objectPath) ||
      objectPath.includes("..")
    )
      throw new ApiError(400, "Invalid attachment path.");
    const owner = objectPath.split("/")[1];
    if (owner !== user.id && user.role !== "Admin") {
      if (user.role !== "Instructor")
        throw new ApiError(403, "This attachment is private.");
      const submissions = await db()
        .collection("submissions")
        .where("attachments", "array-contains", objectPath)
        .get();
      if (!submissions.docs.some((d) => managesTrack(user, d.data().classId)))
        throw new ApiError(
          403,
          "This attachment is outside your assigned tracks.",
        );
    }
    const { data, error: downloadError } = await storageBucket().download(objectPath);
    if (downloadError || !data)
      throw new ApiError(404, "Attachment not found.");
    return new Response(new Uint8Array(await data.arrayBuffer()), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${objectPath.split("/").pop()}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
