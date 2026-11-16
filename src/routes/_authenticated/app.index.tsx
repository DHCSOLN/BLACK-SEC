import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Stat, Status, Table, short, SandboxBanner } from "@/components/bsec/ui";
import { Button } from "@/components/ui/button";
import { useMe, useEnterprise, useEnterprises } from "@/lib/session";
import { CheckCircle2, Circle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/")({ component: Overview });

function EnterpriseDashboard() {
  const { enterpriseId } = useEnterprise();
  const ents = useEnterprises();
  const e = ents.data?.find((x) => x.id === enterpriseId);
  const { data } = useQuery({
    enabled: !!enterpriseId,
    queryKey: ["ent-dash", enterpriseId],
    queryFn: async () => {
      const [t, d, ev, c] = await Promise.all([
        supabase.from("provisioning_tasks").select("module,status").eq("enterprise_id", enterpriseId!),
        supabase.from("enterprise_documents").select("id,status").eq("enterprise_id", enterpriseId!),
        supabase.from("share_events").select("id,status").eq("enterprise_id", enterpriseId!),
        supabase.from("compliance_items").select("id,title,due_date,status").eq("enterprise_id", enterpriseId!).order("due_date").limit(3),
      ]);
      return { tasks: t.data ?? [], docs: d.data ?? [], events: ev.data ?? [], due: c.data ?? [] };
    },
  });
  if (!e) return null;
  const done = data?.tasks.filter((t) => t.status === "completed").length ?? 0;
  const links = [
    ["Provisioning & signatures", "/app/onboarding"], ["Cap table", "/app/capitalization"], ["Shares Archive", "/app/archive"],
    ["Disclosures", "/app/disclosures"], ["Performance", "/app/performance"], ["Accounts", "/app/fx"],
  ] as const;
  return (
    <Panel title={`Enterprise dashboard — ${e.legal_name}`} className="mb-6" actions={<Status s={e.status} />}>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Enterprise ID" value={<span className="text-xl">{e.enterprise_code ?? "pending"}</span>} hint={`Registry: ${e.registry_membership_status.replace(/_/g, " ")}`} />
        <Stat label="Modules provisioned" value={`${done}/${data?.tasks.length ?? 0}`} />
        <Stat label="Pending signatures" value={data?.docs.filter((d) => d.status !== "signed").length ?? 0} />
        <Stat label="Share events awaiting approval" value={data?.events.filter((x) => x.status === "proposed").length ?? 0} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">{links.map(([l, to]) => <Button key={to} asChild size="sm" variant="outline"><Link to={to}>{l}</Link></Button>)}</div>
      {!!data?.due.length && <p className="mt-3 text-xs text-muted-foreground">Next obligations: {data.due.map((c) => `${c.title} (${c.due_date})`).join(" · ")}</p>}
    </Panel>
  );
}

function Overview() {
  const me = useMe();
  const { data } = useQuery({
    queryKey: ["overview"],
    queryFn: async () => {
      const [ents, events, disc, alerts, reqs, tasks, trades] = await Promise.all([
        supabase.from("enterprises").select("id,legal_name,status,created_at"),
        supabase.from("share_events").select("id,enterprise_id,event_type,quantity,status,created_at").eq("status", "proposed"),
        supabase.from("disclosures").select("id,enterprise_id,title,status").eq("status", "submitted"),
        supabase.from("surveillance_alerts").select("id,kind,message,severity,status").in("status", ["open", "investigating"]),
        supabase.from("investor_requests").select("id,kind,subject,status").in("status", ["open", "in_review"]),
        supabase.from("provisioning_tasks").select("id,enterprise_id,module,status,last_error").eq("status", "failed"),
        supabase.from("trades").select("id", { count: "exact", head: true }),
      ]);
      return { ents: ents.data ?? [], events: events.data ?? [], disc: disc.data ?? [], alerts: alerts.data ?? [], reqs: reqs.data ?? [], tasks: tasks.data ?? [], trades: trades.count ?? 0 };
    },
  });
  const pendingEnts = data?.ents.filter((e) => e.status === "pending_review") ?? [];
  const queue = [
    ...pendingEnts.map((e) => ["Enterprise review", e.legal_name, <Status s={e.status} />, <Link to="/app/directory" className="text-gold">Review</Link>]),
    ...(data?.events ?? []).map((e) => ["Share event approval", `${e.event_type} ${e.quantity.toLocaleString()} (${short(e.id)})`, <Status s={e.status} />, <Link to="/app/archive" className="text-gold">Review</Link>]),
    ...(data?.disc ?? []).map((d) => ["Disclosure approval", d.title, <Status s={d.status} />, <Link to="/app/disclosures" className="text-gold">Review</Link>]),
    ...(data?.tasks ?? []).map((t) => ["Provisioning exception", `${t.module}: ${t.last_error}`, <Status s={t.status} />, <Link to="/app/onboarding" className="text-gold">Retry</Link>]),
    ...(data?.reqs ?? []).map((r) => ["Investor request", `${r.kind}: ${r.subject}`, <Status s={r.status} />, <Link to="/app/investors" className="text-gold">Open</Link>]),
  ];
  const journey = [
    { t: "Enroll a business (Onboarding wizard)", done: (data?.ents.filter((e) => !["00000000-0000-4000-a000-000000000001", "00000000-0000-4000-a000-000000000002"].includes(e.id)).length ?? 0) > 0, to: "/app/onboarding" },
    { t: "Sign the authorization resolution", done: false, to: "/app/onboarding" },
    { t: "Registrar approves enterprise membership", done: data?.ents.some((e) => e.status === "active" && !e.id.startsWith("00000000")) ?? false, to: "/app/directory" },
    { t: "Registrar approves proposed share issuance", done: false, to: "/app/archive" },
    { t: "Place a simulated investor order", done: (data?.trades ?? 0) > 0, to: "/app/market" },
    { t: "Submit and review performance reporting", done: false, to: "/app/performance" },
  ] as const;
  return (
    <div>
      <SandboxBanner page="overview" />
      <PageHeader code="BSEC-001 · Overview" title={`Welcome${me.data?.has("founding_admin") ? ", Founding Administrator" : ""}`} desc="Operational overview of the SOLN GPBC enterprise registry, review queue and alerts." />
      <EnterpriseDashboard />
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Enterprises" value={data?.ents.length ?? "—"} hint={`${pendingEnts.length} pending review`} />
        <Stat label="Pending share events" value={data?.events.length ?? "—"} hint="Not issued until approved" />
        <Stat label="Open alerts" value={data?.alerts.length ?? "—"} hint="Market surveillance" />
        <Stat label="Sandbox trades" value={data?.trades ?? "—"} hint="Simulated only" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Admin review queue" className="lg:col-span-2">
          <Table head={["Type", "Item", "Status", ""]} rows={queue} empty="Queue is clear." />
        </Panel>
        <Panel title="End-to-end demo journey">
          <ol className="space-y-3">
            {journey.map((j) => (
              <li key={j.t} className="flex items-start gap-2 text-sm">
                {j.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" /> : <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" />}
                <Link to={j.to} className="hover:text-gold">{j.t}</Link>
              </li>
            ))}
          </ol>
          <Button asChild variant="gold" className="mt-5 w-full"><Link to="/app/onboarding">Start onboarding</Link></Button>
        </Panel>
      </div>
      <Panel title="Alert center" className="mt-6" actions={<Link to="/app/compliance" className="text-sm text-gold">Resolve exceptions</Link>}>
        <Table head={["Severity", "Kind", "Message", "Status"]} rows={(data?.alerts ?? []).map((a) => [<Status s={a.severity} />, a.kind, a.message, <Status s={a.status} />])} empty="No open alerts." />
      </Panel>
    </div>
  );
}
