import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { safeInternalPath } from "../lib/navigation";

type TotpEnroll = {
  factorId: string;
  qr?: string;
  uri?: string;
};

type Stage = "setup" | "verify";

type FromState =
  | string
  | {
      pathname?: string;
    }
  | undefined;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFromPath(locationState: unknown): string {
  const from = (locationState as { from?: FromState } | null)?.from;

  if (typeof from === "string") {
    return safeInternalPath(from, "/immobilienvermoegen");
  }

  if (
    typeof from === "object" &&
    from !== null &&
    typeof from.pathname === "string"
  ) {
    return safeInternalPath(from.pathname, "/immobilienvermoegen");
  }

  return "/immobilienvermoegen";
}

export default function MFA() {
  const navigate = useNavigate();
  const location = useLocation();

  const from = useMemo(() => getFromPath(location.state), [location.state]);

  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<Stage>("verify");

  const [enroll, setEnroll] = useState<TotpEnroll | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const ensureLoggedIn = useCallback(async (): Promise<boolean> => {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    if (!data.session) {
      navigate("/login", { replace: true, state: { from } });
      return false;
    }

    return true;
  }, [from, navigate]);

  const getAalLevel = useCallback(async (): Promise<"aal1" | "aal2" | null> => {
    const { data, error } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (error) throw error;

    if (data?.currentLevel === "aal1" || data?.currentLevel === "aal2") {
      return data.currentLevel as "aal1" | "aal2";
    }

    return null;
  }, []);

  const redirectIfAal2 = useCallback(async (): Promise<boolean> => {
    const level = await getAalLevel();

    if (level === "aal2") {
      navigate(from, { replace: true });
      return true;
    }

    return false;
  }, [from, getAalLevel, navigate]);

  const refreshAndWaitForAal2 = useCallback(async (): Promise<boolean> => {
    const { error } = await supabase.auth.refreshSession();

    if (error) {
      console.warn("[MFA] refreshSession error:", error);
    }

    for (let i = 0; i < 4; i += 1) {
      const level = await getAalLevel();
      if (level === "aal2") return true;
      await sleep(300);
    }

    return false;
  }, [getAalLevel]);

  const startChallenge = useCallback(async (factorId: string) => {
    setError(null);
    setChallengeId(null);

    const { data, error } = await supabase.auth.mfa.challenge({ factorId });

    if (error) throw error;

    const id =
      (data as { id?: string; challengeId?: string } | null)?.id ??
      (data as { id?: string; challengeId?: string } | null)?.challengeId ??
      null;

    if (!id) {
      throw new Error("MFA challengeId fehlt.");
    }

    setChallengeId(id);
  }, []);

  const enrollTotpAndChallenge = useCallback(async () => {
    setError(null);
    setEnroll(null);
    setChallengeId(null);

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator",
    });

    if (error) throw error;

    const raw = data as
      | {
          id?: string;
          factorId?: string;
          totp?: {
            qr_code?: string;
            qrCode?: string;
            qr_svg?: string;
            qr_svg_data?: string;
            qr?: string;
            uri?: string;
            otpauth_url?: string;
            otpauthUrl?: string;
          };
          data?: {
            id?: string;
            factorId?: string;
            totp?: {
              qr_code?: string;
              qrCode?: string;
              qr_svg?: string;
              qr_svg_data?: string;
              qr?: string;
              uri?: string;
              otpauth_url?: string;
              otpauthUrl?: string;
            };
            qr_code?: string;
            qrCode?: string;
            qr_svg?: string;
            qr_svg_data?: string;
            qr?: string;
            uri?: string;
            otpauth_url?: string;
            otpauthUrl?: string;
          };
        }
      | null;

    const factorId =
      raw?.id ?? raw?.factorId ?? raw?.data?.id ?? raw?.data?.factorId ?? null;

    const totp = raw?.totp ?? raw?.data ?? null;

    const qr =
      totp?.qr_code ??
      totp?.qrCode ??
      totp?.qr_svg ??
      totp?.qr_svg_data ??
      totp?.qr ??
      undefined;

    const uri =
      totp?.uri ?? totp?.otpauth_url ?? totp?.otpauthUrl ?? undefined;

    if (!factorId) {
      throw new Error("MFA factorId fehlt.");
    }

    setEnroll({ factorId, qr, uri });
    await startChallenge(factorId);
  }, [startChallenge]);

  const loadAndDecide = useCallback(async () => {
    const alreadyDone = await redirectIfAal2();
    if (alreadyDone) return;

    const { data, error } = await supabase.auth.mfa.listFactors();

    if (error) throw error;

    const totpFactors = data?.totp ?? [];

    if (totpFactors.length > 0) {
      const factorId = totpFactors[0].id;
      setStage("verify");
      setHint("Bitte gib den 6-stelligen Code aus deiner Authenticator-App ein.");
      setEnroll({ factorId });
      await startChallenge(factorId);
      return;
    }

    setStage("setup");
    setHint(
      "Richte 2FA ein: QR-Code scannen und danach den 6-stelligen Code eingeben."
    );
    await enrollTotpAndChallenge();
  }, [enrollTotpAndChallenge, redirectIfAal2, startChallenge]);

  async function onVerify() {
    setBusy(true);
    setError(null);

    try {
      const loggedIn = await ensureLoggedIn();
      if (!loggedIn) return;

      if (!enroll?.factorId) {
        throw new Error("factorId fehlt.");
      }

      if (!challengeId) {
        throw new Error("challengeId fehlt.");
      }

      const cleanCode = code.replace(/\s/g, "");

      if (!/^\d{6}$/.test(cleanCode)) {
        setError("Bitte gib einen 6-stelligen Code ein.");
        return;
      }

      const { error } = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId,
        code: cleanCode,
      });

      if (error) {
        setError(error.message ?? "Verifizierung fehlgeschlagen.");
        try {
          await startChallenge(enroll.factorId);
        } catch {
          // ignore re-challenge failure
        }
        return;
      }

      const becameAal2 = await refreshAndWaitForAal2();

      if (!becameAal2) {
        setError(
          "MFA wurde bestätigt, aber AAL2 ist noch nicht sichtbar. Bitte kurz warten und erneut laden."
        );
        return;
      }

      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onReload() {
    setBusy(true);
    setError(null);
    setCode("");

    try {
      const loggedIn = await ensureLoggedIn();
      if (!loggedIn) return;
      await loadAndDecide();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    setBusy(true);
    setError(null);

    try {
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const loggedIn = await ensureLoggedIn();
        if (!loggedIn || !active) return;

        await loadAndDecide();
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setLoading(false);
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [ensureLoggedIn, loadAndDecide]);

  if (loading) {
    return <div style={{ padding: 24 }}>Lädt…</div>;
  }

  const showQr = stage === "setup";

  return (
    <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ marginTop: 0 }}>Zwei-Faktor-Login (2FA)</h2>
          <div style={{ opacity: 0.75, fontSize: 13 }}>
            Ziel: Ohne bestätigte Authenticator-App (AAL2) kein Zugriff auf die
            App.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onReload}
            disabled={busy}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "white",
              fontWeight: 900,
              cursor: "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            Neu laden
          </button>

          <button
            onClick={onLogout}
            disabled={busy}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "white",
              fontWeight: 900,
              cursor: "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {hint ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 14,
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            fontSize: 13,
          }}
        >
          {hint}
        </div>
      ) : null}

      {showQr ? (
        <div
          style={{
            marginTop: 14,
            padding: 14,
            borderRadius: 14,
            border: "1px solid #e5e7eb",
            background: "white",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 8 }}>
            Setup: QR-Code scannen
          </div>

          {enroll?.qr ? (
            <img
              alt="TOTP QR Code"
              src={
                enroll.qr.startsWith("data:")
                  ? enroll.qr
                  : `data:image/svg+xml;utf8,${encodeURIComponent(enroll.qr)}`
              }
              style={{
                width: 220,
                height: 220,
                borderRadius: 12,
                border: "1px solid #e5e7eb",
              }}
            />
          ) : (
            <div style={{ opacity: 0.7, fontSize: 13 }}>QR wird geladen…</div>
          )}

          {enroll?.uri ? (
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                opacity: 0.8,
                wordBreak: "break-all",
              }}
            >
              <div style={{ fontWeight: 800 }}>Backup-Link (otpauth):</div>
              <code>{enroll.uri}</code>
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 14,
          padding: 14,
          borderRadius: 14,
          border: "1px solid #e5e7eb",
          background: "white",
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 8 }}>
          {stage === "setup" ? "Code bestätigen" : "Code eingeben"}
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            style={{
              padding: "12px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              fontSize: 16,
              letterSpacing: "0.2em",
              width: 160,
              outline: "none",
            }}
          />

          <button
            onClick={onVerify}
            disabled={busy || !challengeId || !enroll?.factorId}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #111827",
              background: "#111827",
              color: "white",
              fontWeight: 900,
              cursor: "pointer",
              opacity: busy || !challengeId || !enroll?.factorId ? 0.6 : 1,
            }}
          >
            {busy ? "Prüfe…" : "Bestätigen"}
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          Tipp: Wenn der Code abgelehnt wird, prüfe Uhrzeit/Zeitzone am Handy.
        </div>

        {error ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 14,
              border: "1px solid #fecaca",
              background: "#fff1f2",
              color: "#991b1b",
              fontSize: 13,
              whiteSpace: "pre-wrap",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 4 }}>Fehler</div>
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
