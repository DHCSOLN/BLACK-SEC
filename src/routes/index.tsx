import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Status, SandboxBanner } from "@/components/bsec/ui";
import { Landmark, ScrollText, Scale, Network } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BLACK SEC — SOLN Enterprise Securities Market" },
      { name: "description", content: "Enterprise registry, Shares Archive and sandbox securities market governed by SOLN GPBC." },
      { property: "og:title", content: "BLACK SEC — SOLN Enterprise Securities Market" },
      { property: "og:description", content: "Enterprise registry, Shares Archive and sandbox securities market governed by SOLN GPBC." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { data } = useQuery({
    queryKey: ["public-directory"],
    queryFn: async () => (await supabase.rpc("public_enterprise_directory")).data ?? [],
  });
  const pillars = [
    { icon: Landmark, t: "Founding governance", d: "SOLN GPBC founding administrator, registrar and compliance roles established first." },
    { icon: ScrollText, t: "Shares Archive", d: "Append-only issuance, transfer and cancellation events with SHA-256 evidence chains." },
    { icon: Scale, t: "Sandbox market", d: "Order book, matching simulation and surveillance. No real trades or client funds." },
    { icon: Network, t: "Multi-currency ledger", d: "Double-entry accounts in LND and eight external currencies. Zero balances until funded." },
  ];
  return (
    <div className="min-h-screen bg-hero">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="font-display text-2xl font-bold tracking-[0.2em]">BLACK <span className="text-gold">SEC</span></div>
        <Button asChild variant="outline"><Link to="/auth">Sign in</Link></Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-20">
        <div className="pt-6"><SandboxBanner page="landing" /></div>
        <section className="py-16 md:py-24">
          <div className="eyebrow">PRD-BSEC-2026-001 · Standards BSEC-001 to BSEC-030</div>
          <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-tight md:text-7xl">
            The SOLN Enterprise <span className="text-gold-gradient">Securities Market</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            A registry, capitalization and disclosure infrastructure for enterprises of State of Loc Nation Global Public Benefit Corporation.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="gold" size="lg"><Link to="/auth">Enroll an enterprise</Link></Button>
            <Button asChild variant="outline" size="lg"><Link to="/auth">Investor access</Link></Button>
          </div>
          <p className="mt-8 max-w-3xl border-l-2 border-gold pl-4 text-xs text-muted-foreground">
            Black SEC is a private registry operated under SOLN GPBC governance. It is not the U.S. Securities and Exchange Commission, is not affiliated with any government regulator,
            and registry membership is not exchange registration. All trading and funding are sandbox simulations unless a verified, regulated partner integration is configured.
          </p>
        </section>
        <section className="grid gap-4 md:grid-cols-4">
          {pillars.map((p) => (
            <div key={p.t} className="rounded-lg border border-border bg-card/70 p-5">
              <p.icon className="h-5 w-5 text-gold" />
              <h3 className="mt-3 text-xl font-semibold">{p.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{p.d}</p>
            </div>
          ))}
        </section>
        <section className="mt-16">
          <h2 className="text-3xl font-semibold">Public enterprise directory</h2>
          <p className="mt-1 text-sm text-muted-foreground">Approved public profiles only. Holdings and private records are never shown here.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {(data ?? []).map((e) => (
              <div key={e.id} className="rounded-lg border border-border bg-card p-5">
                <div className="font-mono text-[11px] text-muted-foreground">{e.enterprise_code}</div>
                <div className="mt-1 font-display text-xl">{e.legal_name}</div>
                <p className="mt-2 text-sm text-muted-foreground">{e.public_summary}</p>
                <div className="mt-3 flex gap-2"><Status s={e.registry_membership_status} /><Status s={e.exchange_registration_status} /></div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
