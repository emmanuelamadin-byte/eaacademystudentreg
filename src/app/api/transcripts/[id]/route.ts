import { document, failure } from "@/server/supabase";
import { id } from "@/server/schemas";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const value = id.parse((await params).id);
    return Response.json(
      { data: await document("transcripts", value) },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  } catch (error) {
    return failure(error);
  }
}
