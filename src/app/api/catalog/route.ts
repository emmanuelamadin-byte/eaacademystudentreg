import { db, failure } from "@/server/supabase";
import { TRACK_IDS } from "@/server/policy";
export const runtime = "nodejs";
export async function GET() {
  try {
    const counts = await Promise.all(
      TRACK_IDS.map(async (id) => {
        const snapshot = await db()
          .collection("users")
          .where("role", "==", "Student")
          .where("enrolledClassId", "==", id)
          .count()
          .get();
        return [id, snapshot.data().count] as const;
      }),
    );
    const sponsored = await db()
      .collection("users")
      .where("role", "==", "Student")
      .where("premiumGranted", "==", true)
      .count()
      .get();
    return Response.json(
      {
        data: {
          studentCounts: Object.fromEntries(counts),
          sponsoredStudents: sponsored.data().count,
        },
      },
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
