import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifySignature, webhookEffect, WEBHOOK_EVENT_TYPES } from "@/lib/soln/protocol";

const Envelope = z.object({
  event_id: z.string().min(1).max(200),
  type: z.enum(WEBHOOK_EVENT_TYPES),
  occurred_at: z.string().max(64),
  data: z.object({
    idempotency_key: z.string().max(300).optional(),
    soln_ref: z.string().max(300).optional(),
    account_ref: z.string().max(300).optional(),
    currency: z.string().max(8).optional(),
    balance: z.string().max(64).optional(),
    as_of: z.string().max(64).optional(),
    reason: z.string().max(1000).optional(),
  }),
});

export const Route = createFileRoute("/api/public/v1/webhooks/soln")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["SOLN_WEBHOOK_SECRET"];
        if (!secret) return Response.json({ error: "CONNECTOR NOT YET VERIFIED: webhook secret not configured" }, { status: 503 });
        const body = await request.text();
        const ok = await verifySignature(secret, body, request.headers.get("x-soln-signature"), request.headers.get("x-soln-timestamp"));
        if (!ok) return Response.json({ error: "invalid signature" }, { status: 401 });
        const parsed = Envelope.safeParse(JSON.parse(body));
        if (!parsed.success) return Response.json({ error: "invalid payload" }, { status: 400 });
        const ev = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error: dup } = await supabaseAdmin.from("soln_webhook_events").insert({ event_id: ev.event_id, event_type: ev.type, payload: ev });
        if (dup) return Response.json({ ok: true, duplicate: true }); // idempotent replay
        try {
          const eff = webhookEffect(ev.type);
          const key = ev.data.idempotency_key;
          if (key) {
            const { data: ob } = await supabaseAdmin.from("soln_outbox").select("*").eq("idempotency_key", key).maybeSingle();
            if (ob) {
              await supabaseAdmin.from("soln_outbox").update({ status: "acknowledged", soln_ref: ev.data.soln_ref ?? ob.soln_ref }).eq("id", ob.id);
              const isTrade = (ob.payload as { type?: string } | null)?.type === "trade_settlement";
              if (isTrade) {
                const { error: te } = await supabaseAdmin.rpc("apply_trade_settlement_event", { _idem: key, _event: ev.type, _soln_ref: ev.data.soln_ref ?? "", _reason: ev.data.reason ?? "" });
                if (te) throw te;
              } else if (ob.kind === "create_instruction" && ob.ref_id) await supabaseAdmin.from("std_instructions").update({ ...eff, soln_ref: ev.data.soln_ref ?? null }).eq("id", ob.ref_id);
              if (ob.kind === "post_journal_event" && ob.ref_id && eff.soln_posting_status) {
                // journal_entries is append-only; posting status is tracked on the outbox + webhook log.
              }
            }
          }
          await supabaseAdmin.from("soln_webhook_events").update({ processed: true }).eq("event_id", ev.event_id);
        } catch (e) {
          await supabaseAdmin.from("soln_webhook_events").update({ process_error: (e as Error).message }).eq("event_id", ev.event_id);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
