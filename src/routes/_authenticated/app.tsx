import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EnterpriseProvider, useMe } from "@/lib/session";
import { EnterprisePicker } from "@/components/bsec/ui";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, ClipboardList, Building2, PieChart, Archive, Megaphone, CandlestickChart, Users, Coins,
  Workflow, TrendingUp, FileText, ShieldCheck, BarChart3, Settings, Plug, Bell, Menu, LogOut,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "Dashboard — BLACK SEC" }, { name: "description", content: "BLACK SEC operating dashboard." }] }),
  component: AppLayout,
});

const NAV = [
  { to: "/app", label: "Overview", icon: LayoutDashboard },
  { to: "/app/onboarding", label: "Enterprise Onboarding", icon: ClipboardList },
  { to: "/app/directory", label: "Enterprise Directory", icon: Building2 },
  { to: "/app/capitalization", label: "Capitalization", icon: PieChart },
  { to: "/app/archive", label: "Shares Archive", icon: Archive },
  { to: "/app/offerings", label: "Offerings", icon: Megaphone },
  { to: "/app/market", label: "Market / Orders", icon: CandlestickChart },
  { to: "/app/investors", label: "Investors", icon: Users },
  { to: "/app/fx", label: "FX & Multi-Currency", icon: Coins },
  { to: "/app/settlement", label: "GFI/STD Settlement", icon: Workflow },
  { to: "/app/performance", label: "Performance", icon: TrendingUp },
  { to: "/app/disclosures", label: "Disclosures", icon: FileText },
  { to: "/app/compliance", label: "Compliance", icon: ShieldCheck },
  { to: "/app/reports", label: "Reports", icon: BarChart3 },
  { to: "/app/admin", label: "Administration", icon: Settings },
  { to: "/app/integrations", label: "Integration Settings", icon: Plug },
] as const;

function AppLayout() {
  return (
    <EnterpriseProvider>
      <Shell />
    </EnterpriseProvider>
  );
}

function Shell() {
  const [open, setOpen] = useState(false);
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: unread } = useQuery({
    queryKey: ["notif-count"],
    queryFn: async () => (await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("read", false)).count ?? 0,
  });
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <div className="flex min-h-screen">
      <aside className={`${open ? "flex" : "hidden"} fixed inset-y-0 z-40 w-64 flex-col border-r border-sidebar-border bg-sidebar lg:sticky lg:top-0 lg:flex lg:h-screen`}>
        <div className="border-b border-sidebar-border px-5 py-5">
          <div className="font-display text-xl font-bold tracking-[0.2em]">BLACK <span className="text-gold">SEC</span></div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">SOLN GPBC Registry</div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/app" }}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-gold"
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3 text-xs">
          <div className="truncate text-muted-foreground">{me.data?.user.email}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {me.data?.roles.map((r) => <span key={r} className="rounded bg-sidebar-accent px-1.5 py-0.5 font-mono text-[9px] uppercase text-gold">{r.replace("_", " ")}</span>)}
          </div>
          <Button size="sm" variant="ghost" className="mt-2 w-full justify-start" onClick={signOut}><LogOut /> Sign out</Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
          <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu"><Menu /></Button>
          <EnterprisePicker />
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded border border-warning/40 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-warning md:inline">Live registry · Market in test mode</span>
            <Button asChild size="sm" variant="ghost"><Link to="/app/admin"><Bell />{unread ? <span className="text-gold">{unread}</span> : null}</Link></Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
