import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Table, Status, Field, selectCls, SandboxBanner, NeedEnterprise, fmt } from "@/components/bsec/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errMsg, useEnterprise } from "@/lib/session";
import { journalImbalance } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/app/fx")({ component: FX });
const CUR = ["LND", "USD", "EUR", "GBP", "CAD", "NGN", "JMD", "XOF", "XCD"];

function FX() {
  const qc = useQueryClient();
  const { enterpriseId } = useEnterprise();
  const { data: quotes } = useQuery({ queryKey: ["fx"], queryFn: async () => (await supabase.from("fx_quotes").select("*").order("quoted_at", { ascending: false }).limit(100)).data ?? [] });
  const { data: ledger } = useQuery({
    enabled: !!enterpriseId, queryKey: ["ledger", enterpriseId],
    queryFn: async () => {
      const [b, m, c] = await Promise.all([
        supabase.rpc("account_balances", { _ent: enterpriseId! }),
        supabase.from("soln_account_mappings").select("*, soln_balance_cache(balance,currency,as_of)").eq("enterprise_id", enterpriseId!),
        supabase.from("soln_connector_state").select("*").maybeSingle(),
      ]);
      return { shadow: b.data ?? [], maps: m.data ?? [], conn: c.data };
    },
  });
  const [q, setQ] = useState({ base: "LND", quote: "USD", rate: "", spread: "0", fee: "0", source: "", kind: "internal_valuation", minutes: "15" });
  const addQuote = useMutation({
    mutationFn: async () => {
      if (!(Number(q.rate) > 0) || q.source.trim().length < 2) throw new Error("Rate > 0 and source required");
      const { error } = await supabase.from("fx_quotes").insert({ base_currency: q.base, quote_currency: q.quote, rate: Number(q.rate), spread_bps: Number(q.spread), fee: Number(q.fee), source: q.source.trim(), quote_kind: q.kind, is_executable: false, expires_at: new Date(Date.now() + Number(q.minutes) * 60000).toISOString() });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Quote recorded (non-executable)"); qc.invalidateQueries({ queryKey: ["fx"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const [lines, setLines] = useState([{ account_id: "", debit: "", credit: "" }, { account_id: "", debit: "", credit: "" }]);
  const [memo, setMemo] = useState("");
  const post = useMutation({
    mutationFn: async () => {
      const ls = lines.map((l) => ({ account_id: l.account_id, debit: Number(l.debit || 0), credit: Number(l.credit || 0), currency: ledger?.shadow.find((a) => a.account_id === l.account_id)?.currency ?? "" }));
      const bad = journalImbalance(ls);
      if (bad.length) throw new Error(`Unbalanced / invalid: ${bad.join(", ")}`);
      const { error } = await supabase.rpc("post_journal", { _ent: enterpriseId!, _key: crypto.randomUUID(), _memo: memo || "Journal event", _lines: ls });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Journal event queued for SOLN ledger posting"); qc.invalidateQueries({ queryKey: ["ledger"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const verified = ledger?.conn?.status === "verified";
  return (
    <div>
      <PageHeader code="BSEC-018 · FX & Multi-Currency" title="FX & Multi-Currency Accounts" desc="The SOLN Central Bank / Global SOLN Reserve ledger is authoritative for LND and internal balances. Black SEC shows cached reads only." />
      <SandboxBanner page="fx" />
      {!enterpriseId ? <NeedEnterprise /> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="SOLN ledger balances (authoritative, cached)">
            <Table head={["Currency", "SOLN account ref", "Sync", "Balance", "As of"]} rows={(ledger?.maps ?? []).map((m) => {
              const b = m.soln_balance_cache?.sort((x, y) => (y.as_of > x.as_of ? 1 : -1))[0];
              return [m.currency, <code className="text-xs">{m.soln_account_ref ?? "unmapped"}</code>, <Status s={m.sync_status} />, verified && b ? fmt(b.balance) : <span className="text-xs text-muted-foreground">Not available</span>, b?.as_of ? new Date(b.as_of).toLocaleString() : "—"];
            })} />
          </Panel>
          <Panel title="Local shadow journal (read model, not authoritative)">
            <Table head={["Code", "Name", "Ccy", "Local net"]} rows={(ledger?.shadow ?? []).map((a) => [a.code, a.name, a.currency, fmt(a.balance)])} />
            <div className="mt-4 space-y-2">
              <p className="text-xs text-muted-foreground">Record a balanced journal event. It is queued for posting to the SOLN ledger; status stays pending until SOLN confirms.</p>
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-3 gap-2">
                  <select className={selectCls} value={l.account_id} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, account_id: e.target.value } : x))}><option value="">Account…</option>{ledger?.shadow.map((a) => <option key={a.account_id} value={a.account_id}>{a.currency} {a.code} {a.name}</option>)}</select>
                  <Input placeholder="Debit" type="number" value={l.debit} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, debit: e.target.value } : x))} />
                  <Input placeholder="Credit" type="number" value={l.credit} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, credit: e.target.value } : x))} />
                </div>
              ))}
              <div className="flex gap-2"><Input placeholder="Memo" value={memo} onChange={(e) => setMemo(e.target.value)} /><Button variant="outline" onClick={() => setLines([...lines, { account_id: "", debit: "", credit: "" }])}>+ Line</Button><Button variant="gold" onClick={() => post.mutate()}>Queue</Button></div>
            </div>
          </Panel>
        </div>
      )}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Record FX reference quote">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Base"><select className={selectCls} value={q.base} onChange={(e) => setQ({ ...q, base: e.target.value })}>{CUR.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Quote"><select className={selectCls} value={q.quote} onChange={(e) => setQ({ ...q, quote: e.target.value })}>{CUR.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Rate"><Input type="number" value={q.rate} onChange={(e) => setQ({ ...q, rate: e.target.value })} /></Field>
            <Field label="Spread (bps)"><Input type="number" value={q.spread} onChange={(e) => setQ({ ...q, spread: e.target.value })} /></Field>
            <Field label="Fee"><Input type="number" value={q.fee} onChange={(e) => setQ({ ...q, fee: e.target.value })} /></Field>
            <Field label="Expires (min)"><Input type="number" value={q.minutes} onChange={(e) => setQ({ ...q, minutes: e.target.value })} /></Field>
            <div className="col-span-2"><Field label="Kind"><select className={selectCls} value={q.kind} onChange={(e) => setQ({ ...q, kind: e.target.value })}><option value="internal_valuation">LND internal valuation (SOLN)</option><option value="test_mock">Test / mock</option></select></Field></div>
            <div className="col-span-2"><Field label="Source (required)" hint="e.g. SOLN Central Bank valuation memo ref"><Input value={q.source} onChange={(e) => setQ({ ...q, source: e.target.value })} /></Field></div>
          </div>
          <Button variant="gold" className="mt-3 w-full" onClick={() => addQuote.mutate()}>Record quote</Button>
          <p className="mt-2 text-[11px] text-muted-foreground">Executable external quotes can only come from a verified FX provider via the SOLN connector.</p>
        </Panel>
        <Panel title="FX quote log" className="lg:col-span-2">
          <Table head={["Pair", "Rate", "Spread", "Fee", "Kind", "Exec", "Source", "Expires"]} rows={(quotes ?? []).map((x) => [`${x.base_currency}/${x.quote_currency}`, x.rate, `${x.spread_bps} bps`, x.fee, x.quote_kind.replace(/_/g, " "), x.is_executable ? "Yes" : "No", x.source, <span className={new Date(x.expires_at) < new Date() ? "text-muted-foreground line-through" : ""}>{new Date(x.expires_at).toLocaleTimeString()}</span>])} />
        </Panel>
      </div>
    </div>
  );
}
