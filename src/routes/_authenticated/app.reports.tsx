import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Table, Stat, ExportButtons, Status } from "@/components/bsec/ui";
import { useMe } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/reports")({ component: Reports });

const CHECKLIST = [
  ["Legal", "SOLN GPBC legal registration and counsel opinion on registry status in each operating jurisdiction"],
  ["Legal", "Securities law analysis: exemptions or registration for any offering; confirm Black SEC is not an exchange"],
  ["SOLN ledger", "Inspect DHCSOLN/GLOBAL-SOLN-RESERVE API schema; finalize endpoint mapping; configure credentials; verify connector"],
  ["SOLN ledger", "Signed webhook secret shared with SOLN; end-to-end posting + reconciliation test in sandbox"],
  ["Broker / ATS", "Contract regulated broker-dealer or ATS partner; implement and verify live adapter"],
  ["Transfer agent", "Engage registered transfer agent where required; reconcile Shares Archive"],
  ["Custody", "Qualified custodian for any client assets; no custody by Black SEC"],
  ["FX", "Licensed FX liquidity provider for executable quotes"],
  ["KYC / AML", "Identity verification and sanctions screening provider for investors and beneficial owners"],
  ["Security", "Enforce MFA for staff roles; penetration test; key rotation; backup and restore drills"],
  ["Operations", "Incident response, complaint handling SLA, audit retention policy"],
];

function Reports() {
  const me = useMe();
  const { data } = useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const [e, ev, t, a] = await Promise.all([
        supabase.from("enterprises").select("id,status"),
        supabase.from("share_events").select("id,status,event_type,quantity"),
        supabase.from("trades").select("id,price,quantity,created_at"),
        supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200),
      ]);
      return { ents: e.data ?? [], events: ev.data ?? [], trades: t.data ?? [], audit: a.data ?? [] };
    },
  });
  const approvedIssued = (data?.events ?? []).filter((e) => e.status === "approved" && e.event_type === "issuance").reduce((a, e) => a + Number(e.quantity), 0);
  return (
    <div>
      <PageHeader code="BSEC-028 · Reports" title="Reports & Audit" desc="Registry statistics, audit evidence and the production readiness checklist." />
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Active enterprises" value={data?.ents.filter((e) => e.status === "active").length ?? "—"} />
        <Stat label="Approved issued shares" value={approvedIssued.toLocaleString()} />
        <Stat label="Archive events" value={data?.events.length ?? "—"} />
        <Stat label="Sandbox trades" value={data?.trades.length ?? "—"} />
      </div>
      <Panel title="Production readiness checklist" className="mt-6">
        <Table head={["Area", "Requirement", "Status"]} rows={CHECKLIST.map(([a, r]) => [a, r, <Status s="pending" />])} />
      </Panel>
      <Panel title="Audit log" className="mt-6" actions={<ExportButtons name="audit-log" rows={data?.audit ?? []} />}>
        {me.data?.isStaff ? (
          <Table head={["Time", "Actor", "Action", "Entity", "ID"]} rows={(data?.audit ?? []).map((a) => [new Date(a.created_at).toLocaleString(), a.actor?.slice(0, 8) ?? "system", a.action, a.entity, <code className="text-xs">{a.entity_id?.slice(0, 8)}</code>])} />
        ) : <p className="text-sm text-muted-foreground">Audit log access is limited to administrators, registrars, compliance officers and auditors.</p>}
      </Panel>
    </div>
  );
}
