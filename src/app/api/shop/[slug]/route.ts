import { failure } from "@/server/supabase";
import { getPublicShopItem } from "@/server/academy";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const item = await getPublicShopItem(slug);
    return Response.json(
      { data: item },
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
