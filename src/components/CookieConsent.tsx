import { useEffect, useState, type CSSProperties } from "react";
import { getCookieConsent, saveCookieConsent, type CookieConsentValue } from "../lib/cookieConsent";

export default function CookieConsent() {
  const [initialConsent] = useState<CookieConsentValue | null>(getCookieConsent);
  const [visible, setVisible] = useState(() => !initialConsent);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analytics, setAnalytics] = useState(() => Boolean(initialConsent?.analytics));
  const [marketing, setMarketing] = useState(() => Boolean(initialConsent?.marketing));

  useEffect(() => {
    const openSettings = () => {
      const current = getCookieConsent();
      setAnalytics(Boolean(current?.analytics));
      setMarketing(Boolean(current?.marketing));
      setVisible(true);
      setSettingsOpen(true);
    };

    window.addEventListener("open-cookie-settings", openSettings);
    return () => window.removeEventListener("open-cookie-settings", openSettings);
  }, []);

  const saveConsent = (choice: { analytics: boolean; marketing: boolean }) => {
    const payload: CookieConsentValue = {
      necessary: true,
      analytics: choice.analytics,
      marketing: choice.marketing,
      savedAt: new Date().toISOString(),
      version: "v2",
    };

    saveCookieConsent(payload);
    setAnalytics(choice.analytics);
    setMarketing(choice.marketing);
    setVisible(false);
    setSettingsOpen(false);
    window.dispatchEvent(new CustomEvent("koenen-cookie-consent-updated", { detail: payload }));
  };

  if (!visible) return null;

  return (
    <>
      <div style={styles.banner} role="dialog" aria-label="Cookie Hinweis" aria-live="polite">
        <div style={styles.bannerText}>
          Wir verwenden notwendige Cookies. Optionale Cookies für Analyse oder Marketing werden nur mit Zustimmung genutzt.{" "}
          <a href="/datenschutz" style={styles.bannerLink}>Datenschutz</a>
        </div>

        <div style={styles.bannerActions}>
          <button type="button" style={styles.secondaryButton} onClick={() => saveConsent({ analytics: false, marketing: false })}>
            Ablehnen
          </button>
          <button type="button" style={styles.secondaryButton} onClick={() => setSettingsOpen(true)}>
            Einstellungen
          </button>
          <button type="button" style={styles.primaryButton} onClick={() => saveConsent({ analytics: true, marketing: true })}>
            Akzeptieren
          </button>
        </div>
      </div>

      {settingsOpen && (
        <div style={styles.overlay} role="presentation">
          <div style={styles.modal} role="dialog" aria-modal="true" aria-label="Cookie Einstellungen">
            <div style={styles.modalHeader}>
              <div>
                <p style={styles.eyebrow}>DSGVO Einstellungen</p>
                <h2 style={styles.modalTitle}>Cookie-Einstellungen</h2>
              </div>
              <button type="button" style={styles.closeButton} onClick={() => setSettingsOpen(false)} aria-label="Schließen">
                ×
              </button>
            </div>

            <p style={styles.modalText}>
              Sie können optionale Cookies jederzeit akzeptieren, ablehnen oder Ihre Auswahl ändern.
              Notwendige Cookies bleiben aktiv, damit die Webseite und der geschützte Bereich funktionieren.
            </p>

            <CookieOption
              title="Notwendige Cookies"
              description="Erforderlich für Sicherheit, Login, MFA und Grundfunktionen."
              checked
              disabled
              onChange={() => undefined}
            />

            <CookieOption
              title="Analyse-Cookies"
              description="Helfen, die Nutzung der Webseite anonymisiert zu verstehen und zu verbessern."
              checked={analytics}
              onChange={setAnalytics}
            />

            <CookieOption
              title="Marketing-Cookies"
              description="Derzeit nicht aktiv. Vorbereitung für mögliche spätere externe Marketing-Dienste."
              checked={marketing}
              onChange={setMarketing}
            />

            <div style={styles.modalActions}>
              <button type="button" style={styles.lightButton} onClick={() => saveConsent({ analytics: false, marketing: false })}>
                Alle ablehnen
              </button>
              <button type="button" style={styles.lightButton} onClick={() => saveConsent({ analytics, marketing })}>
                Auswahl speichern
              </button>
              <button type="button" style={styles.goldButton} onClick={() => saveConsent({ analytics: true, marketing: true })}>
                Alle akzeptieren
              </button>
            </div>

            <p style={styles.legalHint}>
              Weitere Informationen finden Sie in der <a href="/datenschutz" style={styles.modalLink}>Datenschutzerklärung</a>.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function CookieOption({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label style={{ ...styles.optionRow, opacity: disabled ? 0.78 : 1 }}>
      <span style={styles.optionTextWrap}>
        <strong style={styles.optionTitle}>{title}</strong>
        <span style={styles.optionDescription}>{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        style={styles.checkbox}
      />
    </label>
  );
}

const styles: Record<string, CSSProperties> = {
  banner: {
    position: "fixed",
    left: "50%",
    bottom: 12,
    transform: "translateX(-50%)",
    width: "min(92vw, 680px)",
    background: "#26313f",
    color: "#ffffff",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 14,
    boxShadow: "0 12px 34px rgba(15, 23, 42, 0.24)",
    padding: "10px 12px",
    zIndex: 9999,
    display: "flex",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  bannerText: {
    flex: "1 1 300px",
    fontSize: 12,
    lineHeight: 1.35,
  },
  bannerLink: {
    color: "#f4dfb4",
    textDecoration: "underline",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  bannerActions: {
    display: "flex",
    gap: 6,
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },
  primaryButton: {
    border: 0,
    borderRadius: 9,
    padding: "7px 10px",
    background: "#d9c7a3",
    color: "#10233a",
    fontWeight: 850,
    cursor: "pointer",
    fontSize: 12,
  },
  secondaryButton: {
    border: "1px solid rgba(255,255,255,0.24)",
    borderRadius: 9,
    padding: "7px 10px",
    background: "rgba(255,255,255,0.08)",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
    fontSize: 12,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.45)",
    zIndex: 10000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modal: {
    width: "min(94vw, 560px)",
    background: "#fffaf2",
    color: "#10233a",
    borderRadius: 22,
    border: "1px solid #eadfcc",
    boxShadow: "0 26px 80px rgba(15, 23, 42, 0.28)",
    padding: 18,
  },
  modalHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  eyebrow: {
    margin: 0,
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "#8a642f",
  },
  modalTitle: {
    margin: "3px 0 0",
    fontSize: 22,
    lineHeight: 1.15,
    fontWeight: 900,
  },
  closeButton: {
    border: 0,
    background: "transparent",
    color: "#10233a",
    cursor: "pointer",
    fontSize: 30,
    lineHeight: 1,
    padding: 0,
  },
  modalText: {
    margin: "12px 0 14px",
    color: "#526173",
    fontSize: 13,
    lineHeight: 1.5,
  },
  optionRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    border: "1px solid #eadfcc",
    background: "#ffffff",
    borderRadius: 14,
    padding: "11px 12px",
    marginBottom: 8,
    cursor: "pointer",
  },
  optionTextWrap: {
    display: "block",
  },
  optionTitle: {
    display: "block",
    fontSize: 13,
    color: "#10233a",
  },
  optionDescription: {
    display: "block",
    marginTop: 3,
    color: "#637186",
    fontSize: 12,
    lineHeight: 1.35,
  },
  checkbox: {
    width: 18,
    height: 18,
    accentColor: "#1f4e79",
    flexShrink: 0,
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  lightButton: {
    border: "1px solid #d8cbb7",
    background: "#ffffff",
    color: "#10233a",
    borderRadius: 10,
    padding: "8px 11px",
    fontSize: 12,
    fontWeight: 850,
    cursor: "pointer",
  },
  goldButton: {
    border: 0,
    background: "#d9c7a3",
    color: "#10233a",
    borderRadius: 10,
    padding: "8px 11px",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
  },
  legalHint: {
    margin: "12px 0 0",
    color: "#637186",
    fontSize: 12,
    lineHeight: 1.4,
  },
  modalLink: {
    color: "#1f4e79",
    fontWeight: 900,
    textDecoration: "underline",
  },
};
