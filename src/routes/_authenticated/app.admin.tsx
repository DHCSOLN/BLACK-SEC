import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Table, DISCLAIMER_PAGES } from "@/components/bsec/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errMsg, useMe, type Role } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/admin")({ component: Admin });
const ROLES: Role[] = ["founding_admin", "registrar", "compliance_officer", "financial_ops", "auditor", "investor"];

function Admin() {
  const me = useMe();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin"],
    queryFn: async () => {
      const [p, r, n] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_roles").select("*"),
        supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(50),
      ]);
      return { profiles: p.data ?? [], roles: r.data ?? [], notifs: n.data ?? [] };
    },
  });
  const toggle = useMutation({
    mutationFn: async ({ user, role, grant }: { user: string; role: Role; grant: boolean }) => { const { error } = await supabase.rpc("set_user_role", { _user: user, _role: role, _grant: grant }); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin"] }); qc.invalidateQueries({ queryKey: ["me"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const markRead = useMutation({
    mutationFn: async () => { await supabase.from("notifications").update({ read: true }).eq("read", false); },
    onSuccess: () => qc.invalidateQueries(),
  });
  const [mfa, setMfa] = useState<{ id: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  async function enroll() {
    const { data: d, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error) { toast.error(error.message); return; }
    setMfa({ id: d.id, qr: d.totp.qr_code });
  }
  async function verify() {
    if (!mfa) return;
    const { data: ch, error } = await supabase.auth.mfa.challenge({ factorId: mfa.id });
    if (error) { toast.error(error.message); return; }
    const v = await supabase.auth.mfa.verify({ factorId: mfa.id, challengeId: ch.id, code });
    if (v.error) { toast.error(v.error.message); return; }
    await supabase.from("profiles").update({ mfa_enrolled: true }).eq("id", me.data!.user.id);
    toast.success("MFA enabled");
    setMfa(null);
  }
  const isAdmin = me.data?.has("founding_admin");
  return (
    <div>
      <PageHeader code="BSEC-029 · Administration" title="Administration" desc="Founding governance: role assignment, security and notifications." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Multi-factor authentication">
          {mfa ? (
            <div className="space-y-3">
              <img src={mfa.qr} alt="Authenticator QR code" className="h-40 w-40 rounded bg-ivory p-2" />
              <Input placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} />
              <Button variant="gold" onClick={verify}>Verify & enable</Button>
            </div>
          ) : <Button variant="outline" onClick={enroll}>Enroll authenticator app (TOTP)</Button>}
        </Panel>
        <Panel title="Notifications" actions={<Button size="sm" variant="ghost" onClick={() => markRead.mutate()}>Mark all read</Button>}>
          <Table head={["Time", "Title", "Body"]} rows={(data?.notifs ?? []).map((n) => [new Date(n.created_at).toLocaleString(), <span className={n.read ? "" : "text-gold"}>{n.title}</span>, <span className="text-xs text-muted-foreground">{n.body}</span>])} />
        </Panel>
      </div>
      {isAdmin && <DisclaimerEditor />}
      <Panel title="Users & roles" className="mt-6">
        {me.data?.isStaff ? (
          <Table head={["User", "MFA", ...ROLES.map((r) => r.replace("_", " "))]} rows={(data?.profiles ?? []).map((p) => [
            <div><div>{p.display_name}</div><div className="text-xs text-muted-foreground">{p.email}</div></div>, p.mfa_enrolled ? "Yes" : "No",
            ...ROLES.map((r) => {
              const has = data?.roles.some((x) => x.user_id === p.id && x.role === r);
              return <input type="checkbox" aria-label={r} disabled={!isAdmin} checked={!!has} onChange={() => toggle.mutate({ user: p.id, role: r, grant: !has })} className="accent-gold" />;
            }),
          ])} />
        ) : <p className="text-sm text-muted-foreground">Staff only.</p>}
      </Panel>
    </div>
  );
}

const PAGE_LABEL: Record<string, string> = { site: "All pages", landing: "Public home page", overview: "Overview", offerings: "Offerings", market: "Market / Orders", fx: "FX & Multi-Currency", settlement: "GFI/STD Settlement" };
function DisclaimerEditor() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["site_disclaimers_admin"], queryFn: async () => (await supabase.from("site_disclaimers").select("*")).data ?? [] });
  const [draft, setDraft] = useState<Record<string, { body: string; enabled: boolean }>>({});
  const save = useMutation({
    mutationFn: async (page: string) => {
      const cur = data?.find((d) => d.page === page);
      const v = draft[page] ?? { body: cur?.body ?? "", enabled: cur?.enabled ?? true };
      const { error } = await supabase.from("site_disclaimers").upsert({ page, body: v.body, enabled: v.enabled, updated_at: new Date().toISOString(), updated_by: (await supabase.auth.getUser()).data.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Notice saved"); qc.invalidateQueries({ queryKey: ["site_disclaimers"] }); qc.invalidateQueries({ queryKey: ["site_disclaimers_admin"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Panel title="Site notices & disclaimers" className="mt-6">
      <p className="mb-4 text-sm text-muted-foreground">Write the notice you want shown on each page. Leave blank or switch off to show nothing.</p>
      <div className="space-y-4">
        {DISCLAIMER_PAGES.map((page) => {
          const cur = data?.find((d) => d.page === page);
          const v = draft[page] ?? { body: cur?.body ?? "", enabled: cur?.enabled ?? true };
          const set = (patch: Partial<typeof v>) => setDraft((d) => ({ ...d, [page]: { ...v, ...patch } }));
          return (
            <div key={page} className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{PAGE_LABEL[page]}</span>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" className="accent-gold" checked={v.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Show
                </label>
              </div>
              <textarea value={v.body} onChange={(e) => set({ body: e.target.value })} rows={2} className="w-full rounded-md border border-input bg-background p-2 text-sm" placeholder="No notice" />
              <div className="mt-2 flex justify-end"><Button size="sm" variant="gold" onClick={() => save.mutate(page)} disabled={save.isPending}>Save</Button></div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
