// SOLN Central Bank / Global SOLN Reserve ledger connector protocol (BSEC-020..BSEC-024).
// The SOLN ledger is AUTHORITATIVE. Black SEC stores read models only.
// Endpoint paths below are a PROPOSED interface pending the actual SOLN ledger API schema
// (globalsolnreserve.com / DHCSOLN/GLOBAL-SOLN-RESERVE). Adjust ENDPOINTS once inspected.

export const ENDPOINTS = {
  health: "/v1/health",
  balances: (ref: string) => `/v1/accounts/${encodeURIComponent(ref)}/balances`,
  syncAccount: "/v1/accounts/sync",
  createInstruction: "/v1/instructions",
  instruction: (ref: string) => `/v1/instructions/${encodeURIComponent(ref)}`,
  journalEvents: "/v1/journal-events",
} as const;

export const WEBHOOK_EVENT_TYPES = [
  "instruction.posted", // SOLN ledger posted (internal)
  "instruction.rejected",
  "settlement.external_confirmed", // external bank settlement confirmed by SOLN
  "settlement.external_failed",
  "journal.posted",
  "journal.rejected",
  "account.synced",
  "balance.updated",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export type WebhookEnvelope = {
  event_id: string;
  type: WebhookEventType;
  occurred_at: string;
  data: { idempotency_key?: string; soln_ref?: string; account_ref?: string; currency?: string; balance?: string; as_of?: string; reason?: string };
};

export async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function verifySignature(secret: string, body: string, header: string | null, timestamp: string | null, toleranceSec = 300) {
  if (!header || !timestamp) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${timestamp}.${body}`);
  return safeEqual(expected, header.replace(/^sha256=/, ""));
}

/** Backoff for outbox retry: 30s, 2m, 8m, ... capped at 6h. */
export function nextRetryDelayMs(attempts: number) {
  return Math.min(30_000 * 4 ** Math.max(0, attempts - 1), 6 * 3600_000);
}

/** Map an inbound webhook to local status changes. SOLN posting and external bank settlement are distinct. */
export function webhookEffect(t: WebhookEventType): { soln_posting_status?: string; external_bank_status?: string } {
  switch (t) {
    case "instruction.posted": case "journal.posted": return { soln_posting_status: "soln_ledger_posted" };
    case "instruction.rejected": case "journal.rejected": return { soln_posting_status: "soln_rejected" };
    case "settlement.external_confirmed": return { external_bank_status: "external_settlement_confirmed" };
    case "settlement.external_failed": return { external_bank_status: "external_settlement_failed" };
    default: return {};
  }
}
