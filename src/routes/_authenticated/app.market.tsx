import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Table, Status, Field, selectCls, SandboxBanner, fmt, Stat } from "@/components/bsec/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errMsg, useMe } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/market")({ component: Market });

function Market() {
  const qc = useQueryClient();
  const me = useMe();
  const { data: classes } = useQuery({ queryKey: ["tradable"], queryFn: async () => (await supabase.from("share_classes").select("id,name,enterprise_id,enterprises!inner(legal_name,status)").eq("enterprises.status", "active")).data ?? [] });
  const [cls, setCls] = useState("");
  const active = cls || classes?.[0]?.id || "";
  const { data } = useQuery({
    enabled: !!active,
    queryKey: ["book", active],
    queryFn: async () => {
      const [o, t, m] = await Promise.all([
        supabase.from("orders").select("*").eq("class_id", active).order("created_at", { ascending: false }).limit(200),
        supabase.from("trades").select("*, trade_settlements(status, external_bank_status)").eq("class_id", active).order("created_at", { ascending: false }).limit(50),
        supabase.from("market_status").select("*").eq("class_id", active).maybeSingle(),
      ]);
      return { orders: o.data ?? [], trades: t.data ?? [], status: m.data };
    },
  });
  const [t, setT] = useState({ side: "buy", price: "", qty: "" });
  const place = useMutation({
    mutationFn: async () => {
      const price = Number(t.price), qty = Number(t.qty);
      if (!(price > 0) || !(qty > 0) || !Number.isInteger(qty)) throw new Error("Positive price and whole quantity required");
      const { error } = await supabase.rpc("place_order", { _class: active, _side: t.side, _price: price, _qty: qty });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Sandbox order placed and matched"); qc.invalidateQueries({ queryKey: ["book"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.rpc("cancel_order", { _order: id }); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["book"] }),
    onError: (e) => toast.error(errMsg(e)),
  });
  const halt = useMutation({
    mutationFn: async (h: boolean) => {
      const c = classes?.find((x) => x.id === active);
      const reason = h ? window.prompt("Halt reason") ?? "Compliance halt" : null;
      const { error } = await supabase.from("market_status").upsert({ class_id: active, enterprise_id: c!.enterprise_id, halted: h, halt_reason: reason, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["book"] }),
    onError: (e) => toast.error(errMsg(e)),
  });
  const open = (data?.orders ?? []).filter((o) => o.status === "open" || o.status === "partial");
  const bids = open.filter((o) => o.side === "buy").sort((a, b) => Number(b.price) - Number(a.price));
  const asks = open.filter((o) => o.side === "sell").sort((a, b) => Number(a.price) - Number(b.price));
  const last = data?.trades[0]?.price;
  const mine = (data?.orders ?? []).filter((o) => o.user_id === me.data?.user.id);
  const canHalt = me.data?.has("compliance_officer") || me.data?.has("founding_admin");
  return (
    <div>
      <PageHeader code="BSEC-013 · Market / Orders" title="Secondary Market (Sandbox)" desc="Price-time priority matching. Current status: sandbox simulation (no verified broker/ATS or SOLN connector). Verified path: execution, then SOLN ledger instruction and confirmation, then a Shares Archive transfer event for registrar approval, then performance reporting. Settlement is never marked without SOLN confirmation." actions={
        <select className={`${selectCls} max-w-xs`} value={active} onChange={(e) => setCls(e.target.value)}>{classes?.map((c) => <option key={c.id} value={c.id}>{c.enterprises?.legal_name} — {c.name}</option>)}</select>} />
      <SandboxBanner page="market" />
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Stat label="Last price" value={last ?? "—"} hint="Sandbox price discovery" />
        <Stat label="Best bid" value={bids[0]?.price ?? "—"} />
        <Stat label="Best ask" value={asks[0]?.price ?? "—"} />
        <Stat label="Status" value={data?.status?.halted ? "HALTED" : "Open"} hint={data?.status?.halt_reason ?? data?.status?.liquidity_status ?? ""} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Order ticket">
          <div className="space-y-3">
            <Field label="Side"><select className={selectCls} value={t.side} onChange={(e) => setT({ ...t, side: e.target.value })}><option value="buy">Buy</option><option value="sell">Sell</option></select></Field>
            <Field label="Limit price"><Input type="number" value={t.price} onChange={(e) => setT({ ...t, price: e.target.value })} /></Field>
            <Field label="Quantity"><Input type="number" value={t.qty} onChange={(e) => setT({ ...t, qty: e.target.value })} /></Field>
            <p className="text-xs text-muted-foreground">Eligibility: {me.data?.has("investor") ? "Investor role verified (sandbox)" : "Not eligible"}</p>
            <Button variant="gold" className="w-full" disabled={!active || place.isPending} onClick={() => place.mutate()}>Submit sandbox order</Button>
            {canHalt && <Button variant="outline" className="w-full" onClick={() => halt.mutate(!data?.status?.halted)}>{data?.status?.halted ? "Resume trading" : "Halt market"}</Button>}
          </div>
        </Panel>
        <Panel title="Order book" className="lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            <Table head={["Bid", "Qty"]} rows={bids.map((o) => [<span className="text-success">{o.price}</span>, fmt(o.quantity - o.filled)])} empty="No bids" />
            <Table head={["Ask", "Qty"]} rows={asks.map((o) => [<span className="text-destructive">{o.price}</span>, fmt(o.quantity - o.filled)])} empty="No asks" />
          </div>
        </Panel>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Trade history (sandbox)"><Table head={["Time", "Price", "Qty", "SOLN settlement", "External bank"]} rows={(data?.trades ?? []).map((x) => { const ts = Array.isArray(x.trade_settlements) ? x.trade_settlements[0] : x.trade_settlements; return [new Date(x.created_at).toLocaleString(), x.price, fmt(x.quantity), <Status s={ts?.status} />, <Status s={ts?.external_bank_status} />]; })} /></Panel>
        <Panel title="My orders"><Table head={["Side", "Price", "Qty", "Filled", "Status", ""]} rows={mine.map((o) => [o.side, o.price, fmt(o.quantity), fmt(o.filled), <Status s={o.status} />, (o.status === "open" || o.status === "partial") ? <Button size="sm" variant="ghost" onClick={() => cancel.mutate(o.id)}>Cancel</Button> : null])} /></Panel>
      </div>
      <Panel title="Brokerage / ATS partner adapter" className="mt-6">
        <p className="text-sm text-muted-foreground">Adapter interface: <code>submitOrder(order) → {"{ partnerOrderId, status }"}</code>, <code>cancelOrder(id)</code>, <code>onExecutionReport(webhook)</code>. Current adapter: <strong>sandbox-internal</strong>. A live adapter can be enabled only after a regulated partner is configured and verified under Integration Settings.</p>
      </Panel>
    </div>
  );
}
