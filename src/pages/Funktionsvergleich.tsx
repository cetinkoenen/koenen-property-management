import {
  BarChart3,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Mail,
  Plug,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { InfoList, KpiCard, ModuleCard, PageHeader, SectionPanel } from "@/components/ui/professional";

type FeatureStatus = "ready" | "partial" | "planned";

type FeatureRow = {
  nahaus: string;
  koenen: string;
  status: FeatureStatus;
  route?: string;
  note: string;
};

type FeatureGroup = {
  title: string;
  icon: typeof Building2;
  rows: FeatureRow[];
};

const statusLabel: Record<FeatureStatus, string> = {
  ready: "Vorhanden",
  partial: "Teilweise",
  planned: "Ausbau",
};

const statusClass: Record<FeatureStatus, string> = {
  ready: "border-emerald-200 bg-emerald-50 text-emerald-800",
  partial: "border-amber-200 bg-amber-50 text-amber-800",
  planned: "border-slate-200 bg-slate-50 text-slate-700",
};

const featureGroups: FeatureGroup[] = [
  {
    title: "Mietverwaltung",
    icon: Users,
    rows: [
      {
        nahaus: "Immobilienverwaltung",
        koenen: "Portfolio / Immobilien",
        status: "ready",
        route: "/immobilien",
        note: "Objekte, Einheiten, Objektakte und Vermietungszeiten sind vorhanden.",
      },
      {
        nahaus: "Mietverwaltung",
        koenen: "Mieter, Mieteingang, Leerstand",
        status: "ready",
        route: "/mieter",
        note: "Stammdaten, Mietzahlungen, Leerstand und Ein-/Auszug sind integriert.",
      },
      {
        nahaus: "Mietbewerberverwaltung",
        koenen: "Bewerber-Pipeline",
        status: "planned",
        note: "Sinnvoller naechster Ausbau: Interessentenliste mit Status, Dokumenten und Entscheidung.",
      },
      {
        nahaus: "Zaehlerverwaltung",
        koenen: "Zaehler / Staende",
        status: "planned",
        note: "Noch kein eigener Bereich. Passt fachlich zu Ein-/Auszug und Nebenkosten.",
      },
      {
        nahaus: "Mietpreis-Anpassung / Indexmiete",
        koenen: "Vermietungszeitraeume",
        status: "partial",
        route: "/immobilien",
        note: "Sollmieten werden verwaltet; automatische Anpassungs-Workflows waeren ein Ausbau.",
      },
    ],
  },
  {
    title: "Buchhaltung",
    icon: WalletCards,
    rows: [
      {
        nahaus: "Online Banking & Transaktionen",
        koenen: "Buchhaltung / Transaktionen",
        status: "partial",
        route: "/buchhaltung",
        note: "Transaktionen sind vorhanden. Direkte Bankanbindung waere ein separater Integrationsausbau.",
      },
      {
        nahaus: "Transaktionsregeln",
        koenen: "Regeln",
        status: "ready",
        route: "/buchhaltung/regeln",
        note: "Regelmodul ist vorhanden und mit Buchhaltung/Auswertung verbunden.",
      },
      {
        nahaus: "Mahnwesen",
        koenen: "Mahnwesen",
        status: "ready",
        route: "/mieter/mahnwesen",
        note: "Offene Posten und Mahnprozess sind als Fachseite vorhanden.",
      },
      {
        nahaus: "Nebenkostenabrechnung",
        koenen: "NK-Wohnungen / NK-Tiefgaragen",
        status: "ready",
        route: "/nebenkosten",
        note: "Bestehende NK-Seiten bleiben die Quelle.",
      },
      {
        nahaus: "Darlehensverwaltung",
        koenen: "Darlehen",
        status: "ready",
        route: "/darlehen",
        note: "Darlehen, Restschuld und Portfolio-Zuordnung sind vorhanden.",
      },
    ],
  },
  {
    title: "Produktivitaet & Kommunikation",
    icon: CalendarCheck,
    rows: [
      {
        nahaus: "Ticketing",
        koenen: "Ticketing-Hub",
        status: "partial",
        route: "/ticketing",
        note: "Logischer Hub existiert; echte Ticket-Erfassung waere ein neuer Workflow.",
      },
      {
        nahaus: "Kalender / Erinnerungen",
        koenen: "Produktivitaet",
        status: "planned",
        route: "/produktivitaet",
        note: "Naechster sinnvoller Ausbau: Fristen, Zinsbindung, Mietanpassung, Uebergaben.",
      },
      {
        nahaus: "Anschreiben / Vorlagen",
        koenen: "Kommunikation",
        status: "planned",
        route: "/mieter/kommunikation",
        note: "Vorlagen fuer Mieteranschreiben, Mahnungen und Bescheinigungen fehlen als eigener Katalog.",
      },
      {
        nahaus: "E-Mailversand",
        koenen: "Benachrichtigungen",
        status: "partial",
        route: "/mieter/kommunikation",
        note: "Login-/Admin-Benachrichtigung ist vorgesehen; Serienkommunikation waere Ausbau.",
      },
      {
        nahaus: "2FA / Benutzerverwaltung",
        koenen: "MFA / Read-only / Admin",
        status: "ready",
        route: "/benutzer",
        note: "Admin und zwei Lesezugriffe sind modelliert; MFA ist im Login-Prozess eingebunden.",
      },
    ],
  },
  {
    title: "Management & Auswertung",
    icon: BarChart3,
    rows: [
      {
        nahaus: "Vermoegensverwaltung",
        koenen: "Vermoegen",
        status: "ready",
        route: "/vermoegen",
        note: "Aggregiert Immobilien, Buchhaltung und Darlehen.",
      },
      {
        nahaus: "Mietaufstellung",
        koenen: "Mieteingang / Berichte",
        status: "ready",
        route: "/mieter/mieteingang",
        note: "Soll/Ist-Pruefung aus Vermietungszeitraeumen und Buchhaltung ist vorhanden.",
      },
      {
        nahaus: "EÜR / Steuer",
        koenen: "Steuercenter",
        status: "ready",
        route: "/steuer",
        note: "Steuerliche Auswertungen sind als Fachbereich vorhanden.",
      },
      {
        nahaus: "Google Drive / Dokumente",
        koenen: "Dokumentenmanagement",
        status: "partial",
        route: "/dokumente",
        note: "Dokumenten-Hub existiert; externe Drive-Integration waere eine separate Integration.",
      },
    ],
  },
];

const allRows = featureGroups.flatMap((group) => group.rows);
const readyCount = allRows.filter((row) => row.status === "ready").length;
const partialCount = allRows.filter((row) => row.status === "partial").length;
const plannedCount = allRows.filter((row) => row.status === "planned").length;

const nextSteps = [
  {
    to: "/produktivitaet",
    label: "Fristen & Erinnerungen",
    description: "Kalenderlogik fuer Uebergaben, Zinsbindung, Mietanpassungen, Abrechnungen und Dokumentpflichten.",
    icon: CalendarCheck,
  },
  {
    to: "/mieter/kommunikation",
    label: "Vorlagen & Anschreiben",
    description: "Vorlagenkatalog fuer Mieteranschreiben, Mahnungen, Wohnungsgeberbescheinigung und Uebergabe.",
    icon: Mail,
  },
  {
    to: "/mieter",
    label: "Bewerber-Pipeline",
    description: "Interessenten, Selbstauskunft, Status, Zuordnung zur Einheit und Entscheidung dokumentieren.",
    icon: Users,
  },
  {
    to: "/mieter/ein-auszug",
    label: "Zaehlerverwaltung",
    description: "Zaehlernummern, Zaehlerstaende, Fotos und Uebergabeprotokoll fachlich verbinden.",
    icon: Gauge,
  },
  {
    to: "/buchhaltung",
    label: "Bankintegration",
    description: "Bankabruf oder Importprozess als naechste Stufe fuer Transaktionen und Zuordnung.",
    icon: Plug,
  },
];

export default function Funktionsvergleich() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Nahaus-Vorlage"
        title="Funktionsvergleich"
        description="Vergleich der Nahaus-Funktionsstruktur mit der Koenen Property Management. Diese Seite ist eine Roadmap- und Qualitätsübersicht; vorhandene Fachmodule bleiben die Datenquelle."
        meta={[
          { label: "Abdeckung", value: `${readyCount}/${allRows.length}` },
          { label: "Teilweise", value: partialCount },
          { label: "Ausbau", value: plannedCount },
        ]}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Vorhanden" value={readyCount} detail="Fachlich bereits nutzbar" icon={CheckCircle2} tone="green" />
        <KpiCard label="Teilweise" value={partialCount} detail="Hub oder Basis vorhanden" icon={ShieldCheck} tone="amber" />
        <KpiCard label="Ausbau" value={plannedCount} detail="Sinnvolle nächste Module" icon={ClipboardList} tone="blue" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {featureGroups.map((group) => {
          const Icon = group.icon;
          return (
            <SectionPanel key={group.title} eyebrow="Funktionsblock" title={group.title}>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-900">
                <Icon size={21} />
              </div>
              <div className="grid gap-3">
                {group.rows.map((row) => (
                  <div key={`${group.title}-${row.nahaus}`} className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Nahaus: {row.nahaus}</p>
                        <h3 className="mt-1 text-lg font-black text-slate-950">{row.koenen}</h3>
                      </div>
                      <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-black ${statusClass[row.status]}`}>
                        {statusLabel[row.status]}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{row.note}</p>
                    {row.route ? (
                      <NavLink to={row.route} className="mt-3 inline-flex text-sm font-black text-slate-950 no-underline">
                        Modul öffnen
                      </NavLink>
                    ) : null}
                  </div>
                ))}
              </div>
            </SectionPanel>
          );
        })}
      </section>

      <SectionPanel
        eyebrow="Priorisierte Umsetzung"
        title="Was ich als naechstes sinnvoll umsetzen wuerde"
        description="Diese Punkte orientieren sich an Nahaus, passen aber zu deiner bestehenden App ohne Rewrite."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {nextSteps.map((step) => (
            <ModuleCard key={step.label} {...step} badge="Naechster Schritt" />
          ))}
        </div>
      </SectionPanel>

      <SectionPanel
        eyebrow="Bewertung"
        title="Kurzfazit"
        description="Die Koenen Property Management deckt Kernbereiche wie Portfolio, Mieteingang, Buchhaltung, Nebenkosten, Darlehen, Steuer, Auswertung, Read-only und MFA bereits ab. Der groesste Hebel liegt jetzt bei Prozessmodulen: Fristen, Kommunikation, Bewerber, Zaehler und Bankintegration."
      >
        <InfoList
          items={[
            { label: "Staerke", value: "Finanz-/Mieteingangslogik und Portfolio-Daten", tone: "green" },
            { label: "Nahaus-Luecke", value: "Kommunikation, Vorlagen, Bewerber, Kalender", tone: "amber" },
            { label: "Empfehlung", value: "Zuerst Fristen & Vorlagen, dann Bewerber und Zaehler", tone: "blue" },
            { label: "Sicherheit", value: "Kein Datenmodellwechsel fuer diese Roadmap-Seite", tone: "violet" },
          ]}
        />
      </SectionPanel>
    </div>
  );
}
