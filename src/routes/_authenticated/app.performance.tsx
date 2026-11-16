import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Table, Status, Field, selectCls, NeedEnterprise, ExportButtons, fmt } from "@/components/bsec/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errMsg, useEnterprise, useMe } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/performance")({ component: Perf });
const METRICS = ["revenue", "loss", "profit", "milestone", "jobs", "default", "insolvency", "compliance_finding", "dividend", "share_change"];

function Perf() {
  const { enterpriseId } = useEnterprise();
  const me = useMe();
  const qc = useQueryClient();
  const { data } = useQuery({
    enabled: !!enterpriseId, queryKey: ["perf", enterpriseId],
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from("performance_profiles").select("*").eq("enterprise_id", enterpriseId!),
        supabase.from("performance_records").select("*").eq("enterprise_id", enterpriseId!).order("created_at", { ascending: false }),
      ]);
      return { profiles: p.data ?? [], records: r.data ?? [] };
    },
  });
  const [f, setF] = useState({ period: "", metric: "revenue", value: "", currency: "LND", narrative: "", visibility: "private", corrects_id: "" });
  const add = useMutation({
    mutationFn: async () => {
      if (!f.period.trim()) throw new Error("Period required");
      const { error } = await supabase.from("performance_records").insert({ enterprise_id: enterpriseId!, period: f.period, metric: f.metric, value: f.value ? Number(f.value) : null, currency: f.value ? f.currency : null, narrative: f.narrative, visibility: f.visibility, corrects_id: f.corrects_id || null, created_by: me.data!.user.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Enterprise-reported record added"); qc.invalidateQueries({ queryKey: ["perf"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const review = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { verification?: string; visibility?: string } }) => { const { error } = await supabase.from("performance_records").update(patch).eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["perf"] }),
    onError: (e) => toast.error(errMsg(e)),
  });
  const reviewer = me.data?.has("compliance_officer") || me.data?.has("founding_admin");
  if (!enterpriseId) return <><PageHeader code="BSEC-025 · Performance" title="Performance" /><NeedEnterprise /></>;
  return (
    <div>
      <PageHeader code="BSEC-025 · Performance" title="Global SOLN Reserve Performance Profile" desc="Enterprise-reported vs verified metrics. Public views show only approved records. Reporting sync to globalsolnreserve.com is not connected until credentials are configured and tested." actions={<ExportButtons name="performance" rows={data?.records ?? []} />} />
      <div className="mb-6 flex gap-3">{data?.profiles.map((p) => <div key={p.id} className="rounded-md border border-border px-4 py-2 text-sm"><span className="capitalize">{p.visibility}</span> profile · <Status s={p.gsr_sync_status} /></div>)}</div>
      <Panel title="Records">
        <Table head={["Period", "Metric", "Value", "Verification", "Visibility", "Correction of", "Narrative", ""]} rows={(data?.records ?? []).map((r) => [r.period, r.metric.replace(/_/g, " "), r.value !== null ? `${fmt(r.value)} ${r.currency ?? ""}` : "—", <Status s={r.verification} />, <Status s={r.visibility} />, r.corrects_id?.slice(0, 8) ?? "—", <span className="text-xs text-muted-foreground">{r.narrative}</span>,
          reviewer ? <div className="flex gap-1">{r.verification !== "verified" && <Button size="sm" variant="outline" onClick={() => review.mutate({ id: r.id, patch: { verification: "verified" } })}>Verify</Button>}{r.visibility !== "public_approved" && <Button size="sm" variant="outline" onClick={() => review.mutate({ id: r.id, patch: { visibility: "public_approved" } })}>Publish</Button>}</div> : null])} />
      </Panel>
      <Panel title="Report a metric" className="mt-6">
        <div className="grid gap-2 md:grid-cols-4">
          <Field label="Period"><Input placeholder="2026-Q4" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} /></Field>
          <Field label="Metric"><select className={selectCls} value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value })}>{METRICS.map((m) => <option key={m}>{m}</option>)}</select></Field>
          <Field label="Value"><Input type="number" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
          <Field label="Currency"><select className={selectCls} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{["LND", "USD", "EUR", "GBP", "CAD", "NGN", "JMD", "XOF", "XCD"].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Visibility"><select className={selectCls} value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })}><option value="private">Private</option><option value="investor">Investors</option></select></Field>
          <Field label="Corrects record (optional)"><select className={selectCls} value={f.corrects_id} onChange={(e) => setF({ ...f, corrects_id: e.target.value })}><option value="">—</option>{data?.records.map((r) => <option key={r.id} value={r.id}>{r.period} {r.metric}</option>)}</select></Field>
          <div className="md:col-span-2"><Field label="Narrative"><Input value={f.narrative} onChange={(e) => setF({ ...f, narrative: e.target.value })} /></Field></div>
        </div>
        <Button variant="gold" className="mt-3" onClick={() => add.mutate()}>Submit (enterprise-reported)</Button>
      </Panel>
    </div>
  );
}
