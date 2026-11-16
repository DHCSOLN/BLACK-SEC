import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

// Authenticated REST endpoint: Authorization: Bearer <user access token>. RLS + function checks scope results.
export const Route = createFileRoute("/api/v1/enterprises/$id/cap-table")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer /i, "");
        if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
        if (!z.string().uuid().safeParse(params.id).success) return Response.json({ error: "invalid id" }, { status: 400 });
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
        const sb = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}`, apikey: key } },
        });
        const { data: u } = await sb.auth.getUser(token);
        if (!u.user) return Response.json({ error: "unauthorized" }, { status: 401 });
        const { data, error } = await sb.rpc("get_cap_table", { _ent: params.id });
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json({ enterprise_id: params.id, holdings: data, source: "shares_archive_approved_events" });
      },
    },
  },
});
