import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Table, Status, Field, selectCls, fmt, ExportButtons } from "@/components/bsec/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errMsg, useEnterprises, useMe } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/investors")({ component: Investors });

function Investors() {
  const me = useMe();
  const qc = useQueryClient();
  const ents = useEnterprises();
  const { data } = useQuery({
    queryKey: ["investor-portal"],
    queryFn: async () => {
      const [h, d, r] = await Promise.all([
        supabase.rpc("my_holdings"),
        supabase.from("disclosures").select("*, enterprises(legal_name)").eq("status", "approved").order("created_at", { ascending: false }),
        supabase.from("investor_requests").select("*, enterprises(legal_name)").order("created_at", { ascending: false }),
      ]);
      return { holdings: h.data ?? [], disclosures: d.data ?? [], requests: r.data ?? [] };
    },
  });
  const [f, setF] = useState({ enterprise_id: "", kind: "complaint", subject: "", body: "" });
  const submit = useMutation({
    mutationFn: async () => {
      if (!f.enterprise_id || f.subject.trim().length < 3 || f.body.trim().length < 3) throw new Error("Enterprise, subject and details required");
      const { error } = await supabase.from("investor_requests").insert({ ...f, user_id: me.data!.user.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Request submitted"); setF({ ...f, subject: "", body: "" }); qc.invalidateQueries({ queryKey: ["investor-portal"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const respond = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = window.prompt("Response to investor") ?? "";
      const { error } = await supabase.from("investor_requests").update({ status, response }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["investor-portal"] }),
    onError: (e) => toast.error(errMsg(e)),
  });
  const active = (ents.data ?? []).filter((e) => e.status === "active");
  return (
    <div>
      <PageHeader code="BSEC-014 · Investors" title="Investor Portal" desc="Investors see only their own holdings, approved disclosures and their own requests." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="My holdings" actions={<ExportButtons name="my-holdings" rows={data?.holdings ?? []} />}>
          <Table head={["Enterprise", "Class", "Quantity"]} rows={(data?.holdings ?? []).map((h) => [h.legal_name, h.class_name, fmt(h.quantity)])} empty="No holdings linked to your account." />
        </Panel>
        <Panel title="Eligible enterprise profiles">
          <Table head={["Enterprise", "Jurisdiction", "Registry"]} rows={active.map((e) => [e.legal_name, e.jurisdiction, <Status s={e.registry_membership_status} />])} />
        </Panel>
      </div>
      <Panel title="Disclosures, risks, dividend notices & corporate actions" className="mt-6">
        <Table head={["Enterprise", "Category", "Title", "Risk", "Body"]} rows={(data?.disclosures ?? []).map((d) => [d.enterprises?.legal_name, d.category.replace(/_/g, " "), d.title, <Status s={d.risk_level} />, <span className="text-xs text-muted-foreground">{d.body}</span>])} />
      </Panel>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Submit complaint or secondary transfer request">
          <div className="space-y-3">
            <Field label="Enterprise"><select className={selectCls} value={f.enterprise_id} onChange={(e) => setF({ ...f, enterprise_id: e.target.value })}><option value="">Select…</option>{active.map((e) => <option key={e.id} value={e.id}>{e.legal_name}</option>)}</select></Field>
            <Field label="Type"><select className={selectCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="complaint">Complaint</option><option value="secondary_transfer">Secondary transfer request</option><option value="information">Information request</option></select></Field>
            <Field label="Subject"><Input value={f.subject} maxLength={200} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
            <Field label="Details"><Textarea value={f.body} maxLength={5000} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
            <Button variant="gold" onClick={() => submit.mutate()}>Submit</Button>
          </div>
        </Panel>
        <Panel title="Requests">
          <Table head={["Enterprise", "Type", "Subject", "Status", ""]} rows={(data?.requests ?? []).map((r) => [r.enterprises?.legal_name, r.kind, r.subject, <Status s={r.status} />,
            me.data?.isStaff && r.status !== "resolved" ? <Button size="sm" variant="outline" onClick={() => respond.mutate({ id: r.id, status: "resolved" })}>Resolve</Button> : <span className="text-xs text-muted-foreground">{r.response}</span>])} />
        </Panel>
      </div>
    </div>
  );
}
