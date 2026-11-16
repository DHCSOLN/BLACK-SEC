import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Table, NeedEnterprise, ExportButtons, Field, Status, selectCls, fmt, short } from "@/components/bsec/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errMsg, useEnterprise, useMe } from "@/lib/session";
import { parseCSV } from "@/lib/export";
import { useCapData } from "@/lib/cap";

export const Route = createFileRoute("/_authenticated/app/archive")({ component: ArchivePage });

function ArchivePage() {
  const { enterpriseId } = useEnterprise();
  const { data } = useCapData(enterpriseId);
  const me = useMe();
  const qc = useQueryClient();
  const [f, setF] = useState({ class_id: "", type: "issuance", from: "", to: "", qty: "", book: "", notes: "" });
  const [importText, setImportText] = useState("");
  const [filter, setFilter] = useState("");
  const holderName = (id: string | null) => (id ? data?.holders.find((h) => h.id === id)?.name ?? short(id) : "—");
  const className = (id: string) => data?.classes.find((c) => c.id === id)?.name ?? short(id);
  const inv = () => qc.invalidateQueries({ queryKey: ["cap"] });

  const propose = useMutation({
    mutationFn: async () => {
      const qty = Number(f.qty);
      if (!f.class_id || !(qty > 0) || !Number.isInteger(qty)) throw new Error("Class and positive whole quantity required");
      const { error } = await supabase.rpc("propose_share_event", { _ent: enterpriseId!, _class: f.class_id, _type: f.type, _from: (f.from || null) as string, _to: (f.to || null) as string, _qty: qty, ...(f.book ? { _book: f.book } : {}), ...(f.notes ? { _notes: f.notes } : {}) });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Event proposed — awaiting registrar approval"); inv(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const decide = useMutation({
    mutationFn: async ({ id, ok }: { id: string; ok: boolean }) => { const { error } = await supabase.rpc("decide_share_event", { _event: id, _approve: ok }); if (error) throw error; },
    onSuccess: () => { toast.success("Decision recorded in archive"); inv(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const correct = useMutation({
    mutationFn: async (id: string) => {
      const reason = window.prompt("Reason for correction entry (required)");
      if (!reason) throw new Error("Reason required");
      const { error } = await supabase.rpc("propose_correction", { _event: id, _reason: reason });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Correction entry proposed"); inv(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const runImport = useMutation({
    mutationFn: async () => {
      const t = importText.trim();
      const rows: Record<string, string>[] = t.startsWith("[") ? JSON.parse(t) : parseCSV(t);
      let n = 0;
      for (const r of rows) {
        const cls = data?.classes.find((c) => c.name === r["class_name"] || c.id === r["class_id"]);
        if (!cls) throw new Error(`Unknown class in row ${n + 1}`);
        const find = (name?: string) => (name ? data?.holders.find((h) => h.name === name)?.id ?? null : null);
        const { error } = await supabase.rpc("propose_share_event", { _ent: enterpriseId!, _class: cls.id, _type: r["event_type"] ?? "", _from: find(r["from_holder"]) as string, _to: find(r["to_holder"]) as string, _qty: Number(r["quantity"]), ...(r["book_entry_id"] ? { _book: r["book_entry_id"] } : {}), _notes: "Imported (pending registrar verification)" });
        if (error) throw new Error(`Row ${n + 1}: ${error.message}`);
        n++;
      }
      return n;
    },
    onSuccess: (n) => { toast.success(`${n} events imported as proposed`); setImportText(""); inv(); },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (!enterpriseId) return <><PageHeader code="BSEC-005 · Shares Archive" title="Shares Archive" /><NeedEnterprise /></>;
  const canDecide = me.data?.has("registrar") || me.data?.has("founding_admin");
  const events = (data?.events ?? []).filter((e) => !filter || e.status === filter || e.event_type === filter);
  const exportRows = events.map((e) => ({ seq: e.seq, id: e.id, event_type: e.event_type, class_name: className(e.class_id), from_holder: holderName(e.from_holder), to_holder: holderName(e.to_holder), quantity: e.quantity, status: e.status, book_entry_id: e.book_entry_id, prev_hash: e.prev_hash, evidence_hash: e.evidence_hash, corrects_event_id: e.corrects_event_id, created_at: e.created_at, decided_at: e.decided_at }));

  return (
    <div>
      <PageHeader code="BSEC-005 · Shares Archive" title="Shares Archive" desc="Black SEC securities record: append-only event history (financial settlement is recorded by the SOLN ledger). Approved events are immutable and hash-chained (SHA-256). Errors are fixed with correction entries, never edits." actions={<ExportButtons name="shares-archive" rows={exportRows} />} />
      <Panel title="Event history" actions={
        <select className={`${selectCls} max-w-[180px]`} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All events</option>{["proposed", "approved", "rejected", "issuance", "transfer", "cancellation", "correction"].map((s) => <option key={s}>{s}</option>)}
        </select>}>
        <Table head={["#", "Type", "Class", "From", "To", "Qty", "Status", "Book entry", "Evidence hash", ""]} rows={events.map((e) => [
          e.seq, e.event_type, className(e.class_id), holderName(e.from_holder), holderName(e.to_holder), fmt(e.quantity), <Status s={e.status} />,
          <code className="text-[10px]">{e.book_entry_id ?? "—"}</code>,
          <code className="text-[10px] text-muted-foreground" title={`prev: ${e.prev_hash ?? ""}`}>{e.evidence_hash ? e.evidence_hash.slice(0, 14) + "…" : "—"}</code>,
          <div className="flex gap-1">
            {e.status === "proposed" && canDecide && <><Button size="sm" variant="gold" onClick={() => decide.mutate({ id: e.id, ok: true })}>Approve</Button><Button size="sm" variant="outline" onClick={() => decide.mutate({ id: e.id, ok: false })}>Reject</Button></>}
            {e.status === "approved" && <Button size="sm" variant="ghost" onClick={() => correct.mutate(e.id)}>Correct</Button>}
          </div>,
        ])} />
      </Panel>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Propose event">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Type"><select className={selectCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="issuance">Issuance</option><option value="transfer">Transfer</option><option value="cancellation">Cancellation</option></select></Field>
            <Field label="Class"><select className={selectCls} value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value })}><option value="">Select…</option>{data?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            {f.type !== "issuance" && <Field label="From holder"><select className={selectCls} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })}><option value="">Select…</option>{data?.holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>}
            {f.type !== "cancellation" && <Field label="To holder"><select className={selectCls} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })}><option value="">Select…</option>{data?.holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>}
            <Field label="Quantity"><Input type="number" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
            <Field label="Certificate / book-entry ID (optional)"><Input value={f.book} onChange={(e) => setF({ ...f, book: e.target.value })} /></Field>
            <div className="md:col-span-2"><Field label="Notes"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field></div>
          </div>
          <Button variant="gold" className="mt-4" onClick={() => propose.mutate()}>Propose for approval</Button>
        </Panel>
        <Panel title="Import (CSV or JSON)">
          <p className="mb-2 text-xs text-muted-foreground">Columns: event_type, class_name, from_holder, to_holder, quantity, book_entry_id. Holder names must exist. All imports are created as proposed.</p>
          <Textarea rows={7} className="font-mono text-xs" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={"event_type,class_name,from_holder,to_holder,quantity,book_entry_id\nissuance,Common,,Jane Doe,1000,CERT-001"} />
          <Button variant="outline" className="mt-3" disabled={!importText.trim()} onClick={() => runImport.mutate()}>Import as proposed</Button>
        </Panel>
      </div>
      <Panel title="Shareholder statements" className="mt-6">
        <Table head={["Shareholder", "Class", "Approved balance", "Events"]} rows={(data?.table ?? []).map((r) => [r.shareholder_name, r.class_name, fmt(r.quantity), data?.events.filter((e) => e.status === "approved" && (e.to_holder === r.shareholder_id || e.from_holder === r.shareholder_id)).length])} />
      </Panel>
    </div>
  );
}
