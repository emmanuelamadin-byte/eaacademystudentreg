import { z } from "zod";
import { dispatch } from "@/server/academy";
import { ApiError } from "@/server/policy";
import { failure, identity } from "@/server/supabase";
import { readLimitedBody } from "@/server/request-body";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 250000)
      throw new ApiError(413, "This request is too large.");
    const token = await identity(request);
    const raw = new TextDecoder().decode(
      await readLimitedBody(request, 250000),
    );
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new ApiError(400, "Send a valid JSON request.");
    }
    const payload = z
      .object({ action: z.string().min(1).max(80) })
      .passthrough()
      .parse(input);
    const data = await dispatch(token, payload.action, payload);
    return Response.json(
      { data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
