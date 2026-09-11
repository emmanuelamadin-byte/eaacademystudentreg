import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- This adapter intentionally normalizes several heterogeneous Supabase tables. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ApiError, OWNER_EMAIL } from "./policy";
import type { AcademyUser } from "@/lib/types";
import {
  collectionSpec,
  databaseField,
  documentFilters,
  rowFromDatabase,
  rowToDatabase,
  selectionFor,
} from "@/lib/supabase-data";

export type AuthToken = {
  uid: string;
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  avatar_url?: string;
  provider?: string;
};

let client: SupabaseClient | null = null;

export function adminClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret)
    throw new ApiError(503, "Supabase server credentials are not configured.");
  client = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

function throwDatabase(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === "23505")
    throw new ApiError(409, "This record already exists.");
  console.error("Supabase request failed:", error.message);
  const detail = error.message ? `: ${error.message}` : "";
  throw new ApiError(500, `The database request could not be completed${detail}.`);
}

type Filter = [string, string, unknown];

class Snapshot {
  constructor(
    public id: string,
    private value: any,
    public ref?: DocumentReference,
  ) {}
  get exists() {
    return this.value !== null;
  }
  data() {
    return this.value || undefined;
  }
}

class QuerySnapshot {
  constructor(
    public docs: Snapshot[],
    private countValue?: number | null,
  ) {}
  get empty() {
    return this.docs.length === 0;
  }
  get size() {
    return this.docs.length;
  }
  data() {
    return { count: this.countValue ?? this.docs.length };
  }
}

class DocumentReference {
  constructor(
    public collectionName: string,
    public id: string,
  ) {}
  private base() {
    const spec = collectionSpec(this.collectionName, this.id);
    const root =
      spec.schema === "private"
        ? adminClient().schema("private")
        : adminClient();
    let query: any = (root.from(spec.table) as any).select(
      selectionFor(this.collectionName),
    );
    for (const [field, value] of Object.entries(
      documentFilters(this.collectionName, this.id),
    )) {
      query = query.eq(field, value);
    }
    return { spec, query };
  }
  async get() {
    const { query } = this.base();
    const { data, error } = await query.maybeSingle();
    throwDatabase(error);
    return new Snapshot(
      this.id,
      data
        ? rowFromDatabase(this.collectionName, data as Record<string, unknown>)
        : null,
      this,
    );
  }
  async set(value: Record<string, unknown>, options?: { merge?: boolean }) {
    const spec = collectionSpec(this.collectionName, this.id);
    const root =
      spec.schema === "private"
        ? adminClient().schema("private")
        : adminClient();
    const row = {
      ...documentFilters(this.collectionName, this.id),
      ...rowToDatabase(this.collectionName, value),
    };
    if (options?.merge) {
      const { error } = await root.from(spec.table).upsert(row, {
        onConflict: spec.primary.join(","),
      });
      throwDatabase(error);
    } else {
      const { error } = await root.from(spec.table).upsert(row, {
        onConflict: spec.primary.join(","),
      });
      throwDatabase(error);
    }
  }
  async create(value: Record<string, unknown>) {
    const spec = collectionSpec(this.collectionName, this.id);
    const root =
      spec.schema === "private"
        ? adminClient().schema("private")
        : adminClient();
    const row = {
      ...documentFilters(this.collectionName, this.id),
      ...rowToDatabase(this.collectionName, value),
    };
    const { error } = await root.from(spec.table).insert(row);
    throwDatabase(error);
  }
  async update(value: Record<string, unknown>) {
    const spec = collectionSpec(this.collectionName, this.id);
    const root =
      spec.schema === "private"
        ? adminClient().schema("private")
        : adminClient();
    let query = root
      .from(spec.table)
      .update(rowToDatabase(this.collectionName, value));
    for (const [field, fieldValue] of Object.entries(
      documentFilters(this.collectionName, this.id),
    )) {
      query = query.eq(field, fieldValue);
    }
    const { error } = await query;
    throwDatabase(error);
  }
  async delete() {
    const spec = collectionSpec(this.collectionName, this.id);
    const root =
      spec.schema === "private"
        ? adminClient().schema("private")
        : adminClient();
    let query = root.from(spec.table).delete();
    for (const [field, value] of Object.entries(
      documentFilters(this.collectionName, this.id),
    )) {
      query = query.eq(field, value);
    }
    const { error } = await query;
    throwDatabase(error);
  }
}

class CollectionReference {
  private filters: Filter[] = [];
  private maximum?: number;
  private countOnly = false;
  constructor(public name: string) {}
  doc(id = crypto.randomUUID()) {
    return new DocumentReference(this.name, id);
  }
  where(field: string, operator: string, value: unknown) {
    const query = new CollectionReference(this.name);
    query.filters = [...this.filters, [field, operator, value]];
    query.maximum = this.maximum;
    return query;
  }
  limit(value: number) {
    const query = new CollectionReference(this.name);
    query.filters = [...this.filters];
    query.maximum = value;
    return query;
  }
  count() {
    const query = new CollectionReference(this.name);
    query.filters = [...this.filters];
    query.maximum = this.maximum;
    query.countOnly = true;
    return query;
  }
  async get() {
    const spec = collectionSpec(this.name);
    const root =
      spec.schema === "private"
        ? adminClient().schema("private")
        : adminClient();
    let query: any = (root.from(spec.table) as any).select(
      selectionFor(this.name),
      {
        count: this.countOnly ? "exact" : undefined,
        head: this.countOnly,
      },
    );
    for (const [field, operator, value] of this.filters) {
      const column = databaseField(this.name, field);
      if (operator === "==") query = query.eq(column, value);
      else if (operator === "in") query = query.in(column, value as unknown[]);
      else if (operator === "array-contains")
        query = query.contains(column, [value]);
      else throw new Error(`Unsupported query operator: ${operator}`);
    }
    if (this.maximum) query = query.limit(this.maximum);
    const { data, error, count } = await query;
    throwDatabase(error);
    const docs = (data || []).map((row: Record<string, unknown>) => {
      const value = rowFromDatabase(this.name, row as Record<string, unknown>);
      const id = String(value.id || (row as any)[spec.primary[0]] || "");
      const ref = new DocumentReference(this.name, id);
      return new Snapshot(id, value, ref);
    });
    return new QuerySnapshot(docs, count);
  }
}

const store = {
  collection(name: string) {
    return new CollectionReference(name);
  },
  batch() {
    const operations: (() => Promise<unknown>)[] = [];
    return {
      set(
        ref: DocumentReference,
        value: Record<string, unknown>,
        options?: { merge?: boolean },
      ) {
        operations.push(() => ref.set(value, options));
      },
      update(ref: DocumentReference, value: Record<string, unknown>) {
        operations.push(() => ref.update(value));
      },
      delete(ref: DocumentReference) {
        operations.push(() => ref.delete());
      },
      async commit() {
        for (const operation of operations) await operation();
      },
    };
  },
  async runTransaction<T>(
    callback: (transaction: {
      get: (ref: DocumentReference) => Promise<Snapshot>;
      set: (
        ref: DocumentReference,
        value: Record<string, unknown>,
        options?: { merge?: boolean },
      ) => void;
      create: (ref: DocumentReference, value: Record<string, unknown>) => void;
      update: (ref: DocumentReference, value: Record<string, unknown>) => void;
      delete: (ref: DocumentReference) => void;
    }) => Promise<T>,
  ) {
    const operations: (() => Promise<unknown>)[] = [];
    const result = await callback({
      get: (ref) => ref.get(),
      set: (ref, value, options) =>
        operations.push(() => ref.set(value, options)),
      create: (ref, value) => operations.push(() => ref.create(value)),
      update: (ref, value) => operations.push(() => ref.update(value)),
      delete: (ref) => operations.push(() => ref.delete()),
    });
    for (const operation of operations) await operation();
    return result;
  },
};

export const db = () => store;

export async function identity(request: Request): Promise<AuthToken> {
  const bearer = request.headers.get("authorization");
  if (!bearer?.startsWith("Bearer "))
    throw new ApiError(401, "Please sign in to continue.");
  const { data, error } = await adminClient().auth.getUser(bearer.slice(7));
  if (error || !data.user)
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  const metadata = data.user.user_metadata || {};
  return {
    uid: data.user.id,
    sub: data.user.id,
    email: data.user.email,
    email_verified: Boolean(data.user.email_confirmed_at),
    name: metadata.full_name || metadata.name,
    avatar_url: metadata.avatar_url,
    provider: data.user.app_metadata?.provider,
  };
}

export async function actor(token: AuthToken): Promise<AcademyUser> {
  const snap = await db().collection("users").doc(token.uid).get();
  if (!snap.exists)
    throw new ApiError(409, "Finish selecting your primary track first.");
  const user = { ...snap.data(), id: token.uid } as AcademyUser;
  if (
    user.role === "Admin" &&
    (!token.email_verified || token.email?.toLowerCase() !== OWNER_EMAIL)
  )
    throw new ApiError(403, "The administrator email must be verified.");
  return user;
}

export async function limit(
  uid: string,
  name: string,
  maximum: number,
  seconds = 60,
) {
  try {
    const { data, error } = await adminClient().rpc("consume_rate_limit", {
      p_user_id: uid,
      p_action: name,
      p_maximum: maximum,
      p_window_seconds: seconds,
    });
    if (error) {
      console.warn("Rate limit check failed, failing open for user action:", error.message);
      return;
    }
    if (data !== true)
      throw new ApiError(429, "Please wait a moment before trying again.");
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) throw err;
    console.warn("Rate limit check transient exception, failing open:", err);
  }
}

export async function reserveReview(
  studentId: string,
  period: string,
  submissionId: string,
  maximum: number,
) {
  const { data, error } = await adminClient().rpc("reserve_review_allowance", {
    p_student_id: studentId,
    p_period: period,
    p_submission_id: submissionId,
    p_maximum: maximum,
  });
  throwDatabase(error);
  return Number(data);
}

export async function reserveCritique(
  studentId: string,
  period: string,
  projectId: string,
  maximum: number,
) {
  const { data, error } = await adminClient().rpc(
    "reserve_critique_allowance",
    {
      p_student_id: studentId,
      p_period: period,
      p_project_id: projectId,
      p_maximum: maximum,
    },
  );
  throwDatabase(error);
  return Number(data);
}

export async function setStudentBirthday(
  studentId: string,
  month: number,
  day: number,
) {
  const { data, error } = await adminClient().rpc("set_student_birthday", {
    p_student_id: studentId,
    p_month: month,
    p_day: day,
  });
  if (error?.message.includes("birthday_change_limit_reached"))
    throw new ApiError(
      403,
      "You have already used your one birthday correction. Contact the academy if this is still incorrect.",
    );
  if (error?.message.includes("invalid_birthday"))
    throw new ApiError(400, "Choose a valid birthday.");
  throwDatabase(error);
  return data as { month: number; day: number; birthdayChanges: number };
}

export type StudentRosterClaim = {
  email: string;
  name: string;
  phoneNumber?: string;
  countryCode?: string;
  enrolledClassId: AcademyUser["enrolledClassId"];
  membershipPlan: "Free";
  enrolledAt: string;
  whatsappConsent: boolean;
  communicationConsentVersion?: string;
  phoneReviewRequired: boolean;
};

export async function claimStudentRoster(
  email: string,
  userId: string,
): Promise<StudentRosterClaim | undefined> {
  const { data, error } = await adminClient().rpc("claim_student_roster", {
    p_email: email,
    p_user_id: userId,
  });
  throwDatabase(error);
  return (data as StudentRosterClaim | null) || undefined;
}

export async function document(collection: string, id: string) {
  const snap = await db().collection(collection).doc(id).get();
  if (!snap.exists) throw new ApiError(404, "This item could not be found.");
  return { ...snap.data(), id: snap.id } as Record<string, unknown> & {
    id: string;
  };
}

export function failure(error: unknown) {
  if (error instanceof ApiError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error && typeof error === "object" && "issues" in error) {
    const issue = Array.isArray(error.issues) ? error.issues[0] : undefined;
    const path =
      issue &&
      typeof issue === "object" &&
      "path" in issue &&
      Array.isArray(issue.path)
        ? issue.path.join(" → ")
        : "";
    const detail =
      issue && typeof issue === "object" && "message" in issue
        ? String(issue.message)
        : "Check the form and try again.";
    return Response.json(
      { error: path ? `${path}: ${detail}` : detail },
      { status: 400 },
    );
  }
  console.error(
    "Academy request failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  return Response.json(
    { error: "The request could not be completed. Please try again." },
    { status: 500 },
  );
}

export function storageBucket() {
  return adminClient().storage.from("assignment-attachments");
}
