import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Table, Status, selectCls } from "@/components/bsec/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errMsg, useMe } from "@/lib/session";
import { solnTestConnection, solnFlushOutbox, solnSyncBalances, solnReconcile } from "@/lib/soln/soln.functions";
import { ENDPOINTS, WEBHOOK_EVENT_TYPES } from "@/lib/soln/protocol";

export const Route = createFileRoute("/_authenticated/app/integrations")({ component: Integrations });

function Integrations() {
  const qc = useQueryClient();
  const me = useMe();
  const test = useServerFn(solnTestConnection);
  const flush = useServerFn(solnFlushOutbox);
  const sync = useServerFn(solnSyncBalances);
  const recon = useServerFn(solnReconcile);
  const { data } = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      const [c, s, o, w, r, m] = await Promise.all([
        supabase.from("integration_configs").select("*").order("provider"),
        supabase.from("soln_connector_state").select("*").maybeSingle(),
        supabase.from("soln_outbox").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("soln_webhook_events").select("*").order("received_at", { ascending: false }).limit(30),
        supabase.from("soln_reconciliation_runs").select("*").order("created_at", { ascending: false }).limit(10),
        supabase.from("soln_account_mappings").select("*, enterprises(legal_name)").order("created_at"),
      ]);
      return { configs: c.data ?? [], state: s.data, outbox: o.data ?? [], hooks: w.data ?? [], runs: r.data ?? [], maps: m.data ?? [] };
    },
  });
  const run = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: (r) => { toast.message(describeResult(r)); qc.invalidateQueries({ queryKey: ["integrations"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const setMode = useMutation({
    mutationFn: async ({ id, mode }: { id: string; mode: string }) => { const { error } = await supabase.from("integration_configs").update({ mode, updated_at: new Date().toISOString() }).eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
    onError: (e) => toast.error(errMsg(e)),
  });
  const mapRef = useMutation({
    mutationFn: async ({ id, ref }: { id: string; ref: string }) => { const { error } = await supabase.from("soln_account_mappings").update({ soln_account_ref: ref || null, sync_status: "pending_sync" }).eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
    onError: (e) => toast.error(errMsg(e)),
  });
  const st = data?.state;
  const verified = st?.status === "verified";
  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/public/v1/webhooks/soln` : "";
  return (
    <div>
      <PageHeader code="BSEC-021 · Integration Settings" title="Integration Settings" desc="Core launch dependency: SOLN Central Bank / Global SOLN Reserve ledger (authoritative). Black SEC keeps read models only." />
      <Panel title="SOLN Central Bank ledger connector">
        <div className="flex flex-wrap items-center gap-4">
          <div className={`rounded-md border px-4 py-3 font-mono text-sm ${verified ? "border-success/50 text-success" : "border-warning/50 text-warning"}`}>{verified ? "CONNECTOR VERIFIED" : "CONNECTOR NOT YET VERIFIED"}</div>
          <div className="text-sm text-muted-foreground">Environment: {st?.environment} · Last check: {st?.last_check_at ? new Date(st.last_check_at).toLocaleString() : "never"}{st?.last_error && <div className="text-destructive">{st.last_error}</div>}</div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="gold" onClick={() => run.mutate(() => test())}>Test connection</Button>
            <Button variant="outline" onClick={() => run.mutate(() => flush({ data: {} }))}>Send queued</Button>
            <Button variant="outline" onClick={() => run.mutate(() => flush({ data: { replayFailed: true } }))}>Retry / replay failed</Button>
            <Button variant="outline" onClick={() => run.mutate(() => sync())}>Sync balances</Button>
            <Button variant="outline" onClick={() => run.mutate(() => recon())}>Reconcile</Button>
          </div>
        </div>
        <div className="mt-4 grid gap-4 text-xs text-muted-foreground md:grid-cols-2">
          <div>
            <div className="eyebrow mb-1">Server-side secrets required</div>
            SOLN_LEDGER_BASE_URL, SOLN_LEDGER_API_KEY, SOLN_REQUEST_SIGNING_SECRET, SOLN_WEBHOOK_SECRET, SOLN_LEDGER_ENVIRONMENT (sandbox | production)
          </div>
          <div>
            <div className="eyebrow mb-1">Inbound signed webhook</div>
            <code className="break-all">{webhookUrl}</code> · headers x-soln-signature (HMAC-SHA256 of "timestamp.body"), x-soln-timestamp · events: {WEBHOOK_EVENT_TYPES.join(", ")}
          </div>
          <div className="md:col-span-2">
            <div className="eyebrow mb-1">Outbound interface (proposed, pending SOLN schema inspection)</div>
            GET {ENDPOINTS.health} · GET {ENDPOINTS.balances("{ref}")} · POST {ENDPOINTS.syncAccount} · POST {ENDPOINTS.createInstruction} · GET {ENDPOINTS.instruction("{ref}")} · POST {ENDPOINTS.journalEvents} — all with Bearer auth, Idempotency-Key and X-BSEC-Signature.
          </div>
        </div>
      </Panel>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Outbox (idempotent, retried with backoff)">
          <Table head={["Kind", "Idempotency key", "Status", "Attempts", "Error"]} rows={(data?.outbox ?? []).map((o) => [o.kind.replace(/_/g, " "), <code className="text-[10px]">{o.idempotency_key.slice(0, 28)}</code>, <Status s={o.status} />, o.attempts, <span className="text-xs text-muted-foreground">{o.last_error}</span>])} />
        </Panel>
        <Panel title="Webhook events received">
          <Table head={["Time", "Event ID", "Type", "Processed"]} rows={(data?.hooks ?? []).map((w) => [new Date(w.received_at).toLocaleString(), <code className="text-[10px]">{w.event_id}</code>, w.event_type, w.processed ? "Yes" : w.process_error ?? "No"])} empty="No webhooks received." />
        </Panel>
      </div>
      <Panel title="Ledger account mapping (enterprise and investor accounts)" className="mt-6">
        <Table head={["Enterprise", "Subject", "Currency", "SOLN account ref", "Sync"]} rows={(data?.maps ?? []).map((m) => [m.enterprises?.legal_name ?? "—", m.subject_kind, m.currency,
          <Input defaultValue={m.soln_account_ref ?? ""} placeholder="SOLN account ref" className="h-8" disabled={!(me.data?.has("financial_ops") || me.data?.has("founding_admin"))} onBlur={(e) => e.target.value !== (m.soln_account_ref ?? "") && mapRef.mutate({ id: m.id, ref: e.target.value })} />, <Status s={m.sync_status} />])} />
      </Panel>
      <Panel title="Reconciliation runs" className="mt-6">
        <Table head={["Time", "Status", "Matched", "Mismatched"]} rows={(data?.runs ?? []).map((r) => [new Date(r.created_at).toLocaleString(), <Status s={r.status} />, r.matched, r.mismatched])} />
      </Panel>
      <Panel title="Partner integrations" className="mt-6">
        <Table head={["Provider", "Category", "Mode", "Verified", "Notes", ""]} rows={(data?.configs ?? []).map((c) => [c.provider.replace(/_/g, " "), c.category, <Status s={c.mode} />, c.verified ? "Yes" : "No", <span className="text-xs text-muted-foreground">{c.notes}</span>,
          me.data?.has("founding_admin") ? <select className={`${selectCls} h-8 w-28`} value={c.mode} onChange={(e) => setMode.mutate({ id: c.id, mode: e.target.value })}><option value="disabled">disabled</option><option value="test">test</option><option value="live" disabled={!c.verified}>live</option></select> : null])} />
        <p className="mt-3 text-xs text-muted-foreground">Live mode is blocked until the integration is verified. Global SOLN Reserve (globalsolnreserve.com) reporting is not connected.</p>
      </Panel>
    </div>
  );
}

function describeResult(r: unknown): string {
  if (!r || typeof r !== "object") return "Done";
  return Object.entries(r as Record<string, unknown>)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "object" ? (Array.isArray(v) ? v.length : "…") : String(v).replace(/_/g, " ")}`)
    .join(" · ");
}
