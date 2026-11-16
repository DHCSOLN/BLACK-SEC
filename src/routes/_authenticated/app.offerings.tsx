import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Table, Status, Field, selectCls, SandboxBanner, fmt, NeedEnterprise } from "@/components/bsec/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errMsg, useEnterprise } from "@/lib/session";
import { useCapData } from "@/lib/cap";

export const Route = createFileRoute("/_authenticated/app/offerings")({ component: Offerings });

function Offerings() {
  const { enterpriseId } = useEnterprise();
  const cap = useCapData(enterpriseId);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["offerings"], queryFn: async () => (await supabase.from("offerings").select("*, enterprises(legal_name), share_classes(name)").order("created_at", { ascending: false })).data ?? [] });
  const [f, setF] = useState({ class_id: "", title: "", price: "", quantity: "", currency: "LND", risk_summary: "" });
  const create = useMutation({
    mutationFn: async () => {
      if (!f.class_id || !f.title.trim() || !(Number(f.price) > 0) || !(Number(f.quantity) > 0)) throw new Error("All fields required with positive values");
      const { error } = await supabase.from("offerings").insert({ enterprise_id: enterpriseId!, class_id: f.class_id, title: f.title.trim(), price: Number(f.price), quantity: Number(f.quantity), currency: f.currency, risk_summary: f.risk_summary });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Draft offering created"); qc.invalidateQueries({ queryKey: ["offerings"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => { const { error } = await supabase.from("offerings").update({ status }).eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["offerings"] }),
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div>
      <PageHeader code="BSEC-012 · Offerings" title="Primary Offerings" desc="Primary offering records for sandbox simulation. No subscription funds are collected." />
      <SandboxBanner page="offerings" />
      <Panel title="Offerings">
        <Table head={["Enterprise", "Title", "Class", "Price", "Qty", "Status", "Risk", ""]} rows={(data ?? []).map((o) => [o.enterprises?.legal_name, o.title, o.share_classes?.name, `${o.price} ${o.currency}`, fmt(o.quantity), <Status s={o.status} />, <span className="text-xs text-muted-foreground">{o.risk_summary}</span>,
          <div className="flex gap-1">{o.status === "draft" && <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: o.id, status: "open" })}>Open (sandbox)</Button>}{o.status === "open" && <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: o.id, status: "closed" })}>Close</Button>}</div>])} />
      </Panel>
      {enterpriseId ? (
        <Panel title="Create draft offering" className="mt-6">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Class"><select className={selectCls} value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value })}><option value="">Select…</option>{cap.data?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="Currency"><select className={selectCls} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{["LND", "USD", "EUR", "GBP", "CAD", "NGN", "JMD", "XOF", "XCD"].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Price per share"><Input type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
            <Field label="Quantity"><Input type="number" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
            <Field label="Risk summary"><Textarea value={f.risk_summary} onChange={(e) => setF({ ...f, risk_summary: e.target.value })} /></Field>
          </div>
          <Button variant="gold" className="mt-4" onClick={() => create.mutate()}>Create draft</Button>
        </Panel>
      ) : <div className="mt-6"><NeedEnterprise /></div>}
    </div>
  );
}
