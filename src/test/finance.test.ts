import { describe, it, expect } from "vitest";
import { canQueueTradeSettlement, applySettlementEvent, canTransition, validateTransition, journalImbalance, checkApproval, holderBalance, classIssued, matchOrder, type ShareEvent } from "@/lib/finance";
import { hmacHex, verifySignature, webhookEffect, nextRetryDelayMs } from "@/lib/soln/protocol";

describe("STD state machine", () => {
  it("allows the happy path in order", () => {
    const p = ["CREATED", "VALIDATED", "QUOTED", "FUNDED", "EXECUTED", "SETTLED", "RECONCILED", "ARCHIVED"] as const;
    for (let i = 0; i < p.length - 1; i++) expect(canTransition(p[i]!, p[i + 1]!)).toBe(true);
  });
  it("forbids skipping to SETTLED", () => expect(canTransition("CREATED", "SETTLED")).toBe(false));
  it("terminal states have no exits", () => expect(canTransition("ARCHIVED", "CREATED")).toBe(false));
  it("FUNDED requires external confirmation", () => expect(validateTransition("QUOTED", "FUNDED", { isTest: true })).toMatch(/external confirmation/));
  it("test mode only accepts MOCK- confirmations", () => expect(validateTransition("QUOTED", "FUNDED", { isTest: true, externalRef: "BANK-1" })).toMatch(/MOCK-/));
  it("live SETTLED blocked when connector not verified", () => expect(validateTransition("EXECUTED", "SETTLED", { isTest: false, externalRef: "X", liveVerified: false })).toMatch(/verified/));
  it("expired quote rejected", () => expect(validateTransition("VALIDATED", "QUOTED", { isTest: true, quoteExpiresAt: new Date(Date.now() - 1000) })).toMatch(/expired/));
});

describe("double-entry journal", () => {
  it("balanced per currency passes", () => expect(journalImbalance([{ account_id: "a", currency: "USD", debit: 10 }, { account_id: "b", currency: "USD", credit: 10 }])).toEqual([]));
  it("cross-currency balance is not allowed", () => expect(journalImbalance([{ account_id: "a", currency: "USD", debit: 10 }, { account_id: "b", currency: "EUR", credit: 10 }])).toEqual(["USD", "EUR"]));
  it("line with both sides is invalid", () => expect(journalImbalance([{ account_id: "a", currency: "USD", debit: 1, credit: 1 }, { account_id: "b", currency: "USD", credit: 0, debit: 0 }])).toEqual(["INVALID_LINE"]));
});

describe("Shares Archive invariants", () => {
  const c = "cls";
  const base: ShareEvent[] = [{ event_type: "issuance", from_holder: null, to_holder: "A", quantity: 900, status: "approved", class_id: c }];
  it("issuance cannot exceed authorized", () => expect(checkApproval(base, { event_type: "issuance", from_holder: null, to_holder: "B", quantity: 101, status: "proposed", class_id: c }, 1000)).toMatch(/authorized/));
  it("issuance up to authorized is allowed", () => expect(checkApproval(base, { event_type: "issuance", from_holder: null, to_holder: "B", quantity: 100, status: "proposed", class_id: c }, 1000)).toBeNull());
  it("transfer cannot exceed holder balance", () => expect(checkApproval(base, { event_type: "transfer", from_holder: "A", to_holder: "B", quantity: 901, status: "proposed", class_id: c }, 1000)).toMatch(/balance/));
  it("proposed events are not counted as issued", () => {
    const ev = [...base, { event_type: "issuance" as const, from_holder: null, to_holder: "B", quantity: 50, status: "proposed" as const, class_id: c }];
    expect(classIssued(ev, c)).toBe(900);
    expect(holderBalance(ev, "B", c)).toBe(0);
  });
  it("correction reverses an issuance", () => {
    const ev = [...base, { event_type: "correction" as const, from_holder: "A", to_holder: null, quantity: 900, status: "approved" as const, class_id: c }];
    expect(classIssued(ev, c)).toBe(0);
  });
});

describe("matching engine", () => {
  it("fills at resting price with price-time priority", () => {
    const book = [
      { id: "s1", side: "sell" as const, price: 11, quantity: 5, filled: 0, ts: 1 },
      { id: "s2", side: "sell" as const, price: 10, quantity: 5, filled: 0, ts: 2 },
    ];
    const r = matchOrder(book, { id: "b", side: "buy", price: 11, quantity: 7, filled: 0, ts: 3 });
    expect(r.trades).toEqual([{ buy: "b", sell: "s2", price: 10, quantity: 5 }, { buy: "b", sell: "s1", price: 11, quantity: 2 }]);
    expect(r.remaining).toBe(0);
  });
});

describe("SOLN connector protocol", () => {
  it("verifies a valid signature and rejects tampering", async () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const body = '{"a":1}';
    const sig = await hmacHex("s3cret", `${ts}.${body}`);
    expect(await verifySignature("s3cret", body, `sha256=${sig}`, ts)).toBe(true);
    expect(await verifySignature("s3cret", '{"a":2}', `sha256=${sig}`, ts)).toBe(false);
  });
  it("rejects stale timestamps (replay)", async () => {
    const ts = (Math.floor(Date.now() / 1000) - 3600).toString();
    const sig = await hmacHex("k", `${ts}.x`);
    expect(await verifySignature("k", "x", sig, ts)).toBe(false);
  });
  it("SOLN posting never implies external bank settlement", () => {
    expect(webhookEffect("instruction.posted")).toEqual({ soln_posting_status: "soln_ledger_posted" });
    expect(webhookEffect("settlement.external_confirmed")).toEqual({ external_bank_status: "external_settlement_confirmed" });
  });
  it("retry backoff grows and caps", () => {
    expect(nextRetryDelayMs(1)).toBe(30_000);
    expect(nextRetryDelayMs(2)).toBe(120_000);
    expect(nextRetryDelayMs(20)).toBe(6 * 3600_000);
  });
});

describe("verified trade settlement path", () => {
  const ok = { sandbox: false, status: "awaiting_verified_execution" as const, solnVerified: true, brokerVerified: true };
  it("sandbox trades can never be sent for settlement", () => expect(canQueueTradeSettlement({ ...ok, sandbox: true })).toMatch(/Sandbox/));
  it("requires a verified SOLN connector", () => expect(canQueueTradeSettlement({ ...ok, solnVerified: false })).toMatch(/SOLN/));
  it("requires a verified broker/ATS partner", () => expect(canQueueTradeSettlement({ ...ok, brokerVerified: false })).toMatch(/broker/));
  it("verified trade can be queued", () => expect(canQueueTradeSettlement(ok)).toBeNull());
  it("SOLN posting proposes an archive transfer but does not mark bank settlement", () => {
    const r = applySettlementEvent("soln_instruction_queued", "instruction.posted", true);
    expect(r).toEqual({ status: "archive_event_proposed", proposeArchiveTransfer: true });
  });
  it("unmapped holders become an exception, no archive event", () => expect(applySettlementEvent("soln_instruction_queued", "instruction.posted", false).proposeArchiveTransfer).toBe(false));
  it("external bank settlement only from its own event", () => expect(applySettlementEvent("archive_event_proposed", "settlement.external_confirmed", true).externalBank).toBe("external_settlement_confirmed"));
  it("duplicate posting is ignored", () => expect(applySettlementEvent("archive_event_proposed", "instruction.posted", true).proposeArchiveTransfer).toBe(false));
});
