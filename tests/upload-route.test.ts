import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(),
  downloadData: new Uint8Array([137, 80, 78, 71]), // dummy bytes
  downloadError: null as Error | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("../src/server/supabase", () => {
  const snapshot = (path: string) => ({
    exists: state.documents.has(path),
    data: () => state.documents.get(path),
  });
  const reference = (path: string) => ({
    path,
    get: async () => snapshot(path),
  });
  const store = {
    collection: (name: string) => ({
      doc: (id: string) => reference(`${name}/${id}`),
      where: (field: string, operator: string, value: unknown) => ({
        get: async () => {
          const docs = Array.from(state.documents.entries())
            .filter(([key, data]) =>
              key.startsWith(`${name}/`) &&
              (operator === "in"
                ? (value as unknown[]).includes(data[field])
                : data[field] === value),
            )
            .map(([key]) => ({ id: key.slice(name.length + 1) }));
          return { empty: docs.length === 0, docs };
        },
      }),
    }),
  };
  return {
    db: () => store,
    actor: async (token: { uid: string }) => ({
      id: token.uid,
      role: token.uid === "admin-user" ? "Admin" : "Student",
    }),
    identity: async (request: Request) => {
      const bearer = request.headers.get("authorization");
      if (!bearer?.startsWith("Bearer ")) {
        const error = new Error("Please sign in to continue.");
        (error as unknown as { status: number }).status = 401;
        throw error;
      }
      return { uid: bearer.replace("Bearer ", "") };
    },
    limit: async () => {},
    storageBucket: () => ({
      download: async () => {
        if (state.downloadError) return { data: null, error: state.downloadError };
        return {
          data: {
            arrayBuffer: async () => state.downloadData.buffer,
          },
          error: null,
        };
      },
    }),
    failure: (error: unknown) => {
      const status = (error as { status?: number })?.status || 500;
      const message = (error as { message?: string })?.message || "Failed";
      return Response.json({ error: message }, { status });
    },
  };
});

import { GET } from "../src/app/api/upload/route";

describe("GET /api/upload", () => {
  beforeEach(() => {
    state.documents.clear();
    state.downloadError = null;
    state.documents.set("users/admin-123", { id: "admin-123", role: "Admin" });
  });

  it("rejects missing or traversal paths", async () => {
    const resNoPath = await GET(new Request("http://localhost:3000/api/upload"));
    expect(resNoPath.status).toBe(400);

    const resTraversal = await GET(
      new Request("http://localhost:3000/api/upload?path=uploads/user/../secret.pdf"),
    );
    expect(resTraversal.status).toBe(400);
  });

  it("serves image thumbnails publicly and inline without requiring auth headers for staff", async () => {
    const req = new Request(
      "http://localhost:3000/api/upload?path=uploads/admin-123/cover-image.png",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Content-Disposition")).toBe("inline");
    expect(res.headers.get("Cache-Control")).toContain("public");
  });

  it("serves jpeg images inline", async () => {
    const req = new Request(
      "http://localhost:3000/api/upload?path=uploads/admin-123/thumbnail.jpg",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Content-Disposition")).toBe("inline");
  });

  it("protects student image uploads from unauthenticated or unauthorized access", async () => {
    state.documents.set("users/student-789", { id: "student-789", role: "Student" });

    // 1. Unauthenticated request to student image upload must be rejected with 401
    const unauthReq = new Request(
      "http://localhost:3000/api/upload?path=uploads/student-789/homework.png",
    );
    const unauthRes = await GET(unauthReq);
    expect(unauthRes.status).toBe(401);

    // 2. Another student requesting student-789's image upload must be rejected with 403
    const otherStudentReq = new Request(
      "http://localhost:3000/api/upload?path=uploads/student-789/homework.png",
      { headers: { Authorization: "Bearer student-456" } },
    );
    const otherStudentRes = await GET(otherStudentReq);
    expect(otherStudentRes.status).toBe(403);

    // 3. The owning student can access their image upload with private cache-control
    const ownerReq = new Request(
      "http://localhost:3000/api/upload?path=uploads/student-789/homework.png",
      { headers: { Authorization: "Bearer student-789" } },
    );
    const ownerRes = await GET(ownerReq);
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.headers.get("Cache-Control")).toContain("no-store");
  });

  it("requires authentication for documents like PDF cheat sheets", async () => {
    const reqNoAuth = new Request(
      "http://localhost:3000/api/upload?path=uploads/admin-123/notes.pdf",
    );
    const resNoAuth = await GET(reqNoAuth);
    expect(resNoAuth.status).toBe(401);
  });

  it("allows authenticated students to download staff-uploaded lesson PDFs", async () => {
    // Owner is admin
    state.documents.set("users/admin-123", { id: "admin-123", role: "Admin" });

    const reqWithAuth = new Request(
      "http://localhost:3000/api/upload?path=uploads/admin-123/notes.pdf",
      {
        headers: { Authorization: "Bearer student-456" },
      },
    );
    const res = await GET(reqWithAuth);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
  });

  it("requires a purchase for a staff-uploaded digital product", async () => {
    const objectPath = "uploads/admin-123/handbook.pdf";
    state.documents.set("users/admin-123", { role: "Admin" });
    state.documents.set("shopItems/handbook", {
      fileUrl: `/api/upload?path=${encodeURIComponent(objectPath)}`,
    });
    const url = `http://localhost:3000/api/upload?path=${encodeURIComponent(objectPath)}`;

    expect((await GET(new Request(url))).status).toBe(401);
    expect((await GET(new Request(url, {
      headers: { Authorization: "Bearer student-456" },
    }))).status).toBe(403);

    state.documents.set("shopPurchases/student-456_handbook", {
      studentId: "student-456",
      itemId: "handbook",
    });
    const purchased = await GET(new Request(url, {
      headers: { Authorization: "Bearer student-456" },
    }));
    expect(purchased.status).toBe(200);
    expect(purchased.headers.get("Cache-Control")).toContain("no-store");
  });

  it("does not publicly cache or serve purchased image files", async () => {
    const objectPath = "uploads/admin-123/template.png";
    state.documents.set("shopItems/template", {
      fileUrl: `/api/upload?path=${encodeURIComponent(objectPath)}`,
    });
    const url = `http://localhost:3000/api/upload?path=${encodeURIComponent(objectPath)}`;

    expect((await GET(new Request(url))).status).toBe(401);
    state.documents.set("shopPurchases/student-456_template", {
      studentId: "student-456",
      itemId: "template",
    });
    const purchased = await GET(new Request(url, {
      headers: { Authorization: "Bearer student-456" },
    }));
    expect(purchased.status).toBe(200);
    expect(purchased.headers.get("Cache-Control")).toContain("no-store");
  });
});
