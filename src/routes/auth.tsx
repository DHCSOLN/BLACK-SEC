import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/bsec/ui";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — BLACK SEC" },
      { name: "description", content: "Sign in to the BLACK SEC enterprise securities platform." },
      { property: "og:title", content: "Sign in — BLACK SEC" },
      { property: "og:description", content: "Sign in to the BLACK SEC enterprise securities platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({ email: z.string().trim().email().max(255), password: z.string().min(8).max(128) });

function AuthPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = schema.safeParse({ email, password });
    if (!p.success) { toast.error(p.error.issues[0]?.message ?? "Invalid input"); return; }
    setBusy(true);
    try {
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { emailRedirectTo: window.location.origin + "/app", data: { display_name: name } },
        });
        if (error) throw error;
        if (!data.session) toast.success("Check your email to confirm your account.");
        else navigate({ to: "/app" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/app" });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-hero px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-8">
        <div className="font-display text-2xl font-bold tracking-[0.2em]">BLACK <span className="text-gold">SEC</span></div>
        <h1 className="text-2xl">{mode === "in" ? "Sign in" : "Create account"}</h1>
        {mode === "up" && <Field label="Display name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></Field>}
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Password" hint="Minimum 8 characters. MFA enrollment is available after sign-in."><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <Button type="submit" variant="gold" className="w-full" disabled={busy}>{mode === "in" ? "Sign in" : "Create account"}</Button>
        <button type="button" className="w-full text-center text-xs text-muted-foreground hover:text-gold" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "No account? Create one" : "Have an account? Sign in"}
        </button>
        <p className="text-[11px] text-muted-foreground">The first account created becomes the SOLN GPBC founding administrator.</p>
      </form>
    </div>
  );
}
