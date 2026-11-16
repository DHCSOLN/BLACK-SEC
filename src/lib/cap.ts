import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCapData(ent: string | null) {
  return useQuery({
    enabled: !!ent,
    queryKey: ["cap", ent],
    queryFn: async () => {
      const [c, t, s, ev] = await Promise.all([
        supabase.from("share_classes").select("*").eq("enterprise_id", ent!).order("created_at"),
        supabase.rpc("get_cap_table", { _ent: ent! }),
        supabase.from("shareholders").select("*").eq("enterprise_id", ent!).order("name"),
        supabase.from("share_events").select("*").eq("enterprise_id", ent!).order("seq"),
      ]);
      return { classes: c.data ?? [], table: t.data ?? [], holders: s.data ?? [], events: ev.data ?? [] };
    },
  });
}

