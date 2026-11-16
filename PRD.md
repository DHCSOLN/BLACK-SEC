# PRD-BSEC-2026-001 — BLACK SEC: SOLN Enterprise Securities Market

Owner: State of Loc Nation Global Public Benefit Corporation (SOLN GPBC). Standards BSEC-001 to BSEC-030.
Black SEC is a private registry. It is not the U.S. SEC, is not a government regulator, and registry membership is not exchange registration.

## 1. Governance (BSEC-001)
Founding governance first: the first account becomes the founding administrator (also registrar, compliance officer, financial ops).
Roles: founding_admin, registrar, compliance_officer, financial_ops, auditor, investor; enterprise founder/secretary via enterprise membership.
Roles live in a separate table; checks run in database functions. Tenant isolation by enterprise via row-level security. MFA (TOTP) enrollment in Administration.

## 2. Onboarding (BSEC-002)
Wizard: identity, entity type, jurisdiction, beneficial owners, documents, binding membership election, equity election (new/import), classes, initial shareholders, currencies.
Submission runs `submit_onboarding` then `provision_enterprise` modules: enterprise_id, dashboard, governance_documents, cap_table, shares_archive, multi_currency_accounts, **soln_ledger_sync**, disclosure_workspace, performance_profile, compliance_calendar, reporting, notifications. Per-module status, error, attempts, retry. Governance drafts are pending signature.
Initial holdings are **proposed** issuance events only.

## 3. Shares Archive (BSEC-005..009)
Append-only events (issuance, transfer, cancellation, correction). Approved events are immutable and SHA-256 hash-chained.
Approval by registrar requires a signed authorization resolution and checks authorized vs issued and holder balances. Corrections reverse prior events. CSV/JSON import (as proposed) and export. Investors see only their own holdings.
SOLN GPBC founding template exists with no holdings or tax data.

## 4. Market (BSEC-012..015) — SANDBOX ONLY
Primary offerings, order ticket, order book, price-time matching, trade history, surveillance alerts (>20% deviation), halts, liquidity status, investor eligibility. Current status is sandbox simulation. Verified execution path: verified execution → SOLN ledger instruction and confirmation → proposed Shares Archive transfer event (registrar approval) → performance reporting. No settlement is marked without SOLN confirmation. Broker/ATS partner adapter interface is defined; no live adapter until a regulated partner is verified.

## 5. Financial infrastructure (BSEC-018..024) — SOLN LEDGER IS AUTHORITATIVE
The SOLN Central Bank / Global SOLN Reserve end-to-end ledger (globalsolnreserve.com; DHCSOLN/GLOBAL-SOLN-RESERVE; SOLNCB on AWS/MongoDB Atlas) is the source of truth for LND and internal balances, GFI, STD, FX and reconciliation.
Black SEC keeps **read models only**: local journal = shadow/read model queued for SOLN posting; balance cache from SOLN reads.
Connector: server-side secrets, Bearer auth, Idempotency-Key, HMAC request signing, outbox with exponential backoff retry and replay, signed inbound webhooks (idempotent by event_id, 5-minute timestamp tolerance), account mapping for enterprise and investor accounts, reconciliation runs, status dashboard.
Status: **CONNECTOR NOT YET VERIFIED** until credentials are configured and the health check passes. While unverified: no balances shown, no executable FX, no live settlement. The existing SOLN ledger must be inspected before any mapping changes; Black SEC never overwrites or migrates it.
Distinct statuses: `soln_posting_status` (SOLN ledger posted) vs `external_bank_status` (external bank settled). External bank settlement is never claimed automatically.
GFI/STD are SOLN-configurable terminology pending exact protocol definition. STD states: CREATED, VALIDATED, QUOTED, FUNDED, EXECUTED, SETTLED, RECONCILED, ARCHIVED; FAILED, EXPIRED, CANCELLED, REVERSED, DISPUTED. FUNDED/SETTLED require external confirmation (MOCK- in test mode).
FX quotes record rate, timestamp, expiry, spread, fee, source and kind; LND internal valuations are never executable.

### 5a. Verified trade settlement path (implemented, gated)
Each trade gets a settlement record. `queue_trade_settlement` refuses sandbox trades and requires both a verified SOLN connector and a verified live broker/ATS partner; it queues an idempotent SOLN instruction (`TRADE-<id>`).
On a signed SOLN `instruction.posted` event, `apply_trade_settlement_event` marks the trade SOLN-ledger-posted, proposes a Shares Archive transfer (registrar approval still required) and adds a share-change performance record. Unmapped buyer/seller holders become an exception. External bank settlement changes only on `settlement.external_confirmed` / `external_failed`. Only the webhook handler (service role) can call the confirmation function.

## 6. Performance (BSEC-025)
Private and public profiles provisioned automatically. Records are enterprise-reported until verified by compliance; public only when approved; corrections reference prior records. Global SOLN Reserve reporting sync is not connected.

## 7. Disclosures, compliance, reports (BSEC-016, 027, 028)
Draft → submitted → approved disclosures; compliance calendar; alert center; audit log (append-only, trigger-written).

## 8. APIs
- `GET /api/public/v1/health`
- `GET /api/public/v1/directory` — approved public profiles only
- `GET /api/v1/enterprises/{id}/cap-table` — Bearer user token, RLS-scoped
- `POST /api/public/v1/webhooks/soln` — signed SOLN events (see PRD.yml)

## 9. Production readiness checklist
- [ ] Legal registration of SOLN GPBC and counsel opinion on registry status per jurisdiction
- [ ] Securities law analysis for offerings; confirm non-exchange status
- [ ] Inspect SOLN ledger API schema; finalize endpoint mapping; configure secrets; verify connector
- [ ] Exchange webhook secret with SOLN; end-to-end posting and reconciliation test
- [ ] Regulated broker-dealer / ATS partner adapter, verified
- [ ] Registered transfer agent where required
- [ ] Qualified custodian (Black SEC holds no client funds)
- [ ] Licensed FX liquidity provider for executable quotes
- [ ] KYC/AML and sanctions screening provider
- [ ] Enforce MFA for staff; penetration test; backup/restore drills
- [ ] Incident response, complaints SLA, audit retention
