import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Table, Status, Field } from "@/components/bsec/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errMsg, useEnterprise } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/compliance")({ component: Compliance });

function Compliance() {
  const { enterpriseId } = useEnterprise();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["compliance"],
    queryFn: async () => {
      const [c, a] = await Promise.all([
        supabase.from("compliance_items").select("*, enterprises(legal_name)").order("due_date"),
        supabase.from("surveillance_alerts").select("*").order("created_at", { ascending: false }),
      ]);
      return { items: c.data ?? [], alerts: a.data ?? [] };
    },
  });
  const [f, setF] = useState({ title: "", due_date: "" });
  const add = useMutation({
    mutationFn: async () => { if (!enterpriseId || !f.title || !f.due_date) throw new Error("Enterprise, title and date required"); const { error } = await supabase.from("compliance_items").insert({ ...f, enterprise_id: enterpriseId }); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance"] }),
    onError: (e) => toast.error(errMsg(e)),
  });
  const upd = useMutation({
    mutationFn: async ({ table, id, status }: { table: "compliance_items" | "surveillance_alerts"; id: string; status: string }) => {
      const resolution = table === "surveillance_alerts" && (status === "resolved" || status === "dismissed") ? window.prompt("Resolution note") ?? "" : null;
      const { error } = table === "surveillance_alerts" ? await supabase.from(table).update({ status, resolution }).eq("id", id) : await supabase.from(table).update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance"] }),
    onError: (e) => toast.error(errMsg(e)),
  });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div>
      <PageHeader code="BSEC-027 · Compliance" title="Compliance & Exceptions" desc="Compliance calendar, market surveillance alerts and exception resolution." />
      <Panel title="Surveillance alerts">
        <Table head={["Time", "Severity", "Kind", "Message", "Status", ""]} rows={(data?.alerts ?? []).map((a) => [new Date(a.created_at).toLocaleString(), <Status s={a.severity} />, a.kind, a.message, <Status s={a.status} />,
          a.status === "open" || a.status === "investigating" ? <div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => upd.mutate({ table: "surveillance_alerts", id: a.id, status: "investigating" })}>Investigate</Button><Button size="sm" variant="gold" onClick={() => upd.mutate({ table: "surveillance_alerts", id: a.id, status: "resolved" })}>Resolve</Button></div> : <span className="text-xs text-muted-foreground">{a.resolution}</span>])} empty="No alerts." />
      </Panel>
      <Panel title="Compliance calendar" className="mt-6">
        <Table head={["Enterprise", "Obligation", "Due", "Status", ""]} rows={(data?.items ?? []).map((c) => [c.enterprises?.legal_name, c.title, <span className={c.due_date < today && c.status === "open" ? "text-destructive" : ""}>{c.due_date}</span>, <Status s={c.status} />,
          c.status === "open" ? <Button size="sm" variant="outline" onClick={() => upd.mutate({ table: "compliance_items", id: c.id, status: "submitted" })}>Mark submitted</Button> : c.status === "submitted" ? <Button size="sm" variant="gold" onClick={() => upd.mutate({ table: "compliance_items", id: c.id, status: "accepted" })}>Accept</Button> : null])} />
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <Field label="Obligation"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Due date"><Input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
          <Button variant="gold" onClick={() => add.mutate()}>Add to selected enterprise</Button>
        </div>
      </Panel>
    </div>
  );
}
