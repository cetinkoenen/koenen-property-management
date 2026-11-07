import type { BookingTemplate } from "../lib/bookingAssistant";

type Props = {
  templates: BookingTemplate[];
  favorites: string[];
  recent: string[];
  onApplyTemplate: (template: BookingTemplate) => void;
  onDeleteTemplate: (id: string) => void;
  onSelectCategory: (category: string) => void;
};

/** Bedienhilfe für wiederkehrende Buchungen. Fachliche Buchungsdaten bleiben in finance_entry. */
export default function BookingAssistantPanel({ templates, favorites, recent, onApplyTemplate, onDeleteTemplate, onSelectCategory }: Props) {
  return <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 18, boxShadow: "0 1px 2px rgba(16,24,40,0.04)", padding: 14, display: "grid", gap: 10 }}>
    <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase", color: "#315f72" }}>Buchungsassistent</div>
    {templates.length ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{templates.map(template => <span key={template.id} style={{ display: "inline-flex", overflow: "hidden", border: "1px solid #bfdbfe", borderRadius: 10, background: "#eff6ff" }}><button type="button" onClick={() => onApplyTemplate(template)} style={{ border: 0, background: "transparent", padding: "7px 9px", color: "#1e3a8a", fontWeight: 900, cursor: "pointer" }}>{template.name}</button><button type="button" onClick={() => onDeleteTemplate(template.id)} aria-label={`Vorlage ${template.name} löschen`} title="Vorlage löschen" style={{ border: 0, borderLeft: "1px solid #bfdbfe", background: "transparent", padding: "7px 9px", color: "#9f1239", fontWeight: 900, cursor: "pointer" }}>×</button></span>)}</div> : <div style={{ fontSize: 12, color: "#64748b", fontWeight: 750 }}>Noch keine Vorlage gespeichert. Füllen Sie die Buchung aus und speichern Sie sie unten als Vorlage.</div>}
    {(favorites.length || recent.length) ? <div style={{ display: "grid", gap: 7 }}>{favorites.length ? <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}><span style={{ fontSize: 12, fontWeight: 900, color: "#64748b" }}>Favoriten:</span>{favorites.map(item => <button key={item} type="button" onClick={() => onSelectCategory(item)} style={{ border: "1px solid #fcd34d", borderRadius: 999, background: "#fffbeb", padding: "5px 9px", color: "#92400e", fontSize: 12, fontWeight: 900, cursor: "pointer" }}>★ {item}</button>)}</div> : null}{recent.length ? <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}><span style={{ fontSize: 12, fontWeight: 900, color: "#64748b" }}>Zuletzt:</span>{recent.map(item => <button key={item} type="button" onClick={() => onSelectCategory(item)} style={{ border: "1px solid #cbd5e1", borderRadius: 999, background: "#ffffff", padding: "5px 9px", color: "#475569", fontSize: 12, fontWeight: 850, cursor: "pointer" }}>{item}</button>)}</div> : null}</div> : null}
  </div>;
}
