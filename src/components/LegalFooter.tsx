import { openCookieSettings } from "../lib/cookieConsent";

export default function LegalFooter() {
  return (
    <footer style={styles.footer}>
      <a href="/impressum" style={styles.link}>Impressum</a>
      <a href="/datenschutz" style={styles.link}>Datenschutz</a>
      <button type="button" onClick={openCookieSettings} style={styles.button}>
        Cookie-Einstellungen
      </button>
    </footer>
  );
}

const styles: Record<string, React.CSSProperties> = {
  footer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 18,
    padding: "22px 16px",
    fontSize: 13,
    color: "#48566a",
  },
  link: {
    color: "#48566a",
    textDecoration: "none",
    fontWeight: 650,
  },
  button: {
    border: 0,
    background: "transparent",
    color: "#48566a",
    fontWeight: 650,
    cursor: "pointer",
    padding: 0,
    fontSize: 13,
  },
};
