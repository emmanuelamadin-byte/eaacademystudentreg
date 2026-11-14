import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

// Run the real migrations and PL/pgSQL on an isolated PostgreSQL engine. This
// models the pre-existing Supabase auth/billing tables; no remote data is used.
let database: PGlite;
const buyerId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const campaignId = "33333333-3333-4333-8333-333333333333";
beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION private.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, raw_app_meta_data jsonb);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id), full_name text, email text,
      role text DEFAULT 'Student', primary_track text NOT NULL, membership_plan text DEFAULT 'Free',
      phone_number text, enrolled_at timestamptz DEFAULT now(), avatar_url text);
    CREATE TABLE public.billing_intents(reference text PRIMARY KEY, student_id uuid NOT NULL REFERENCES public.profiles(id),
      email text NOT NULL, kind text NOT NULL, amount_kobo bigint NOT NULL, currency text DEFAULT 'NGN',
      donor_name text, anonymous boolean DEFAULT false, recurring boolean DEFAULT false, plan_code text,
      status text DEFAULT 'pending', created_at timestamptz DEFAULT now());
    CREATE TABLE public.payments(reference text PRIMARY KEY, student_id uuid NOT NULL REFERENCES public.profiles(id),
      kind text NOT NULL, status text NOT NULL, amount numeric NOT NULL, paid_at timestamptz, created_at timestamptz DEFAULT now());
  `);
  for (const name of [
    "20260910124013_add_shop_and_digital_products_schema.sql",
    "20260925100000_harden_shop_access.sql",
    "20261114120000_landing_pages_and_guest_shop_checkout.sql",
  ]) {
    await database.exec(
      await readFile(
        new URL(`../supabase/migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
  }
}, 30000);
afterAll(async () => {
  await database?.close();
});
beforeEach(async () => {
  await database.exec(`TRUNCATE auth.users, public.profiles, public.shop_items, public.shop_purchases,
    public.payments, public.billing_intents, public.shop_landing_pages, public.shop_receipt_outbox,
    public.shop_campaign_events, public.shop_request_limits CASCADE;`);
  await database.query(
    "INSERT INTO auth.users VALUES ($1,'buyer@gmail.com',now(),'{\"providers\":[\"google\"]}'),($2,'other@gmail.com',now(),'{\"providers\":[\"google\"]}')",
    [buyerId, otherId],
  );
  await database.exec(
    "INSERT INTO public.shop_items(id,slug,type,title,price,published) VALUES ('guide','guide','digital_product','Photo Guide',7500,true)",
  );
});
async function intent(reference = "ea_guest", studentId: string | null = null) {
  await database.query(
    `INSERT INTO public.billing_intents(reference,student_id,email,kind,item_id,item_title,item_type,item_slug,
    buyer_name,amount_kobo,guest,campaign_id,initialized_at) VALUES ($1,$2,'buyer@gmail.com','shop_item','guide','Photo Guide','digital_product','guide','Buyer',750000,$3,$4,now())`,
    [reference, studentId, studentId === null, null],
  );
}
async function fulfill(
  reference = "ea_guest",
  amount = 750000,
  email = "buyer@gmail.com",
  currency = "NGN",
) {
  return database.query<{ fulfilled: boolean }>(
    "SELECT public.fulfill_shop_payment($1,$2,$3,$4,now()) AS fulfilled",
    [reference, email, amount, currency],
  );
}
async function claim(id = buyerId, email = "buyer@gmail.com") {
  return database.query<{ claimed: number }>(
    "SELECT public.claim_shop_purchases($1,$2,'Buyer',NULL) AS claimed",
    [id, email],
  );
}
describe("atomic guest commerce migration", () => {
  it("does not downgrade an existing staff account while claiming a purchase", async () => {
    await database.query(
      "INSERT INTO public.profiles(id,role,primary_track) VALUES($1,'Admin',NULL)",
      [buyerId],
    );
    await intent();
    await fulfill();
    await claim();
    expect(
      (
        await database.query(
          "SELECT role,enrollment_status FROM public.profiles WHERE id=$1",
          [buyerId],
        )
      ).rows[0],
    ).toEqual({ role: "Admin", enrollment_status: "enrolled" });
  });
  it("records a paid guest before an account profile exists and fulfills retries once", async () => {
    await intent();
    const results = await Promise.all([fulfill(), fulfill(), fulfill()]);
    expect(results.map((r) => r.rows[0].fulfilled)).toEqual([
      true,
      false,
      false,
    ]);
    expect(
      (await database.query("SELECT * FROM public.payments")).rows,
    ).toHaveLength(1);
    expect(
      (await database.query("SELECT * FROM public.shop_purchases")).rows,
    ).toHaveLength(0);
    expect(
      (await database.query("SELECT sales_count FROM public.shop_items"))
        .rows[0],
    ).toEqual({ sales_count: 1 });
    expect(
      (await database.query("SELECT * FROM public.shop_receipt_outbox")).rows,
    ).toHaveLength(1);
  });
  it("rejects amount, currency, and email mismatch without recording payment", async () => {
    await intent();
    await expect(fulfill("ea_guest", 100)).rejects.toThrow(/do not match/);
    await expect(
      fulfill("ea_guest", 750000, "other@gmail.com"),
    ).rejects.toThrow(/do not match/);
    await expect(
      fulfill("ea_guest", 750000, "buyer@gmail.com", "USD"),
    ).rejects.toThrow(/do not match/);
    expect(
      (await database.query("SELECT * FROM public.payments")).rows,
    ).toHaveLength(0);
  });
  it("claims only after matching Google verification, creates a minimal profile, and is repeatable", async () => {
    await intent();
    await fulfill();
    expect((await claim(otherId, "other@gmail.com")).rows[0].claimed).toBe(0);
    await expect(claim(otherId, "buyer@gmail.com")).rejects.toThrow(
      /Verified Google/,
    );
    expect((await claim()).rows[0].claimed).toBe(1);
    expect((await claim()).rows[0].claimed).toBe(0);
    expect(
      (
        await database.query(
          "SELECT primary_track,enrollment_status FROM public.profiles WHERE id=$1",
          [buyerId],
        )
      ).rows[0],
    ).toEqual({ primary_track: null, enrollment_status: "purchase_only" });
    expect(
      (await database.query("SELECT student_id FROM public.shop_purchases"))
        .rows[0],
    ).toEqual({ student_id: buyerId });
  });
  it("repairs a skeleton profile without changing an existing enrolled student's track", async () => {
    await database.query(
      "INSERT INTO public.profiles(id,primary_track) VALUES($1,NULL),($2,'creative-media')",
      [buyerId, otherId],
    );
    await intent();
    await fulfill();
    await claim();
    expect(
      (
        await database.query(
          "SELECT enrollment_status FROM public.profiles WHERE id=$1",
          [buyerId],
        )
      ).rows[0],
    ).toEqual({ enrollment_status: "purchase_only" });
    expect(
      (
        await database.query(
          "SELECT primary_track,enrollment_status FROM public.profiles WHERE id=$1",
          [otherId],
        )
      ).rows[0],
    ).toEqual({
      primary_track: "creative-media",
      enrollment_status: "enrolled",
    });
  });
  it("keeps the first entitlement when the same guest pays twice while recording both payments", async () => {
    await intent("ea_first");
    await fulfill("ea_first");
    await claim();
    await intent("ea_second");
    await fulfill("ea_second");
    await claim();
    expect(
      (
        await database.query(
          "SELECT payment_reference FROM public.shop_purchases",
        )
      ).rows,
    ).toEqual([{ payment_reference: "ea_first" }]);
    expect(
      (await database.query("SELECT * FROM public.payments")).rows,
    ).toHaveLength(2);
  });
  it("rolls back all payment writes if entitlement delivery fails", async () => {
    await database.query(
      "INSERT INTO public.profiles(id,primary_track) VALUES($1,'creative-media')",
      [buyerId],
    );
    await intent("ea_failure", buyerId);
    await database.exec(`CREATE FUNCTION public.test_delivery_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'delivery failed'; END $$;
      CREATE TRIGGER test_fail BEFORE INSERT ON public.shop_purchases FOR EACH ROW EXECUTE FUNCTION public.test_delivery_failure();`);
    try {
      await expect(fulfill("ea_failure")).rejects.toThrow(/delivery failed/);
      expect(
        (await database.query("SELECT * FROM public.payments")).rows,
      ).toHaveLength(0);
      expect(
        (await database.query("SELECT sales_count FROM public.shop_items"))
          .rows[0],
      ).toEqual({ sales_count: 0 });
      expect(
        (await database.query("SELECT status FROM public.billing_intents"))
          .rows[0],
      ).toEqual({ status: "pending" });
    } finally {
      await database.exec(
        "DROP TRIGGER test_fail ON public.shop_purchases; DROP FUNCTION public.test_delivery_failure()",
      );
    }
  });
  it("reserves receipt delivery once and reports payments separately from accessed purchases", async () => {
    await database.query(
      "INSERT INTO public.shop_landing_pages(id,item_id,name,slug,draft) VALUES($1,'guide','Campaign','campaign','{}')",
      [campaignId],
    );
    await intent();
    await database.query("UPDATE public.billing_intents SET campaign_id=$1", [
      campaignId,
    ]);
    await fulfill();
    const first = await database.query(
      "SELECT public.reserve_shop_receipt('ea_guest') AS reserved",
    );
    const second = await database.query(
      "SELECT public.reserve_shop_receipt('ea_guest') AS reserved",
    );
    expect(first.rows[0]).toEqual({ reserved: true });
    expect(second.rows[0]).toEqual({ reserved: false });
    const totals = await database.query<{
      totals: { payments: number; accessed: number; revenue: number };
    }>("SELECT public.shop_campaign_totals($1) AS totals", [campaignId]);
    expect(totals.rows[0].totals).toMatchObject({
      payments: 1,
      accessed: 0,
      revenue: 7500,
    });
    await claim();
    const accessed = await database.query<{ totals: { accessed: number } }>(
      "SELECT public.shop_campaign_totals($1) AS totals",
      [campaignId],
    );
    expect(accessed.rows[0].totals.accessed).toBe(1);
  });
  it("retains account requirements for memberships and revokes browser access to privileged functions", async () => {
    await expect(
      database.exec(
        "INSERT INTO public.billing_intents(reference,email,kind,amount_kobo) VALUES('bad','buyer@gmail.com','premium',1000000)",
      ),
    ).rejects.toThrow(/guest_shop_only/);
    for (const role of ["anon", "authenticated"]) {
      expect(
        (
          await database.query(
            "SELECT has_function_privilege($1,'public.claim_shop_purchases(uuid,text,text,text)','EXECUTE') AS allowed",
            [role],
          )
        ).rows[0],
      ).toEqual({ allowed: false });
      expect(
        (
          await database.query(
            "SELECT has_table_privilege($1,'public.shop_landing_pages','SELECT') AS allowed",
            [role],
          )
        ).rows[0],
      ).toEqual({ allowed: false });
    }
    await expect(
      database.exec("DELETE FROM public.shop_items WHERE id='guide'"),
    ).resolves.toBeDefined();
  });
  it("uses durable rate-limit buckets and prevents deletion of products with pending purchases", async () => {
    const results = [];
    for (let i = 0; i < 3; i++)
      results.push(
        (
          await database.query<{ allowed: boolean }>(
            "SELECT public.consume_shop_request_limit('checkout:test',2,60) AS allowed",
          )
        ).rows[0].allowed,
      );
    expect(results).toEqual([true, true, false]);
    await intent();
    await expect(
      database.exec("DELETE FROM public.shop_items WHERE id='guide'"),
    ).rejects.toThrow(/billing_intents_shop_item_fk/);
  });
});
