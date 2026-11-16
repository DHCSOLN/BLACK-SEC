import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCapData } from "@/lib/cap";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Table, NeedEnterprise, ExportButtons, Field, fmt, Stat } from "@/components/bsec/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errMsg, useEnterprise } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/capitalization")({ component: Cap });

function Cap() {
  const { enterpriseId } = useEnterprise();
  const { data } = useCapData(enterpriseId);
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", authorized: "", par_value: "0" });
  const [h, setH] = useState({ name: "", email: "" });
  const addClass = useMutation({
    mutationFn: async () => {
      if (!f.name.trim() || !(Number(f.authorized) > 0)) throw new Error("Name and authorized > 0 required");
      const { error } = await supabase.from("share_classes").insert({ enterprise_id: enterpriseId!, name: f.name.trim(), authorized: Number(f.authorized), par_value: Number(f.par_value) });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Class added"); setF({ name: "", authorized: "", par_value: "0" }); qc.invalidateQueries({ queryKey: ["cap"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const addHolder = useMutation({
    mutationFn: async () => {
      if (!h.name.trim()) throw new Error("Name required");
      const { error } = await supabase.from("shareholders").insert({ enterprise_id: enterpriseId!, name: h.name.trim(), email: h.email || null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Shareholder added"); setH({ name: "", email: "" }); qc.invalidateQueries({ queryKey: ["cap"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  if (!enterpriseId) return <><PageHeader code="BSEC-004 · Capitalization" title="Capitalization" /><NeedEnterprise /></>;
  const issuedBy = (cid: string) => (data?.table ?? []).filter((r) => r.class_id === cid).reduce((a, r) => a + Number(r.quantity), 0);
  const pendingBy = (cid: string) => (data?.events ?? []).filter((e) => e.class_id === cid && e.status === "proposed" && e.event_type === "issuance").reduce((a, e) => a + Number(e.quantity), 0);
  return (
    <div>
      <PageHeader code="BSEC-004 · Capitalization" title="Capitalization & Cap Table" desc="Issued figures derive only from approved Shares Archive events. Proposed issuances are shown separately and are not issued." actions={<ExportButtons name="cap-table" rows={data?.table ?? []} />} />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {(data?.classes ?? []).map((c) => (
          <Stat key={c.id} label={c.name} value={`${fmt(issuedBy(c.id))} / ${fmt(c.authorized)}`} hint={`Issued / authorized · ${fmt(pendingBy(c.id))} proposed (not issued)`} />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Cap table (approved holdings)" className="lg:col-span-2">
          <Table head={["Shareholder", "Class", "Quantity", "% of class issued"]} rows={(data?.table ?? []).map((r) => [r.shareholder_name, r.class_name, fmt(r.quantity), `${((Number(r.quantity) / Math.max(1, issuedBy(r.class_id))) * 100).toFixed(2)}%`])} empty="No approved holdings yet." />
        </Panel>
        <div className="space-y-6">
          <Panel title="Add share class">
            <div className="space-y-2">
              <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label="Authorized"><Input type="number" value={f.authorized} onChange={(e) => setF({ ...f, authorized: e.target.value })} /></Field>
              <Field label="Par value"><Input type="number" value={f.par_value} onChange={(e) => setF({ ...f, par_value: e.target.value })} /></Field>
              <Button variant="gold" className="w-full" onClick={() => addClass.mutate()}>Add class</Button>
            </div>
          </Panel>
          <Panel title="Add shareholder">
            <div className="space-y-2">
              <Field label="Name"><Input value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} /></Field>
              <Field label="Email"><Input value={h.email} onChange={(e) => setH({ ...h, email: e.target.value })} /></Field>
              <Button variant="outline" className="w-full" onClick={() => addHolder.mutate()}>Add shareholder</Button>
            </div>
          </Panel>
        </div>
      </div>
      <Panel title="Class rights" className="mt-6">
        <Table head={["Class", "Authorized", "Par", "Voting", "Dividend", "Transfer restrictions"]} rows={(data?.classes ?? []).map((c) => [c.name, fmt(c.authorized), c.par_value, c.voting_rights, c.dividend_rights ?? "—", c.transfer_restrictions ?? "—"])} />
      </Panel>
    </div>
  );
}
