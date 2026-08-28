// src/roles/useActiveAccount.ts
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthProvider";
import { getErrorMessage } from "../lib/errorMessage";

type State = {
  loading: boolean;
  accountId: string | null;
  error?: string;
};

/**
 * useActiveAccount
 * ---------------
 * Wählt den "ersten" Account, in dem der aktuelle User Mitglied ist.
 *
 * CRITICAL:
 * - IMMER auf user_id filtern, sonst bekommst du fremde Accounts / RLS-Fehler.
 * - Kein Request solange Auth noch lädt oder user null ist.
 */
export function useActiveAccount(): State {
  const { user, loading: authLoading } = useAuth();

  const [state, setState] = useState<State>({
    loading: true,
    accountId: null,
    error: undefined,
  });

  // sequence guard gegen späte responses
  const seqRef = useRef(0);

  useEffect(() => {
    let alive = true;
    const seq = ++seqRef.current;

    async function run() {
      // Auth lädt: Hook ist ebenfalls loading
      if (authLoading) {
        if (alive) setState({ loading: true, accountId: null, error: undefined });
        return;
      }

      // Kein User: sauber resetten
      if (!user?.id) {
        if (alive) setState({ loading: false, accountId: null, error: undefined });
        return;
      }

      // User vorhanden => laden
      if (alive) setState({ loading: true, accountId: null, error: undefined });

      try {
        const { data, error } = await supabase
          .from("account_members")
          .select("account_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!alive || seq !== seqRef.current) return;
        if (error) throw error;

        const accountId = data?.account_id ? String(data.account_id) : null;
        setState({ loading: false, accountId, error: undefined });
      } catch (e: unknown) {
        if (!alive || seq !== seqRef.current) return;
        const msg = getErrorMessage(e);
        setState({ loading: false, accountId: null, error: msg });
      }
    }

    run();

    return () => {
      alive = false;
    };
  }, [authLoading, user?.id]);

  return state;
}
