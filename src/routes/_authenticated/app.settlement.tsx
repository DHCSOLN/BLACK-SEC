import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Table, Status, Field, selectCls, SandboxBanner, NeedEnterprise, fmt } from "@/components/bsec/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errMsg, useEnterprise } from "@/lib/session";
import { STD_TRANSITIONS, EXTERNAL_CONFIRMATION_REQUIRED, type StdState } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/app/settlement")({ component: Settlement });

function Settlement() {
  const qc = useQueryClient();
  const { enterpriseId } = useEnterprise();
  const { data } = useQuery({
    enabled: !!enterpriseId, queryKey: ["std", enterpriseId],
    queryFn: async () => {
      const [s, t, q] = await Promise.all([
        supabase.from("std_instructions").select("*").eq("enterprise_id", enterpriseId!).order("created_at", { ascending: false }),
        supabase.from("std_transitions").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("fx_quotes").select("id,base_currency,quote_currency,rate,expires_at").gt("expires_at", new Date().toISOString()),
      ]);
      return { ins: s.data ?? [], tr: t.data ?? [], quotes: q.data ?? [] };
    },
  });
  const [f, setF] = useState({ amount: "", currency: "LND", target: "", beneficiary: "", purpose: "" });
  const create = useMutation({
    mutationFn: async () => {
      if (!(Number(f.amount) > 0) || !f.beneficiary.trim()) throw new Error("Amount and beneficiary required");
      const { error } = await supabase.rpc("create_std", { _ent: enterpriseId!, _key: crypto.randomUUID(), _amount: Number(f.amount), _currency: f.currency, _target: f.target, _beneficiary: f.beneficiary, _purpose: f.purpose });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Instruction created and queued for SOLN ledger"); qc.invalidateQueries({ queryKey: ["std"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const move = useMutation({
    mutationFn: async ({ id, to }: { id: string; to: StdState }) => {
      let ref: string | undefined, quote: string | undefined;
      if (EXTERNAL_CONFIRMATION_REQUIRED.includes(to)) ref = window.prompt(`${to} requires an external confirmation reference (test mode: MOCK-...)`) ?? undefined;
      if (to === "QUOTED") quote = window.prompt(`FX quote ID. Active: ${data?.quotes.map((q) => `${q.id.slice(0, 8)} ${q.base_currency}/${q.quote_currency}`).join(", ") || "none"}`) ?? undefined;
      const full = quote ? data?.quotes.find((q) => q.id.startsWith(quote!))?.id : undefined;
      const { error } = await supabase.rpc("transition_std", { _id: id, _to: to, ...(ref ? { _external_ref: ref } : {}), ...(full ? { _quote: full } : {}) });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["std"] }),
    onError: (e) => toast.error(errMsg(e)),
  });
  const mockConfirm = () => `MOCK-${Date.now()}`;
  return (
    <div>
      <PageHeader code="BSEC-020 · GFI/STD Settlement" title="GFI / STD Settlement Instructions" desc="GFI and STD are SOLN-configurable terminology pending exact protocol definition. Instructions are routed to the SOLN Central Bank ledger; SOLN ledger posting and external bank settlement are tracked separately." />
      <SandboxBanner page="settlement" />
      {!enterpriseId ? <NeedEnterprise /> : (
        <>
          <Panel title="Instructions">
            <Table head={["Created", "Amount", "Beneficiary", "State", "SOLN ledger", "External bank", "Next"]} rows={(data?.ins ?? []).map((s) => [new Date(s.created_at).toLocaleString(), `${fmt(s.amount)} ${s.currency}${s.target_currency ? " → " + s.target_currency : ""}`, s.beneficiary, <Status s={s.state} />, <Status s={s.soln_posting_status} />, <Status s={s.external_bank_status} />,
              <div className="flex flex-wrap gap-1">{STD_TRANSITIONS[s.state as StdState].map((t) => <Button key={t} size="sm" variant="outline" onClick={() => move.mutate({ id: s.id, to: t })}>{t}</Button>)}</div>])} />
          </Panel>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Panel title="New instruction">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Amount"><Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
                <Field label="Currency"><select className={selectCls} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{["LND", "USD", "EUR", "GBP", "CAD", "NGN", "JMD", "XOF", "XCD"].map((c) => <option key={c}>{c}</option>)}</select></Field>
                <Field label="Target currency"><select className={selectCls} value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })}><option value="">Same</option>{["LND", "USD", "EUR", "GBP", "CAD", "NGN", "JMD", "XOF", "XCD"].map((c) => <option key={c}>{c}</option>)}</select></Field>
                <Field label="Beneficiary"><Input value={f.beneficiary} onChange={(e) => setF({ ...f, beneficiary: e.target.value })} /></Field>
                <div className="col-span-2"><Field label="Purpose"><Input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} /></Field></div>
              </div>
              <Button variant="gold" className="mt-3" onClick={() => create.mutate()}>Create instruction</Button>
            </Panel>
            <Panel title="Transition log (immutable)">
              <Table head={["Time", "From", "To", "Ext ref"]} rows={(data?.tr ?? []).filter((t) => data?.ins.some((i) => i.id === t.instruction_id)).map((t) => [new Date(t.created_at).toLocaleString(), t.from_state ?? "—", t.to_state, <code className="text-xs">{t.external_ref ?? ""}</code>])} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
