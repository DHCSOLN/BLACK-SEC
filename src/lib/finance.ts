// Pure financial invariants mirrored from database enforcement (BSEC-010..BSEC-022).
// Financial source of truth: the existing SOLN Central Bank / Global SOLN Reserve ledger.
// The local database is authoritative only for Black SEC workflow and securities records
// (Shares Archive, approvals, disclosures) and holds cached projections of SOLN data.
// Local database functions enforce Black SEC workflow rules; these helpers mirror them for UI pre-validation and tests.

export const STD_STATES = [
  "CREATED", "VALIDATED", "QUOTED", "FUNDED", "EXECUTED", "SETTLED", "RECONCILED", "ARCHIVED",
  "FAILED", "EXPIRED", "CANCELLED", "REVERSED", "DISPUTED",
] as const;
export type StdState = (typeof STD_STATES)[number];

export const STD_TRANSITIONS: Record<StdState, StdState[]> = {
  CREATED: ["VALIDATED", "CANCELLED", "FAILED"],
  VALIDATED: ["QUOTED", "CANCELLED", "FAILED"],
  QUOTED: ["FUNDED", "CANCELLED", "EXPIRED", "FAILED"],
  FUNDED: ["EXECUTED", "FAILED", "REVERSED"],
  EXECUTED: ["SETTLED", "FAILED", "REVERSED", "DISPUTED"],
  SETTLED: ["RECONCILED", "REVERSED", "DISPUTED"],
  RECONCILED: ["ARCHIVED", "DISPUTED"],
  ARCHIVED: [],
  FAILED: [],
  EXPIRED: [],
  CANCELLED: [],
  REVERSED: [],
  DISPUTED: ["REVERSED", "SETTLED"],
};
export const EXTERNAL_CONFIRMATION_REQUIRED: StdState[] = ["FUNDED", "SETTLED"];

export function canTransition(from: StdState, to: StdState) {
  return STD_TRANSITIONS[from].includes(to);
}

export function validateTransition(
  from: StdState,
  to: StdState,
  opts: { externalRef?: string; isTest: boolean; liveVerified?: boolean; quoteExpiresAt?: Date },
): string | null {
  if (!canTransition(from, to)) return `Illegal transition ${from} -> ${to}`;
  if (to === "QUOTED") {
    if (!opts.quoteExpiresAt) return "FX quote required for QUOTED";
    if (opts.quoteExpiresAt.getTime() < Date.now()) return "FX quote expired";
  }
  if (EXTERNAL_CONFIRMATION_REQUIRED.includes(to)) {
    const ref = opts.externalRef?.trim() ?? "";
    if (!ref) return `${to} requires external confirmation reference`;
    if (opts.isTest && !ref.startsWith("MOCK-")) return "Test-mode instructions accept only MOCK- confirmations";
    if (!opts.isTest && !opts.liveVerified) return "No verified live settlement integration configured";
  }
  return null;
}

export type JournalLine = { account_id: string; currency: string; debit?: number; credit?: number };
export function journalImbalance(lines: JournalLine[]): string[] {
  const sums = new Map<string, number>();
  for (const l of lines) {
    const d = l.debit ?? 0, c = l.credit ?? 0;
    if (d < 0 || c < 0 || (d === 0) === (c === 0)) return ["INVALID_LINE"];
    sums.set(l.currency, Math.round(((sums.get(l.currency) ?? 0) + d - c) * 1e6) / 1e6);
  }
  if (lines.length < 2) return ["TOO_FEW_LINES"];
  return [...sums.entries()].filter(([, v]) => v !== 0).map(([k]) => k);
}

export type ShareEvent = {
  event_type: "issuance" | "transfer" | "cancellation" | "correction";
  from_holder: string | null;
  to_holder: string | null;
  quantity: number;
  status: "proposed" | "approved" | "rejected";
  class_id: string;
};
export function holderBalance(events: ShareEvent[], holder: string, classId: string) {
  return events
    .filter((e) => e.status === "approved" && e.class_id === classId)
    .reduce((s, e) => s + (e.to_holder === holder ? e.quantity : 0) - (e.from_holder === holder ? e.quantity : 0), 0);
}
export function classIssued(events: ShareEvent[], classId: string) {
  return events
    .filter((e) => e.status === "approved" && e.class_id === classId)
    .reduce((s, e) => s + (e.from_holder === null ? e.quantity : e.to_holder === null ? -e.quantity : 0), 0);
}
export function checkApproval(events: ShareEvent[], e: ShareEvent, authorized: number): string | null {
  if (e.status !== "proposed") return "Event already decided";
  if (e.from_holder === null) {
    const issued = classIssued(events, e.class_id);
    if (issued + e.quantity > authorized) return "Exceeds authorized shares";
  } else if (holderBalance(events, e.from_holder, e.class_id) < e.quantity) {
    return "Insufficient holder balance";
  }
  return null;
}

export type BookOrder = { id: string; side: "buy" | "sell"; price: number; quantity: number; filled: number; ts: number };
export function matchOrder(book: BookOrder[], incoming: BookOrder) {
  const trades: { buy: string; sell: string; price: number; quantity: number }[] = [];
  const opp = book
    .filter((o) => o.side !== incoming.side && o.filled < o.quantity)
    .filter((o) => (incoming.side === "buy" ? o.price <= incoming.price : o.price >= incoming.price))
    .sort((a, b) => (incoming.side === "buy" ? a.price - b.price : b.price - a.price) || a.ts - b.ts);
  let rem = incoming.quantity;
  for (const o of opp) {
    if (rem === 0) break;
    const q = Math.min(rem, o.quantity - o.filled);
    o.filled += q;
    rem -= q;
    trades.push({
      buy: incoming.side === "buy" ? incoming.id : o.id,
      sell: incoming.side === "sell" ? incoming.id : o.id,
      price: o.price,
      quantity: q,
    });
  }
  return { trades, remaining: rem };
}

export function fxAllIn(rate: number, spreadBps: number, side: "buy" | "sell") {
  const adj = rate * (spreadBps / 10000);
  return side === "buy" ? rate + adj : rate - adj;
}

export async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Verified trade settlement path (mirrors public.queue_trade_settlement / apply_trade_settlement_event).
// execution -> SOLN ledger instruction -> SOLN posting confirmation -> proposed Shares Archive transfer -> performance record.
// External bank settlement is a separate status set only by a SOLN external-settlement event.
export type TradeSettlementStatus =
  | "sandbox_not_settled" | "awaiting_verified_execution" | "soln_instruction_queued" | "soln_ledger_posted"
  | "soln_rejected" | "archive_event_proposed" | "exception_holder_unmapped";

export function canQueueTradeSettlement(o: { sandbox: boolean; status: TradeSettlementStatus; solnVerified: boolean; brokerVerified: boolean }): string | null {
  if (o.sandbox) return "Sandbox trades are simulations and cannot be sent for SOLN settlement";
  if (o.status !== "awaiting_verified_execution") return `Settlement already ${o.status}`;
  if (!o.solnVerified) return "SOLN ledger connector not yet verified";
  if (!o.brokerVerified) return "No verified broker/ATS execution partner";
  return null;
}

export function applySettlementEvent(
  status: TradeSettlementStatus,
  event: string,
  holdersMapped: boolean,
): { status: TradeSettlementStatus; proposeArchiveTransfer: boolean; externalBank?: "external_settlement_confirmed" | "external_settlement_failed" } {
  if (event === "settlement.external_confirmed") return { status, proposeArchiveTransfer: false, externalBank: "external_settlement_confirmed" };
  if (event === "settlement.external_failed") return { status, proposeArchiveTransfer: false, externalBank: "external_settlement_failed" };
  if (event === "instruction.rejected") return { status: "soln_rejected", proposeArchiveTransfer: false };
  if (event !== "instruction.posted" || !["soln_instruction_queued", "exception_holder_unmapped"].includes(status)) return { status, proposeArchiveTransfer: false };
  if (!holdersMapped) return { status: "exception_holder_unmapped", proposeArchiveTransfer: false };
  return { status: "archive_event_proposed", proposeArchiveTransfer: true };
}
