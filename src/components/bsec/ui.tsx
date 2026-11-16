import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { exportRows } from "@/lib/export";
import { useEnterprise, useEnterprises } from "@/lib/session";
import { ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function PageHeader({ code, title, desc, actions }: { code: string; title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div>
        <div className="eyebrow">{code}</div>
        <h1 className="mt-1 text-3xl font-semibold text-foreground md:text-4xl">{title}</h1>
        {desc && <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, children, actions, className = "" }: { title?: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-border bg-card p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h2 className="text-xl font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const tone: Record<string, "success" | "warning" | "danger" | "gold" | "secondary"> = {
  approved: "success", active: "success", completed: "success", signed: "success", filled: "success", member: "success", verified: "success", resolved: "success", accepted: "success", SETTLED: "success", RECONCILED: "success", ARCHIVED: "secondary",
  proposed: "warning", pending: "warning", pending_review: "warning", pending_signature: "warning", provisioning: "warning", running: "warning", open: "gold", partial: "gold", draft: "secondary", submitted: "warning", in_review: "warning", investigating: "warning", test: "warning",
  rejected: "danger", failed: "danger", FAILED: "danger", cancelled: "secondary", CANCELLED: "secondary", EXPIRED: "secondary", REVERSED: "danger", DISPUTED: "danger", suspended: "danger", high: "danger", medium: "warning", low: "secondary", disabled: "secondary", live: "success",
};
export function Status({ s }: { s: string | null | undefined }) {
  if (!s) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={tone[s] ?? "outline"} className="font-mono text-[10px] uppercase tracking-wider">{s.replace(/_/g, " ")}</Badge>;
}

export const DISCLAIMER_PAGES = ["site", "landing", "overview", "offerings", "market", "fx", "settlement"] as const;
export function SandboxBanner({ page }: { page: string; children?: ReactNode }) {
  const { data } = useQuery({
    queryKey: ["site_disclaimers"],
    queryFn: async () => {
      const { data } = await supabase.from("site_disclaimers").select("page, body, enabled").eq("enabled", true);
      return data ?? [];
    },
    staleTime: 60_000,
  });
  const items = (data ?? []).filter((d) => (d.page === page || d.page === "site") && d.body.trim());
  if (!items.length) return null;
  return (
    <div className="mb-5 space-y-2">
      {items.map((d) => (
        <div key={d.page} className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="whitespace-pre-wrap">{d.body}</div>
        </div>
      ))}
    </div>
  );
}

export function ExportButtons({ name, rows }: { name: string; rows: Record<string, unknown>[] }) {
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => exportRows(name, rows, "csv")} disabled={!rows.length}>CSV</Button>
      <Button size="sm" variant="outline" onClick={() => exportRows(name, rows, "json")} disabled={!rows.length}>JSON</Button>
    </>
  );
}

export function Table({ head, rows, empty = "No records." }: { head: string[]; rows: ReactNode[][]; empty?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={head.length} className="px-3 py-6 text-center text-muted-foreground">{empty}</td></tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-accent/40">
                {r.map((c, j) => <td key={j} className="px-3 py-2 align-top">{c}</td>)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-3xl text-gold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function EnterprisePicker() {
  const { data } = useEnterprises();
  const { enterpriseId, setEnterpriseId } = useEnterprise();
  return (
    <select
      aria-label="Select enterprise"
      className="h-9 max-w-xs rounded-md border border-input bg-background px-2 text-sm"
      value={enterpriseId ?? ""}
      onChange={(e) => setEnterpriseId(e.target.value || null)}
    >
      <option value="">Select enterprise…</option>
      {(data ?? []).map((e) => (
        <option key={e.id} value={e.id}>{e.legal_name}</option>
      ))}
    </select>
  );
}

export function NeedEnterprise() {
  return (
    <Panel>
      <p className="text-sm text-muted-foreground">Select an enterprise in the top bar to view this module.</p>
    </Panel>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const selectCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
export const short = (id?: string | null) => (id ? id.slice(0, 8) : "—");
export const fmt = (n: number | string | null | undefined) => (n === null || n === undefined ? "—" : Number(n).toLocaleString());
