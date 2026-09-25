import { z } from "zod";
import { readLimitedBody } from "@/server/request-body";
import {
  extractTikTokRequestContext,
  sendTikTokServerEvent,
  type TikTokEventName,
} from "@/server/tiktok";

export const runtime = "nodejs";

const ALLOWED_EVENTS: [TikTokEventName, ...TikTokEventName[]] = [
  "ViewContent",
  "AddToWishlist",
  "Search",
  "AddPaymentInfo",
  "AddToCart",
  "InitiateCheckout",
  "PlaceAnOrder",
  "CompleteRegistration",
  "Purchase",
  "CompletePayment",
];

const eventSchema = z.object({
  event: z.enum(ALLOWED_EVENTS),
  event_id: z.string().max(160).optional(),
  timestamp: z.number().optional(),
  url: z.string().max(2048).optional(),
  referrer: z.string().max(2048).optional(),
  properties: z
    .object({
      value: z.number().optional(),
      currency: z.string().max(10).optional(),
      content_id: z.string().max(200).optional(),
      content_type: z.string().max(60).optional(),
      content_name: z.string().max(300).optional(),
      content_category: z.string().max(200).optional(),
      query: z.string().max(300).optional(),
      brand: z.string().max(120).optional(),
      url: z.string().max(2048).optional(),
    })
    .optional(),
  user: z
    .object({
      email: z.string().max(320).nullable().optional(),
      phone_number: z.string().max(60).nullable().optional(),
      external_id: z.string().max(200).nullable().optional(),
      callback: z.string().max(500).nullable().optional(),
      ttclid: z.string().max(500).nullable().optional(),
      ttp: z.string().max(500).nullable().optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 32000) {
      return Response.json({ ok: false }, { status: 413 });
    }
    const raw = new TextDecoder().decode(await readLimitedBody(request, 32000));
    const parsed = eventSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return Response.json({ ok: false }, { status: 400 });
    }

    const body = parsed.data;
    const reqCtx = extractTikTokRequestContext(request);

    const result = await sendTikTokServerEvent({
      event: body.event,
      event_id: body.event_id,
      timestamp: body.timestamp,
      url: body.url || body.properties?.url,
      referrer: body.referrer || reqCtx.referrer,
      properties: body.properties,
      user: {
        email: body.user?.email,
        phone_number: body.user?.phone_number,
        external_id: body.user?.external_id,
        ip: reqCtx.ip,
        user_agent: reqCtx.user_agent,
        ttp: body.user?.ttp || reqCtx.ttp,
        ttclid:
          body.user?.ttclid || body.user?.callback || reqCtx.ttclid,
      },
    });

    // If the event is "Purchase", also send "CompletePayment" so both TikTok standard purchase event names are populated
    if (body.event === "Purchase") {
      void sendTikTokServerEvent({
        event: "CompletePayment",
        event_id: body.event_id ? `${body.event_id}_cp` : undefined,
        timestamp: body.timestamp,
        url: body.url || body.properties?.url,
        referrer: body.referrer || reqCtx.referrer,
        properties: body.properties,
        user: {
          email: body.user?.email,
          phone_number: body.user?.phone_number,
          external_id: body.user?.external_id,
          ip: reqCtx.ip,
          user_agent: reqCtx.user_agent,
          ttp: body.user?.ttp || reqCtx.ttp,
          ttclid:
            body.user?.ttclid || body.user?.callback || reqCtx.ttclid,
        },
      });
    }

    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ ok: false }, { status: 200 });
  }
}
