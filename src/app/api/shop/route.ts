import { failure } from "@/server/supabase";
import { listPublicShopItems } from "@/server/academy";

export const runtime = "nodejs";

export async function GET() {
  try {
    const items = await listPublicShopItems();
    return Response.json(
      { data: items },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      },
    );
  } catch (error) {
    return failure(error);
  }
}
