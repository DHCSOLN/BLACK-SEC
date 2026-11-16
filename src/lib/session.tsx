import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Role = "founding_admin" | "registrar" | "compliance_officer" | "financial_ops" | "auditor" | "investor";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const [{ data: roles }, { data: members }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
        supabase.from("enterprise_members").select("enterprise_id, role").eq("user_id", u.user.id),
      ]);
      const r = (roles ?? []).map((x) => x.role as Role);
      return {
        user: u.user,
        roles: r,
        memberships: members ?? [],
        has: (x: Role) => r.includes(x),
        isStaff: r.some((x) => x !== "investor"),
      };
    },
  });
}

type EntCtx = { enterpriseId: string | null; setEnterpriseId: (id: string | null) => void };
const Ctx = createContext<EntCtx>({ enterpriseId: null, setEnterpriseId: () => {} });
export function EnterpriseProvider({ children }: { children: ReactNode }) {
  const [enterpriseId, set] = useState<string | null>(null);
  useEffect(() => {
    set(localStorage.getItem("bsec.enterprise"));
  }, []);
  const setEnterpriseId = (id: string | null) => {
    set(id);
    if (id) localStorage.setItem("bsec.enterprise", id);
    else localStorage.removeItem("bsec.enterprise");
  };
  return <Ctx.Provider value={{ enterpriseId, setEnterpriseId }}>{children}</Ctx.Provider>;
}
export const useEnterprise = () => useContext(Ctx);

export function useEnterprises() {
  return useQuery({
    queryKey: ["enterprises"],
    queryFn: async () => {
      const { data, error } = await supabase.from("enterprises").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function errMsg(e: unknown) {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: string }).message);
  return String(e);
}
