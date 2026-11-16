import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/health")({
  server: { handlers: { GET: async () => Response.json({ service: "black-sec", prd: "PRD-BSEC-2026-001", status: "ok", trading: "sandbox_only", soln_connector: process.env["SOLN_LEDGER_BASE_URL"] ? "configured_unverified_until_tested" : "not_yet_verified" }) } },
});
