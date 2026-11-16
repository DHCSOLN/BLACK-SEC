import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Status, Table, ExportButtons, selectCls } from "@/components/bsec/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errMsg, useEnterprise, useEnterprises, useMe } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/directory")({ component: Directory });

function Directory() {
  const { data } = useEnterprises();
  const me = useMe();
  const qc = useQueryClient();
  const { setEnterpriseId } = useEnterprise();
  const [q, setQ] = useState("");
  const [st, setSt] = useState("");
  const rows = (data ?? []).filter((e) => (!q || `${e.legal_name} ${e.enterprise_code} ${e.jurisdiction}`.toLowerCase().includes(q.toLowerCase())) && (!st || e.status === st));
  const decide = useMutation({
    mutationFn: async ({ id, ok }: { id: string; ok: boolean }) => { const { error } = await supabase.rpc("decide_enterprise", { _ent: id, _approve: ok }); if (error) throw error; },
    onSuccess: () => { toast.success("Decision recorded"); qc.invalidateQueries(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const canDecide = me.data?.has("registrar") || me.data?.has("founding_admin");
  return (
    <div>
      <PageHeader code="BSEC-003 · Enterprise Directory" title="Enterprise Directory" desc="Registry membership status is distinct from exchange registration. Visible records follow tenant isolation and role permissions." actions={<ExportButtons name="enterprises" rows={rows} />} />
      <Panel>
        <div className="mb-4 flex flex-wrap gap-2">
          <Input placeholder="Search name, code, jurisdiction" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
          <select className={`${selectCls} max-w-[200px]`} value={st} onChange={(e) => setSt(e.target.value)}>
            <option value="">All statuses</option>{["draft", "provisioning", "pending_review", "active", "rejected", "suspended"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <Table head={["Code", "Legal name", "Type", "Jurisdiction", "Status", "Registry", "Exchange", ""]} rows={rows.map((e) => [
          <code className="text-xs">{e.enterprise_code ?? "—"}</code>,
          <span>{e.legal_name}{e.is_demo && <span className="ml-2 text-[10px] text-warning">DEMO</span>}{e.is_template && <span className="ml-2 text-[10px] text-gold">TEMPLATE</span>}</span>,
          e.entity_type, e.jurisdiction, <Status s={e.status} />, <Status s={e.registry_membership_status} />, <span className="text-xs text-muted-foreground">{e.exchange_registration_status.replace(/_/g, " ")}</span>,
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEnterpriseId(e.id)}>Open</Button>
            {canDecide && e.status === "pending_review" && <><Button size="sm" variant="gold" onClick={() => decide.mutate({ id: e.id, ok: true })}>Approve</Button><Button size="sm" variant="outline" onClick={() => decide.mutate({ id: e.id, ok: false })}>Reject</Button></>}
          </div>,
        ])} />
      </Panel>
    </div>
  );
}
