import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Status, Table, Field, selectCls, NeedEnterprise } from "@/components/bsec/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { errMsg, useEnterprise } from "@/lib/session";
import { Plus, Trash2, RotateCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/onboarding")({ component: Onboarding });

const CURRENCIES = ["LND", "USD", "EUR", "GBP", "CAD", "NGN", "JMD", "XOF", "XCD"];
const STEPS = ["Identity", "Beneficial owners", "Documents", "Membership", "Equity & classes", "Shareholders", "Currencies", "Review"];

type Owner = { full_name: string; ownership_pct: string; control_role: string };
type Cls = { name: string; authorized: string; par_value: string; voting_rights: string; dividend_rights: string; transfer_restrictions: string };
type Holder = { name: string; email: string; class_name: string; quantity: string };
type Doc = { title: string; doc_type: string; content: string };

const identitySchema = z.object({
  legal_name: z.string().trim().min(2).max(200),
  entity_type: z.enum(["corporation", "llc", "sole_proprietor", "public_benefit_corporation"]),
  jurisdiction: z.string().trim().min(2).max(100),
});

function Onboarding() {
  const qc = useQueryClient();
  const { enterpriseId, setEnterpriseId } = useEnterprise();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [id, setId] = useState({ legal_name: "", trade_name: "", entity_type: "corporation", jurisdiction: "", registration_number: "", address: "", public_summary: "" });
  const [owners, setOwners] = useState<Owner[]>([{ full_name: "", ownership_pct: "100", control_role: "Director" }]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [accepted, setAccepted] = useState(false);
  const [equity, setEquity] = useState<"new" | "import">("new");
  const [classes, setClasses] = useState<Cls[]>([{ name: "Common", authorized: "1000000", par_value: "0.01", voting_rights: "one_vote_per_share", dividend_rights: "", transfer_restrictions: "" }]);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [currencies, setCurrencies] = useState<string[]>(["LND", "USD"]);

  function validate(s: number): string | null {
    if (s === 0) { const r = identitySchema.safeParse(id); return r.success ? null : `${String(r.error.issues[0]?.path[0] ?? "field").replace(/_/g, " ")}: ${r.error.issues[0]?.message}`; }
    if (s === 1) { const tot = owners.reduce((a, o) => a + Number(o.ownership_pct || 0), 0); if (owners.some((o) => !o.full_name.trim())) return "Owner names required"; if (tot > 100) return "Ownership exceeds 100%"; }
    if (s === 3 && !accepted) return "You must accept the binding Black SEC standards";
    if (s === 4) { if (!classes.length) return "At least one class"; if (classes.some((c) => !c.name.trim() || !(Number(c.authorized) > 0))) return "Each class needs a name and authorized > 0"; }
    if (s === 5) {
      for (const c of classes) {
        const sum = holders.filter((h) => h.class_name === c.name).reduce((a, h) => a + Number(h.quantity || 0), 0);
        if (sum > Number(c.authorized)) return `Initial shareholders exceed authorized shares for ${c.name}`;
      }
      if (holders.some((h) => !h.name.trim())) return "Shareholder names required";
    }
    if (s === 6 && !currencies.length) return "Select at least one currency";
    return null;
  }
  function next() { const e = validate(step); if (e) { toast.error(e); return; } setStep(step + 1); }

  const submit = useMutation({
    mutationFn: async () => {
      for (let i = 0; i < 7; i++) { const e = validate(i); if (e) throw new Error(e); }
      const { data, error } = await supabase.rpc("submit_onboarding", {
        _payload: { ...id, membership_accepted: accepted, equity_mode: equity, currencies, owners, documents: docs, classes, shareholders: holders },
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (entId) => {
      toast.success("Enterprise submitted. Provisioning complete — see module statuses below.");
      setEnterpriseId(entId);
      qc.invalidateQueries();
      navigate({ to: "/app" });
      setStep(0);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div>
      <PageHeader code="BSEC-002 · Enterprise Onboarding" title="One-time enterprise enrollment" desc="Complete each step. On submission the platform provisions the enterprise ID, governance drafts, cap table, Shares Archive, zero-balance accounts, disclosure workspace, performance profiles and compliance calendar." />
      <div className="mb-6 flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => i < step && setStep(i)} className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wider ${i === step ? "border-gold text-gold" : i < step ? "border-success/50 text-success" : "border-border text-muted-foreground"}`}>
            {i + 1}. {s}
          </button>
        ))}
      </div>
      <Panel>
        {step === 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Legal business name *"><Input value={id.legal_name} onChange={(e) => setId({ ...id, legal_name: e.target.value })} /></Field>
            <Field label="Trade name"><Input value={id.trade_name} onChange={(e) => setId({ ...id, trade_name: e.target.value })} /></Field>
            <Field label="Entity type *">
              <select className={selectCls} value={id.entity_type} onChange={(e) => setId({ ...id, entity_type: e.target.value })}>
                <option value="corporation">Corporation</option><option value="llc">LLC</option><option value="sole_proprietor">Sole proprietor</option><option value="public_benefit_corporation">Public benefit corporation</option>
              </select>
            </Field>
            <Field label="Jurisdiction *"><Input value={id.jurisdiction} onChange={(e) => setId({ ...id, jurisdiction: e.target.value })} /></Field>
            <Field label="Registration number"><Input value={id.registration_number} onChange={(e) => setId({ ...id, registration_number: e.target.value })} /></Field>
            <Field label="Registered address"><Input value={id.address} onChange={(e) => setId({ ...id, address: e.target.value })} /></Field>
            <div className="md:col-span-2"><Field label="Public summary (shown only after approval)"><Textarea value={id.public_summary} onChange={(e) => setId({ ...id, public_summary: e.target.value })} maxLength={1000} /></Field></div>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-3">
            {owners.map((o, i) => (
              <div key={i} className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
                <Input placeholder="Full legal name" value={o.full_name} onChange={(e) => setOwners(owners.map((x, j) => j === i ? { ...x, full_name: e.target.value } : x))} />
                <Input type="number" placeholder="Ownership %" value={o.ownership_pct} onChange={(e) => setOwners(owners.map((x, j) => j === i ? { ...x, ownership_pct: e.target.value } : x))} />
                <Input placeholder="Control role" value={o.control_role} onChange={(e) => setOwners(owners.map((x, j) => j === i ? { ...x, control_role: e.target.value } : x))} />
                <Button variant="ghost" size="icon" onClick={() => setOwners(owners.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setOwners([...owners, { full_name: "", ownership_pct: "0", control_role: "" }])}><Plus /> Add owner</Button>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Supporting documents are stored as protected records with a SHA-256 hash. Governance drafts are generated automatically.</p>
            {docs.map((d, i) => (
              <div key={i} className="grid gap-2 md:grid-cols-[1fr_1fr_2fr_auto]">
                <Input placeholder="Title" value={d.title} onChange={(e) => setDocs(docs.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                <select className={selectCls} value={d.doc_type} onChange={(e) => setDocs(docs.map((x, j) => j === i ? { ...x, doc_type: e.target.value } : x))}>
                  <option value="certificate_of_formation">Certificate of formation</option><option value="good_standing">Good standing</option><option value="supporting">Supporting</option>
                </select>
                <Input placeholder="Content / reference" value={d.content} onChange={(e) => setDocs(docs.map((x, j) => j === i ? { ...x, content: e.target.value } : x))} />
                <Button variant="ghost" size="icon" onClick={() => setDocs(docs.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setDocs([...docs, { title: "", doc_type: "certificate_of_formation", content: "" }])}><Plus /> Add document</Button>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4 text-sm">
            <div className="rounded-md border border-border bg-muted p-4 text-muted-foreground">
              By electing membership, the enterprise agrees to be bound by Black SEC standards BSEC-001 through BSEC-030 under SOLN GPBC governance, including truthful disclosure, Shares Archive recordkeeping, registrar approval of all share events, and compliance calendar obligations. Registry membership is not exchange registration and is not approval by any government securities regulator.
            </div>
            <label className="flex items-center gap-2"><Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} /> I accept the binding Black SEC standards on behalf of the enterprise.</label>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-4">
            <Field label="Equity election">
              <select className={selectCls} value={equity} onChange={(e) => setEquity(e.target.value as "new" | "import")}>
                <option value="new">Create new shares</option><option value="import">Import existing shares (registrar verification required)</option>
              </select>
            </Field>
            {classes.map((c, i) => (
              <div key={i} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-3">
                <Field label="Class name"><Input value={c.name} onChange={(e) => setClasses(classes.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></Field>
                <Field label="Authorized shares"><Input type="number" value={c.authorized} onChange={(e) => setClasses(classes.map((x, j) => j === i ? { ...x, authorized: e.target.value } : x))} /></Field>
                <Field label="Par value"><Input type="number" value={c.par_value} onChange={(e) => setClasses(classes.map((x, j) => j === i ? { ...x, par_value: e.target.value } : x))} /></Field>
                <Field label="Voting rights"><Input value={c.voting_rights} onChange={(e) => setClasses(classes.map((x, j) => j === i ? { ...x, voting_rights: e.target.value } : x))} /></Field>
                <Field label="Dividend rights"><Input value={c.dividend_rights} onChange={(e) => setClasses(classes.map((x, j) => j === i ? { ...x, dividend_rights: e.target.value } : x))} /></Field>
                <Field label="Transfer restrictions"><Input value={c.transfer_restrictions} onChange={(e) => setClasses(classes.map((x, j) => j === i ? { ...x, transfer_restrictions: e.target.value } : x))} /></Field>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setClasses([...classes, { name: "", authorized: "", par_value: "0", voting_rights: "non_voting", dividend_rights: "", transfer_restrictions: "" }])}><Plus /> Add class</Button>
            <p className="text-xs text-muted-foreground">Authorization resolutions are generated as signature-pending drafts on submission.</p>
          </div>
        )}
        {step === 5 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Initial shareholders become <strong>proposed</strong> issuance events. Shares are not issued until the authorization resolution is signed and the registrar approves.</p>
            {holders.map((h, i) => (
              <div key={i} className="grid gap-2 md:grid-cols-[2fr_2fr_1fr_1fr_auto]">
                <Input placeholder="Name" value={h.name} onChange={(e) => setHolders(holders.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                <Input placeholder="Email (optional)" value={h.email} onChange={(e) => setHolders(holders.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
                <select className={selectCls} value={h.class_name} onChange={(e) => setHolders(holders.map((x, j) => j === i ? { ...x, class_name: e.target.value } : x))}>
                  {classes.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
                <Input type="number" placeholder="Quantity" value={h.quantity} onChange={(e) => setHolders(holders.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} />
                <Button variant="ghost" size="icon" onClick={() => setHolders(holders.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setHolders([...holders, { name: "", email: "", class_name: classes[0]?.name ?? "", quantity: "" }])}><Plus /> Add shareholder</Button>
          </div>
        )}
        {step === 6 && (
          <div className="flex flex-wrap gap-3">
            {CURRENCIES.map((c) => (
              <label key={c} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <Checkbox checked={currencies.includes(c)} onCheckedChange={(v) => setCurrencies(v ? [...currencies, c] : currencies.filter((x) => x !== c))} />
                {c}{c === "LND" && <span className="text-[10px] text-muted-foreground">(internal accounting)</span>}
              </label>
            ))}
            <p className="w-full text-xs text-muted-foreground">Accounts are created at zero balance. No fictional cash balances are recorded.</p>
          </div>
        )}
        {step === 7 && (
          <div className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Enterprise:</span> {id.legal_name} ({id.entity_type}, {id.jurisdiction})</p>
            <p><span className="text-muted-foreground">Owners:</span> {owners.length} · <span className="text-muted-foreground">Documents:</span> {docs.length}</p>
            <p><span className="text-muted-foreground">Equity:</span> {equity} · Classes: {classes.map((c) => `${c.name} (${c.authorized})`).join(", ")}</p>
            <p><span className="text-muted-foreground">Proposed initial holders:</span> {holders.length}</p>
            <p><span className="text-muted-foreground">Ledger currencies:</span> {currencies.join(", ")}</p>
            <p><span className="text-muted-foreground">Standards accepted:</span> {accepted ? "Yes" : "No"}</p>
          </div>
        )}
        <div className="mt-6 flex justify-between">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
          {step < STEPS.length - 1 ? <Button variant="gold" onClick={next}>Continue</Button> : <Button variant="gold" disabled={submit.isPending} onClick={() => submit.mutate()}>Submit & provision</Button>}
        </div>
      </Panel>
      {enterpriseId ? <ProvisioningStatus ent={enterpriseId} /> : <div className="mt-6"><NeedEnterprise /></div>}
    </div>
  );
}

function ProvisioningStatus({ ent }: { ent: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["prov", ent],
    queryFn: async () => {
      const [t, d] = await Promise.all([
        supabase.from("provisioning_tasks").select("*").eq("enterprise_id", ent).order("module"),
        supabase.from("enterprise_documents").select("*").eq("enterprise_id", ent).order("created_at"),
      ]);
      return { tasks: t.data ?? [], docs: d.data ?? [] };
    },
  });
  const retry = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.rpc("retry_provisioning", { _task: id }); if (error) throw error; },
    onSuccess: () => { toast.success("Retry executed"); qc.invalidateQueries(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const sign = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.rpc("sign_document", { _doc: id }); if (error) throw error; },
    onSuccess: () => { toast.success("Document signed"); qc.invalidateQueries(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <Panel title="Provisioning modules">
        <Table head={["Module", "Status", "Attempts", "Error", ""]} rows={data?.tasks.map((t) => [t.module.replace(/_/g, " "), <Status s={t.status} />, t.attempts, <span className="text-xs text-destructive">{t.last_error}</span>,
          t.status === "failed" ? <Button size="sm" variant="outline" onClick={() => retry.mutate(t.id)}><RotateCw /> Retry</Button> : null]) ?? []} empty="Not provisioned (template or demo enterprise)." />
      </Panel>
      <Panel title="Documents & pending signatures">
        <Table head={["Document", "Status", "SHA-256", ""]} rows={data?.docs.map((d) => [d.title, <Status s={d.status} />, <code className="text-[10px] text-muted-foreground" title={d.sha256 ?? ""}>{d.sha256?.slice(0, 16)}…</code>,
          d.status !== "signed" ? <Button size="sm" variant="outline" onClick={() => sign.mutate(d.id)}>Sign</Button> : null]) ?? []} />
      </Panel>
    </div>
  );
}
