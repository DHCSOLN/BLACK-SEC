import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ENDPOINTS, hmacHex, nextRetryDelayMs } from "./protocol";

type Ctx = { supabase: { rpc: (fn: "has_role", args: { _user_id: string; _role: "founding_admin" | "financial_ops" }) => PromiseLike<{ data: boolean | null }> }; userId: string };

async function requireFinance(ctx: Ctx) {
  const [a, f] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "founding_admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "financial_ops" }),
  ]);
  if (!a.data && !f.data) throw new Error("Financial operations or founding admin role required");
}

function config() {
  const base = process.env["SOLN_LEDGER_BASE_URL"];
  const key = process.env["SOLN_LEDGER_API_KEY"];
  const signing = process.env["SOLN_REQUEST_SIGNING_SECRET"];
  const env = process.env["SOLN_LEDGER_ENVIRONMENT"] ?? "sandbox";
  return { base, key, signing, env, configured: !!(base && key) };
}

async function call(path: string, init: { method: string; body?: unknown; idempotencyKey?: string }) {
  const c = config();
  if (!c.configured) throw new Error("CONNECTOR NOT YET VERIFIED: SOLN ledger credentials not configured");
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  const ts = Math.floor(Date.now() / 1000).toString();
  const headers: Record<string, string> = { Authorization: `Bearer ${c.key}`, "Content-Type": "application/json", "X-BSEC-Timestamp": ts };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  if (c.signing && body) headers["X-BSEC-Signature"] = "sha256=" + (await hmacHex(c.signing, `${ts}.${body}`));
  const res = await fetch(c.base!.replace(/\/$/, "") + path, { method: init.method, headers, body: body ?? null, signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`SOLN ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

export const solnTestConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFinance(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const c = config();
    let status: "verified" | "not_verified" | "error" = "not_verified";
    let error: string | null = c.configured ? null : "Credentials not configured (SOLN_LEDGER_BASE_URL, SOLN_LEDGER_API_KEY)";
    let version: string | null = null;
    if (c.configured) {
      try {
        const h = await call(ENDPOINTS.health, { method: "GET" });
        version = h?.version ?? null;
        status = "verified";
      } catch (e) {
        status = "error";
        error = (e as Error).message;
      }
    }
    await supabaseAdmin.from("soln_connector_state").update({ status, last_error: error, api_version: version, environment: c.configured ? (c.env === "production" ? "production" : "sandbox") : "unconfigured", last_check_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", 1);
    return { status, error, configured: c.configured };
  });

export const solnFlushOutbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { replayFailed?: boolean }) => ({ replayFailed: !!d?.replayFailed }))
  .handler(async ({ context, data }) => {
    await requireFinance(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: st } = await supabaseAdmin.from("soln_connector_state").select("status").eq("id", 1).single();
    const statuses = data.replayFailed ? ["pending", "failed", "blocked_not_verified"] : ["pending", "blocked_not_verified"];
    const { data: items } = await supabaseAdmin.from("soln_outbox").select("*").in("status", statuses).lte("next_attempt_at", new Date().toISOString()).limit(50);
    let sent = 0, failed = 0, blocked = 0;
    for (const it of items ?? []) {
      if (st?.status !== "verified") {
        await supabaseAdmin.from("soln_outbox").update({ status: "blocked_not_verified", last_error: "CONNECTOR NOT YET VERIFIED", updated_at: new Date().toISOString() }).eq("id", it.id);
        blocked++;
        continue;
      }
      const path = it.kind === "create_instruction" ? ENDPOINTS.createInstruction : it.kind === "post_journal_event" ? ENDPOINTS.journalEvents : ENDPOINTS.syncAccount;
      try {
        const r = await call(path, { method: "POST", body: it.payload, idempotencyKey: it.idempotency_key });
        await supabaseAdmin.from("soln_outbox").update({ status: "sent", soln_ref: r?.soln_ref ?? null, attempts: it.attempts + 1, last_error: null, updated_at: new Date().toISOString() }).eq("id", it.id);
        sent++;
      } catch (e) {
        await supabaseAdmin.from("soln_outbox").update({ status: "failed", attempts: it.attempts + 1, last_error: (e as Error).message, next_attempt_at: new Date(Date.now() + nextRetryDelayMs(it.attempts + 1)).toISOString(), updated_at: new Date().toISOString() }).eq("id", it.id);
        failed++;
      }
    }
    return { sent, failed, blocked };
  });

export const solnSyncBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFinance(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: st } = await supabaseAdmin.from("soln_connector_state").select("status").eq("id", 1).single();
    if (st?.status !== "verified") return { synced: 0, message: "CONNECTOR NOT YET VERIFIED — no balances fetched or shown." };
    const { data: maps } = await supabaseAdmin.from("soln_account_mappings").select("*").not("soln_account_ref", "is", null);
    let synced = 0;
    for (const m of maps ?? []) {
      try {
        const r = await call(ENDPOINTS.balances(m.soln_account_ref!), { method: "GET" });
        for (const b of r?.balances ?? []) {
          await supabaseAdmin.from("soln_balance_cache").insert({ mapping_id: m.id, currency: b.currency, balance: b.balance, as_of: b.as_of });
        }
        await supabaseAdmin.from("soln_account_mappings").update({ sync_status: "synced", last_synced_at: new Date().toISOString() }).eq("id", m.id);
        synced++;
      } catch {
        await supabaseAdmin.from("soln_account_mappings").update({ sync_status: "error" }).eq("id", m.id);
      }
    }
    return { synced, message: `${synced} accounts synced from SOLN ledger` };
  });

export const solnReconcile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFinance(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: st } = await supabaseAdmin.from("soln_connector_state").select("status").eq("id", 1).single();
    if (st?.status !== "verified") {
      await supabaseAdmin.from("soln_reconciliation_runs").insert({ status: "blocked_not_verified", started_by: context.userId, details: { reason: "CONNECTOR NOT YET VERIFIED" } });
      return { status: "blocked_not_verified" };
    }
    const { data: sent } = await supabaseAdmin.from("soln_outbox").select("*").in("status", ["sent", "acknowledged"]).not("soln_ref", "is", null).limit(200);
    let matched = 0, mismatched = 0;
    const mismatches: { id: string; soln_ref?: string | null; error?: string }[] = [];
    for (const it of sent ?? []) {
      try {
        const r = await call(ENDPOINTS.instruction(it.soln_ref!), { method: "GET" });
        if (r?.idempotency_key === it.idempotency_key) { matched++; await supabaseAdmin.from("soln_outbox").update({ status: "acknowledged" }).eq("id", it.id); }
        else { mismatched++; mismatches.push({ id: it.id, soln_ref: it.soln_ref }); }
      } catch (e) { mismatched++; mismatches.push({ id: it.id, error: (e as Error).message }); }
    }
    await supabaseAdmin.from("soln_reconciliation_runs").insert({ status: "completed", matched, mismatched, details: { mismatches }, started_by: context.userId });
    return { status: "completed", matched, mismatched };
  });
