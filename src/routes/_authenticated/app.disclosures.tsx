import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Table, Status, Field, selectCls, NeedEnterprise } from "@/components/bsec/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errMsg, useEnterprise, useMe } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/disclosures")({ component: Disc });

function Disc() {
  const { enterpriseId } = useEnterprise();
  const me = useMe();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["disc"], queryFn: async () => (await supabase.from("disclosures").select("*, enterprises(legal_name)").order("created_at", { ascending: false })).data ?? [] });
  const [f, setF] = useState({ title: "", category: "general", body: "", risk_level: "medium" });
  const add = useMutation({
    mutationFn: async () => {
      if (!f.title.trim() || !f.body.trim()) throw new Error("Title and body required");
      const { error } = await supabase.from("disclosures").insert({ ...f, enterprise_id: enterpriseId!, status: "draft" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Draft created"); qc.invalidateQueries({ queryKey: ["disc"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: { status: string; approved_by?: string; approved_at?: string } = { status };
      if (status === "approved") { patch.approved_by = me.data!.user.id; patch.approved_at = new Date().toISOString(); }
      const { error } = await supabase.from("disclosures").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["disc"] }),
    onError: (e) => toast.error(errMsg(e)),
  });
  const reviewer = me.data?.has("compliance_officer") || me.data?.has("founding_admin");
  return (
    <div>
      <PageHeader code="BSEC-016 · Disclosures" title="Disclosures" desc="Draft, submit and approve disclosures. Only approved disclosures are visible to investors." />
      <Panel title="Disclosure workspace">
        <Table head={["Enterprise", "Category", "Title", "Risk", "Status", ""]} rows={(data ?? []).map((d) => [d.enterprises?.legal_name, d.category.replace(/_/g, " "), d.title, <Status s={d.risk_level} />, <Status s={d.status} />,
          <div className="flex gap-1">
            {(d.status === "draft" || d.status === "rejected") && <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: d.id, status: "submitted" })}>Submit</Button>}
            {reviewer && d.status === "submitted" && <><Button size="sm" variant="gold" onClick={() => setStatus.mutate({ id: d.id, status: "approved" })}>Approve</Button><Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: d.id, status: "rejected" })}>Reject</Button></>}
          </div>])} />
      </Panel>
      {enterpriseId ? (
        <Panel title="New disclosure" className="mt-6">
          <div className="grid gap-2 md:grid-cols-3">
            <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="Category"><select className={selectCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{["general", "risk", "financial", "corporate_action", "dividend_notice", "material_event"].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Risk level"><select className={selectCls} value={f.risk_level} onChange={(e) => setF({ ...f, risk_level: e.target.value })}>{["low", "medium", "high"].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <div className="md:col-span-3"><Field label="Body"><Textarea rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field></div>
          </div>
          <Button variant="gold" className="mt-3" onClick={() => add.mutate()}>Create draft</Button>
        </Panel>
      ) : <div className="mt-6"><NeedEnterprise /></div>}
    </div>
  );
}
