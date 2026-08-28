// src/roles/useMyRole.ts
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthProvider";
import { getErrorMessage } from "../lib/errorMessage";

export type Role = "viewer" | "admin" | "owner";

type State = {
  loading: boolean;
  role: Role | null;
  error?: string;
};

/**
 * useMyRole(accountId)
 * --------------------
 * Lädt die Rolle des aktuellen Users im angegebenen Account.
 *
 * WICHTIG:
 * - Kein "viewer"-Default, wenn keine Row gefunden wurde!
 *   Sonst maskierst du "User ist kein Member" / RLS / falsche Filter.
 * - Race-Guard gegen späte responses.
 */
export function useMyRole(accountId: string | null): State {
  const { user, loading: authLoading } = useAuth();

  const [state, setState] = useState<State>({
    loading: true,
    role: null,
    error: undefined,
  });

  const seqRef = useRef(0);

  useEffect(() => {
    let alive = true;
    const seq = ++seqRef.current;

    async function run() {
      // Auth lädt => hook bleibt loading
      if (authLoading) {
        if (alive) setState({ loading: true, role: null, error: undefined });
        return;
      }

      // Ohne User oder Account: sauber resetten
      if (!user?.id || !accountId) {
        if (alive) setState({ loading: false, role: null, error: undefined });
        return;
      }

      if (alive) setState({ loading: true, role: null, error: undefined });

      try {
        const { data, error } = await supabase
          .from("account_members")
          .select("role")
          .eq("account_id", accountId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (!alive || seq !== seqRef.current) return;
        if (error) throw error;

        // Wenn keine Row -> user ist kein member ODER RLS blockt => role bleibt null
        const role = (data?.role as Role | undefined) ?? null;

        // Optional: harte Validierung, falls DB Müll liefert
        const allowed: Role[] = ["viewer", "admin", "owner"];
        const safeRole = role && allowed.includes(role) ? role : null;

        setState({ loading: false, role: safeRole, error: undefined });
      } catch (e: unknown) {
        if (!alive || seq !== seqRef.current) return;
        const msg = getErrorMessage(e);
        setState({ loading: false, role: null, error: msg });
      }
    }

    run();

    return () => {
      alive = false;
    };
  }, [authLoading, user?.id, accountId]);

  return state;
}
