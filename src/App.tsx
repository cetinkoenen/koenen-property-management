import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type FormEvent, type ReactNode, type SyntheticEvent } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  Car,
  ChevronDown,
  ClipboardList,
  DoorOpen,
  Euro,
  FileText,
  FolderKanban,
  FolderOpen,
  KeyRound,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Menu,
  PackageCheck,
  PlusCircle,
  ReceiptText,
  Settings2,
  ShieldCheck,
  TrendingUp,
  UserCog,
  Users,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";

import Login from "./pages/Login";
import MFA from "./pages/MFA";
import AuthCallback from "./pages/AuthCallback";
import RequireAuthMFA from "./components/RequireAuthMFA";
import BackupButton from "./components/BackupButton";
import { useAuth } from "./auth/AuthProvider";
import { isAdminEmail, isReadonlyApprovalEmail } from "./auth/accessControl";
import { supabase } from "./lib/supabaseClient";
import { clearAppSessionStorage } from "./lib/security";
import { createRentAccountPdf } from "./lib/rentAccountPdf";
import { isVacancyInRange, listVacancies, type UnitVacancy } from "./services/vacancyService";
import { listMileageTrips, type MileageTripRow } from "./services/mileageTripService";
import {
  buildAnlageVBookingExportRows,
  buildAnlageVReportLines,
  buildSection35aReportLines,
  buildTaxAdvisorDashboard,
  formatTaxCurrency,
  getTaxObjectProfileForLabel,
  type AnlageVBookingExportRow,
  type TaxReportLoanRow,
} from "./services/taxReportEngine";
import {
  deletePropertyTask,
  listPropertyTasks,
  savePropertyTask,
  type PropertyTaskCategory,
  type PropertyTaskPriority,
  type PropertyTaskRow,
  type PropertyTaskStatus,
} from "./services/workflowTaskService";
import logo from "./assets/koenen-brand-logo.webp";
import { createPdfLogoObject, drawPdfLogo } from "./lib/pdfLogo";
import { AppDataProvider, useAppData, type FinanceEntry } from "./state/AppDataContext";
import { EmptyState, InfoList, KpiCard, ModuleCard, PageHeader, SectionPanel } from "./components/ui/professional";
import { isPortfolioGeneralEntry, PORTFOLIO_GENERAL_LABEL } from "./lib/portfolioExpense";
import { canonicalCategoryForTax } from "./lib/taxClassification";
import type { RentAnnualReportSnapshot } from "./pages/Mietuebersicht";
import "./App.css";

type AppErrorBoundaryProps = {
  children: ReactNode;
  resetKey?: string;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Die Seite konnte nicht geladen werden.",
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("App route crashed:", error, info.componentStack);
  }

  componentDidUpdate(prevProps: AppErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: "" });
    }
  }

  handleReload = () => {
    clearAppSessionStorage();
    window.location.assign("/");
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="mx-auto max-w-[1760px] px-3 py-6 sm:px-5 lg:px-8">
        <section className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-red-900 shadow-sm">
          <p className="text-sm font-black uppercase tracking-[0.14em] text-red-700">
            Seite konnte nicht geladen werden
          </p>
          <h1 className="mt-3 text-2xl font-black text-slate-950">
            Bitte Seite neu starten
          </h1>
          <p className="mt-3 max-w-3xl text-sm font-semibold text-red-800">
            {this.state.message}
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-5 rounded-2xl border border-red-200 bg-white px-5 py-3 text-sm font-black text-red-900 shadow-sm"
          >
            Session zurücksetzen und neu laden
          </button>
        </section>
      </div>
    );
  }
}

const EntryAdd = lazy(() => import("./pages/EntryAdd"));
const Cockpit = lazy(() => import("./pages/Cockpit"));
const Monate = lazy(() => import("./pages/Monate"));
const Auswertung = lazy(() => import("./pages/Auswertung"));
const SteuerCenter = lazy(() => import("./pages/SteuerCenter"));
const Fahrtenbuch = lazy(() => import("./pages/Fahrtenbuch"));
const Funktionsvergleich = lazy(() => import("./pages/Funktionsvergleich"));
const InvestmentBericht = lazy(() => import("./pages/InvestmentBericht"));
const ImmobilienVermoegen = lazy(() => import("./pages/ImmobilienVermoegen"));
const NebenkostenTiefgarage = lazy(() => import("./pages/NebenkostenTiefgarage"));
const NebenkostenWohnungen = lazy(() => import("./pages/NebenkostenWohnungen"));
const Administrator = lazy(() => import("./pages/Administrator"));
const Datenschutz = lazy(() => import("./pages/Datenschutz"));
const Mietuebersicht = lazy(() => import("./pages/Mietuebersicht"));
const Mietentwicklung = lazy(() => import("./pages/Mietentwicklung"));
const MieterAnlegen = lazy(() => import("./pages/MieterAnlegen"));
const MieterRegister = lazy(() => import("./pages/MieterRegister"));
const Leerstand = lazy(() => import("./pages/Leerstand"));
const Mahnwesen = lazy(() => import("./pages/Mahnwesen"));
const Kautionen = lazy(() => import("./pages/Kautionen"));
const EinAuszug = lazy(() => import("./pages/EinAuszug"));
const Transaktionsregeln = lazy(() => import("./pages/Transaktionsregeln"));
const Darlehensuebersicht = lazy(() => import("./pages/Darlehensuebersicht"));
const Datenpruefung = lazy(() => import("./pages/Datenpruefung"));

function RouteFallback() {
  return (
    <div className="mx-auto max-w-[1760px] px-3 py-6 sm:px-5 lg:px-8">
      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-3 w-36 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-4 h-8 w-full max-w-xl animate-pulse rounded-2xl bg-slate-100" />
        <div className="mt-3 h-4 w-full max-w-3xl animate-pulse rounded-full bg-slate-100" />
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-20 animate-pulse rounded-2xl border border-slate-100 bg-slate-50" />
          ))}
        </div>
        <div className="sr-only" aria-live="polite">
          Seite wird geladen
        </div>
      </div>
    </div>
  );
}

const routePreloaders: Record<string, () => Promise<unknown>> = {
  "/dashboard/finanz-kennzahlen": () => import("./pages/Cockpit"),
  "/dashboard/warnmeldungen": () => import("./pages/Datenpruefung"),
  "/dashboard/aktuelle-todos": async () => undefined,
  "/immobilienvermoegen": () => import("./pages/ImmobilienVermoegen"),
  "/immobilien/immobilie-anlegen": () => import("./pages/Administrator"),
  "/mieter/mietentwicklung": () => import("./pages/Mietentwicklung"),
  "/immobilien/einheiten-verwaltung": async () => undefined,
  "/immobilien/zaehlerstaende-verbrauch": () => import("./pages/NebenkostenWohnungen"),
  "/immobilien/objekt-dokumente": async () => undefined,
  "/investment-bericht": () => import("./pages/InvestmentBericht"),
  "/mieter/stammdaten": () => import("./pages/MieterAnlegen"),
  "/mieter/register": () => import("./pages/MieterRegister"),
  "/mieter/mieteingang": () => import("./pages/Mietuebersicht"),
  "/ein-auszug": () => import("./pages/EinAuszug"),
  "/buchhaltung/einnahmen-ausgaben": () => import("./pages/EntryAdd"),
  "/buchhaltung/buchungen": async () => undefined,
  "/buchhaltung/steuer-center-berater": () => import("./pages/SteuerCenter"),
  "/buchhaltung/fahrtenbuch": () => import("./pages/Fahrtenbuch"),
  "/buchhaltung/berichte-exporte": async () => undefined,
  "/darlehen": () => import("./pages/Darlehensuebersicht"),
  "/nebenkosten": () => import("./pages/NebenkostenWohnungen"),
  "/nebenkosten/wohnungen": () => import("./pages/NebenkostenWohnungen"),
  "/nebenkosten/tiefgarage": () => import("./pages/NebenkostenTiefgarage"),
  "/mahnwesen": () => import("./pages/Mahnwesen"),
  "/ticketsystem/schadenmeldungen": async () => undefined,
  "/dokumente": async () => undefined,
  "/einstellungen/benutzer-rechteverwaltung": () => import("./pages/Administrator"),
  "/einstellungen/datenschutz-sicherheit": () => import("./pages/Datenschutz"),
};

const preloadedRoutes = new Set<string>();

function preloadRoute(to: string) {
  const preload = routePreloaders[to];
  if (!preload || preloadedRoutes.has(to)) return;
  preloadedRoutes.add(to);
  void preload().catch(() => {
    preloadedRoutes.delete(to);
  });
}

function sidebarNavLinkClass(isActive: boolean): string {
  return [
    "group flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-black no-underline transition",
    isActive
      ? "bg-white/13 text-white shadow-[inset_3px_0_0_#7ed0bd,0_12px_28px_rgba(0,0,0,0.18)]"
      : "text-slate-300 hover:bg-white/8 hover:text-white",
  ].join(" ");
}

type ShellNavItem = {
  to: string;
  label: string;
  group: string;
  icon: LucideIcon;
  end?: boolean;
};

type ModuleLink = {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
  adminOnly?: boolean;
};

type ModuleHubConfig = {
  eyebrow: string;
  title: string;
  description: string;
  links: ModuleLink[];
};

type WorkspaceSubpage = {
  path: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

type WorkspaceTab = {
  label: string;
  description: string;
};

type WorkspaceConfig = {
  eyebrow: string;
  title: string;
  description: string;
  basePath: string;
  source: string;
  subpages: WorkspaceSubpage[];
  tabs: WorkspaceTab[];
};

const groupAccent: Record<string, string> = {
  Dashboard: "text-[#9ed7e2]",
  Immobilien: "text-[#9bd8c4]",
  Immobilienvermögen: "text-[#aeb8ff]",
  Investment: "text-[#aeb8ff]",
  Mieter: "text-[#9bd8c4]",
  Buchhaltung: "text-[#d8c5ef]",
  Darlehen: "text-[#aeb8ff]",
  Nebenkosten: "text-[#e9cfa4]",
  Aufgaben: "text-[#9ed7e2]",
  Dokumente: "text-[#bdd7e3]",
  Einstellungen: "text-slate-300",
  Überblick: "text-[#9ed7e2]",
  Finanzen: "text-[#d8c5ef]",
  Verwaltung: "text-[#e9cfa4]",
};

const auswertungSubNav = [
  { view: "cockpit", label: "Objektakte & Workflows" },
  { view: "finanzen", label: "Finanzanalyse" },
  { view: "objektjahr", label: "Objekt-Jahresübersicht" },
  { view: "business", label: "Business Intelligence 4C" },
  { view: "backend5b", label: "Backend 5B" },
  { view: "single-source", label: "Single Source 3A" },
  { view: "stability", label: "Stabilität 3B" },
  { view: "automation", label: "Automatisierung 2B" },
  { view: "reporting4d", label: "Reporting/PDF 4D" },
  { view: "reporting", label: "Archiv 2C" },
];


function RedirectObjectRoute({ section = "objektakte" }: { section?: string }) {
  void section;
  return <Navigate to="/immobilienvermoegen" replace />;
}

function RedirectLoanRoute() {
  const { propertyId } = useParams<{ propertyId: string }>();
  return <Navigate to={propertyId ? `/darlehen/${encodeURIComponent(propertyId)}` : "/darlehen"} replace />;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("de-DE");
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addMonthsToDate(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function isCurrentMonthEntry(entry: FinanceEntry, today = new Date()): boolean {
  if (!entry.booking_date) return false;
  const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  return entry.booking_date.startsWith(monthKey);
}

function isRentLikeEntry(entry: FinanceEntry): boolean {
  if (entry.entry_type !== "income") return false;
  const text = `${entry.category ?? ""} ${entry.note ?? ""}`.toLowerCase();
  return text.includes("miet") || text.includes("pacht");
}

const buchhaltungSubpages: WorkspaceSubpage[] = [
  { path: "/buchhaltung/buchungen", label: "Buchungen", icon: WalletCards },
  { path: "/buchhaltung/einnahmen-ausgaben", label: "Einnahmen & Ausgaben", icon: PlusCircle },
  { path: "/mieter/mieteingang", label: "Mieteingang", icon: CalendarCheck },
  { path: "/buchhaltung/steuer-center-berater", label: "Steuer-Center", icon: Euro },
  { path: "/buchhaltung/fahrtenbuch", label: "Fahrtenbuch", icon: Car },
  { path: "/buchhaltung/berichte-exporte", label: "Berichte & Exporte", icon: BarChart3 },
];

const immobilienSubpages: WorkspaceSubpage[] = [
  { path: "/immobilienvermoegen", label: "Immobilienvermögen", icon: Landmark },
  { path: "/immobilien/immobilie-anlegen", label: "Immobilie anlegen", icon: PlusCircle, adminOnly: true },
  { path: "/immobilien/einheiten-verwaltung", label: "Einheiten-Verwaltung", icon: FolderKanban },
  { path: "/immobilien/zaehlerstaende-verbrauch", label: "Zählerstände & Verbrauch", icon: ClipboardList },
  { path: "/immobilien/objekt-dokumente", label: "Objekt-Dokumente", icon: FileText },
];

const mieterSubpages: WorkspaceSubpage[] = [
  { path: "/mieter/register", label: "Mieterregister", icon: Users },
  { path: "/mieter/stammdaten", label: "Stammdaten", icon: Users },
  { path: "/mieter/mietentwicklung", label: "Mietentwicklung", icon: TrendingUp },
  { path: "/mieter/mieteingang", label: "Mieteingang", icon: CalendarCheck },
  { path: "/ein-auszug", label: "Ein-/Auszug", icon: KeyRound },
  { path: "/leerstand", label: "Leerstand", icon: DoorOpen },
];

const workspaceConfigs: Record<string, WorkspaceConfig> = {
  dashboardFinanz: {
    eyebrow: "1. Modul | Dashboard",
    title: "Finanz-Kennzahlen",
    description: "Zentrale Übersicht aus Portfolio, Buchhaltung, Leerstand, Darlehen und Steuer. Diese Seite aggregiert nur bestehende Datenquellen.",
    basePath: "/dashboard",
    source: "Cockpit, Buchhaltung, Mieteingang, Leerstand, Darlehen",
    subpages: [
      { path: "/dashboard/finanz-kennzahlen", label: "Finanz-Kennzahlen", icon: BarChart3 },
      { path: "/dashboard/warnmeldungen", label: "Warnmeldungen", icon: Bell },
      { path: "/dashboard/aktuelle-todos", label: "Aktuelle To-dos", icon: ListChecks },
    ],
    tabs: [
      { label: "Soll/Ist-Vergleich", description: "Ist-Mieten aus Buchungen, Soll-Mieten aus Vermietungszeiträumen und Mietrückstände als Differenz." },
      { label: "Gesamteinnahmen & Cashflow", description: "Bruttomieteinnahmen, Nebenkostenvorauszahlungen und bereinigter Cashflow aus vorhandenen Buchungen." },
      { label: "Offene Posten & Forderungsmanagement", description: "Überfällige Mieten, unbezahlte Rechnungen und vorhandene Mahnstatus bündeln." },
      { label: "Leerstandskosten & Effizienz", description: "Leerstandsquote und Mietausfall über bestehende Leerstands- und Mietdaten sichtbar machen." },
      { label: "Filter & Export", description: "Objekt-, Zeitraum- und Exportkontext für steuerberaterfähige Auswertungen." },
    ],
  },
  dashboardWarnungen: {
    eyebrow: "1. Modul | Dashboard",
    title: "Warnmeldungen",
    description: "Operative Frühwarnzentrale aus bestehenden Prüf-, Buchhaltungs-, Leerstands- und Fristendaten.",
    basePath: "/dashboard",
    source: "Datenprüfung, Mieteingang, Leerstand, Mahnwesen",
    subpages: [
      { path: "/dashboard/finanz-kennzahlen", label: "Finanz-Kennzahlen", icon: BarChart3 },
      { path: "/dashboard/warnmeldungen", label: "Warnmeldungen", icon: Bell },
      { path: "/dashboard/aktuelle-todos", label: "Aktuelle To-dos", icon: ListChecks },
    ],
    tabs: [
      { label: "Zahlungsverzug & Mietrückstände", description: "Kurzzeitiger Verzug, gravierender Rückstand, Teilzahlungen und Mahn-Quick-Actions." },
      { label: "Leerstand & Vermietungsrisiko", description: "Akuter Leerstand, bevorstehender Leerstand und kritische Leerstandsdauer." },
      { label: "Konto- & Buchungsalarme", description: "Nicht zugeordnete Transaktionen und auffällige Buchungszustände." },
      { label: "Fristen & Instandhaltung", description: "Überfällige Tickets, Prüffristen, Wartung und Vertragsfristen." },
      { label: "Dringlichkeits-Filter", description: "Hohe, mittlere und informative Warnungen getrennt betrachten." },
    ],
  },
  dashboardTodos: {
    eyebrow: "1. Modul | Dashboard",
    title: "Aufgaben & Instandhaltung",
    description: "Hier behalten Sie alle Aufgaben rund um Ihre Immobilien im Blick: Reparaturen, Fristen, Mieteranliegen, Handwerkertermine und interne Notizen.",
    basePath: "/dashboard",
    source: "Ein-/Auszug, Nebenkosten, Mahnwesen, Ticketing",
    subpages: [
      { path: "/dashboard/finanz-kennzahlen", label: "Finanz-Kennzahlen", icon: BarChart3 },
      { path: "/dashboard/warnmeldungen", label: "Warnmeldungen", icon: Bell },
      { path: "/dashboard/aktuelle-todos", label: "Aktuelle To-dos", icon: ListChecks },
    ],
    tabs: [
      { label: "Mieterwechsel & Übergaben", description: "Auszugs-To-dos, Übergabeprotokolle, Einzugs-To-dos und Kautionsmanagement." },
      { label: "Rechtliche & gesetzliche Fristen", description: "Nebenkostenabrechnung, Sicherheit, Wartung und WEG-Fristen überwachen." },
      { label: "Vertrags- & Mietanpassungen", description: "Indexmieten, Mietanpassungen und befristete Verträge im Blick behalten." },
      { label: "Handwerker & Schadensabwicklung", description: "Angebotsfreigaben, Reparaturstatus und Rechnungsprüfung bündeln." },
      { label: "Organisation & Filter", description: "Zuständigkeit, Fälligkeit und Status-Tracker für die tägliche Arbeit." },
    ],
  },
  immobilienObjekte: {
    eyebrow: "2. Modul | Immobilien & Einheiten",
    title: "Objektübersicht",
    description: "Bestehende Immobilienseite als zentrale Objekt- und Finanzübersicht im neuen Modulrahmen.",
    basePath: "/immobilien",
    source: "Portfolio, Objektakten, Buchhaltung, Darlehen",
    subpages: immobilienSubpages,
    tabs: [
      { label: "Wohnimmobilien", description: "Gebäude-Stammdaten, Einheiten-Struktur, Grundstücksdaten und Gemeinschaftsflächen." },
      { label: "Gewerbeimmobilien", description: "Nutzflächen, Umsatzsteueroptionen sowie Stellplatz- und Logistik-Zuordnung." },
    ],
  },
  mieterMietentwicklung: {
    eyebrow: "Mieter | Mietentwicklung",
    title: "Mietentwicklung",
    description: "Zentrale Übersicht aller Sollmieten, Ist-Buchungen und Mieterhöhungen seit Januar 2024.",
    basePath: "/mieter",
    source: "Mietentwicklung/Mietanpassungen, Mieterregister, Buchungen, Mieteingang",
    subpages: mieterSubpages,
    tabs: [
      { label: "Sollmieten", description: "Aktuelle Sollmiete pro Immobilie aus den gepflegten Vermietungszeiträumen." },
      { label: "Buchungsprüfung", description: "Tatsächliche Mietzahlungen und Mietbestandteil-NK aus der Buchhaltung." },
      { label: "Erhöhungen", description: "Automatisch erkannte Mietsteigerungen aus Vermietungszeiträumen und Buchungen." },
      { label: "Datenqualität", description: "Objekte mit fehlender oder abweichender Soll-/Ist-Miete priorisiert prüfen." },
    ],
  },
  immobilienEinheiten: {
    eyebrow: "2. Modul | Immobilien & Einheiten",
    title: "Einheiten-Verwaltung",
    description: "Wohnungen, Garagen, Gewerbeeinheiten und Belegungshistorie auf Basis vorhandener Objekt- und Mietdaten.",
    basePath: "/immobilien",
    source: "Portfolio, Vermietungszeiträume, Leerstand",
    subpages: immobilienSubpages,
    tabs: [
      { label: "Wohnungen", description: "Einheiten-Details, Ausstattung, Zustand, Grundriss, Fotos und abrechnungsrelevante Faktoren." },
      { label: "Garagen & Stellplätze", description: "Typisierung, E-Mobilität, Schließmedien und Kopplung an Wohnungen oder Fremdvermietung." },
      { label: "Gewerbeeinheiten", description: "Nutzflächen, Nebenräume, technische Anschlüsse und umsatzsteuerliche Behandlung." },
      { label: "Status & Belegungshistorie", description: "Vermietet, reserviert, leerstehend sowie Mieter- und Mietpreishistorie." },
      { label: "Schnellauswahl & Massenbearbeitung", description: "Datenblatt, Exposé und Mietanpassungsprüfung im bestehenden Portfolio-Kontext." },
    ],
  },
  immobilienVerbrauch: {
    eyebrow: "2. Modul | Immobilien & Einheiten",
    title: "Zählerstände & Verbrauch",
    description: "Frontend-Zugang für Verbrauchs- und Zählerstandsprozesse inklusive Fotodokumentation im Objektkontext.",
    basePath: "/immobilien",
    source: "Objektakte, Nebenkosten, Dokumente",
    subpages: immobilienSubpages,
    tabs: [
      { label: "Zählerstände", description: "Erfassung je Objekt und Einheit über vorhandene Objektakten vorbereiten." },
      { label: "Fotodokumentation", description: "Smartphone-taugliche Dokumentation von Zählerständen als Objektanhang." },
      { label: "Verbrauch", description: "Verbrauchsdaten als Grundlage für Nebenkosten- und Plausibilitätsprüfungen." },
    ],
  },
  immobilienDokumente: {
    eyebrow: "2. Modul | Immobilien & Einheiten",
    title: "Objekt-Dokumente",
    description: "Digitale Objektakte für Energieausweise, Prüfberichte, Versicherungen und sonstige Objektunterlagen.",
    basePath: "/immobilien",
    source: "Dokumentenmanagement, Objektakte",
    subpages: immobilienSubpages,
    tabs: [
      { label: "Energieausweise", description: "Gültigkeit und Ablage über bestehende Objektakten prüfen." },
      { label: "Brandschutz & Prüfberichte", description: "Berichte objektbezogen strukturieren und auffindbar halten." },
      { label: "Versicherungen", description: "Policen, Laufzeiten und Nachweise im Objektkontext bündeln." },
    ],
  },
  immobilienAnlegen: {
    eyebrow: "2. Modul | Immobilien & Einheiten",
    title: "Immobilie anlegen",
    description: "Neue Wohnungen oder Garagen fachlich direkt im Immobilienbereich erfassen. Die Anlage schreibt weiterhin in die vorhandenen Portfolio- und Vermietungsquellen.",
    basePath: "/immobilien",
    source: "portfolio_properties, portfolio_property_rentals, property_extra_info",
    subpages: immobilienSubpages,
    tabs: [
      { label: "Objektart", description: "Wohnung oder Garage auswählen und die Einheit sauber benennen." },
      { label: "Adresse & Einheit", description: "Objektname, Adresse, Einheit und Nutzung im Portfolio-Kontext pflegen." },
      { label: "Vermietungsstart", description: "Startdatum und Sollmiete als Grundlage für Mieteingang und Leerstand speichern." },
      { label: "Finanzdaten", description: "Kaltmiete, Nebenkosten, Gesamtmiete und Marktwert als Stammdaten erfassen." },
    ],
  },
  kontakteVertraege: {
    eyebrow: "3. Modul | Kontakte & Mietverhältnisse",
    title: "Aktive Mietverträge",
    description: "Verträge, Mietzins-Struktur, Anpassungsplanung und Kautionen in einer Mieterstruktur.",
    basePath: "/kontakte",
    source: "Mieter anlegen, Vermietungszeiträume, Buchhaltung",
    subpages: [
      { path: "/kontakte/aktive-mietvertraege", label: "Aktive Mietverträge", icon: Users },
      { path: "/kontakte/mieter-eigentuemerakten", label: "Mieter-/Eigentümerakten", icon: FolderOpen },
      { path: "/kontakte/interessenten-selbstauskuenfte", label: "Interessenten", icon: UserCog },
      { path: "/kontakte/wohnungsgeberbescheinigungen-uebergabeprotokolle", label: "Übergaben & Protokolle", icon: KeyRound },
    ],
    tabs: [
      { label: "Vertragsdetails", description: "Laufzeiten, Kündigungsfristen und Verlängerungen." },
      { label: "Mietzins-Struktur", description: "Kaltmiete, Nebenkosten, Stellplatzmiete und Vertragsbestandteile." },
      { label: "Mietanpassungs-Planer", description: "Indexklauseln, Anpassungstermine und Mieterkommunikation." },
      { label: "Kautions-Status", description: "Beträge, Bürgschaften, Verpfändungen und Kautionsbuchungen." },
    ],
  },
  kontakteAkten: {
    eyebrow: "3. Modul | Kontakte & Mietverhältnisse",
    title: "Mieter- & Eigentümerakten",
    description: "Stammdaten, SEPA, Kommunikation und Dokumente aus bestehenden Mieterinformationen.",
    basePath: "/kontakte",
    source: "Mieterstammdaten, Dokumente, Mahnwesen",
    subpages: [
      { path: "/kontakte/aktive-mietvertraege", label: "Aktive Mietverträge", icon: Users },
      { path: "/kontakte/mieter-eigentuemerakten", label: "Mieter-/Eigentümerakten", icon: FolderOpen },
      { path: "/kontakte/interessenten-selbstauskuenfte", label: "Interessenten", icon: UserCog },
      { path: "/kontakte/wohnungsgeberbescheinigungen-uebergabeprotokolle", label: "Übergaben & Protokolle", icon: KeyRound },
    ],
    tabs: [
      { label: "Stammdaten", description: "Kontaktdaten, Mitmieter und Notfallkontakte." },
      { label: "SEPA-Mandate", description: "Lastschrift-Erteilungen und Bankverbindungen." },
      { label: "Kommunikations-Historie", description: "E-Mails, Briefe und Telefonnotizen." },
      { label: "Dokumenten-Archiv", description: "Ausweise, Nachweise und Schriftverkehr." },
    ],
  },
  kontakteInteressenten: {
    eyebrow: "3. Modul | Kontakte & Mietverhältnisse",
    title: "Interessenten & Selbstauskünfte",
    description: "Bewerber-Pool, Selbstauskunft, Besichtigungsplanung und KI-Matching als CRM-Arbeitsbereich.",
    basePath: "/kontakte",
    source: "Mieteranlage, Dokumente, Kommunikation",
    subpages: [
      { path: "/kontakte/aktive-mietvertraege", label: "Aktive Mietverträge", icon: Users },
      { path: "/kontakte/mieter-eigentuemerakten", label: "Mieter-/Eigentümerakten", icon: FolderOpen },
      { path: "/kontakte/interessenten-selbstauskuenfte", label: "Interessenten", icon: UserCog },
      { path: "/kontakte/wohnungsgeberbescheinigungen-uebergabeprotokolle", label: "Übergaben & Protokolle", icon: KeyRound },
    ],
    tabs: [
      { label: "Bewerber-Pool", description: "Eingegangene Anfragen und Interessentenlisten." },
      { label: "Digitale Selbstauskunft", description: "Bonitätsprüfung und vorhandene Nachweisdokumente." },
      { label: "Besichtigungs-Planer", description: "Terminkoordination und Einladungen." },
      { label: "KI-Matching", description: "Vorauswahl nach Objektkriterien, ohne zusätzliche Datenquelle." },
    ],
  },
  kontakteUebergaben: {
    eyebrow: "3. Modul | Kontakte & Mietverhältnisse",
    title: "Wohnungsgeberbescheinigungen & Übergabeprotokolle",
    description: "Einzug, Auszug, Formulare und Fotodokumentation aus bestehenden Mieterwechselprozessen.",
    basePath: "/kontakte",
    source: "Ein-/Auszug, Mieterakten, Objektakten",
    subpages: [
      { path: "/kontakte/aktive-mietvertraege", label: "Aktive Mietverträge", icon: Users },
      { path: "/kontakte/mieter-eigentuemerakten", label: "Mieter-/Eigentümerakten", icon: FolderOpen },
      { path: "/kontakte/interessenten-selbstauskuenfte", label: "Interessenten", icon: UserCog },
      { path: "/kontakte/wohnungsgeberbescheinigungen-uebergabeprotokolle", label: "Übergaben & Protokolle", icon: KeyRound },
    ],
    tabs: [
      { label: "Meldebehörden-Formulare", description: "Wohnungsgeberbestätigung und Formularprozesse." },
      { label: "Einzugsprotokolle", description: "Zustand, Schlüssel und Zählerstände beim Einzug." },
      { label: "Auszugsprotokolle", description: "Mängel, Renovierungspflichten und Rückgabe." },
      { label: "Fotodokumentation", description: "Visuelle Beweissicherung im Übergabeprozess." },
    ],
  },
  buchhaltungBuchungen: {
    eyebrow: "4. Modul | Buchhaltung & Finanzen",
    title: "Buchungen",
    description: "Operative Finanzzentrale mit Bankbewegungen, offenen Posten, manueller Erfassung, Belegen und Zahlungsverkehr.",
    basePath: "/buchhaltung",
    source: "Buchhaltung, Transaktionen, Buchungsmaske",
    subpages: buchhaltungSubpages,
    tabs: [
      { label: "Bankkonten & Transaktionen", description: "Live-Feeds und vorhandene Transaktionsübersicht." },
      { label: "Offene Posten", description: "Manuelle und KI-gestützte Zahlungszuordnung." },
      { label: "Einnahmen & Ausgaben", description: "Bestehende manuelle Buchungserfassung." },
      { label: "Belegarchiv & OCR", description: "Rechnungs-Upload und Belegkontext." },
      { label: "Daueraufträge & Lastschriften", description: "SEPA-Einzüge und wiederkehrende Zahlungen." },
    ],
  },
  buchhaltungEinnahmenAusgaben: {
    eyebrow: "4. Modul | Buchhaltung & Finanzen",
    title: "Einnahmen & Ausgaben",
    description: "Die bewährte Eingabeseite für neue Einnahmen und Ausgaben. Alle bestehenden Funktionen der Buchungserfassung bleiben erhalten.",
    basePath: "/buchhaltung",
    source: "Bestehende Buchungsmaske",
    subpages: buchhaltungSubpages,
    tabs: [
      { label: "Einnahme erfassen", description: "Miete, Nebenkosten, Kautionen und sonstige Einnahmen über die vorhandene Maske eintragen." },
      { label: "Ausgabe erfassen", description: "Reparaturen, Bewirtschaftungskosten, Darlehenskosten und sonstige Ausgaben erfassen." },
      { label: "Objekt & Kategorie", description: "Buchungen wie bisher einem Objekt und einer Kategorie zuordnen." },
      { label: "Beleg & Notiz", description: "Vorhandene Felder für Beschreibung, Nachweise und spätere Prüfung nutzen." },
    ],
  },
  buchhaltungSoll: {
    eyebrow: "4. Modul | Buchhaltung & Finanzen",
    title: "Mietanpassungen",
    description: "Die Mietanpassungen werden über die bestehende Seite Mietentwicklung geführt. Dort sehen Sie Sollmieten, Buchungen und erkannte Änderungen je Immobilie.",
    basePath: "/buchhaltung",
    source: "Vermietungszeiträume, Buchhaltung, Mieteingang",
    subpages: buchhaltungSubpages,
    tabs: [
      { label: "Mietzusammensetzung", description: "Nettokaltmiete, Nebenkosten und Warmmiete pro Objekt prüfen." },
      { label: "Vorher-Nachher", description: "Letzte Anpassung und Differenz je Kostenart nachvollziehen." },
      { label: "Historie", description: "Alle erkannten Mietanpassungen aus Vermietungszeiträumen und Buchungen bündeln." },
      { label: "Schreiben", description: "Vorbereitete Mieteranschreiben für geplante Anpassungen erstellen." },
    ],
  },
  buchhaltungNebenkosten: {
    eyebrow: "4. Modul | Buchhaltung & Finanzen",
    title: "Nebenkostenabrechnung",
    description: "Pflichtseite NK-Abrechnung bleibt vollständig erhalten und wird in die neue Buchhaltungsstruktur eingeordnet.",
    basePath: "/buchhaltung",
    source: "NK-Seiten, Buchhaltung, Umlageschlüssel",
    subpages: buchhaltungSubpages,
    tabs: [
      { label: "Umlageschlüssel & Verteiler", description: "Wohnfläche, Personen und bestehende Verteilungsschlüssel." },
      { label: "Heizkosten-Integration", description: "Messdienstleister-Importe und Verbrauchsdaten als bestehender Prozess." },
      { label: "Abrechnungserstellung", description: "PDF-Erstellung und Versandprozess über vorhandene NK-Seiten." },
    ],
  },
  buchhaltungMahnwesen: {
    eyebrow: "4. Modul | Buchhaltung & Finanzen",
    title: "Automatisiertes Mahnwesen",
    description: "Mahnfristen, Vorlagen und Eskalation auf Grundlage bestehender offener Posten.",
    basePath: "/buchhaltung",
    source: "Mahnwesen, Mieteingang, Buchhaltung",
    subpages: buchhaltungSubpages,
    tabs: [
      { label: "Mahnstufen & Fristen", description: "Workflow-Konfiguration für Erinnerung, Mahnung und Eskalation." },
      { label: "Vorlagen-Editor", description: "Texte für Zahlungserinnerung und Mahnungen." },
      { label: "Inkasso & Rechtsübergabe", description: "Übergabe harter Fälle an Dienstleister oder Rechtsanwälte." },
    ],
  },
  buchhaltungSteuer: {
    eyebrow: "4. Modul | Buchhaltung & Finanzen",
    title: "Steuer-Center & Berater-Schnittstelle",
    description: "Pflichtseite Steuer bleibt erhalten und wird als strukturierter Jahresabschlussbereich eingebunden.",
    basePath: "/buchhaltung",
    source: "Steuer-Center, Buchungen, Darlehenszinsen",
    subpages: buchhaltungSubpages,
    tabs: [
      { label: "Anlage V Vorbereitung", description: "Strukturierung für Einkünfte aus Vermietung und Verpachtung." },
      { label: "Einnahmen-Aufstellung", description: "Kaltmieten, Umlagen, Garagen und steuerpflichtige Zuflüsse." },
      { label: "Werbungskosten-Erfassung", description: "Erhaltungsaufwand, Verwaltungskosten und sonstige Abzüge." },
      { label: "Grundsteuer & Abgaben", description: "Nicht umlagefähige öffentliche Lasten und Abgaben." },
    ],
  },
  buchhaltungFahrtenbuch: {
    eyebrow: "4. Modul | Buchhaltung & Finanzen",
    title: "Fahrtenbuch & Fahrtkosten-Rechner",
    description: "Zentrale steuerliche Fahrtenliste für Bestandsimmobilien und neue Investment-Prüfungen.",
    basePath: "/buchhaltung",
    source: "Fahrtenbuch, Immobilienvermögen, Investment-Prüfung",
    subpages: buchhaltungSubpages,
    tabs: [
      { label: "Fahrten erfassen", description: "Besichtigung, Makler, Notar, Handwerker und Kontrollfahrten dokumentieren." },
      { label: "Steuerjahr prüfen", description: "Fahrtkosten je Jahr und Objekt für Anlage V nachvollziehen." },
      { label: "Belege", description: "Fotos und Dokumente für Finanzamt und Steuerberater öffnen." },
      { label: "Investment-Fahrten", description: "Noch nicht gekaufte Objekte als ernsthafte Kaufprüfung separat nachhalten." },
    ],
  },
  buchhaltungBerichte: {
    eyebrow: "4. Modul | Buchhaltung & Finanzen",
    title: "Berichte & Exporte",
    description: "Laden Sie hier mit wenigen Klicks alle Unterlagen für Ihre Steuererklärung, Ihre Mieter oder die Bank herunter.",
    basePath: "/buchhaltung",
    source: "Buchhaltung, Steuer-Center, Nebenkosten, Darlehen",
    subpages: buchhaltungSubpages,
    tabs: [
      { label: "Steuer-Report", description: "Anlage V, Einnahmen, Ausgaben und Darlehenszinsen als Jahrespaket." },
      { label: "Steuerberater", description: "Export-Datei mit sauber strukturierten Buchungen und Belegen vorbereiten." },
      { label: "Mietkonto", description: "Offene Zahlungen und Mietkonten pro Objekt prüfen." },
      { label: "Nebenkosten & Vermögen", description: "PDF-Pakete für Nebenkosten, Immobilienvermögen und Kredite erzeugen." },
    ],
  },
  buchhaltungDarlehen: {
    eyebrow: "4. Modul | Buchhaltung & Finanzen",
    title: "Darlehensübersicht",
    description: "Finanzierungsübersicht mit Restschuld, Zinsen, Tilgung, Verlauf und Objektzuordnung. Die bestehende Darlehensseite bleibt die Datenquelle.",
    basePath: "/buchhaltung",
    source: "Darlehensübersicht, property_loan_ledger, Portfolio",
    subpages: buchhaltungSubpages,
    tabs: [
      { label: "Übersicht", description: "Alle Immobilien mit Darlehensstatus, Restschuld und Rückzahlungsstand prüfen." },
      { label: "Ledger bearbeiten", description: "Jahreswerte für Zinsen, Tilgung und Restschuld in der bestehenden Darlehenslogik pflegen." },
      { label: "Objektzuordnung", description: "Darlehen den richtigen Immobilien zuordnen und Abweichungen sichtbar halten." },
      { label: "Steuerrelevanz", description: "Zinsen werden für das Steuer-Center genutzt; Tilgung bleibt dokumentiert, aber steuerlich getrennt." },
    ],
  },
  buchhaltungPortal: {
    eyebrow: "4. Modul | Buchhaltung & Finanzen",
    title: "Steuerberater-Portal",
    description: "Übergabebereich für DATEV, Gast-Zugang und Beleg-Sammel-Download auf Basis vorhandener Rechte und Berichte.",
    basePath: "/buchhaltung",
    source: "Reports, Benutzerrechte, Belege",
    subpages: buchhaltungSubpages,
    tabs: [
      { label: "DATEV-Export", description: "Buchungsstapel und strukturierte Übergabe." },
      { label: "Gast-Zugang", description: "Nur-Lese-Zugang für Steuerberater über bestehende Rollen." },
      { label: "Beleg-Sammel-Download", description: "ZIP-Export für Rechnungsbelege und OCR-Daten." },
    ],
  },
  buchhaltungUst: {
    eyebrow: "4. Modul | Buchhaltung & Finanzen",
    title: "Umsatzsteuer-Optionen",
    description: "Spezialbereich für Gewerbemieten, USt.-Voranmeldung und Vorsteuer-Schlüsselung bei Mischobjekten.",
    basePath: "/buchhaltung",
    source: "Buchhaltung, Steuer, Gewerbeobjekte",
    subpages: buchhaltungSubpages,
    tabs: [
      { label: "USt.-Voranmeldung", description: "Netto-/Bruttomieten und eingenommene Umsatzsteuer." },
      { label: "Vorsteuer-Schlüsselung", description: "Abziehbare Vorsteuern bei Wohn-/Gewerbe-Mischobjekten." },
    ],
  },
  ticketSchaden: {
    eyebrow: "5. Modul | Aufgaben & Ticketsystem",
    title: "Schadenmeldungen",
    description: "Technische Mängel, Fotos und Mieter-Kommunikation als Gebäudemanagement-Arbeitsbereich.",
    basePath: "/ticketsystem",
    source: "Datenprüfung, Mieterkommunikation, Dokumente",
    subpages: [
      { path: "/ticketsystem/schadenmeldungen", label: "Schadenmeldungen", icon: FolderKanban },
      { path: "/ticketsystem/handwerker-beauftragung", label: "Handwerker-Beauftragung", icon: BriefcaseBusiness },
    ],
    tabs: [
      { label: "Kategorisierung & Priorität", description: "Wasser, Strom, Heizung und weitere Gewerke nach Dringlichkeit sortieren." },
      { label: "Foto-Dokumentation & Anhänge", description: "Schadensbilder und Dokumente direkt im Vorgang einsehen." },
      { label: "Mieter-Kommunikation", description: "Mail- und Status-Updates im Ticket-Kontext." },
    ],
  },
  ticketHandwerker: {
    eyebrow: "5. Modul | Aufgaben & Ticketsystem",
    title: "Handwerker-Beauftragung",
    description: "Dienstleister, Angebote, Aufträge und Statusverfolgung für technische Instandhaltung.",
    basePath: "/ticketsystem",
    source: "Tickets, Dienstleister, E-Mail-Schnittstellen",
    subpages: [
      { path: "/ticketsystem/schadenmeldungen", label: "Schadenmeldungen", icon: FolderKanban },
      { path: "/ticketsystem/handwerker-beauftragung", label: "Handwerker-Beauftragung", icon: BriefcaseBusiness },
    ],
    tabs: [
      { label: "Dienstleister-Verzeichnis", description: "Gewerk- und Regionen-Filter für passende Handwerker." },
      { label: "Angebotseinholung", description: "Kostenvoranschläge digital vergleichen." },
      { label: "Auftragserteilung", description: "PDF-Aufträge und E-Mail-Versand vorbereiten." },
      { label: "Statusverfolgung", description: "Termine, Ausführung und Fertigmeldung überwachen." },
    ],
  },
  einstellungenBenutzer: {
    eyebrow: "6. Modul | System-Einstellungen",
    title: "Benutzer- & Rechteverwaltung",
    description: "Geschützter Bereich für Benutzer, Rollen, Berechtigungen und Login-Sicherheit. Immobilien- und Mieterstammdaten liegen in den jeweiligen Fachmodulen.",
    basePath: "/einstellungen",
    source: "Benutzerrollen, Zugriffsschutz, Login-Sicherheit",
    subpages: [
      { path: "/einstellungen/benutzer-rechteverwaltung", label: "Benutzer & Rechte", icon: UserCog },
      { path: "/einstellungen/datenschutz-compliance", label: "Datenschutz & Compliance", icon: ShieldCheck },
    ],
    tabs: [
      { label: "Benutzerübersicht", description: "Registrierte Profile und Zugänge." },
      { label: "Rollen-Editor", description: "Admin- und Lesezugänge definieren." },
      { label: "Berechtigungs-Matrix", description: "Lese-/Schreibrechte für Objekte und Finanzen." },
      { label: "Sicherheit & Login", description: "2FA und Passwort-Richtlinien." },
    ],
  },
  einstellungenDatenschutz: {
    eyebrow: "6. Modul | System-Einstellungen",
    title: "Datenschutz & Compliance",
    description: "DSGVO-Exporte, Löschprozesse, Logbücher und Audit-Trail als geschützter Administrationsbereich.",
    basePath: "/einstellungen",
    source: "Datenschutz, Audit, Administrator",
    subpages: [
      { path: "/einstellungen/benutzer-rechteverwaltung", label: "Benutzer & Rechte", icon: UserCog },
      { path: "/einstellungen/datenschutz-compliance", label: "Datenschutz & Compliance", icon: ShieldCheck },
    ],
    tabs: [
      { label: "DSGVO-Exporte", description: "Selbstauskünfte exportieren oder nach Frist löschen." },
      { label: "Logbücher & Audit-Trail", description: "Kritische Aktionen nachvollziehbar protokollieren." },
    ],
  },
};

function LogoutButton({ showEmail = true, compact = false }: { showEmail?: boolean; compact?: boolean }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  async function handleLogout() {
    try {
      await supabase.auth.signOut({ scope: "local" });
      clearAppSessionStorage();
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Logout fehlgeschlagen:", error);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {showEmail ? (
        <span className="hidden h-[46px] items-center rounded-2xl border border-[#d8d2c7] bg-white/65 px-4 text-sm font-semibold text-slate-600 2xl:inline-flex">
          {user?.email ?? "Eingeloggt"}
        </span>
      ) : null}
      <button
        type="button"
        onClick={handleLogout}
        className={[
          "inline-flex h-[46px] items-center justify-center rounded-2xl border border-[#d8d2c7] bg-white/75 px-4 text-sm font-extrabold text-slate-900 shadow-sm transition hover:bg-white",
          compact ? "flex-1" : "w-[116px]",
        ].join(" ")}
      >
        Logout
      </button>
    </div>
  );
}

const READONLY_MUTATION_RE =
  /\b(speichern|bearbeiten|loeschen|löschen|archivieren|archiv|anlegen|hinzufuegen|hinzufügen|hochladen|upload|abschliessen|abschließen|freigeben|sperren|importieren|anwenden|generieren|erzeugen|erstelle|erstellen|neue zeile|auto-fortschreibung|als erledigt|erledigt markieren|aenderungen|änderungen|zuruecksetzen|zurücksetzen|auswahl loeschen|auswahl löschen)\b/i;

const READONLY_ALLOW_RE =
  /\b(suche|suchen|filter|alle|neu laden|aktualisieren|reload|drucken|print|pdf|csv|export|download|herunterladen|ansehen|anzeigen|oeffnen|öffnen|vorschau|schliessen|schließen|abbrechen|zurueck|zurück|weiter|vormonat|folgemonat|aktueller mietmonat|logout|cookie|detailmaske oeffnen|detailmaske öffnen|detail|diagramm|kopieren)\b/i;

const READONLY_MUTATION_FORM_RE =
  /\b(buchung erfassen|fahrt erfassen|leerstand bearbeiten|mieterdaten|hochladen|upload|speichern|bearbeiten|anlegen|eintragen|neue buchung|neue fahrt|neue aufgabe|neue mietanpassung|neue immobilie|neuer zeitraum|neue zeile)\b/i;

function readonlyTextFor(element: Element): string {
  const htmlElement = element as HTMLElement;
  return [
    htmlElement.innerText,
    htmlElement.textContent,
    htmlElement.getAttribute("aria-label"),
    htmlElement.getAttribute("title"),
    htmlElement.getAttribute("name"),
    htmlElement.getAttribute("value"),
    htmlElement.getAttribute("placeholder"),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function isReadonlyAllowlisted(element: Element): boolean {
  return Boolean(element.closest("[data-readonly-allow='true']"));
}

function isReadonlyMutationAction(element: Element): boolean {
  if (isReadonlyAllowlisted(element)) return false;
  const tagName = element.tagName.toLowerCase();
  const inputType = (element as HTMLInputElement).type?.toLowerCase();
  const text = readonlyTextFor(element);

  if (tagName === "input" && inputType === "file") return true;
  if (tagName === "button" && (element as HTMLButtonElement).type === "submit") return true;
  if (READONLY_ALLOW_RE.test(text)) return false;
  return READONLY_MUTATION_RE.test(text);
}

function setReadonlyMutationDisabled(element: Element, disabled: boolean) {
  const control = element as HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  if (disabled) {
    if (!element.hasAttribute("data-readonly-original-title")) {
      element.setAttribute("data-readonly-original-title", element.getAttribute("title") ?? "");
    }
    control.disabled = true;
    element.setAttribute("aria-disabled", "true");
    element.setAttribute("data-readonly-locked", "true");
    element.setAttribute("title", "Nur-Lesen-Zugang: Änderungen sind dem Admin vorbehalten.");
  } else if (element.getAttribute("data-readonly-locked") === "true") {
    control.disabled = false;
    element.removeAttribute("aria-disabled");
    element.removeAttribute("data-readonly-locked");
    const originalTitle = element.getAttribute("data-readonly-original-title") ?? "";
    if (originalTitle) element.setAttribute("title", originalTitle);
    else element.removeAttribute("title");
    element.removeAttribute("data-readonly-original-title");
  }
}

function formLooksMutating(form: HTMLFormElement): boolean {
  if (isReadonlyAllowlisted(form)) return false;
  const formText = readonlyTextFor(form).slice(0, 1800);
  const hasMutationButton = Array.from(form.querySelectorAll("button,input[type='submit']")).some(isReadonlyMutationAction);
  return hasMutationButton || READONLY_MUTATION_FORM_RE.test(formText);
}

function applyReadonlyDomState(root: HTMLElement, enabled: boolean) {
  const mutationActions = root.querySelectorAll("button,a[role='button'],input[type='button'],input[type='submit'],input[type='file']");
  mutationActions.forEach((element) => {
    if (element instanceof HTMLAnchorElement) {
      if (enabled && isReadonlyMutationAction(element)) {
        element.setAttribute("aria-disabled", "true");
        element.setAttribute("data-readonly-locked", "true");
        element.setAttribute("title", "Nur-Lesen-Zugang: Änderungen sind dem Admin vorbehalten.");
      } else if (!enabled && element.getAttribute("data-readonly-locked") === "true") {
        element.removeAttribute("aria-disabled");
        element.removeAttribute("data-readonly-locked");
        element.removeAttribute("title");
      }
      return;
    }
    setReadonlyMutationDisabled(element, enabled && isReadonlyMutationAction(element));
  });

  root.querySelectorAll("form").forEach((formElement) => {
    const form = formElement as HTMLFormElement;
    const lockForm = enabled && formLooksMutating(form);
    form.querySelectorAll("input,textarea,select").forEach((field) => {
      const control = field as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const type = (control as HTMLInputElement).type?.toLowerCase();
      if (type === "search" || control.closest("[data-readonly-allow='true']")) return;
      if (lockForm) {
        control.disabled = true;
        field.setAttribute("aria-disabled", "true");
        field.setAttribute("data-readonly-field", "true");
      } else if (field.getAttribute("data-readonly-field") === "true") {
        control.disabled = false;
        field.removeAttribute("aria-disabled");
        field.removeAttribute("data-readonly-field");
      }
    });
  });
}

function ReadOnlyInteractionGuard({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    applyReadonlyDomState(root, enabled);
    if (!enabled) return undefined;

    let frameId = 0;
    const observer = new MutationObserver(() => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        applyReadonlyDomState(root, true);
      });
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [enabled]);

  function blockReadonlyEvent(event: SyntheticEvent<HTMLElement>) {
    if (!enabled) return;
    const target = event.target as Element | null;
    const action = target?.closest("button,a[role='button'],input[type='button'],input[type='submit'],input[type='file']");
    if (action && isReadonlyMutationAction(action)) {
      event.preventDefault();
      event.stopPropagation();
      window.alert("Nur-Lesen-Zugang: Diese Aktion ist dem Admin vorbehalten.");
    }
  }

  function blockReadonlySubmit(event: React.FormEvent<HTMLElement>) {
    if (!enabled) return;
    const form = event.target as HTMLFormElement;
    if (formLooksMutating(form)) {
      event.preventDefault();
      event.stopPropagation();
      window.alert("Nur-Lesen-Zugang: Speichern und Änderungen sind dem Admin vorbehalten.");
    }
  }

  return (
    <div ref={rootRef} onClickCapture={blockReadonlyEvent} onSubmitCapture={blockReadonlySubmit}>
      {children}
    </div>
  );
}

function ProtectedAppShell() {
  const location = useLocation();
  const { user } = useAuth();
  const resetKey = `${user?.email ?? "anonymous"}:${location.pathname}:${location.search}`;

  return (
    <RequireAuthMFA>
      <AppErrorBoundary resetKey={resetKey}>
        <AppDataProvider>
          <AppShell />
        </AppDataProvider>
      </AppErrorBoundary>
    </RequireAuthMFA>
  );
}

function NebenkostenIndexPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Nebenkostenabrechnungen"
        title="Nebenkosten"
        description="Zentrale Auswahl fuer Wohnungs- und Tiefgaragenabrechnungen. Berechnungen und Eingaben bleiben in den bestehenden Fachseiten."
        meta={[
          { label: "Quelle", value: "Buchhaltung + NK-Seiten" },
          { label: "Modus", value: "Bestand erhalten" },
        ]}
      />

      <section className="grid gap-4 md:grid-cols-2">
        <ModuleCard
          to="/nebenkosten/wohnungen"
          label="NK-Wohnungen"
          description="Nebenkostenabrechnung fuer Wohnungen mit vorhandenen Umlageschluesseln, Kostenpositionen und Ausgaben."
          icon={Building2}
          badge="Wohnungen"
        />
        <ModuleCard
          to="/nebenkosten/tiefgarage"
          label="NK-Tiefgaragen"
          description="Abrechnung fuer Tiefgaragen und Stellplaetze mit den bestehenden Tabellen und Exporten."
          icon={ClipboardList}
          badge="Garage"
        />
      </section>

      <SectionPanel
        eyebrow="Arbeitslogik"
        title="Bestehende Fachseiten bleiben die Quelle"
        description="Diese Uebersicht sortiert nur die Zugriffe. Die fachlichen Berechnungen bleiben auf den bereits geprueften NK-Seiten."
      >
        <InfoList
          items={[
            { label: "Wohnungen", value: "Abrechnung, Umlagen, PDF/Export", tone: "blue" },
            { label: "Tiefgarage", value: "Stellplaetze, Kosten, Export", tone: "amber" },
            { label: "Buchungen", value: "Kostenquelle bleibt Buchhaltung", tone: "green" },
          ]}
        />
      </SectionPanel>
    </div>
  );
}

function ModuleHubPage({
  eyebrow,
  title,
  description,
  links,
  meta,
}: {
  eyebrow: string;
  title: string;
  description: string;
  links: ModuleLink[];
  meta?: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={eyebrow} title={title} description={description} meta={meta} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {links.map((link) => <ModuleCard key={link.to} {...link} />)}
      </section>
    </div>
  );
}

function ModuleWorkspacePage({
  config,
  children,
}: {
  config: WorkspaceConfig;
  children?: ReactNode;
}) {
  const { user } = useAuth();
  const isAdmin = isAdminEmail(user?.email);
  const eyebrow = config.eyebrow.replace(/^\d+\.\s*Modul\s*\|\s*/i, "");
  const visibleSubpages = config.subpages.filter((subpage) => !subpage.adminOnly || isAdmin);

  return (
    <div className="module-workspace space-y-5">
      <PageHeader
        eyebrow={eyebrow}
        title={config.title}
        description={config.description}
        meta={[
          { label: "Quelle", value: config.source },
        ]}
      />

      <section className="rounded-[24px] border border-white/70 bg-white/82 p-3 shadow-[0_14px_34px_rgba(51,65,85,0.07)] backdrop-blur sm:p-4">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {visibleSubpages.map((subpage) => {
            const Icon = subpage.icon;
            return (
              <NavLink
                key={subpage.path}
                to={subpage.path}
                className={({ isActive }) =>
                  [
                    "flex min-h-12 items-center gap-3 rounded-2xl border px-3 py-3 text-sm font-black no-underline transition",
                    isActive
                      ? "border-teal-200 bg-[#e8f3ef] text-[#19485a] shadow-sm"
                      : "border-slate-200/80 bg-slate-50/70 text-slate-800 hover:border-teal-200 hover:bg-white",
                  ].join(" ")
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={18}
                              className={isActive ? "text-[#255f6f]" : "text-slate-800"}
                    />
                    <span className={isActive ? "text-[#19485a]" : "text-slate-950"}>
                      {subpage.label}
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </section>

      <div className="module-workspace-content">
        {children ?? (
          <EmptyState
            title="Vorhandene Fachseite wird hier eingebunden"
            description="Diese Unterseite ist strukturell vorbereitet und verwendet vorhandene Datenquellen, sobald die passende Fachkomponente verfügbar ist."
          />
        )}
      </div>
    </div>
  );
}

function AdminOnlyWorkspace({
  config,
  children,
}: {
  config: WorkspaceConfig;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const isAdmin = isAdminEmail(user?.email);

  if (!isAdmin) {
    return (
      <ModuleWorkspacePage config={config}>
        <EmptyState
          title="Administrationsbereich geschützt"
          description="Diese Unterseite ist nur für Admin-Benutzer freigegeben. Bestehende Zugriffsbeschränkungen bleiben aktiv."
        />
      </ModuleWorkspacePage>
    );
  }

  return <ModuleWorkspacePage config={config}>{children}</ModuleWorkspacePage>;
}

function MieterHubPage() {
  return (
    <ModuleHubPage
      eyebrow="Mietermanagement"
      title="Mieter"
      description="Zentrale Mieter-Navigation. Die Stammdaten, Verträge und Zahlungskontrollen bleiben in den bestehenden Modulen."
      meta={[
        { label: "Quelle", value: "Mieterstammdaten + Buchhaltung" },
        { label: "Pflege", value: "Mieter anlegen" },
      ]}
      links={[
        { to: "/mieter/register", label: "Mieterregister", description: "Aktive und archivierte Mieter mit Mietverträgen strukturiert prüfen.", icon: Users, badge: "Register" },
        { to: "/mieter/mietentwicklung", label: "Mietentwicklung", description: "Mietanpassungen, Sollmieten und Historie je Objekt prüfen.", icon: TrendingUp, badge: "Sollmiete" },
        { to: "/mieter/mieteingang", label: "Zahlungen", description: "Mieteingänge aus Buchhaltung und Vermietungszeiträumen prüfen.", icon: WalletCards, badge: "Soll/Ist" },
        { to: "/mieter/stammdaten", label: "Stammdaten", description: "Mieter anlegen und vorhandene Mieterstammdaten pflegen.", icon: Users, badge: "Stamm" },
        { to: "/mieter/leerstand", label: "Leerstand", description: "Leerstände und nicht aktive Einheiten verwalten.", icon: DoorOpen, badge: "Status" },
        { to: "/mieter/ein-auszug", label: "Ein-/Auszug", description: "Übergaben, Prozesse und Historie rund um Mieterwechsel.", icon: KeyRound, badge: "Prozess" },
        { to: "/mieter/mahnwesen", label: "Mahnwesen", description: "Offene Posten und Mahnprozess aus bestehenden Daten.", icon: Bell, badge: "Offen" },
      ]}
    />
  );
}

function BuchhaltungHubPage() {
  const { user } = useAuth();
  const isReadOnly = !isAdminEmail(user?.email) && isReadonlyApprovalEmail(user?.email);
  const { entries, loading, error, getPropertyName } = useAppData();
  const currentMonthEntries = useMemo(
    () => entries.filter((entry) => isCurrentMonthEntry(entry)),
    [entries],
  );
  const income = currentMonthEntries
    .filter((entry) => entry.entry_type === "income")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const expenses = currentMonthEntries
    .filter((entry) => entry.entry_type === "expense")
    .reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
  const rentIncome = currentMonthEntries
    .filter((entry) => isRentLikeEntry(entry))
    .reduce((sum, entry) => sum + entry.amount, 0);
  const unassigned = currentMonthEntries.filter((entry) => !entry.object_id || !entry.category).length;
  const recentEntries = useMemo(
    () =>
      [...entries]
        .sort((a, b) => String(b.booking_date ?? "").localeCompare(String(a.booking_date ?? "")))
        .slice(0, 6),
    [entries],
  );
  const monthLabel = new Date().toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Single Source of Truth"
        title="Buchhaltung"
        description="Arbeitscockpit für Transaktionen, Monatsbewegungen, Regeln und Auswertungen. Die Buchungen bleiben die zentrale Datenquelle der App."
      >
        <NavLink
          to="/buchhaltung/transaktionen"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 text-sm font-black text-indigo-900 no-underline shadow-sm"
        >
          Transaktionen öffnen <ArrowRight size={16} />
        </NavLink>
      </PageHeader>

      {error ? (
        <div className="rounded-[22px] border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-900">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={`Einnahmen ${monthLabel}`} value={formatCurrency(income)} icon={WalletCards} tone="green" />
        <KpiCard label={`Ausgaben ${monthLabel}`} value={formatCurrency(expenses)} icon={ReceiptText} tone="red" />
        <KpiCard label="Saldo" value={formatCurrency(income - expenses)} icon={BarChart3} tone={income - expenses >= 0 ? "blue" : "amber"} />
        <KpiCard label="Mieteingänge" value={formatCurrency(rentIncome)} detail={`${currentMonthEntries.length} Buchungen im Monat`} icon={CalendarCheck} tone="violet" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Arbeitsliste</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">Letzte Buchungen</h2>
            </div>
            {loading ? <span className="text-sm font-bold text-slate-500">Daten werden geladen...</span> : null}
          </div>

          {recentEntries.length ? (
            <div className="mt-5 overflow-hidden rounded-[18px] border border-slate-200">
              {recentEntries.map((entry) => (
                <div
                  key={`${entry.id ?? "entry"}-${entry.booking_date}-${entry.amount}`}
                  className="grid gap-3 border-b border-slate-100 p-4 last:border-b-0 md:grid-cols-[110px_1fr_140px]"
                >
                  <div className="text-sm font-black text-slate-700">{formatDate(entry.booking_date)}</div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-slate-950">
                      {getPropertyName(entry.object_id) || entry.objekt_code || "Ohne Objekt"}
                    </div>
                    <div className="mt-1 truncate text-xs font-bold text-slate-500">
                      {entry.category || "Ohne Kategorie"} {entry.note ? `- ${entry.note}` : ""}
                    </div>
                  </div>
                  <div className={["text-left text-sm font-black md:text-right", entry.entry_type === "expense" ? "text-red-700" : "text-emerald-700"].join(" ")}>
                    {formatCurrency(entry.amount)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState title="Noch keine Buchungen geladen" description="Sobald Buchhaltungsdaten verfügbar sind, erscheinen hier die neuesten Bewegungen." />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <KpiCard
            label="Zu prüfen"
            value={unassigned}
            detail="Buchungen ohne Objekt oder Kategorie im aktuellen Monat"
            icon={ShieldCheck}
            tone={unassigned ? "amber" : "green"}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <ModuleCard to="/buchhaltung/transaktionen" label="Transaktionen" description="Buchhaltungsübersicht mit Einnahmen und Ausgaben prüfen." icon={WalletCards} />
            <ModuleCard to="/buchhaltung/einnahmen-ausgaben" label="Einnahmen & Ausgaben" description={isReadOnly ? "Buchungen und Felder lesbar; Änderungen bleiben gesperrt." : "Einnahmen und Ausgaben über das bestehende Erfassungsmodul anlegen."} icon={PlusCircle} />
            <ModuleCard to="/buchhaltung/regeln" label="Regeln" description={isReadOnly ? "Regeln lesbar; Bearbeitung bleibt dem Admin vorbehalten." : "Transaktionsregeln und Zuordnungen verwalten."} icon={Settings2} />
            <ModuleCard to="/berichte" label="Berichte" description="Reports und Auswertungen aus vorhandenen Datenquellen." icon={BarChart3} />
          </div>
        </div>
      </section>
    </div>
  );
}

function OrganisationHubPage({ kind }: { kind: "ticketing" | "dokumente" | "produktivitaet" | "einstellungen" | "benutzer" | "kautionen" }) {
  const { user } = useAuth();
  const isAdmin = isAdminEmail(user?.email);
  const configs: Record<string, ModuleHubConfig> = {
    ticketing: {
      eyebrow: "Arbeitsorganisation",
      title: "Ticketing",
      description: "Tickets und Vorgänge werden als Organisationsschicht eingeordnet. Bestehende Aufgaben- und Prüfmodule bleiben die Grundlage.",
      links: [
        { to: "/dashboard", label: "Heute wichtig", description: "Offene Vorgänge und Hinweise im Dashboard prüfen.", icon: LayoutDashboard },
        { to: "/datenpruefung", label: "Datenprüfung", description: "Bestehende Prüfseite unverändert nutzen.", icon: ShieldCheck },
        { to: "/mieter/mahnwesen", label: "Mahnwesen", description: "Zahlungsbezogene Vorgänge aus offenen Posten.", icon: Bell },
      ],
    },
    dokumente: {
      eyebrow: "Dokumentenmanagement",
      title: "Dokumentenmanagement",
      description: "Dokumente bleiben an Immobilien, Mietern, Buchungen und Verträgen verknüpft. Diese Seite bündelt die Zugänge.",
      links: [
        { to: "/immobilien", label: "Immobilien-Dokumente", description: "Objektbezogene Unterlagen über Portfolio und Objektakten.", icon: FolderOpen },
        { to: "/mieter", label: "Mieter-Dokumente", description: "Mieterbezogene Dokumente über Mieterstammdaten und Prozesse.", icon: Users },
        { to: "/buchhaltung", label: "Buchungsbelege", description: "Belege und Zahlungsinformationen über Buchhaltung.", icon: ReceiptText },
        { to: "/darlehen", label: "Darlehensunterlagen", description: "Finanzierungsdokumente über Darlehen.", icon: Landmark },
      ],
    },
    produktivitaet: {
      eyebrow: "Querschnitt",
      title: "Produktivität",
      description: "Aufgaben, Erinnerungen, Workflows und Automatisierungen werden über bestehende Module erreichbar gemacht.",
      links: [
        { to: "/dashboard", label: "Aufgaben", description: "Cockpit-Aufgaben und wichtige Hinweise.", icon: ListChecks },
        { to: "/berichte?view=automation", label: "Automatisierung", description: "Bestehende Automatisierungs- und Reporting-Zugänge.", icon: CalendarCheck },
        { to: "/ticketing", label: "Tickets", description: "Organisatorische Vorgänge aus Prüf- und Fachmodulen.", icon: FolderKanban },
      ],
    },
    einstellungen: {
      eyebrow: "System",
      title: "Einstellungen",
      description: "Konfigurationen werden nur logisch gruppiert. Vorhandene Einstellungsseiten bleiben erhalten.",
      links: [
        { to: "/buchhaltung/regeln", label: "Transaktionsregeln", description: "Regeln und Zuordnungen für Buchungen.", icon: Settings2, adminOnly: true },
        { to: "/datenpruefung", label: "Datenprüfung", description: "Qualitätssicherung der vorhandenen Daten.", icon: ShieldCheck },
        { to: "/benutzer", label: "Benutzer", description: "Benutzer- und Rollenverwaltung.", icon: UserCog, adminOnly: true },
      ],
    },
    benutzer: {
      eyebrow: "Zugriff",
      title: "Benutzer",
      description: "Benutzerübersicht für Admin und Lesezugänge. Rechteverwaltung bleibt in der bestehenden Administrator-Seite.",
      links: [
        { to: "/einstellungen/benutzer-rechteverwaltung", label: "Benutzer & Rechte", description: "Benutzer, Rollen und Login-Sicherheit verwalten.", icon: ShieldCheck, adminOnly: true },
        { to: "/dashboard", label: "Read-Only Übersicht", description: "Lesende Nutzer verwenden die App als Informationsquelle.", icon: BookOpenCheck },
      ],
    },
    kautionen: {
      eyebrow: "Buchhaltung",
      title: "Kautionen",
      description: "Kautionsrelevante Informationen werden über bestehende Buchungen, Mieter und Berichte eingeordnet.",
      links: [
        { to: "/buchhaltung/transaktionen", label: "Buchungen", description: "Kautionsbuchungen über bestehende Transaktionen prüfen.", icon: WalletCards },
        { to: "/mieter/stammdaten", label: "Mieter", description: "Kautionsangaben in den vorhandenen Mieterstammdaten.", icon: Users },
        { to: "/berichte", label: "Berichte", description: "Auswertungen und Nachweise aus bestehenden Reports.", icon: BarChart3 },
      ],
    },
  };

  const config = configs[kind];
  const links = config.links.filter((link) => !link.adminOnly || isAdmin);

  return (
    <div className="space-y-5">
      <ModuleHubPage {...config} links={links} />
      <SectionPanel
        eyebrow="Struktur"
        title="Logisch gruppiert, fachlich unverändert"
        description="Diese Seite bündelt vorhandene Module. Daten, Berechnungen und Erfassungslogik bleiben in den jeweiligen Fachseiten."
      >
        <InfoList
          items={[
            { label: "Datenquelle", value: "Bestehende Module", tone: "blue" },
            { label: "Aenderungen", value: isAdmin ? "Admin-Rechte aktiv" : "Nur Lesen", tone: isAdmin ? "green" : "slate" },
            { label: "Ziel", value: "Schneller Einstieg statt doppelter Logik", tone: "violet" },
          ]}
        />
      </SectionPanel>
    </div>
  );
}

type ReportKind = "tax" | "advisor" | "anlage-v-package" | "section35a" | "rent-account" | "utilities" | "wealth" | "handover" | "vacancy" | "tax-data-package";
type ReportFormat = "pdf" | "csv" | "excel" | "zip";
type AnlageVReportDataRow = Omit<AnlageVBookingExportRow, "recordType" | "paymentStatus"> & {
  recordType: AnlageVBookingExportRow["recordType"] | "Leerstand" | "Offene Miete";
  paymentStatus: AnlageVBookingExportRow["paymentStatus"] | "Nicht anwendbar";
};

function slugifyReportPart(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "bericht";
}

function csvValue(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadBlob(filename: string, blob: Blob) {
  if (!filename.trim() || blob.size === 0) {
    throw new Error("Der Export konnte nicht erstellt werden, weil die Datei leer ist.");
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Firefox, Safari and embedded browsers may still read the Blob after the
  // synthetic click. Releasing it immediately can cancel an otherwise valid
  // download, so keep it alive briefly and clean it up afterwards.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function buildCsv(headers: string[], rows: Array<Array<unknown>>): string {
  return [headers, ...rows].map((row) => row.map(csvValue).join(";")).join("\n");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ";" && !quoted) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current);
  return values;
}

function csvToExcelHtml(title: string, csv: string): string {
  const rows = csv.split(/\r?\n/).filter(Boolean).map(parseCsvLine);
  const head = rows[0] ?? [];
  const body = rows.slice(1);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; color: #111827; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    p { color: #64748b; font-size: 12px; margin: 0 0 18px; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #eef7f4; color: #234e59; font-weight: 700; text-align: left; }
    th, td { border: 1px solid #dbe4ee; padding: 8px; font-size: 12px; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>Exportiert am ${escapeHtml(new Date().toLocaleString("de-DE"))}</p>
  <table>
    <thead><tr>${head.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead>
    <tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>
</body>
</html>`;
}

function wrapPdfLine(value: string, maxLength = 92): string[] {
  const words = value
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .flatMap((word) => {
      if (word.length <= maxLength) return [word];
      const chunks: string[] = [];
      for (let index = 0; index < word.length; index += maxLength) {
        chunks.push(word.slice(index, index + maxLength));
      }
      return chunks;
    });
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (`${current} ${word}`.trim().length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function escapePdfText(value: string): string {
  return value
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/€/g, "EUR")
    .replace(/§/g, "Paragraf ")
    .replace(/–|—/g, "-")
    .replace(/→/g, "->")
    .replace(/•/g, "-")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, " ");
}

function createSimplePdf(title: string, lines: string[]): Blob {
  const pageWidth = 595;
  const pageHeight = 842;
  const marginX = 42;
  const contentWidth = pageWidth - marginX * 2;
  const minY = 72;
  const generatedAt = new Date().toLocaleString("de-DE");
  const pageStreams: string[] = [];
  let current: string[] = [];
  let y = 0;
  let pageNumber = 0;

  const color = {
    navy: "0.055 0.075 0.13 rg",
    slate: "0.39 0.45 0.56 rg",
    muted: "0.84 0.88 0.93 rg",
    soft: "0.96 0.98 1 rg",
    teal: "0.18 0.39 0.45 rg",
    mint: "0.9 0.97 0.94 rg",
    white: "1 1 1 rg",
  };

  function rect(x: number, rectY: number, width: number, height: number, fill: string, stroke?: string) {
    current.push(fill, `${x} ${rectY} ${width} ${height} re f`);
    if (stroke) current.push(stroke.replace(" rg", " RG"), "0.8 w", `${x} ${rectY} ${width} ${height} re S`);
  }

  function text(value: string, x: number, textY: number, size = 10, font: "F1" | "F2" = "F1", fill = color.navy) {
    current.push(fill, "BT", `/${font} ${size} Tf`, `${x} ${textY} Td`, `(${escapePdfText(value)}) Tj`, "ET");
  }

  function divider(lineY: number) {
    current.push("0.88 0.91 0.95 RG", "0.8 w", `${marginX} ${lineY} m ${pageWidth - marginX} ${lineY} l S`);
  }

  function drawChrome() {
    rect(0, pageHeight - 76, pageWidth, 76, color.soft);
    current.push(...drawPdfLogo(marginX, pageHeight - 64, 118));
    text("Steuer- und Finanzreport", marginX + 132, pageHeight - 35, 10, "F2", color.slate);
    text(`Erstellt: ${generatedAt}`, pageWidth - 206, pageHeight - 35, 9, "F1", color.slate);
    divider(pageHeight - 82);
    text("Cetin Koenen | Hohenloher Str. 78/1, 74243 Langenbrettach | info.koenen@gmail.com", marginX, 34, 8, "F1", color.slate);
    text(`Seite ${pageNumber}`, pageWidth - 86, 34, 8, "F2", color.slate);
  }

  function startPage(continued = false) {
    if (current.length) pageStreams.push(current.join("\n"));
    pageNumber += 1;
    current = [];
    drawChrome();
    y = pageHeight - 116;
    if (continued) {
      text(title, marginX, y, 16, "F2");
      text("Fortsetzung", pageWidth - 122, y + 2, 9, "F2", color.teal);
      y -= 28;
      divider(y + 14);
    }
  }

  function ensureSpace(required: number) {
    if (y - required < minY) startPage(true);
  }

  function paragraph(value: string, options?: { bold?: boolean; size?: number; fill?: string; indent?: number; maxLength?: number }) {
    const size = options?.size ?? 10;
    const indent = options?.indent ?? 0;
    const wrapped = wrapPdfLine(value, options?.maxLength ?? (indent ? 78 : 88));
    ensureSpace(wrapped.length * (size + 4) + 4);
    wrapped.forEach((line) => {
      text(line, marginX + indent, y, size, options?.bold ? "F2" : "F1", options?.fill ?? color.navy);
      y -= size + 4;
    });
  }

  function sectionHeading(value: string) {
    ensureSpace(42);
    y -= 4;
    text(value.replace(/:$/, ""), marginX, y, 13, "F2", color.teal);
    y -= 10;
    divider(y);
    y -= 16;
  }

  function keyValueRow(label: string, value: string) {
    const labelLines = wrapPdfLine(label, 36);
    const valueLines = wrapPdfLine(value || "-", 52);
    const rowHeight = Math.max(32, Math.max(labelLines.length * 10, valueLines.length * 13) + 16);
    ensureSpace(rowHeight + 8);
    rect(marginX, y - rowHeight + 8, contentWidth, rowHeight, color.soft, color.muted);
    labelLines.forEach((line, index) => {
      text(line, marginX + 12, y - 4 - index * 10, 8, "F2", color.slate);
    });
    valueLines.forEach((line, index) => {
      text(line, marginX + 210, y - 4 - index * 13, 10, "F2", color.navy);
    });
    y -= rowHeight + 8;
  }

  function tableLikeRow(value: string) {
    const parts = value.split("|").map((part) => part.trim());
    if (parts.length < 2) {
      paragraph(value);
      return;
    }
    const primaryParts = parts.slice(0, 6);
    const overflowParts = parts.slice(6);
    const widths = primaryParts.length <= 5 ? [72, 112, 98, 88, 121] : [62, 104, 66, 90, 76, 73];
    const wrapLimits = primaryParts.length <= 5 ? [14, 21, 19, 17, 23] : [12, 20, 13, 18, 15, 14];
    const wrappedParts = primaryParts.map((part, index) => wrapPdfLine(part || "-", wrapLimits[index] ?? 18));
    const primaryHeight = Math.max(...wrappedParts.map((partLines) => partLines.length)) * 10;
    const overflowLines = overflowParts.length
      ? wrapPdfLine(`Weitere Angaben: ${overflowParts.map((part) => part || "-").join(" | ")}`, 96)
      : [];
    const rowHeight = Math.max(32, primaryHeight + (overflowLines.length ? overflowLines.length * 10 + 10 : 0) + 16);
    ensureSpace(rowHeight + 8);
    rect(marginX, y - rowHeight + 8, contentWidth, rowHeight, "0.985 0.99 1 rg", color.muted);
    let x = marginX + 10;
    wrappedParts.forEach((partLines, index) => {
      partLines.forEach((line, lineIndex) => {
        const emphasized = index === 4 || index === 5;
        text(line, x, y - 5 - lineIndex * 10, emphasized ? 7.5 : 7.2, emphasized ? "F2" : "F1", emphasized ? color.teal : color.navy);
      });
      x += widths[index] ?? 70;
    });
    overflowLines.forEach((line, lineIndex) => {
      text(line, marginX + 10, y - primaryHeight - 12 - lineIndex * 10, 7.4, lineIndex === 0 ? "F2" : "F1", color.slate);
    });
    y -= rowHeight + 8;
  }

  startPage();
  const titleLines = wrapPdfLine(title, 46);
  titleLines.forEach((line, index) => {
    text(line, marginX, y, index === 0 ? 24 : 18, "F2");
    y -= index === 0 ? 27 : 22;
  });
  paragraph("Professionell formatierter Export aus Koenen Property Management. Die Buchhaltung und gepflegten Stammdaten bleiben die fachliche Quelle.", { size: 10, fill: color.slate, maxLength: 84 });
  y -= 8;
  rect(marginX, y - 42, contentWidth, 48, color.mint, "0.74 0.9 0.82 rg");
  text("REPORT-METADATEN", marginX + 14, y - 8, 8, "F2", color.teal);
  text(`Erstellt: ${generatedAt}`, marginX + 14, y - 25, 10, "F2", color.navy);
  text("Quelle: App-Daten, Buchhaltung, Darlehen, Fahrtenbuch", marginX + 240, y - 25, 9, "F1", color.slate);
  y -= 70;

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      y -= 8;
      return;
    }
    if (/^[A-Za-z0-9 .,&/()äöüÄÖÜß§-]{2,70}:$/.test(line) || ["Buchungen:", "Darlehen:", "Leerstände:", "Steuerliche Dokumentation:", "Pruefhinweise:"].includes(line)) {
      sectionHeading(line);
      return;
    }
    if (line.includes("|")) {
      tableLikeRow(line);
      return;
    }
    const keyValue = line.match(/^([^:]{2,72}):\s*(.+)$/);
    if (keyValue) {
      keyValueRow(keyValue[1], keyValue[2]);
      return;
    }
    paragraph(line.startsWith("-") ? line : line, { indent: line.startsWith("-") ? 10 : 0, fill: line.startsWith("-") ? color.slate : color.navy });
  });

  pageStreams.push(current.join("\n"));
  const pageKids = pageStreams.map((_, index) => `${6 + index * 2} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageKids}] /Count ${pageStreams.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    createPdfLogoObject(),
    ...pageStreams.flatMap((content, index) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /BrandLogo 5 0 R >> >> /Contents ${7 + index * 2} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ]),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

const crcTable = Array.from({ length: 256 }, (_, tableIndex) => {
  let value = tableIndex;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(files: Array<{ name: string; content: string }>): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  function pushUint32(view: DataView, viewOffset: number, value: number) {
    view.setUint32(viewOffset, value >>> 0, true);
  }

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = encoder.encode(file.content);
    const checksum = crc32(contentBytes);
    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    pushUint32(localView, 0, 0x04034b50);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    pushUint32(localView, 14, checksum);
    pushUint32(localView, 18, contentBytes.length);
    pushUint32(localView, 22, contentBytes.length);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    chunks.push(local, contentBytes);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    pushUint32(centralView, 0, 0x02014b50);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    pushUint32(centralView, 16, checksum);
    pushUint32(centralView, 20, contentBytes.length);
    pushUint32(centralView, 24, contentBytes.length);
    centralView.setUint16(28, nameBytes.length, true);
    pushUint32(centralView, 42, offset);
    central.set(nameBytes, 46);
    centralChunks.push(central);
    offset += local.length + contentBytes.length;
  });

  const centralOffset = offset;
  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  pushUint32(endView, 0, 0x06054b50);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  pushUint32(endView, 12, centralSize);
  pushUint32(endView, 16, centralOffset);

  const parts = [...chunks, ...centralChunks, end].map((chunk) =>
    chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer,
  );
  return new Blob(parts, { type: "application/zip" });
}

async function createZipWithBinary(files: Array<{ name: string; content: string | Blob | Uint8Array }>): Promise<Blob> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  function pushUint32(view: DataView, viewOffset: number, value: number) {
    view.setUint32(viewOffset, value >>> 0, true);
  }

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    let contentBytes: Uint8Array;
    if (typeof file.content === "string") {
      contentBytes = encoder.encode(file.content);
    } else if (file.content instanceof Blob) {
      contentBytes = new Uint8Array(await file.content.arrayBuffer());
    } else {
      contentBytes = file.content;
    }

    const checksum = crc32(contentBytes);
    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    pushUint32(localView, 0, 0x04034b50);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    pushUint32(localView, 14, checksum);
    pushUint32(localView, 18, contentBytes.length);
    pushUint32(localView, 22, contentBytes.length);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    chunks.push(local, contentBytes);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    pushUint32(centralView, 0, 0x02014b50);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    pushUint32(centralView, 16, checksum);
    pushUint32(centralView, 20, contentBytes.length);
    pushUint32(centralView, 24, contentBytes.length);
    centralView.setUint16(28, nameBytes.length, true);
    pushUint32(centralView, 42, offset);
    central.set(nameBytes, 46);
    centralChunks.push(central);
    offset += local.length + contentBytes.length;
  }

  const centralOffset = offset;
  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  pushUint32(endView, 0, 0x06054b50);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  pushUint32(endView, 12, centralSize);
  pushUint32(endView, 16, centralOffset);

  const parts = [...chunks, ...centralChunks, end].map((chunk) =>
    chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer,
  );
  return new Blob(parts, { type: "application/zip" });
}

function ReportActionButton({
  label,
  primary = false,
  disabled = false,
  busy = false,
  onClick,
}: {
  label: string;
  primary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      className={[
        "inline-flex min-h-10 items-center justify-center rounded-2xl px-4 text-sm font-black no-underline shadow-sm transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-55 disabled:hover:translate-y-0",
        primary
          ? "bg-slate-950 text-white hover:bg-[#255f6f]"
          : "border border-slate-200 bg-white text-slate-900 hover:border-teal-200 hover:bg-teal-50",
      ].join(" ")}
    >
      {busy ? "Export wird erstellt…" : label}
    </button>
  );
}

function ReportsExportsPage() {
  const { objects, entries, loanRows, getPropertyName, loading: appDataLoading } = useAppData();
  const currentYear = new Date().getFullYear();
  const [objectFilter, setObjectFilter] = useState("all");
  const [period, setPeriod] = useState(String(currentYear));
  const [vacancies, setVacancies] = useState<UnitVacancy[]>([]);
  const [vacancyError, setVacancyError] = useState<string | null>(null);
  const [vacancyLoadedRange, setVacancyLoadedRange] = useState<string | null>(null);
  const [mileageTrips, setMileageTrips] = useState<MileageTripRow[]>([]);
  const [mileageError, setMileageError] = useState<string | null>(null);
  const [mileageLoadedYear, setMileageLoadedYear] = useState<number | null>(null);
  const [taxLoanRows, setTaxLoanRows] = useState<TaxReportLoanRow[]>([]);
  const [taxLoanError, setTaxLoanError] = useState<string | null>(null);
  const [taxLoanLoadedYear, setTaxLoanLoadedYear] = useState<number | null>(null);
  const [rentAnnualReport, setRentAnnualReport] = useState<RentAnnualReportSnapshot | null>(null);
  const [activeExport, setActiveExport] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const rentReportRef = useRef<HTMLElement | null>(null);
  const isPortfolioReportFilter = objectFilter === "portfolio";
  const selectedObject = isPortfolioReportFilter ? undefined : objects.find((object) => object.id === objectFilter);
  const periodStart = `${period}-01-01`;
  const periodEnd = `${period}-12-31`;
  const vacancyRangeKey = `${periodStart}:${periodEnd}`;
  const selectedYear = Number(period) || currentYear;
  const yearEntries = entries.filter((entry) => entry.booking_date?.startsWith(`${period}-`));
  const matchesSelectedObject = (entry: FinanceEntry) => {
    if (!selectedObject) return true;
    if (entry.object_id === selectedObject.id) return true;
    if (entry.objekt_code && selectedObject.code && entry.objekt_code === selectedObject.code) return true;
    const entryName = getPropertyName(entry.object_id);
    const haystack = `${entryName} ${entry.objekt_code ?? ""} ${entry.category ?? ""} ${entry.note ?? ""}`.toLowerCase();
    const candidates = [selectedObject.label, selectedObject.code ?? "", ...(selectedObject.aliases ?? [])]
      .map((value) => value.toLowerCase().trim())
      .filter(Boolean);
    return candidates.some((candidate) => haystack.includes(candidate) || candidate.includes(haystack));
  };
  const scopedEntries = yearEntries.filter((entry) => {
    if (isPortfolioReportFilter) return isPortfolioGeneralEntry(entry);
    if (selectedObject) return matchesSelectedObject(entry);
    return true;
  });
  const income = scopedEntries.filter((entry) => entry.entry_type === "income").reduce((sum, entry) => sum + entry.amount, 0);
  const expenses = scopedEntries.filter((entry) => entry.entry_type === "expense").reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
  const rentItems = scopedEntries.filter((entry) => isRentLikeEntry(entry)).length;
  const reportObjectName = isPortfolioReportFilter ? PORTFOLIO_GENERAL_LABEL : selectedObject?.label ?? "Alle Immobilien";
  const reportSlug = `${slugifyReportPart(reportObjectName)}-${period}`;
  const matchesSelectedVacancy = (vacancy: UnitVacancy) => {
    if (!selectedObject) return true;
    if (vacancy.property_id === selectedObject.id) return true;
    const haystack = `${vacancy.object_label ?? ""} ${vacancy.object_code ?? ""} ${vacancy.property_id} ${vacancy.unit_label ?? ""}`.toLowerCase();
    const candidates = [selectedObject.label, selectedObject.code ?? "", selectedObject.id, ...(selectedObject.aliases ?? [])]
      .map((value) => value.toLowerCase().trim())
      .filter(Boolean);
    return candidates.some((candidate) => haystack.includes(candidate) || candidate.includes(haystack));
  };
  const scopedVacancies = isPortfolioReportFilter
    ? []
    : vacancies
      .filter((vacancy) => isVacancyInRange(vacancy, periodStart, periodEnd))
      .filter(matchesSelectedVacancy)
      .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  const scopedLoans = isPortfolioReportFilter
    ? []
    : selectedObject
      ? loanRows.filter((row) => {
        const rowName = row.property_name.toLowerCase();
        return row.property_id === selectedObject.id || rowName.includes(selectedObject.label.toLowerCase()) || selectedObject.label.toLowerCase().includes(rowName);
      })
      : loanRows;
  const taxAdvisorDashboard = buildTaxAdvisorDashboard({
    year: selectedYear,
    entries: yearEntries,
    loans: taxLoanRows,
    mileageTrips,
    objects,
  });
  const rentReportReady = getReadyRentReport() !== null;
  const vacancyReportReady = vacancyLoadedRange === vacancyRangeKey;
  const mileageReportReady = mileageLoadedYear === selectedYear;
  const taxLoanReportReady = taxLoanLoadedYear === selectedYear;

  useEffect(() => {
    let alive = true;

    async function loadVacancyRows() {
      try {
        setVacancyError(null);
        const rows = await listVacancies({ from: periodStart, to: periodEnd });
        if (alive) setVacancies(rows);
      } catch (error) {
        if (!alive) return;
        setVacancies([]);
        setVacancyError(error instanceof Error ? error.message : String(error));
      } finally {
        if (alive) setVacancyLoadedRange(vacancyRangeKey);
      }
    }

    void loadVacancyRows();
    return () => {
      alive = false;
    };
  }, [periodEnd, periodStart, vacancyRangeKey]);

  useEffect(() => {
    let alive = true;

    async function loadMileageRows() {
      try {
        setMileageError(null);
        const rows = await listMileageTrips({ year: selectedYear });
        if (alive) setMileageTrips(rows);
      } catch (error) {
        if (!alive) return;
        setMileageTrips([]);
        setMileageError(error instanceof Error ? error.message : String(error));
      } finally {
        if (alive) setMileageLoadedYear(selectedYear);
      }
    }

    void loadMileageRows();
    return () => {
      alive = false;
    };
  }, [selectedYear]);

  useEffect(() => {
    let alive = true;

    async function loadTaxLoanRows() {
      try {
        setTaxLoanError(null);
        const { data, error } = await supabase
          .from("property_loan_ledger")
          .select("property_id,year,interest,principal")
          .eq("year", selectedYear);
        if (error) throw error;
        if (alive) {
          const reportYearEntries = entries.filter((entry) => entry.booking_date?.startsWith(`${selectedYear}-`));
          const bookedSplits = objects.map((object) => {
            const rows = reportYearEntries.filter((entry) => (
              (entry.object_id === object.id || Boolean(entry.objekt_code && object.code && entry.objekt_code === object.code))
              && canonicalCategoryForTax(entry, object.label) === "Kreditrate"
              && entry.loan_interest_amount != null
              && entry.loan_principal_amount != null
            ));
            return {
              object,
              count: rows.length,
              interest: rows.reduce((sum, entry) => sum + Number(entry.loan_interest_amount ?? 0), 0),
              principal: rows.reduce((sum, entry) => sum + Number(entry.loan_principal_amount ?? 0), 0),
            };
          }).filter((item) => item.count > 0);

          const ledgerRows = (data ?? []).map((row) => ({
            property_id: String(row.property_id ?? ""),
            property_name: getPropertyName(String(row.property_id ?? "")),
            year: Number(row.year ?? selectedYear),
            interest: Number(row.interest ?? 0),
            principal: Number(row.principal ?? 0),
          }));
          const resolved = ledgerRows.map((row) => {
            const normalizedLoanName = row.property_name.toLowerCase();
            const split = bookedSplits.find((item) => {
              const objectName = item.object.label.toLowerCase();
              return row.property_id === item.object.id || normalizedLoanName.includes(objectName) || objectName.includes(normalizedLoanName);
            });
            return split ? { ...row, interest: split.interest, principal: split.principal } : row;
          });
          for (const split of bookedSplits) {
            const alreadyIncluded = resolved.some((row) => {
              const loanName = row.property_name.toLowerCase();
              const objectName = split.object.label.toLowerCase();
              return row.property_id === split.object.id || loanName.includes(objectName) || objectName.includes(loanName);
            });
            if (!alreadyIncluded) resolved.push({
              property_id: split.object.id,
              property_name: split.object.label,
              year: selectedYear,
              interest: split.interest,
              principal: split.principal,
            });
          }
          setTaxLoanRows(resolved);
        }
      } catch (error) {
        if (!alive) return;
        setTaxLoanRows([]);
        setTaxLoanError(error instanceof Error ? error.message : String(error));
      } finally {
        if (alive) setTaxLoanLoadedYear(selectedYear);
      }
    }

    void loadTaxLoanRows();
    return () => {
      alive = false;
    };
  }, [entries, getPropertyName, objects, selectedYear]);

  function reportActionReady(kind: ReportKind): boolean {
    if (appDataLoading) return false;
    if (kind === "rent-account") return rentReportReady;
    if (kind === "vacancy") return vacancyReportReady;
    if (kind === "section35a") return mileageReportReady;
    if (kind === "anlage-v-package") return mileageReportReady && taxLoanReportReady;
    if (kind === "tax") return objectFilter === "all" && rentReportReady && vacancyReportReady && mileageReportReady && taxLoanReportReady;
    if (kind === "tax-data-package") return rentReportReady && vacancyReportReady && mileageReportReady && taxLoanReportReady;
    return true;
  }

  async function runReportExport(kind: ReportKind, format: ReportFormat) {
    const exportKey = `${kind}:${format}`;
    if (!reportActionReady(kind) || activeExport) return;
    setActiveExport(exportKey);
    setExportMessage(null);
    try {
      await downloadReport(kind, format);
      setExportMessage(`${reportTitle(kind)} wurde als ${format.toUpperCase()} erstellt.`);
    } catch (error) {
      console.error("Berichtsexport fehlgeschlagen:", error);
      setExportMessage(error instanceof Error ? error.message : "Der Export konnte nicht erstellt werden.");
    } finally {
      setActiveExport(null);
    }
  }

  function reportTitle(kind: ReportKind): string {
    const titles: Record<ReportKind, string> = {
      tax: "Steuer-Report Anlage V",
      advisor: "Export für den Steuerberater",
      "anlage-v-package": "Anlage-V Exportpaket",
      section35a: "§35a Bericht Hohenloher Str. 78",
      "rent-account": "Mietkonto-Check und offene Zahlungen",
      utilities: "Nebenkostenabrechnungen",
      wealth: "Immobilien-Vermögen und Kredite",
      handover: "Übergabeprotokolle und Zählerstände",
      vacancy: "Leerstandsbericht",
      "tax-data-package": "Steuerberater-Datenpaket",
    };
    return titles[kind];
  }

  function entryRows(kind: ReportKind): FinanceEntry[] {
    if (kind === "rent-account") return scopedEntries.filter((entry) => isRentLikeEntry(entry));
    if (kind === "utilities") {
      return scopedEntries.filter((entry) => {
        const text = `${entry.category ?? ""} ${entry.note ?? ""}`.toLowerCase();
        return text.includes("nebenkosten") || text.includes("hausgeld") || text.includes("betriebskosten") || text.includes("nk");
      });
    }
    if (kind === "handover") {
      return scopedEntries.filter((entry) => {
        const text = `${entry.category ?? ""} ${entry.note ?? ""}`.toLowerCase();
        return text.includes("übergabe") || text.includes("uebergabe") || text.includes("zähler") || text.includes("zaehler") || text.includes("einzug") || text.includes("auszug");
      });
    }
    return scopedEntries;
  }

  function buildRentAccountLines(): string[] {
    const report = getReadyRentReport();
    if (!report) {
      return [
        `Zeitraum: ${period}`,
        "Quelle: Seite Mieteingang / Zahlungskalender",
        "Der Mietkonto-Jahresreport wird noch aus der Hauptquelle geladen.",
      ];
    }

    const kpiOrder: Array<keyof RentAnnualReportSnapshot["kpis"]> = [
      "1.-5. Tag",
      "6.-10. Tag",
      "11.-20. Tag",
      "ab 21. Tag",
      "Teilweise",
      "Fehlt",
      "Leerstand",
      "Neutral",
    ];

    return [
      `Objektfilter: ${reportObjectName}`,
      `Zeitraum: ${period}`,
      "Hauptquelle: Seite Mieteingang / Zahlungskalender",
      "Soll: Mietentwicklung/Mietanpassungen und Mieterregister. Ist: Buchungen. Leerstand: Seite Leerstand.",
      "",
      `Summe Zahlungseingänge: ${formatCurrency(report.totals.paid)}`,
      `Soll gesamt: ${formatCurrency(report.totals.expected)}`,
      `Noch offen: ${formatCurrency(report.totals.open)}`,
      `Überzahlung: ${formatCurrency(report.totals.overpaid)}`,
      "",
      "KPI Zahlungskalender:",
      ...kpiOrder.map((label) => `${label}: ${report.kpis[label]}`),
      "",
      "Jahressummen nach Immobilie:",
      ...report.propertyTotals.map((row) =>
        `${row.objectLabel} | Zahlungseingänge ${formatCurrency(row.paid)} | Soll ${formatCurrency(row.expected)} | Offen ${formatCurrency(row.open)} | Überzahlung ${formatCurrency(row.overpaid)}`
      ),
      "",
      "Monatsübersicht nach Immobilie und Einheit:",
      ...report.rows.flatMap((row) => [
        `${row.objectLabel} | ${row.unitLabel} | Mieter: ${row.tenantName} | Jahr Ist ${formatCurrency(row.yearPaid)} | Jahr Soll ${formatCurrency(row.yearExpected)} | Offen ${formatCurrency(row.yearOpen)} | Überzahlung ${formatCurrency(row.yearOverpaid)}`,
        ...row.months.map((month) =>
          `  ${month.monthLabel}: ${month.kpi} | Eingang ${formatCurrency(month.paid)} | Soll ${formatCurrency(month.expected)} | Offen ${formatCurrency(month.open)} | Überzahlung ${formatCurrency(month.overpaid)} | Eingang ${formatDate(month.paymentDate)} | Quelle ${month.expectedSource}`
        ),
      ]),
    ];
  }

  function getReadyRentReport(): RentAnnualReportSnapshot | null {
    const expectedObjectFilter = selectedObject?.id ?? "";
    return (
      rentAnnualReport
      && rentAnnualReport.year === selectedYear
      && rentAnnualReport.objectFilter === expectedObjectFilter
    ) ? rentAnnualReport : null;
  }

  function buildAnlageVReportDataRows(): AnlageVReportDataRow[] {
    const bookingRows: AnlageVReportDataRow[] = buildAnlageVBookingExportRows(taxAdvisorDashboard);
    const readyRentReport = getReadyRentReport();
    const openPaymentRows: AnlageVReportDataRow[] = readyRentReport
      ? readyRentReport.rows.flatMap((rentRow) => {
          const profile = getTaxObjectProfileForLabel(`${rentRow.objectLabel} ${rentRow.unitLabel}`);
          if (!profile || profile.usage === "self_used_weg") return [];
          const taxReport = taxAdvisorDashboard.AnlageVReports.find((report) => report.profile.key === profile.key);
          return rentRow.months
            .filter((month) => month.open > 0)
            .map((month) => ({
              recordType: "Offene Miete" as const,
              taxYear: selectedYear,
              objectId: profile.taxObjectId,
              objectName: profile.reportLabel,
              livingAreaM2: taxReport?.livingAreaM2 ?? (profile.usage === "rented_parking" ? 0 : null),
              bookingDate: "",
              categoryName: "Kaltmiete",
              officialFormLine: profile.usage === "rented_parking" ? "Anlage V Zeilen 16-18 (andere Räume)" : "Anlage V Zeilen 13-15 (Wohnraum)",
              bookingText: `${month.monthLabel} ${selectedYear} | Soll ${formatCurrency(month.expected)} | offen ${formatCurrency(month.open)} | ${rentRow.tenantName}`,
              incomeAmount: 0,
              expenseAmount: 0,
              apportionableStatus: "Nicht anwendbar" as const,
              paymentStatus: "Offen" as const,
              reviewStatus: "Exportiert" as const,
            }));
        })
      : [];

    const vacancyRows: AnlageVReportDataRow[] = scopedVacancies.flatMap((vacancy) => {
      const profile = getTaxObjectProfileForLabel(`${vacancy.object_label ?? ""} ${vacancy.object_code ?? ""} ${vacancy.unit_label ?? ""}`);
      if (!profile || profile.usage === "self_used_weg") return [];
      const taxReport = taxAdvisorDashboard.AnlageVReports.find((report) => report.profile.key === profile.key);
      return [{
        recordType: "Leerstand" as const,
        taxYear: selectedYear,
        objectId: profile.taxObjectId,
        objectName: profile.reportLabel,
        livingAreaM2: taxReport?.livingAreaM2 ?? (profile.usage === "rented_parking" ? 0 : null),
        bookingDate: vacancy.start_date,
        categoryName: "Leerstand",
        officialFormLine: "Zusatzbericht - Nachweis der Vermietungsabsicht",
        bookingText: `${formatDate(vacancy.start_date)} bis ${vacancy.end_date ? formatDate(vacancy.end_date) : "offen"} | ${vacancy.reason ?? "-"} | ${vacancy.notes ?? ""}`,
        incomeAmount: 0,
        expenseAmount: 0,
        apportionableStatus: "Nicht anwendbar" as const,
        paymentStatus: "Nicht anwendbar" as const,
        reviewStatus: "Exportiert" as const,
      }];
    });

    return [...bookingRows, ...openPaymentRows, ...vacancyRows]
      .sort((left, right) => left.objectName.localeCompare(right.objectName, "de") || left.bookingDate.localeCompare(right.bookingDate));
  }

  function buildReportLines(kind: ReportKind): string[] {
    if (kind === "tax-data-package") {
      return buildTaxDataPackageLines();
    }

    if (kind === "tax") {
      const dataRows = buildAnlageVReportDataRows();
      const blockedCount = dataRows.filter((row) => row.reviewStatus === "Blockiert").length;
      const reviewCount = dataRows.filter((row) => row.reviewStatus === "Prüfung erforderlich").length;
      return [
        `Steuer-Report Anlage V ${selectedYear}`,
        "Datenbasis: Buchungen, Darlehensmodul, Fahrtenbuch, Mieteingang, Leerstand und Immobilien-Stammdaten.",
        "Zeitraumregel: Es werden ausschließlich tatsächliche Zahlungsdaten vom 01.01. bis 31.12. des Steuerjahres berücksichtigt (§ 11 EStG).",
        "Ausschluss: Hohenloher Str. 78 ist selbstgenutzt und vollständig aus Anlage V ausgeschlossen.",
        "Hausgeldregel: Rücklagenzuführungen und nicht aufgeschlüsselte Hausgeldzahlungen werden nicht als Werbungskosten abgezogen.",
        "Formularzeilen: Zuordnung nach amtlicher ELSTER-Hilfe zur Anlage V 2025; für spätere Steuerjahre vor Abgabe mit dem dann gültigen Formular abgleichen.",
        "",
        `Steuerobjekte: ${taxAdvisorDashboard.AnlageVReports.length} (4 Wohnungen und 3 getrennte TG-Stellplätze)`,
        `Datensätze: ${dataRows.length}`,
        `Blockiert: ${blockedCount}`,
        `Prüfung erforderlich: ${reviewCount}`,
        taxLoanError ? `Hinweis Darlehenszinsen: ${taxLoanError}` : "",
        mileageError ? `Hinweis Fahrtenbuch: ${mileageError}` : "",
        vacancyError ? `Hinweis Leerstand: ${vacancyError}` : "",
        "",
        ...taxAdvisorDashboard.AnlageVReports.flatMap((report, index) => [
          `${index + 1}. ${report.profile.reportLabel}`,
          ...buildAnlageVReportLines(report).map((line) => (line ? `  ${line}` : "")),
          "",
        ]),
        "Detailnachweis je Buchung:",
        ...dataRows.map((row) => `${row.bookingDate || "-"} | ${row.objectId} | ${row.categoryName} | ${row.officialFormLine} | Einnahme ${formatCurrency(row.incomeAmount)} | Ausgabe ${formatCurrency(row.expenseAmount)} | umlagefähig ${row.apportionableStatus} | Zahlung ${row.paymentStatus} | ${row.reviewStatus} | ${row.bookingText}`),
      ];
    }

    if (kind === "anlage-v-package") {
      return [
        `Steuerjahr: ${period}`,
        "Exportbereich A: Anlage V - 7 separate Steuerobjekte",
        "",
        ...taxAdvisorDashboard.AnlageVReports.flatMap((report, index) => [
          `${index + 1}. ${report.profile.reportLabel}`,
          ...buildAnlageVReportLines(report).map((line) => (line ? `  ${line}` : "")),
          "",
        ]),
        taxAdvisorDashboard.warnings.length ? "Pruefhinweise:" : "",
        ...taxAdvisorDashboard.warnings.map((warning) => `- ${warning}`),
      ].filter((line, index, list) => line || list[index - 1] !== "");
    }

    if (kind === "section35a") {
      return [
        `Steuerjahr: ${period}`,
        "Exportbereich B: §35a EStG - nur Hohenloher Str. 78",
        "",
        ...buildSection35aReportLines(taxAdvisorDashboard.section35aReport),
        mileageError ? `Hinweis: Fahrtenbuch konnte nicht vollständig geladen werden: ${mileageError}` : "",
      ].filter(Boolean);
    }

    if (kind === "vacancy") {
      const vacancyLines = scopedVacancies.map((vacancy) => {
        const endDate = vacancy.end_date ?? "offen";
        return `${formatDate(vacancy.start_date)} bis ${formatDate(endDate)} | Status: ${vacancy.status || "-"} | ${vacancy.object_label || vacancy.object_code || reportObjectName} | ${vacancy.unit_label || "Gesamte Immobilie"} | ${vacancy.reason ?? "-"} | ${vacancy.notes ?? ""}`;
      });
      return [
        `Objekt: ${reportObjectName}`,
        `Zeitraum: ${period}`,
        `Leerstandszeiträume: ${scopedVacancies.length}`,
        "",
        "Steuerliche Dokumentation:",
        "Leerstand wird als Nachweis fuer Vermietungsabsicht und Einnahmeausfall dokumentiert. Es wird keine künstliche Einnahme- oder Ausgabenbuchung erzeugt.",
        "",
        "Leerstände:",
        ...(vacancyLines.length ? vacancyLines : ["Für diese Filterauswahl wurden keine Leerstände dokumentiert."]),
        vacancyError ? `Hinweis: Leerstände konnten nicht vollständig geladen werden: ${vacancyError}` : "",
      ].filter(Boolean);
    }

    if (kind === "rent-account") {
      return buildRentAccountLines();
    }

    const rows = entryRows(kind);
    const reportIncome = rows.filter((entry) => entry.entry_type === "income").reduce((sum, entry) => sum + entry.amount, 0);
    const reportExpenses = rows.filter((entry) => entry.entry_type === "expense").reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
    const lines = [
      `Objekt: ${reportObjectName}`,
      `Zeitraum: ${period}`,
      `Buchungen: ${rows.length}`,
      `Einnahmen: ${formatCurrency(reportIncome)}`,
      `Ausgaben: ${formatCurrency(reportExpenses)}`,
      `Saldo: ${formatCurrency(reportIncome - reportExpenses)}`,
      "",
      "Buchungen:",
      ...rows
        .sort((a, b) => String(a.booking_date ?? "").localeCompare(String(b.booking_date ?? "")))
        .slice(0, 40)
        .map((entry) => `${formatDate(entry.booking_date)} | ${getPropertyName(entry.object_id) || entry.objekt_code || reportObjectName} | ${entry.entry_type === "expense" ? "Ausgabe" : "Einnahme"} | ${entry.category ?? "-"} | ${formatCurrency(entry.amount)} | ${entry.note ?? ""}`),
    ];
    if (kind === "wealth") {
      lines.push("", "Darlehen:");
      scopedLoans.forEach((loan) => {
        lines.push(`${loan.property_name}: Restschuld ${formatCurrency(loan.last_balance ?? 0)}, Zinsen ${formatCurrency(loan.interest_total ?? 0)}, Tilgung ${formatCurrency(loan.principal_total ?? 0)}`);
      });
    }
    if (!rows.length) {
      lines.push("Für diese Filterauswahl wurden keine passenden Buchungen gefunden. Der Bericht dokumentiert die leere Auswahl nachvollziehbar.");
    }
    return lines;
  }

  function buildTaxDataPackageLines(): string[] {
    const sections: Array<{ title: string; kind: ReportKind }> = [
      { title: "1. Anlage-V-Paket fuer Steuerberater", kind: "anlage-v-package" },
      { title: "2. Steuer-Report Anlage V", kind: "tax" },
      { title: "3. Mietkonto-Check und offene Zahlungen", kind: "rent-account" },
      { title: "4. Immobilien-Vermoegen und Kredite", kind: "wealth" },
      { title: "5. Leerstandsbericht", kind: "vacancy" },
      { title: "6. Paragraf 35a Bericht Hohenloher Str. 78", kind: "section35a" },
      { title: "7. Export fuer den Steuerberater", kind: "advisor" },
      { title: "8. Nebenkostenabrechnungen", kind: "utilities" },
    ];

    return [
      `Steuerjahr: ${period}`,
      "Paketinhalt: Alle steuerrelevanten Jahresunterlagen in einem zusammengefuehrten PDF.",
      "Quelle: Buchhaltung, Darlehen, Leerstand, Fahrtenbuch, Mietregister und Immobilienvermoegen.",
      "Hinweis: Allgemein / Portfolio-Ausgaben werden anteilig auf die vermieteten Anlage-V-Objekte verteilt; Hohenloher Str. 78 bleibt fuer Anlage V gesperrt.",
      "",
      ...sections.flatMap((section) => [
        `${section.title}:`,
        ...buildReportLines(section.kind),
        "",
      ]),
      "Paket-Pruefhinweise:",
      ...(taxAdvisorDashboard.warnings.length ? taxAdvisorDashboard.warnings.map((warning) => `- ${warning}`) : ["- Keine offenen Steuerhinweise im aktuellen Dashboard."]),
      mileageError ? `- Fahrtenbuch-Hinweis: ${mileageError}` : "",
      vacancyError ? `- Leerstand-Hinweis: ${vacancyError}` : "",
    ].filter(Boolean);
  }

  function buildReportCsv(kind: ReportKind): string {
    if (kind === "tax") {
      return buildCsv([
        "Datensatztyp",
        "Steuerjahr",
        "Objekt_ID",
        "Objekt_Name",
        "Wohnflaeche_qm",
        "Buchungsdatum_Zahlung",
        "Kategorie_Name",
        "Amtliche_Formularzeile",
        "Buchungstext_Verwendungszweck",
        "Einnahme_Betrag",
        "Ausgabe_Betrag",
        "Umlagefaehig_Status",
        "Zahlungsstatus",
        "Pruefstatus",
      ], buildAnlageVReportDataRows().map((row) => [
        row.recordType,
        row.taxYear,
        row.objectId,
        row.objectName,
        row.livingAreaM2 ?? "",
        row.bookingDate,
        row.categoryName,
        row.officialFormLine,
        row.bookingText,
        row.incomeAmount,
        row.expenseAmount,
        row.apportionableStatus,
        row.paymentStatus,
        row.reviewStatus,
      ]));
    }

    if (kind === "tax-data-package") {
      return buildCsv(["Bereich", "Datei", "Format", "Beschreibung"], [
        ["Anlage V", `anlage-v/steuerberater-jahresakte-${period}.pdf`, "PDF", "Zusammengefuehrter Objektbericht mit Verwaltungskosten & Pauschalen"],
        ["Anlage V", `anlage-v/gesamtuebersicht-${period}.csv`, "CSV", "Felder 1 bis 7 je vermietetem Objekt"],
        ["Steuer", `steuer-report-anlage-v-${period}.pdf`, "PDF", "Allgemeine Anlage-V-Jahresuebersicht"],
        ["Mietkonto", `mietkonto-check-${period}.pdf`, "PDF", "Mietzahlungen und offene Posten"],
        ["Vermoegen", `immobilien-vermoegen-kredite-${period}.pdf`, "PDF", "Objektwerte, Darlehen und Zins-/Tilgungswerte"],
        ["Leerstand", `leerstandsbericht-${period}.pdf`, "PDF", "Leerstand mit Status, Beginn und Ende"],
        ["§35a", `35a-hohenloher-str-78-${period}.pdf`, "PDF", "Selbstgenutztes Objekt, Arbeitslohn und Barzahlungspruefung"],
        ["Steuerberater", `export-steuerberater-${period}.xlsx`, "Excel", "Strukturierte Uebergabedaten"],
        ["Nebenkosten", `nebenkostenabrechnungen-${period}.pdf`, "PDF", "Nebenkosten- und Betriebskostenuebersicht"],
        ["Portfolio", `portfolio-ausgaben-${period}.csv`, "CSV", "Allgemein / Portfolio-Ausgaben mit anteiliger Steuerlogik"],
      ]);
    }

    if (kind === "anlage-v-package") {
      const rows = taxAdvisorDashboard.AnlageVReports.map((report) => [
        report.profile.reportLabel,
        report.profile.usage === "rented_parking" ? "Stellplatz-Vermietung" : "Wohnraumvermietung",
        report.income,
        report.buildingAfa,
        report.inventoryAfa,
        report.loanInterest,
        report.maintenance,
        report.runningCosts,
        report.administrationCosts,
        report.portfolioAdministrationShare,
        report.mileageTravelCosts,
        report.mileageVmaCosts,
        report.mileageHotelCosts,
        report.businessMealDeductible,
        report.telecommunicationDeductible,
        report.net,
      ]);
      return buildCsv([
        "Objekt",
        "Status",
        "Feld 1 Mieteinnahmen",
        "Feld 2 AfA",
        "Feld 3 Inventar-AfA",
        "Feld 4 Schuldzinsen",
        "Feld 5 Erhaltungsaufwand",
        "Feld 6 Betriebs-/Nebenkosten",
        "Feld 7 Verwaltungskosten",
        "davon Portfolio-Ausgaben anteilig",
        "davon Fahrt/Ticket",
        "davon VMA",
        "davon Hotel",
        "davon Bewirtungskosten 70%",
        "davon Telefon/Internet anteilig",
        "Ergebnis",
      ], rows);
    }

    if (kind === "section35a") {
      const report = taxAdvisorDashboard.section35aReport;
      return buildCsv(["Objekt", "Steuerjahr", "Haushaltsnah Arbeitslohn", "Handwerker Arbeitslohn", "davon Handwerker-Fahrtkosten §35a", "Homeoffice-Fahrtkosten", "Barzahlungen ausgeschlossen", "Homeoffice %", "Homeoffice abziehbar"], [[
        report.profile.reportLabel,
        period,
        report.householdServicesLabor,
        report.craftsmanLabor,
        report.section35aTripCosts,
        report.homeOfficeTripCosts,
        report.excludedCashPayments.length,
        report.homeOfficePercentage,
        report.homeOfficeDeductible,
      ]]);
    }

    if (kind === "vacancy") {
      const rows = scopedVacancies.map((vacancy) => [
        vacancy.object_label || vacancy.object_code || reportObjectName,
        vacancy.unit_label || "Gesamte Immobilie",
        formatDate(vacancy.start_date),
        vacancy.end_date ? formatDate(vacancy.end_date) : "offen",
        vacancy.status,
        vacancy.reason ?? "",
        vacancy.notes ?? "",
        "Nachweis fuer Steuererklaerung / Vermietungsabsicht",
      ]);
      return buildCsv(["Objekt", "Einheit", "Beginn", "Ende", "Status", "Grund", "Notiz", "Steuerhinweis"], rows);
    }

    if (kind === "rent-account") {
      const report = getReadyRentReport();
      const rows = report ? report.rows.flatMap((row) => row.months.map((month) => [
        row.objectLabel,
        row.unitLabel,
        row.tenantName,
        period,
        month.monthLabel,
        month.kpi,
        month.status === "none" ? "Nicht ausgewertet" : month.status,
        month.paid,
        month.expected,
        month.open,
        month.overpaid,
        month.paymentDate ?? "",
        month.expectedSource,
        row.yearPaid,
        row.yearExpected,
        row.yearOpen,
        row.yearOverpaid,
      ])) : [];
      return buildCsv([
        "Immobilie",
        "Einheit",
        "Mieter",
        "Jahr",
        "Monat",
        "KPI",
        "Status",
        "Zahlungseingang",
        "Soll",
        "Noch offen",
        "Überzahlung",
        "Zahlungsdatum",
        "Soll-Quelle",
        "Jahr Ist",
        "Jahr Soll",
        "Jahr offen",
        "Jahr Überzahlung",
      ], rows);
    }

    const rows = entryRows(kind)
      .sort((a, b) => String(a.booking_date ?? "").localeCompare(String(b.booking_date ?? "")))
      .map((entry) => [
        formatDate(entry.booking_date),
        getPropertyName(entry.object_id) || entry.objekt_code || reportObjectName,
        entry.entry_type === "expense" ? "Ausgabe" : "Einnahme",
        entry.category ?? "",
        entry.note ?? "",
        entry.amount,
      ]);
    return buildCsv(["Datum", "Objekt", "Typ", "Kategorie", "Notiz", "Betrag"], rows);
  }

  function buildSummaryText(kind: ReportKind): string {
    return [
      reportTitle(kind),
      `Objekt: ${reportObjectName}`,
      `Zeitraum: ${period}`,
      `Erstellt: ${new Date().toLocaleString("de-DE")}`,
      "",
      ...buildReportLines(kind),
    ].join("\n");
  }

  async function downloadTaxDataPackage(format: ReportFormat) {
    const packageSlug = `steuerberater-datenpaket-${period}`;
    const packageTitle = `Steuerberater-Datenpaket ${period}`;
    const combinedPdf = createSimplePdf(packageTitle, buildTaxDataPackageLines());

    if (format === "pdf") {
      downloadBlob(`${packageSlug}.pdf`, combinedPdf);
      return;
    }

    if (format === "csv") {
      downloadBlob(`${packageSlug}-index.csv`, new Blob([`\uFEFF${buildReportCsv("tax-data-package")}`], { type: "text/csv;charset=utf-8" }));
      return;
    }

    if (format === "excel") {
      downloadBlob(`${packageSlug}-index.xls`, new Blob([`\uFEFF${csvToExcelHtml(packageTitle, buildReportCsv("tax-data-package"))}`], { type: "application/vnd.ms-excel;charset=utf-8" }));
      return;
    }

    const packageKinds: Array<{ folder: string; filename: string; kind: ReportKind }> = [
      { folder: "01-anlage-v", filename: `anlage-v-paket-${period}`, kind: "anlage-v-package" },
      { folder: "02-steuer-report", filename: `steuer-report-anlage-v-${period}`, kind: "tax" },
      { folder: "03-mietkonto", filename: `mietkonto-check-${period}`, kind: "rent-account" },
      { folder: "04-vermoegen-kredite", filename: `immobilien-vermoegen-kredite-${period}`, kind: "wealth" },
      { folder: "05-leerstand", filename: `leerstandsbericht-${period}`, kind: "vacancy" },
      { folder: "06-35a-hohenloher", filename: `35a-hohenloher-str-78-${period}`, kind: "section35a" },
      { folder: "07-steuerberater-export", filename: `export-steuerberater-${period}`, kind: "advisor" },
      { folder: "08-nebenkosten", filename: `nebenkostenabrechnungen-${period}`, kind: "utilities" },
    ];

    const rentedReportCount = taxAdvisorDashboard.AnlageVReports.length || 1;
    const portfolioExpenseRows = taxAdvisorDashboard.AnlageVReports.flatMap((report) =>
      report.portfolioAdministrationRows.map((entry) => {
        const amount = Math.abs(Number(entry.amount ?? 0));
        return [report.profile.reportLabel, entry.booking_date ?? "", entry.category ?? "", amount, amount / rentedReportCount, entry.note ?? ""];
      })
    );

    const readyRentReport = getReadyRentReport();
    if (!readyRentReport) {
      window.alert("Der Mietkonto-Jahresreport wird noch aus der Seite Mieteingang geladen. Bitte einen Moment warten und den Export erneut starten.");
      return;
    }

    const files: Array<{ name: string; content: string | Blob }> = [
      { name: `${packageSlug}/00-zusammengefuehrter-steuerberater-report-${period}.pdf`, content: combinedPdf },
      { name: `${packageSlug}/00-paket-index.csv`, content: buildReportCsv("tax-data-package") },
      { name: `${packageSlug}/00-paket-index.xls`, content: csvToExcelHtml(packageTitle, buildReportCsv("tax-data-package")) },
      { name: `${packageSlug}/00-lesemich.txt`, content: buildSummaryText("tax-data-package") },
      { name: `${packageSlug}/portfolio-ausgaben/portfolio-ausgaben-${period}.csv`, content: buildCsv(["Objekt", "Datum", "Kategorie", "Gesamtbetrag", "Objektanteil", "Notiz"], portfolioExpenseRows) },
      { name: `${packageSlug}/portfolio-ausgaben/portfolio-ausgaben-${period}.xls`, content: csvToExcelHtml(`Portfolio-Ausgaben ${period}`, buildCsv(["Objekt", "Datum", "Kategorie", "Gesamtbetrag", "Objektanteil", "Notiz"], portfolioExpenseRows)) },
      { name: `${packageSlug}/hinweis.txt`, content: "Dieses Datenpaket ist nach Steuerjahr gefiltert. Das zusammengefuehrte PDF ist die Leseakte; CSV/XLS-Dateien dienen der Detailpruefung. Allgemein / Portfolio-Ausgaben sind gesondert enthalten und werden in Anlage V anteilig verteilt." },
    ];

    packageKinds.forEach((item) => {
      const csv = buildReportCsv(item.kind);
      files.push(
        {
          name: `${packageSlug}/${item.folder}/${item.filename}.pdf`,
          content: item.kind === "rent-account"
            ? createRentAccountPdf(readyRentReport, reportObjectName)
            : createSimplePdf(reportTitle(item.kind), buildReportLines(item.kind)),
        },
        { name: `${packageSlug}/${item.folder}/${item.filename}.csv`, content: csv },
        { name: `${packageSlug}/${item.folder}/${item.filename}.xls`, content: csvToExcelHtml(reportTitle(item.kind), csv) },
        { name: `${packageSlug}/${item.folder}/${item.filename}.txt`, content: buildSummaryText(item.kind) },
      );
    });

    downloadBlob(`${packageSlug}.zip`, await createZipWithBinary(files));
  }

  async function downloadReport(kind: ReportKind, format: ReportFormat) {
    if (kind === "tax-data-package") {
      await downloadTaxDataPackage(format);
      return;
    }

    if (kind === "rent-account" && !getReadyRentReport()) {
      window.alert("Der Mietkonto-Jahresreport wird noch aus der Seite Mieteingang geladen. Bitte einen Moment warten und den Export erneut starten.");
      return;
    }

    const baseName = kind === "tax"
      ? `Steuer-Report_Anlage_V_${period}`
      : `${slugifyReportPart(reportTitle(kind))}-${reportSlug}`;
    if (kind === "anlage-v-package" && format === "zip") {
      const rentedReportCount = taxAdvisorDashboard.AnlageVReports.length || 1;
      const portfolioExpenseRows = taxAdvisorDashboard.AnlageVReports.flatMap((report) =>
        report.portfolioAdministrationRows.map((entry) => {
          const amount = Math.abs(Number(entry.amount ?? 0));
          return [
            report.profile.reportLabel,
            entry.booking_date ?? "",
            entry.category ?? "",
            amount,
            amount / rentedReportCount,
            entry.note ?? "",
          ];
        })
      );
      const portfolioExpenseText = [
        `Portfolio-Ausgaben fuer Anlage V ${period}`,
        "Quelle: Buchhaltung, Zuordnung Allgemein / Portfolio-Ausgabe.",
        "Diese Positionen werden nicht einer einzelnen Immobilie direkt zugeordnet, sondern anteilig auf die 7 vermieteten Anlage-V-Steuerobjekte verteilt. Hohenloher Str. 78 bleibt ausgeschlossen.",
        "",
        "Typische Kategorien: Steuerberater, Software, Kontofuehrungsgebuehr, Buero / Porto, Verwaltungskosten.",
        "",
        ...(portfolioExpenseRows.length
          ? portfolioExpenseRows.map((row) => `${row[1]} | ${row[0]} | ${row[2]} | Gesamt ${formatCurrency(Number(row[3]))} | Objektanteil ${formatCurrency(Number(row[4]))} | ${row[5]}`)
          : ["Keine Portfolio-Ausgaben fuer diesen Zeitraum gefunden."]),
      ].join("\n");
      const files = [
        { name: `anlage-v/steuerberater-jahresakte-${period}.txt`, content: buildSummaryText("anlage-v-package") },
        {
          name: `anlage-v/portfolio-ausgaben-steuerberater-${period}.csv`,
          content: buildCsv(["Objekt", "Datum", "Kategorie", "Gesamtbetrag", "Objektanteil", "Notiz"], portfolioExpenseRows),
        },
        { name: `anlage-v/portfolio-ausgaben-steuerberater-${period}.txt`, content: portfolioExpenseText },
        ...taxAdvisorDashboard.AnlageVReports.flatMap((report) => {
          const name = slugifyReportPart(`${report.profile.reportLabel}-${period}`);
          return [
            { name: `anlage-v/${name}.txt`, content: buildAnlageVReportLines(report).join("\n") },
            {
              name: `anlage-v/${name}.csv`,
              content: buildCsv(["Feld", "Wert"], [
                [report.incomeLabel, report.income],
                ["Gebaeude-/Teileigentum-AfA", report.buildingAfa],
                ["Einbaukuechen & Inventar-AfA", report.inventoryAfa],
                ["Schuldzinsen", report.loanInterest],
                ["Erhaltungsaufwand", report.maintenance],
                ["Laufende Betriebs- & Nebenkosten", report.runningCosts],
                ["Verwaltungskosten & Pauschalen", report.administrationCosts],
                ["davon Portfolio-Ausgaben anteilig", report.portfolioAdministrationShare],
                ["Reisekosten gesamt", report.mileageCosts],
                ["Fahrt/Ticket", report.mileageTravelCosts],
                ["Verpflegungsmehraufwand", report.mileageVmaCosts],
                ["Hotelkosten", report.mileageHotelCosts],
                ["Bewirtungskosten 70%-Anteil", report.businessMealDeductible],
                ["Telefon-/Internetkosten anteilig", report.telecommunicationDeductible],
                ["Vorlaeufiges Ergebnis", report.net],
              ]),
            },
          ];
        }),
        { name: "anlage-v/gesamtuebersicht.csv", content: buildReportCsv("anlage-v-package") },
        { name: "hinweis.txt", content: `Anlage V: Hohenloher Str. 78 ist wegen Status Selbstgenutzt / WEG technisch ausgeschlossen. Die drei Rosenstein-Stellplätze P250, P253 und P254 werden als getrennte Steuerobjekte ausgewiesen.\n\nSteuerberater-, Software-, Kontofuehrungs- und sonstige Portfolio-Ausgaben finden Sie in anlage-v/portfolio-ausgaben-steuerberater-${period}.csv sowie im jeweiligen Objektbericht unter Feld 7.` },
      ];
      downloadBlob(`${baseName}.zip`, createZip(files));
      return;
    }

    if (format === "csv") {
      downloadBlob(`${baseName}.csv`, new Blob([`\uFEFF${buildReportCsv(kind)}`], { type: "text/csv;charset=utf-8" }));
      return;
    }
    if (format === "excel") {
      downloadBlob(`${baseName}.xls`, new Blob([`\uFEFF${csvToExcelHtml(reportTitle(kind), buildReportCsv(kind))}`], { type: "application/vnd.ms-excel;charset=utf-8" }));
      return;
    }
    if (format === "pdf") {
      const content = kind === "rent-account"
        ? createRentAccountPdf(getReadyRentReport()!, reportObjectName)
        : createSimplePdf(reportTitle(kind), buildReportLines(kind));
      downloadBlob(`${baseName}.pdf`, content);
      return;
    }
    downloadBlob(`${baseName}.zip`, createZip([
      { name: `${baseName}.csv`, content: buildReportCsv(kind) },
      { name: `${baseName}.txt`, content: buildSummaryText(kind) },
      { name: "hinweis.txt", content: "Dieses Paket wurde aus dem aktuellen Filter der Seite Berichte & Exporte erzeugt. Die Buchhaltung bleibt die Datenquelle." },
    ]));
  }

  const reportCards = [
    {
      title: "Steuerberater-Datenpaket",
      description: "Ein Jahrespaket mit zusammengefuehrtem PDF, Einzel-PDFs, CSV-/Excel-Tabellen und Portfolio-Ausgaben fuer die direkte Uebergabe an den Steuerberater.",
      icon: PackageCheck,
      actions: [
        { label: "Data-Package ZIP", kind: "tax-data-package", format: "zip", primary: true },
        { label: "Zusammengeführtes PDF", kind: "tax-data-package", format: "pdf" },
        { label: "Paket-Index Excel", kind: "tax-data-package", format: "excel" },
        { label: "Paket-Index CSV", kind: "tax-data-package", format: "csv" },
      ],
    },
    {
      title: "Anlage-V-Paket für Steuerberater",
      description: "Erzeugt 7 getrennte Steuerobjekte: 4 Wohnungen plus die Rosenstein-Stellplätze P250, P253 und P254. Hohenloher bleibt gesperrt.",
      icon: FileText,
      actions: [
        { label: "Anlage-V-Paket ZIP", kind: "anlage-v-package", format: "zip", primary: true },
        { label: "Jahresakte-PDF", kind: "anlage-v-package", format: "pdf" },
        { label: "Excel", kind: "anlage-v-package", format: "excel" },
        { label: "Gesamtübersicht CSV", kind: "anlage-v-package", format: "csv" },
      ],
    },
    {
      title: "Steuer-Report (Anlage V)",
      description: "Fachlicher Detailreport für alle Immobilien nach Zahlungsdatum mit Formularzeile, Wohnfläche, getrennten Miet-/Kostenarten, Hausgeld-Sperre, Leerstand und offenen Mieten. Objektfilter: Alle Objekte.",
      icon: Euro,
      actions: [
        { label: "PDF herunterladen", kind: "tax", format: "pdf", primary: true },
        { label: "Excel", kind: "tax", format: "excel" },
        { label: "CSV", kind: "tax", format: "csv" },
      ],
    },
    {
      title: "Mietkonto-Check & Offene Zahlungen",
      description: "Jahresreport aus der Hauptquelle Mieteingang: Zahlungskalender, farbliche Zahlungs-KPIs sowie Ist, Soll, offen und Überzahlung je Immobilie.",
      icon: CalendarCheck,
      actions: [
        { label: "PDF herunterladen", kind: "rent-account", format: "pdf", primary: true },
        { label: "Excel", kind: "rent-account", format: "excel" },
        { label: "CSV", kind: "rent-account", format: "csv" },
      ],
    },
    {
      title: "Immobilien-Vermögen & Kredite",
      description: "Objektwerte, Restschulden, Zins- und Tilgungswerte für Bank, Finanzierung und Vermögensübersicht.",
      icon: Landmark,
      actions: [
        { label: "Vermögens-PDF", kind: "wealth", format: "pdf", primary: true },
        { label: "Excel", kind: "wealth", format: "excel" },
        { label: "CSV", kind: "wealth", format: "csv" },
      ],
    },
    {
      title: "Leerstandsbericht",
      description: "Dokumentiert Leerstandszeiträume mit Status, Beginn, Ende, Grund und Notiz für Steuerberater und Anlage-V-Nachweis.",
      icon: DoorOpen,
      actions: [
        { label: "PDF herunterladen", kind: "vacancy", format: "pdf", primary: true },
        { label: "Excel", kind: "vacancy", format: "excel" },
        { label: "CSV", kind: "vacancy", format: "csv" },
      ],
    },
    {
      title: "§35a-Bericht Hohenloher Str. 78",
      description: "Isolierter Bericht für haushaltsnahe Dienstleistungen und Handwerkerleistungen. Barzahlungen werden ausgeschlossen und als Warnung dokumentiert.",
      icon: ShieldCheck,
      actions: [
        { label: "§35a-PDF", kind: "section35a", format: "pdf", primary: true },
        { label: "Excel", kind: "section35a", format: "excel" },
        { label: "CSV", kind: "section35a", format: "csv" },
      ],
    },
    {
      title: "Export für den Steuerberater",
      description: "Strukturierte Export-Datei mit Buchungen, Objektbezug, Kategorien und Jahresfilter für die Übergabe.",
      icon: BriefcaseBusiness,
      actions: [
        { label: "PDF", kind: "advisor", format: "pdf", primary: true },
        { label: "Excel", kind: "advisor", format: "excel" },
        { label: "CSV", kind: "advisor", format: "csv" },
      ],
    },
    {
      title: "Nebenkostenabrechnungen (PDF-Paket)",
      description: "Bündelt Nebenkosten- und Betriebskostenbuchungen für Wohnungen und Tiefgarage als Übergabepaket.",
      icon: ReceiptText,
      actions: [
        { label: "PDF herunterladen", kind: "utilities", format: "pdf", primary: true },
        { label: "Excel", kind: "utilities", format: "excel" },
        { label: "CSV", kind: "utilities", format: "csv" },
        { label: "ZIP-Paket", kind: "utilities", format: "zip" },
      ],
    },
  ] satisfies Array<{
    title: string;
    description: string;
    icon: LucideIcon;
    actions: Array<{ label: string; kind: ReportKind; format: ReportFormat; primary?: boolean }>;
  }>;

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Ausgewertete Buchungen" value={scopedEntries.length} detail={reportObjectName} icon={WalletCards} tone="blue" />
        <KpiCard label="Einnahmen" value={formatCurrency(income)} detail={period} icon={TrendingUp} tone="green" />
        <KpiCard label="Ausgaben" value={formatCurrency(expenses)} detail={`${rentItems} Mietbuchungen erkannt`} icon={ReceiptText} tone="red" />
        <KpiCard label="Leerstände" value={scopedVacancies.length} detail={vacancyError ? "Leerstand konnte nicht geladen werden" : "Zeiträume im Filter"} icon={DoorOpen} tone={scopedVacancies.length ? "amber" : "slate"} />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Anlage-V-Berichte" value={taxAdvisorDashboard.AnlageVReports.length} detail="4 Wohnungen + TG-Stellplätze" icon={FileText} tone="blue" />
        <KpiCard label="§35a Arbeitslohn" value={formatTaxCurrency(taxAdvisorDashboard.section35aReport.householdServicesLabor + taxAdvisorDashboard.section35aReport.craftsmanLabor)} detail="Hohenloher Str. 78" icon={ShieldCheck} tone="green" />
        <KpiCard label="Barzahlung gesperrt" value={taxAdvisorDashboard.section35aReport.excludedCashPayments.length} detail="aus §35a ausgeschlossen" icon={ReceiptText} tone={taxAdvisorDashboard.section35aReport.excludedCashPayments.length ? "amber" : "slate"} />
        <KpiCard label="Steuerhinweise" value={taxAdvisorDashboard.warnings.length} detail={mileageError ? "Fahrtenbuch prüfen" : "Berechnungsprüfung"} icon={Bell} tone={taxAdvisorDashboard.warnings.length || mileageError ? "amber" : "green"} />
      </section>

      <SectionPanel
        eyebrow="Exportfilter"
        title="Bericht vorbereiten"
        description="Wählen Sie Objekt und Zeitraum. Alle Export-Kacheln erzeugen ihre Datei direkt aus genau dieser gefilterten Auswahl."
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <label className="grid gap-2 text-sm font-black text-slate-700">
            Welches Objekt möchten Sie auswerten?
            <select
              value={objectFilter}
              onChange={(event) => setObjectFilter(event.target.value)}
              className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-950 shadow-sm"
            >
              <option value="all">Alle Objekte</option>
              <option value="portfolio">{PORTFOLIO_GENERAL_LABEL}</option>
              {objects.map((object) => (
                <option key={object.id} value={object.id}>{object.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-black text-slate-700">
            Zeitraum
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-950 shadow-sm"
            >
              <option value="2025">Steuerjahr 2025</option>
              <option value={String(currentYear)}>Aktuelles Jahr ({currentYear})</option>
              <option value={String(currentYear - 1)}>Vorjahr ({currentYear - 1})</option>
            </select>
          </label>
        </div>
      </SectionPanel>

      <section className="grid gap-4 lg:grid-cols-2">
        {exportMessage ? (
          <div role="status" className="lg:col-span-2 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-900">
            {exportMessage}
          </div>
        ) : null}
        {reportCards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.title} className="rounded-[24px] border border-white/70 bg-white/84 p-5 shadow-[0_14px_34px_rgba(51,65,85,0.07)] backdrop-blur">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eef7f4] text-[#255f6f] ring-1 ring-teal-100">
                  <Icon size={20} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-black text-slate-950">{card.title}</h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[#5c6a7e]">{card.description}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {card.title === "Mietkonto-Check & Offene Zahlungen" ? (
                  <ReportActionButton
                    label="Jahresreport anzeigen"
                    primary
                    onClick={() => rentReportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  />
                ) : null}
                {card.actions.map((action) => (
                  <ReportActionButton
                    key={action.label}
                    label={action.label}
                    primary={action.primary}
                    disabled={!reportActionReady(action.kind) || activeExport !== null}
                    busy={activeExport === `${action.kind}:${action.format}`}
                    onClick={() => void runReportExport(action.kind, action.format)}
                  />
                ))}
              </div>
            </article>
          );
        })}
      </section>

      <section ref={rentReportRef} className="scroll-mt-24">
        <SectionPanel
          eyebrow="Mietkonto-Check & Offene Zahlungen"
          title={`Mieteingang Jahresübersicht ${period}`}
          description="Dieser Report verwendet direkt den Zahlungskalender der Seite Mieteingang. Änderungen an Buchungen, Mietanpassungen, Mietverträgen oder Leerständen fließen dadurch ohne parallele Datenquelle ein."
        >
          <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-500">Mietkonto-Jahresreport wird geladen…</div>}>
            <Mietuebersicht
              key={`rent-account-${selectedYear}-${selectedObject?.id ?? "all"}`}
              embeddedAnnualReport
              reportYear={selectedYear}
              reportObjectId={selectedObject?.id ?? null}
              onAnnualReportChange={setRentAnnualReport}
            />
          </Suspense>
        </SectionPanel>
      </section>

      <SectionPanel
        eyebrow="Hinweis"
        title="Steuerberater-Paket sauber vorbereiten"
        description="Prüfen Sie vor dem Export offene Buchungen, fehlende Objektzuordnungen und Darlehenszinsen. So bleiben Anlage V, Bankunterlagen und Mieterübersichten konsistent."
      />
    </div>
  );
}

type MaintenanceTask = {
  id: string;
  backendId?: string;
  title: string;
  objectId: string;
  objectLabel: string;
  dueDate: string;
  contractor: string;
  category: string;
  status: "Neu" | "In Arbeit" | "Erledigt" | "Archiviert";
  priority: "Normal" | "Hoch";
  note: string;
  createdAt: string;
  source: "aufgabe" | "schaden" | "handwerker";
  backendCategory: PropertyTaskCategory;
  backendPriority: PropertyTaskPriority;
  backendStatus: PropertyTaskStatus;
  history: Array<Record<string, unknown>>;
  meta: Record<string, unknown>;
};

type TaskPageMode = "aufgabe" | "schaden" | "handwerker";

const taskModeCopy: Record<TaskPageMode, { category: string; contractor: string; titlePlaceholder: string; description: string }> = {
  aufgabe: {
    category: "Verwaltung",
    contractor: "Intern",
    titlePlaceholder: "z. B. Wasserhahn in Bad prüfen lassen",
    description: "Aufgaben werden als zentrale Arbeitsliste und Kalenderfrist sichtbar.",
  },
  schaden: {
    category: "Schadenmeldung",
    contractor: "Mieter / Intern",
    titlePlaceholder: "z. B. Wasserschaden Bad dokumentieren",
    description: "Schadenmeldungen werden als Aufgaben-Ticket mit Verlauf gespeichert.",
  },
  handwerker: {
    category: "Handwerker-Beauftragung",
    contractor: "Handwerker offen",
    titlePlaceholder: "z. B. Angebot Sanitärbetrieb einholen",
    description: "Handwerker-Beauftragungen laufen in derselben Arbeitsliste mit Status und Historie.",
  },
};

function statusToBackend(status: MaintenanceTask["status"]): PropertyTaskStatus {
  if (status === "In Arbeit") return "in_bearbeitung";
  if (status === "Erledigt") return "erledigt";
  if (status === "Archiviert") return "archiviert";
  return "offen";
}

function statusFromBackend(status: PropertyTaskStatus): MaintenanceTask["status"] {
  if (status === "in_bearbeitung") return "In Arbeit";
  if (status === "erledigt") return "Erledigt";
  if (status === "archiviert") return "Archiviert";
  return "Neu";
}

function priorityFromBackend(priority: PropertyTaskPriority): MaintenanceTask["priority"] {
  return priority === "hoch" || priority === "kritisch" ? "Hoch" : "Normal";
}

function backendPriorityFromPriority(priority: MaintenanceTask["priority"]): PropertyTaskPriority {
  return priority === "Hoch" ? "hoch" : "mittel";
}

function taskCategoryToBackend(category: string): PropertyTaskCategory {
  const normalized = category.toLowerCase();
  if (normalized.includes("schaden") || normalized.includes("handwerker") || normalized.includes("reparatur")) return "capex";
  if (normalized.includes("leerstand")) return "leerstand";
  if (normalized.includes("mieter") || normalized.includes("miete")) return "miete";
  if (normalized.includes("nebenkosten") || normalized.includes("nk")) return "nk";
  if (normalized.includes("dokument")) return "dokument";
  if (normalized.includes("darlehen")) return "darlehen";
  if (normalized.includes("prüfung")) return "prüfung";
  return "allgemein";
}

function taskSourceFromMeta(meta: Record<string, unknown> | null | undefined): TaskPageMode {
  const value = String(meta?.task_source ?? meta?.kind ?? "");
  if (value === "schaden") return "schaden";
  if (value === "handwerker") return "handwerker";
  return "aufgabe";
}

function taskDisplayCategory(row: PropertyTaskRow): string {
  const metaCategory = typeof row.meta?.display_category === "string" ? row.meta.display_category : "";
  if (metaCategory) return metaCategory;
  if (row.category === "capex") return "Reparatur / Mangel";
  if (row.category === "leerstand") return "Leerstand";
  if (row.category === "prüfung") return "Gesetzliche Prüfung";
  return "Verwaltung";
}

function mapPropertyTaskRow(row: PropertyTaskRow, todayIso: string): MaintenanceTask {
  const status = statusFromBackend(row.status);
  const priority = priorityFromBackend(row.priority);
  return {
    id: row.id,
    backendId: row.id,
    title: row.title,
    objectId: row.property_id ?? row.portfolio_property_id ?? row.objekt_code ?? "all",
    objectLabel: row.property_name ?? "Allgemeine Aufgabe",
    dueDate: row.due_date ?? todayIso,
    contractor: typeof row.meta?.contractor === "string" ? row.meta.contractor : "Noch nicht zugeordnet",
    category: taskDisplayCategory(row),
    status,
    priority,
    note: row.description ?? "",
    createdAt: row.created_at?.slice(0, 10) ?? todayIso,
    source: taskSourceFromMeta(row.meta),
    backendCategory: row.category,
    backendPriority: row.priority,
    backendStatus: row.status,
    history: Array.isArray(row.meta?.history) ? row.meta.history as Array<Record<string, unknown>> : [],
    meta: row.meta ?? {},
  };
}

function TaskMonthCalendar({
  monthDate,
  tasks,
  todayIso,
  onSelectTask,
}: {
  monthDate: Date;
  tasks: MaintenanceTask[];
  todayIso: string;
  onSelectTask: (task: MaintenanceTask) => void;
}) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const monthLabel = monthDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1);
  const dayCount = new Date(year, month + 1, 0).getDate();
  const leadingEmptyDays = (firstDay.getDay() + 6) % 7;
  const calendarCells = [
    ...Array.from({ length: leadingEmptyDays }, (_, index) => ({ key: `empty-${index}`, iso: "", day: 0, tasks: [] as MaintenanceTask[] })),
    ...Array.from({ length: dayCount }, (_, index) => {
      const day = index + 1;
      const iso = toIsoDate(new Date(year, month, day));
      return {
        key: iso,
        iso,
        day,
        tasks: tasks.filter((task) => task.dueDate === iso),
      };
    }),
  ];

  return (
    <article className="rounded-[22px] border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 rounded-t-[22px] border-b border-slate-100 bg-[#1f667a] px-4 py-3 text-white">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/70">Kalender</p>
          <h3 className="mt-0.5 text-base font-black capitalize">{monthLabel}</h3>
        </div>
        <CalendarCheck size={19} />
      </div>
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => (
          <div key={day} className="px-1 py-2">{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {calendarCells.map((cell) => {
          const isToday = cell.iso === todayIso;
          const hasOverdue = cell.tasks.some((task) => task.dueDate < todayIso && task.status !== "Erledigt");
          return (
            <div key={cell.key} className={["relative min-h-[50px] border-b border-r border-slate-100 p-1.5 last:border-r-0", !cell.day ? "bg-slate-50/60" : "bg-white"].join(" ")}>
              {cell.day ? (
                <>
                  <div className={[
                    "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black",
                    isToday ? "bg-[#1f667a] text-white" : hasOverdue ? "bg-rose-100 text-rose-800" : "text-slate-600",
                  ].join(" ")}>
                    {cell.day}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {cell.tasks.slice(0, 3).map((task) => {
                      const isOverdue = task.dueDate < todayIso && task.status !== "Erledigt";
                      const markerClass = task.status === "Erledigt"
                        ? "bg-emerald-500 ring-emerald-100"
                        : isOverdue
                          ? "bg-rose-500 ring-rose-100"
                          : task.priority === "Hoch"
                            ? "bg-amber-500 ring-amber-100"
                            : "bg-blue-500 ring-blue-100";
                      return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => onSelectTask(task)}
                        className={[
                          "group/task relative h-3.5 w-3.5 rounded-full ring-2 transition hover:scale-110 focus-visible:outline-none focus-visible:ring-4",
                          markerClass,
                        ].join(" ")}
                        title={task.title}
                      >
                        <span className="sr-only">{task.title}</span>
                        <span className="pointer-events-none absolute left-1/2 top-5 z-50 hidden w-72 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-3 text-left text-sm leading-5 text-slate-700 shadow-2xl group-hover/task:block group-focus-visible/task:block">
                          <span className="block text-base font-black text-slate-950">{task.title}</span>
                          <span className="mt-1 block text-xs font-bold text-slate-500">{task.objectLabel}</span>
                          <span className="mt-2 block text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                            {new Date(`${task.dueDate}T00:00:00`).toLocaleDateString("de-DE")} · {task.status}{isOverdue ? " · überfällig" : ""}
                          </span>
                          {task.note ? <span className="mt-2 block text-sm font-semibold text-slate-700">{task.note}</span> : null}
                        </span>
                      </button>
                      );
                    })}
                    {cell.tasks.length > 3 ? <div className="text-[10px] font-black leading-4 text-slate-500">+{cell.tasks.length - 3}</div> : null}
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </article>
  );
}

function TasksMaintenancePage({ mode = "aufgabe" }: { mode?: TaskPageMode }) {
  const { objects } = useAppData();
  const { user } = useAuth();
  const isAdmin = isAdminEmail(user?.email);
  const modeDefaults = taskModeCopy[mode];
  const todayIso = new Date().toISOString().slice(0, 10);
  const [objectFilter, setObjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selectedTask, setSelectedTask] = useState<MaintenanceTask | null>(null);
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [taskStatus, setTaskStatus] = useState("");
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [form, setForm] = useState({
    id: "",
    title: "",
    objectId: objects[0]?.id ?? "all",
    dueDate: todayIso,
    category: modeDefaults.category,
    contractor: modeDefaults.contractor,
    status: "Neu" as MaintenanceTask["status"],
    priority: "Normal" as MaintenanceTask["priority"],
    note: "",
  });

  const loadTasks = useCallback(async () => {
    setLoadingTasks(true);
    setTaskStatus("");
    try {
      const rows = await listPropertyTasks();
      setTasks(rows.map((row) => mapPropertyTaskRow(row, todayIso)));
    } catch (error) {
      setTasks([]);
      setTaskStatus(error instanceof Error ? error.message : "Aufgaben konnten nicht geladen werden.");
    } finally {
      setLoadingTasks(false);
    }
  }, [todayIso]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTasks();
  }, [loadTasks]);

  const visibleTasks = tasks.filter((task) => task.status !== "Archiviert");
  const overdueTasks = visibleTasks.filter((task) => task.dueDate < todayIso && task.status !== "Erledigt");
  const currentMonthDate = useMemo(() => new Date(), []);
  const nextMonthDate = useMemo(() => addMonthsToDate(new Date(), 1), []);
  const filteredTasks = tasks.filter((task) => {
    if (objectFilter !== "all" && task.objectId !== objectFilter) return false;
    if (statusFilter === "all" && task.status === "Archiviert") return false;
    if (statusFilter === "overdue" && !(task.dueDate < todayIso && task.status !== "Erledigt")) return false;
    if (statusFilter !== "all" && statusFilter !== "overdue" && task.status !== statusFilter) return false;
    if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
    return true;
  });

  function resetTaskForm() {
    setForm({
      id: "",
      title: "",
      objectId: objects[0]?.id ?? "all",
      dueDate: todayIso,
      category: modeDefaults.category,
      contractor: modeDefaults.contractor,
      status: "Neu",
      priority: "Normal",
      note: "",
    });
    setSelectedTask(null);
  }

  function beginEditTask(task: MaintenanceTask) {
    setSelectedTask(task);
    setForm({
      id: task.backendId ?? task.id,
      title: task.title,
      objectId: task.objectId,
      dueDate: task.dueDate,
      category: task.category,
      contractor: task.contractor,
      status: task.status,
      priority: task.priority,
      note: task.note,
    });
  }

  const handleSaveTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin || savingTask) return;
    const object = objects.find((item) => item.id === form.objectId);
    const title = form.title.trim();
    if (!title) return;
    setSavingTask(true);
    setTaskStatus("Speichert...");
    try {
      const existingTask = form.id ? tasks.find((task) => task.backendId === form.id || task.id === form.id) : null;
      const historyAction = form.id ? "aktualisiert" : "erstellt";
      const saved = await savePropertyTask({
        id: form.id || undefined,
        propertyId: object?.id ?? null,
        portfolioPropertyId: null,
        objektCode: object?.id ?? null,
        propertyName: object?.label ?? "Allgemeine Aufgabe",
        title,
        description: form.note.trim() || null,
        category: taskCategoryToBackend(form.category),
        priority: backendPriorityFromPriority(form.priority),
        status: statusToBackend(form.status),
        dueDate: form.dueDate || todayIso,
        source: "manuell",
        meta: {
          task_source: mode,
          display_category: form.category,
          contractor: form.contractor,
          history: [
            ...(existingTask?.history ?? []),
            {
              at: new Date().toISOString(),
              action: historyAction,
              label: form.category,
              status: form.status,
            },
          ],
        },
      });
      const mapped = mapPropertyTaskRow(saved, todayIso);
      setTasks((current) => [mapped, ...current.filter((task) => task.id !== mapped.id)]);
      setSelectedTask(mapped);
      setTaskStatus("Aufgabe gespeichert.");
      resetTaskForm();
    } catch (error) {
      setTaskStatus(error instanceof Error ? error.message : "Aufgabe konnte nicht gespeichert werden.");
    } finally {
      setSavingTask(false);
    }
  };

  async function handleArchiveTask(task: MaintenanceTask) {
    if (!isAdmin || !task.backendId) return;
    setTaskStatus("Archiviert...");
    try {
      const archived = await savePropertyTask({
        id: task.backendId,
        propertyId: task.objectId === "all" ? null : task.objectId,
        portfolioPropertyId: null,
        objektCode: task.objectId === "all" ? null : task.objectId,
        propertyName: task.objectLabel,
        title: task.title,
        description: task.note || null,
        category: task.backendCategory,
        priority: task.backendPriority,
        status: "archiviert",
        dueDate: task.dueDate,
        source: "manuell",
        meta: {
          task_source: task.source,
          display_category: task.category,
          contractor: task.contractor,
          history: [
            ...task.history,
            {
              at: new Date().toISOString(),
              action: "archiviert",
              label: task.category,
              status: "Archiviert",
            },
          ],
        },
      });
      const mapped = mapPropertyTaskRow(archived, todayIso);
      setTasks((current) => current.map((item) => item.id === mapped.id ? mapped : item));
      setSelectedTask(mapped);
      setTaskStatus("Aufgabe archiviert.");
    } catch (error) {
      setTaskStatus(error instanceof Error ? error.message : "Archivieren fehlgeschlagen.");
    }
  }

  async function handleDeleteTask(task: MaintenanceTask) {
    if (!isAdmin || !task.backendId) return;
    const confirmed = window.confirm(`Aufgabe "${task.title}" wirklich löschen?`);
    if (!confirmed) return;
    setTaskStatus("Löscht...");
    try {
      const isGeneratedVacancyTask = task.source === "aufgabe" && task.backendCategory === "leerstand" && task.meta?.source === "unit_vacancies";
      if (isGeneratedVacancyTask) {
        await savePropertyTask({
          id: task.backendId,
          propertyId: task.objectId === "all" ? null : task.objectId,
          portfolioPropertyId: null,
          objektCode: task.objectId === "all" ? null : task.objectId,
          propertyName: task.objectLabel,
          title: task.title,
          description: task.note || null,
          category: task.backendCategory,
          priority: task.backendPriority,
          status: "archiviert",
          dueDate: task.dueDate,
          source: "system",
          meta: {
            ...task.meta,
            dismissed_at: new Date().toISOString(),
            deleted_at: new Date().toISOString(),
            history: [
              ...task.history,
              {
                at: new Date().toISOString(),
                action: "gelöscht",
                label: task.category,
                status: "Archiviert",
              },
            ],
          },
        });
      } else {
        await deletePropertyTask(task.backendId);
      }
      setTasks((current) => current.filter((item) => item.id !== task.id));
      resetTaskForm();
      setTaskStatus("Aufgabe gelöscht.");
    } catch (error) {
      setTaskStatus(error instanceof Error ? error.message : "Löschen fehlgeschlagen.");
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-4">
        <KpiCard label="Offene Aufgaben" value={visibleTasks.filter((task) => task.status !== "Erledigt").length} icon={ListChecks} tone="blue" />
        <KpiCard label="Überfällig" value={overdueTasks.length} icon={Bell} tone="red" />
        <KpiCard label="In Arbeit" value={visibleTasks.filter((task) => task.status === "In Arbeit").length} icon={FolderKanban} tone="violet" />
        <KpiCard label="Erledigt" value={tasks.filter((task) => task.status === "Erledigt").length} icon={ShieldCheck} tone="green" />
      </section>

      <SectionPanel eyebrow="Kalenderübersicht" title="Vorgeplante Aufgaben im Kalender" description="Fälligkeiten aus Ihren Aufgaben werden im aktuellen und nächsten Monat als Kalenderübersicht sichtbar. Klicken Sie auf einen Eintrag, um die Aufgabe zu öffnen.">
        <div className="grid gap-4 xl:grid-cols-2">
          <TaskMonthCalendar monthDate={currentMonthDate} tasks={visibleTasks} todayIso={todayIso} onSelectTask={beginEditTask} />
          <TaskMonthCalendar monthDate={nextMonthDate} tasks={visibleTasks} todayIso={todayIso} onSelectTask={beginEditTask} />
        </div>
      </SectionPanel>

      <section className="grid gap-5 2xl:grid-cols-[minmax(360px,0.72fr)_minmax(0,1.68fr)]">
        <SectionPanel eyebrow={form.id ? "Bearbeiten" : "Neue Aufgabe"} title={form.id ? "Vorgang bearbeiten" : mode === "schaden" ? "Schadenmeldung anlegen" : mode === "handwerker" ? "Handwerker-Beauftragung anlegen" : "Neue Aufgabe anlegen"} description={modeDefaults.description}>
          <form onSubmit={handleSaveTask} className="grid gap-3 text-[13px]">
            <label className="grid gap-2 font-black leading-5 text-slate-700">
              Was ist zu tun?
              <input
                disabled={!isAdmin}
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder={modeDefaults.titlePlaceholder}
                className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-bold text-slate-950 shadow-sm placeholder:text-slate-400"
              />
            </label>
            <div className="grid gap-4">
              <label className="grid min-w-0 gap-2 font-black leading-5 text-slate-700">
                Immobilie / Einheit
                <select
                  disabled={!isAdmin}
                  value={form.objectId}
                  onChange={(event) => setForm((current) => ({ ...current, objectId: event.target.value }))}
                  className="min-h-11 w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-bold text-slate-950 shadow-sm"
                >
                  {objects.map((object) => (
                    <option key={object.id} value={object.id}>{object.label}</option>
                  ))}
                  <option value="all">Allgemein</option>
                </select>
              </label>
              <label className="grid min-w-0 gap-2 font-black leading-5 text-slate-700">
                Fällig bis
                <input
                  type="date"
                  disabled={!isAdmin}
                  value={form.dueDate}
                  onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
                  className="min-h-11 w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-bold text-slate-950 shadow-sm"
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 font-black leading-5 text-slate-700">
                Art der Aufgabe
                <select disabled={!isAdmin} value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-bold text-slate-950 shadow-sm">
                  <option>Schadenmeldung</option>
                  <option>Handwerker-Beauftragung</option>
                  <option>Reparatur / Mangel</option>
                  <option>Verwaltung</option>
                  <option>Mieterwechsel</option>
                  <option>Gesetzliche Prüfung</option>
                </select>
              </label>
              <label className="grid gap-2 font-black leading-5 text-slate-700">
                Status
                <select disabled={!isAdmin} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as MaintenanceTask["status"] }))} className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-bold text-slate-950 shadow-sm">
                  <option>Neu</option>
                  <option>In Arbeit</option>
                  <option>Erledigt</option>
                  <option>Archiviert</option>
                </select>
              </label>
              <label className="grid gap-2 font-black leading-5 text-slate-700">
                Priorität
                <select disabled={!isAdmin} value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as MaintenanceTask["priority"] }))} className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-bold text-slate-950 shadow-sm">
                  <option>Normal</option>
                  <option>Hoch</option>
                </select>
              </label>
            </div>
            <label className="grid gap-2 font-black leading-5 text-slate-700">
              Zuständig / Handwerker
              <input disabled={!isAdmin} value={form.contractor} onChange={(event) => setForm((current) => ({ ...current, contractor: event.target.value }))} placeholder="z. B. Intern, Handwerker offen, Firma..." className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-bold text-slate-950 shadow-sm placeholder:text-slate-400" />
            </label>
            <label className="grid gap-2 font-black leading-5 text-slate-700">
              Details zur Aufgabe
              <textarea
                disabled={!isAdmin}
                value={form.note}
                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                placeholder="Notiz, Ansprechpartner, gewünschtes Ergebnis..."
                rows={4}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[13px] font-semibold leading-5 text-slate-950 shadow-sm placeholder:text-slate-400"
              />
            </label>
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-[13px] font-bold leading-6 text-blue-900">
              Diese Eingabe wird zentral gespeichert und erscheint unter Aufgaben, Schadenmeldungen und Handwerker-Beauftragung in derselben Arbeitsliste.
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={!isAdmin || savingTask || !form.title.trim()} className="rounded-2xl bg-slate-950 px-5 py-3 text-[13px] font-black text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">
                {savingTask ? "Speichert..." : form.id ? "Änderung speichern" : "Aufgabe speichern"}
              </button>
              {form.id ? <button type="button" onClick={resetTaskForm} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-[13px] font-black text-slate-900 shadow-sm">Neu erfassen</button> : null}
            </div>
            {taskStatus ? <p className="text-[13px] font-bold leading-5 text-slate-500">{taskStatus}</p> : null}
          </form>
        </SectionPanel>

        <SectionPanel eyebrow="Arbeitsliste" title="Aufgaben & Instandhaltung" description="Klicken Sie auf eine Aufgabe, um Status, Verlauf und Dokumentation zu prüfen.">
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <select value={objectFilter} onChange={(event) => setObjectFilter(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold text-slate-950">
              <option value="all">Alle Objekte</option>
              {objects.map((object) => <option key={object.id} value={object.id}>{object.label}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold text-slate-950">
              <option value="all">Alle Status</option>
              <option value="overdue">Überfällige Aufgaben</option>
              <option value="Neu">Neu</option>
              <option value="In Arbeit">In Arbeit</option>
              <option value="Erledigt">Erledigt</option>
              <option value="Archiviert">Archiviert</option>
            </select>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold text-slate-950">
              <option value="all">Alle Prioritäten</option>
              <option value="Hoch">Hoch</option>
              <option value="Normal">Normal</option>
            </select>
          </div>
          {filteredTasks.length ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              {filteredTasks.map((task) => (
                <article
                  key={task.id}
                  className="grid w-full gap-3 border-b border-slate-100 bg-white p-4 text-left last:border-b-0 hover:bg-[#f8fbfa] xl:grid-cols-[minmax(190px,1.25fr)_minmax(150px,0.9fr)_105px_minmax(130px,0.8fr)_120px_110px]"
                >
                  <button type="button" onClick={() => beginEditTask(task)} className="text-left">
                    <p className="text-[13px] font-black leading-5 text-slate-950">{task.title}</p>
                    <p className="mt-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{task.category}</p>
                  </button>
                  <div className="text-[13px] font-bold leading-5 text-slate-600">{task.objectLabel}</div>
                  <div className="whitespace-nowrap text-[13px] font-black text-slate-950">{formatDate(task.dueDate)}</div>
                  <div className="text-[13px] font-bold leading-5 text-slate-600">{task.contractor}</div>
                  <div className="xl:justify-self-end">
                    <span className={[
                      "inline-flex min-h-8 items-center rounded-full px-3 text-[11px] font-black uppercase tracking-[0.12em]",
                      task.status === "Erledigt" ? "bg-emerald-50 text-emerald-800" : task.priority === "Hoch" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800",
                    ].join(" ")}>
                      {task.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    <button type="button" onClick={() => beginEditTask(task)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-black text-slate-700">Bearbeiten</button>
                    <button type="button" disabled={!isAdmin || task.status === "Archiviert"} onClick={() => void handleArchiveTask(task)} className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[12px] font-black text-blue-800 disabled:opacity-50">Archiv</button>
                    <button type="button" disabled={!isAdmin} onClick={() => void handleDeleteTask(task)} className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[12px] font-black text-red-800 disabled:opacity-50">Löschen</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title={loadingTasks ? "Aufgaben werden geladen" : "Aktuell stehen keine Aufgaben an"}
              description={loadingTasks ? "Die zentrale Aufgabenliste wird aus der Datenbank geladen." : "Neue Aufgaben erscheinen hier, sobald sie angelegt oder aus einem Vorgang abgeleitet werden."}
            />
          )}
        </SectionPanel>
      </section>

      {selectedTask ? (
        <div className="fixed inset-0 z-50 bg-slate-950/35 p-3 backdrop-blur-sm sm:p-5" onClick={() => setSelectedTask(null)}>
          <aside className="ml-auto flex h-full max-w-2xl flex-col overflow-hidden rounded-[24px] bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Aufgabe nachverfolgen</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">{selectedTask.title}</h2>
              </div>
              <button type="button" onClick={() => setSelectedTask(null)} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700" aria-label="Aufgabe schließen">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <InfoList
                items={[
                  { label: "Status", value: selectedTask.status, tone: selectedTask.status === "Erledigt" ? "green" : "blue" },
                  { label: "Erstellt am", value: formatDate(selectedTask.createdAt), tone: "slate" },
                  { label: "Zugeordnet zu", value: selectedTask.contractor, tone: "violet" },
                  { label: "Angehängte Dokumente", value: "Noch keine Datei", tone: "slate" },
                ]}
              />
              <SectionPanel title="Verlauf & Dokumentation" description="Statusänderungen, Notizen und Nachweise werden hier chronologisch gesammelt.">
                <div className="grid gap-3">
                  {(selectedTask.history.length ? selectedTask.history : [
                    {
                      at: selectedTask.createdAt,
                      action: "erstellt",
                      label: selectedTask.category,
                      status: selectedTask.status,
                    },
                  ]).map((entry, index) => {
                    const entryDate = typeof entry.at === "string" ? entry.at.slice(0, 10) : selectedTask.createdAt;
                    const entryAction = typeof entry.action === "string" ? entry.action : "aktualisiert";
                    const entryLabel = typeof entry.label === "string" ? entry.label : selectedTask.category;
                    const entryStatus = typeof entry.status === "string" ? entry.status : selectedTask.status;
                    return (
                      <div key={`${entryDate}-${entryAction}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-700">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{formatDate(entryDate)}</p>
                        <p className="mt-1 text-slate-950">{entryAction}: {entryLabel}</p>
                        <p className="mt-1 text-xs text-slate-500">Status: {entryStatus}</p>
                      </div>
                    );
                  })}
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-900">
                    Aufgabe automatisch im Kalender für {formatDate(selectedTask.dueDate)} vorgemerkt.
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => beginEditTask(selectedTask)} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm">Bearbeiten</button>
                  <button type="button" disabled={!isAdmin || selectedTask.status === "Archiviert"} onClick={() => void handleArchiveTask(selectedTask)} className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-3 text-sm font-black text-blue-800 disabled:opacity-50">Archivieren</button>
                  <button type="button" disabled={!isAdmin} onClick={() => void handleDeleteTask(selectedTask)} className="rounded-2xl border border-red-100 bg-red-50 px-5 py-3 text-sm font-black text-red-800 disabled:opacity-50">Löschen</button>
                </div>
              </SectionPanel>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function AppShell() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openMobileGroups, setOpenMobileGroups] = useState<Set<string>>(
    () => new Set(["Dashboard", "Immobilien", "Immobilienvermögen", "Mieter", "Buchhaltung"]),
  );
  const { user } = useAuth();
  const location = useLocation();
  const isAdmin = isAdminEmail(user?.email);
  const isReadOnly = !isAdmin && isReadonlyApprovalEmail(user?.email);
  const activeAuswertungView = location.pathname === "/auswertungen"
    ? new URLSearchParams(location.search).get("view") ?? "cockpit"
    : "";

  const navItems = useMemo<ShellNavItem[]>(
    () => [
      { to: "/dashboard/finanz-kennzahlen", label: "Cockpit", group: "Dashboard", icon: LayoutDashboard },
      { to: "/dashboard/warnmeldungen", label: "Warnungen", group: "Dashboard", icon: Bell },
      { to: "/immobilien/immobilie-anlegen", label: "Immobilie anlegen", group: "Immobilien", icon: PlusCircle },
      { to: "/leerstand", label: "Leerstand", group: "Immobilien", icon: DoorOpen },
      { to: "/immobilienvermoegen", label: "Dashboard", group: "Immobilienvermögen", icon: Landmark },
      { to: "/immobilienvermoegen/lilienthaler-str-54", label: "Lilienthaler Str. 54", group: "Immobilienvermögen", icon: Building2 },
      { to: "/immobilienvermoegen/elsasser-str-52", label: "Elsasser Str. 52", group: "Immobilienvermögen", icon: Building2 },
      { to: "/immobilienvermoegen/colmarer-str-45", label: "Colmarer Str. 45", group: "Immobilienvermögen", icon: Building2 },
      { to: "/immobilienvermoegen/fuerther-str-74", label: "Fürther Str. 74", group: "Immobilienvermögen", icon: Building2 },
      { to: "/immobilienvermoegen/hohenloher-str-78", label: "Hohenloher Str. 78", group: "Immobilienvermögen", icon: Building2 },
      { to: "/immobilienvermoegen/rosensteinstr-25", label: "Rosensteinstr. 25", group: "Immobilienvermögen", icon: Building2 },
      { to: "/investment-bericht", label: "Investment-Bericht", group: "Investment", icon: BookOpenCheck },
      { to: "/mieter/register", label: "Mieterregister", group: "Mieter", icon: Users },
      { to: "/mieter/stammdaten", label: "Stammdaten", group: "Mieter", icon: Users },
      { to: "/mieter/mietentwicklung", label: "Mietentwicklung", group: "Mieter", icon: TrendingUp },
      { to: "/mieter/mieteingang", label: "Mieteingang", group: "Mieter", icon: CalendarCheck },
      { to: "/ein-auszug", label: "Ein-/Auszug", group: "Mieter", icon: KeyRound },
      { to: "/buchhaltung/einnahmen-ausgaben", label: "Einnahmen & Ausgaben", group: "Buchhaltung", icon: PlusCircle },
      { to: "/buchhaltung/buchungen", label: "Buchungen", group: "Buchhaltung", icon: WalletCards },
      { to: "/buchhaltung/steuer-center-berater", label: "Steuer", group: "Buchhaltung", icon: Euro },
      { to: "/buchhaltung/fahrtenbuch", label: "Fahrtenbuch", group: "Buchhaltung", icon: Car },
      { to: "/buchhaltung/berichte-exporte", label: "Berichte & Exporte", group: "Buchhaltung", icon: BarChart3 },
      { to: "/darlehen", label: "Übersicht", group: "Darlehen", icon: Landmark },
      { to: "/nebenkosten", label: "Übersicht", group: "Nebenkosten", icon: ClipboardList },
      { to: "/nebenkosten/wohnungen", label: "Wohnungen", group: "Nebenkosten", icon: Building2 },
      { to: "/nebenkosten/tiefgarage", label: "Tiefgarage", group: "Nebenkosten", icon: DoorOpen },
      { to: "/mahnwesen", label: "Mahnwesen", group: "Aufgaben", icon: Bell },
      { to: "/ticketsystem/schadenmeldungen", label: "Tickets", group: "Aufgaben", icon: FolderKanban },
      { to: "/dokumente", label: "Archiv", group: "Dokumente", icon: FolderOpen },
      { to: "/einstellungen/benutzer-rechteverwaltung", label: "Benutzer & Rechte", group: "Einstellungen", icon: UserCog },
      ...(isAdmin ? [{ to: "/einstellungen/datenschutz-compliance", label: "Datenschutz", group: "Einstellungen", icon: ShieldCheck }] : []),
    ],
    [isAdmin],
  );

  const navGroups = useMemo(
    () =>
      ["Dashboard", "Immobilien", "Immobilienvermögen", "Investment", "Mieter", "Buchhaltung", "Darlehen", "Nebenkosten", "Aufgaben", "Dokumente", "Einstellungen"].map((group) => ({
        group,
        items: navItems.filter((item) => item.group === group),
      })).filter((group) => group.items.length > 0),
    [navItems],
  );

  function toggleMobileGroup(group: string) {
    setOpenMobileGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  return (
    <ReadOnlyInteractionGuard enabled={isReadOnly}>
    <div className={["min-h-screen text-slate-950", isReadOnly ? "app-readonly" : ""].filter(Boolean).join(" ")}>
      <img src={logo} alt="Koenen Property Management Logo" className="app-global-print-logo" />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[286px] flex-col border-r border-white/10 bg-[linear-gradient(180deg,#102535_0%,#132a38_48%,#0d1824_100%)] text-white shadow-[18px_0_52px_rgba(15,23,42,0.20)] xl:flex">
        <NavLink
          to="/dashboard/finanz-kennzahlen"
          className="flex flex-col items-stretch gap-2 border-b border-white/10 px-5 py-4 no-underline"
          title="Zum Dashboard"
        >
          <div className="flex h-20 w-full shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white px-3 shadow-sm">
            <img
              src={logo}
              alt="Koenen Property Management"
              className="h-full w-full object-contain"
              onError={(event) => {
                if (!event.currentTarget.src.endsWith("/logo/koenen.png")) {
                  event.currentTarget.src = "/logo/koenen.png";
                }
              }}
            />
          </div>
          <div className="min-w-0 text-center">
            <div className="truncate text-sm font-black uppercase tracking-[0.13em] text-[#d5e2e4]">
              Immobilienverwaltung
            </div>
          </div>
        </NavLink>

        <nav className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
          {navGroups.map(({ group, items }) => (
            <div key={group}>
              <div className={`mb-2 px-3 text-[11px] font-black uppercase tracking-[0.16em] ${groupAccent[group] ?? "text-slate-400"}`}>
                {group}
              </div>
              <div className="space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        onMouseEnter={() => preloadRoute(item.to)}
                        onFocus={() => preloadRoute(item.to)}
                        className={({ isActive }) => sidebarNavLinkClass(isActive)}
                      >
                        {({ isActive }) => (
                          <>
                            <Icon
                              size={19}
                              className={isActive ? "text-white" : "text-slate-400 transition group-hover:text-white"}
                            />
                            <span className="truncate">{item.label}</span>
                          </>
                        )}
                      </NavLink>
                      {item.to === "/auswertungen" && location.pathname === "/auswertungen" ? (
                        <div className="ml-8 mt-1 grid gap-1 border-l border-white/10 pl-3">
                          {auswertungSubNav.map((subItem) => {
                            const active = activeAuswertungView === subItem.view;
                            return (
                              <Link
                                key={subItem.view}
                                to={`/auswertungen?view=${subItem.view}`}
                                className={[
                                  "rounded-xl px-3 py-2 text-xs font-extrabold no-underline transition",
                                  active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/8 hover:text-white",
                                ].join(" ")}
                              >
                                {subItem.label}
                              </Link>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="mb-3 rounded-2xl border border-white/10 bg-white/6 px-3 py-2 text-xs font-bold text-slate-300">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Angemeldet</div>
            <div className="mt-1 truncate">{user?.email ?? "Eingeloggt"}</div>
            <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
              {isReadOnly ? "Nur Lesen" : "Admin"}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <BackupButton />
            <LogoutButton showEmail={false} compact />
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/68 backdrop-blur-xl xl:hidden">
        <div className="mx-auto max-w-[1760px] px-3 py-2.5 sm:px-6 sm:py-3 lg:px-8">
          <div className="flex items-center justify-between gap-3 sm:gap-5">
            <NavLink
              to="/dashboard/finanz-kennzahlen"
              className="flex min-w-0 items-center gap-3"
              title="Zum Dashboard"
            >
              <div className="flex h-12 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/70 bg-white/80 px-1.5 shadow-sm sm:h-14 sm:w-36">
                <img
                  src={logo}
                  alt="Koenen Property Management"
                  className="h-full w-full object-contain"
                  onError={(event) => {
                    if (!event.currentTarget.src.endsWith("/logo/koenen.png")) {
                      event.currentTarget.src = "/logo/koenen.png";
                    }
                  }}
                />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:text-xs sm:tracking-[0.18em]">
                  Koenen Property Management
                </div>
                <div className="max-w-[220px] truncate text-base font-semibold leading-tight text-slate-950 sm:max-w-none sm:text-2xl">
                  Immobilien-Finanzübersicht
                </div>
              </div>
            </NavLink>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/84 text-slate-900 shadow-sm backdrop-blur sm:h-12 sm:w-12"
              aria-label={mobileMenuOpen ? "Menü schließen" : "Menü öffnen"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="mt-3 max-h-[calc(100vh-86px)] overflow-y-auto rounded-[24px] border border-white/70 bg-white/88 p-3 shadow-[0_18px_45px_rgba(55,65,81,0.10)] backdrop-blur xl:hidden">
              <nav className="grid gap-4">
                {navGroups.map(({ group, items }) => (
                  <div key={group} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/84">
                    <button
                      type="button"
                      onClick={() => toggleMobileGroup(group)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                      aria-expanded={openMobileGroups.has(group)}
                    >
                      <span className={`text-[11px] font-black uppercase tracking-[0.16em] ${groupAccent[group] ?? "text-slate-500"}`}>
                        {group}
                      </span>
                      <ChevronDown
                        size={18}
                        className={[
                          "text-slate-500 transition-transform",
                          openMobileGroups.has(group) ? "rotate-180" : "",
                        ].join(" ")}
                      />
                    </button>
                    {openMobileGroups.has(group) ? (
                    <div className="grid grid-cols-1 gap-2 border-t border-slate-100 p-2 sm:grid-cols-2">
                      {items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <div key={item.to} className={item.to === "/auswertungen" && location.pathname === "/auswertungen" ? "col-span-2" : ""}>
                            <NavLink
                              to={item.to}
                              end={item.end}
                              onMouseEnter={() => preloadRoute(item.to)}
                              onFocus={() => preloadRoute(item.to)}
                              onClick={() => setMobileMenuOpen(false)}
                              className={({ isActive }) =>
                                [
                                  "flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-center text-sm font-extrabold leading-tight shadow-sm transition",
                                  isActive
                                    ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                                    : "border-slate-200 bg-white text-slate-900",
                                ].join(" ")
                              }
                            >
                              <Icon size={16} />
                              <span>{item.label}</span>
                            </NavLink>
                            {item.to === "/auswertungen" && location.pathname === "/auswertungen" ? (
                              <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
                                {auswertungSubNav.map((subItem) => {
                                  const active = activeAuswertungView === subItem.view;
                                  return (
                                    <Link
                                      key={subItem.view}
                                      to={`/auswertungen?view=${subItem.view}`}
                                      onClick={() => setMobileMenuOpen(false)}
                                      className={[
                                        "rounded-xl px-3 py-2 text-center text-xs font-extrabold no-underline transition",
                                        active ? "bg-indigo-100 text-indigo-800" : "bg-white text-slate-700",
                                      ].join(" ")}
                                    >
                                      {subItem.label}
                                    </Link>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    ) : null}
                  </div>
                ))}
              </nav>

              <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-white/70 bg-white/80 p-3">
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-sm font-medium text-slate-600">
                  {user?.email ?? "Eingeloggt"}
                  <span className="ml-2 font-black text-slate-500">{isReadOnly ? "Nur Lesen" : "Admin"}</span>
                </div>
                <BackupButton />
                <LogoutButton />
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1760px] px-3 py-4 sm:px-5 sm:py-6 lg:px-8 xl:ml-[286px] xl:max-w-none">
        {isReadOnly ? (
          <div className="readonly-banner">
            Nur-Lesen-Zugang: Daten und Felder sind geschützt. Änderungen sind dem Admin vorbehalten.
          </div>
        ) : null}
        <Outlet />
      </main>
    </div>
    </ReadOnlyInteractionGuard>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/mfa" element={<MFA />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

      <Route element={<ProtectedAppShell />}>
        <Route path="/dashboard" element={<Navigate to="/dashboard/finanz-kennzahlen" replace />} />
        <Route
          path="/dashboard/finanz-kennzahlen"
          element={<ModuleWorkspacePage config={workspaceConfigs.dashboardFinanz}><Cockpit /></ModuleWorkspacePage>}
        />
        <Route
          path="/dashboard/warnmeldungen"
          element={<ModuleWorkspacePage config={workspaceConfigs.dashboardWarnungen}><Datenpruefung /></ModuleWorkspacePage>}
        />
        <Route
          path="/dashboard/aktuelle-todos"
          element={<ModuleWorkspacePage config={workspaceConfigs.dashboardTodos}><TasksMaintenancePage /></ModuleWorkspacePage>}
        />
        <Route path="/cockpit" element={<Navigate to="/dashboard/finanz-kennzahlen" replace />} />

        <Route path="/portfolio" element={<Navigate to="/immobilienvermoegen" replace />} />
        <Route path="/immobilien" element={<Navigate to="/immobilienvermoegen" replace />} />
        <Route path="/Immobilien" element={<Navigate to="/immobilienvermoegen" replace />} />
        <Route
          path="/immobilien/objektuebersicht"
          element={<Navigate to="/immobilienvermoegen" replace />}
        />
        <Route
          path="/immobilien/immobilie-anlegen"
          element={<ModuleWorkspacePage config={workspaceConfigs.immobilienAnlegen}><Administrator focus="property" /></ModuleWorkspacePage>}
        />
        <Route
          path="/immobilien/mietentwicklung"
          element={<Navigate to="/mieter/mietentwicklung" replace />}
        />
        <Route
          path="/immobilien/einheiten-verwaltung"
          element={<Navigate to="/immobilienvermoegen" replace />}
        />
        <Route
          path="/immobilien/zaehlerstaende-verbrauch"
          element={<ModuleWorkspacePage config={workspaceConfigs.immobilienVerbrauch}><NebenkostenIndexPage /></ModuleWorkspacePage>}
        />
        <Route
          path="/immobilien/objekt-dokumente"
          element={<ModuleWorkspacePage config={workspaceConfigs.immobilienDokumente}><OrganisationHubPage kind="dokumente" /></ModuleWorkspacePage>}
        />
        <Route path="/portfolio/:propertyId/*" element={<Navigate to="/immobilienvermoegen" replace />} />
        <Route path="/immobilien/:propertyId/*" element={<Navigate to="/immobilienvermoegen" replace />} />

        <Route path="/objekte" element={<Navigate to="/immobilienvermoegen" replace />} />
        <Route
          path="/objekte/:propertyId"
          element={<RedirectObjectRoute section="objektakte" />}
        />
        <Route
          path="/objekte/:propertyId/monate"
          element={<RedirectObjectRoute section="finance-pro-jahr" />}
        />
        <Route
          path="/objekte/:propertyId/auswertungen"
          element={<RedirectObjectRoute section="finance-pro-jahr" />}
        />
        <Route
          path="/objekte/:propertyId/darlehen"
          element={<RedirectObjectRoute section="darlehen" />}
        />
        <Route
          path="/objekte/:propertyId/income"
          element={<RedirectObjectRoute section="income" />}
        />
        <Route
          path="/objekte/:propertyId/capex"
          element={<RedirectObjectRoute section="capex" />}
        />

        <Route path="/monate" element={<Monate />} />
        <Route path="/buchhaltung" element={<Navigate to="/buchhaltung/buchungen" replace />} />
        <Route
          path="/buchhaltung/buchungen"
          element={<ModuleWorkspacePage config={workspaceConfigs.buchhaltungBuchungen}><BuchhaltungHubPage /></ModuleWorkspacePage>}
        />
        <Route
          path="/buchhaltung/einnahmen-ausgaben"
          element={<ModuleWorkspacePage config={workspaceConfigs.buchhaltungEinnahmenAusgaben}><EntryAdd /></ModuleWorkspacePage>}
        />
        <Route
          path="/buchhaltung/sollstellungen-mietanpassungen"
          element={<Navigate to="/mieter/mietentwicklung" replace />}
        />
        <Route
          path="/buchhaltung/nebenkostenabrechnung"
          element={<ModuleWorkspacePage config={workspaceConfigs.buchhaltungNebenkosten}><NebenkostenIndexPage /></ModuleWorkspacePage>}
        />
        <Route
          path="/buchhaltung/automatisiertes-mahnwesen"
          element={<ModuleWorkspacePage config={workspaceConfigs.buchhaltungMahnwesen}><Mahnwesen /></ModuleWorkspacePage>}
        />
        <Route
          path="/buchhaltung/steuer-center-berater"
          element={<ModuleWorkspacePage config={workspaceConfigs.buchhaltungSteuer}><SteuerCenter /></ModuleWorkspacePage>}
        />
        <Route
          path="/buchhaltung/fahrtenbuch"
          element={<ModuleWorkspacePage config={workspaceConfigs.buchhaltungFahrtenbuch}><Fahrtenbuch /></ModuleWorkspacePage>}
        />
        <Route
          path="/buchhaltung/berichte-exporte"
          element={<ModuleWorkspacePage config={workspaceConfigs.buchhaltungBerichte}><ReportsExportsPage /></ModuleWorkspacePage>}
        />
        <Route
          path="/buchhaltung/darlehen"
          element={<ModuleWorkspacePage config={workspaceConfigs.buchhaltungDarlehen}><Darlehensuebersicht /></ModuleWorkspacePage>}
        />
        <Route
          path="/buchhaltung/steuerberater-portal"
          element={<ModuleWorkspacePage config={workspaceConfigs.buchhaltungPortal}><OrganisationHubPage kind="benutzer" /></ModuleWorkspacePage>}
        />
        <Route
          path="/buchhaltung/umsatzsteuer-optionen"
          element={<ModuleWorkspacePage config={workspaceConfigs.buchhaltungUst}><SteuerCenter /></ModuleWorkspacePage>}
        />
        <Route path="/buchhaltung/transaktionen" element={<Monate />} />
        <Route path="/buchhaltung/einnahmen" element={<Navigate to="/buchhaltung/einnahmen-ausgaben" replace />} />
        <Route path="/buchhaltung/ausgaben" element={<Navigate to="/buchhaltung/einnahmen-ausgaben" replace />} />
        <Route path="/buchhaltung/neue-buchung" element={<EntryAdd />} />
        <Route path="/buchhaltung/regeln" element={<Transaktionsregeln />} />
        <Route path="/buchhaltung/mahnwesen" element={<Navigate to="/buchhaltung/automatisiertes-mahnwesen" replace />} />
        <Route path="/buchhaltung/kautionen" element={<Navigate to="/buchhaltung/sollstellungen-mietanpassungen" replace />} />
        <Route path="/buchhaltung/nebenkosten" element={<Navigate to="/buchhaltung/nebenkostenabrechnung" replace />} />
        <Route path="/buchhaltung/mietanpassungen" element={<Navigate to="/mieter/mietentwicklung" replace />} />
        <Route path="/mietanpassungen" element={<Navigate to="/mieter/mietentwicklung" replace />} />
        <Route path="/berichte-exporte" element={<Navigate to="/buchhaltung/berichte-exporte" replace />} />
        <Route path="/exports" element={<Navigate to="/buchhaltung/berichte-exporte" replace />} />
        <Route path="/export" element={<Navigate to="/buchhaltung/berichte-exporte" replace />} />
        <Route path="/buchhaltung/berichte" element={<Navigate to="/buchhaltung/berichte-exporte" replace />} />
        <Route path="/buchhaltung/export" element={<Navigate to="/buchhaltung/berichte-exporte" replace />} />
        <Route path="/buchhaltung/fahrten" element={<Navigate to="/buchhaltung/fahrtenbuch" replace />} />
        <Route path="/fahrtenbuch" element={<Navigate to="/buchhaltung/fahrtenbuch" replace />} />
        <Route path="/steuer/fahrtenbuch" element={<Navigate to="/buchhaltung/fahrtenbuch" replace />} />
        <Route path="/steuer" element={<Navigate to="/buchhaltung/steuer-center-berater" replace />} />
        <Route path="/auswertungen" element={<Auswertung />} />
        <Route path="/berichte" element={<Auswertung />} />
        <Route path="/funktionsvergleich" element={<Funktionsvergleich />} />
        <Route path="/investment-bericht" element={<InvestmentBericht />} />
        <Route path="/investment" element={<Navigate to="/investment-bericht" replace />} />
        <Route path="/investition" element={<Navigate to="/investment-bericht" replace />} />
        <Route
          path="/auswertung"
          element={<Navigate to="/auswertungen" replace />}
        />

        <Route path="/buchungen" element={<EntryAdd />} />
        <Route path="/administrator" element={<Navigate to="/einstellungen/benutzer-rechteverwaltung" replace />} />
        <Route path="/kontakte" element={<Navigate to="/kontakte/aktive-mietvertraege" replace />} />
        <Route
          path="/kontakte/aktive-mietvertraege"
          element={<ModuleWorkspacePage config={workspaceConfigs.kontakteVertraege}><MieterAnlegen /></ModuleWorkspacePage>}
        />
        <Route
          path="/kontakte/mieter-eigentuemerakten"
          element={<ModuleWorkspacePage config={workspaceConfigs.kontakteAkten}><MieterAnlegen /></ModuleWorkspacePage>}
        />
        <Route
          path="/kontakte/interessenten-selbstauskuenfte"
          element={<ModuleWorkspacePage config={workspaceConfigs.kontakteInteressenten}><MieterAnlegen /></ModuleWorkspacePage>}
        />
        <Route
          path="/kontakte/wohnungsgeberbescheinigungen-uebergabeprotokolle"
          element={<ModuleWorkspacePage config={workspaceConfigs.kontakteUebergaben}><EinAuszug /></ModuleWorkspacePage>}
        />
        <Route path="/mieter" element={<Navigate to="/mieter/uebersicht" replace />} />
        <Route path="/mieter/uebersicht" element={<MieterHubPage />} />
        <Route path="/mieter/register" element={<MieterRegister />} />
        <Route path="/mieter/stammdaten" element={<MieterAnlegen />} />
        <Route path="/mieter/vertrag" element={<MieterAnlegen />} />
        <Route path="/mieter/zahlungen" element={<Mietuebersicht />} />
        <Route path="/mieter/mieteingang" element={<Mietuebersicht />} />
        <Route path="/mieter/mieteingang/jahresuebersicht" element={<Mietuebersicht />} />
        <Route
          path="/mieter/mietentwicklung"
          element={<ModuleWorkspacePage config={workspaceConfigs.mieterMietentwicklung}><Mietentwicklung /></ModuleWorkspacePage>}
        />
        <Route path="/mieter/dokumente" element={<OrganisationHubPage kind="dokumente" />} />
        <Route path="/mieter/historie" element={<EinAuszug />} />
        <Route path="/mieter/ein-auszug" element={<EinAuszug />} />
        <Route path="/mieter/notizen" element={<MieterAnlegen />} />
        <Route path="/mieter/kommunikation" element={<Mahnwesen />} />
        <Route path="/mieter/leerstand" element={<Leerstand />} />
        <Route path="/mieter/mahnwesen" element={<Mahnwesen />} />
        <Route path="/mieteruebersicht" element={<Mietuebersicht />} />
        <Route path="/mieter-anlegen" element={<MieterAnlegen />} />
        <Route path="/leerstand" element={<Leerstand />} />
        <Route path="/mahnwesen" element={<Mahnwesen />} />
        <Route path="/ein-auszug" element={<EinAuszug />} />
        <Route path="/transaktionsregeln" element={<Transaktionsregeln />} />
        <Route
          path="/entry-add"
          element={<Navigate to="/buchungen" replace />}
        />

        <Route path="/datenpruefung" element={<Datenpruefung />} />
        <Route path="/automatisierung" element={<Navigate to="/produktivitaet" replace />} />

        <Route path="/nebenkosten" element={<NebenkostenIndexPage />} />
        <Route
          path="/nebenkosten/tiefgarage"
          element={<NebenkostenTiefgarage />}
        />
        <Route
          path="/nebenkosten/wohnungen"
          element={<NebenkostenWohnungen />}
        />

        <Route path="/darlehen" element={<Darlehensuebersicht />} />
        <Route path="/darlehen/:propertyId" element={<Darlehensuebersicht />} />
        <Route path="/darlehen/tilgungsplan" element={<Darlehensuebersicht />} />
        <Route path="/darlehen/zahlungen" element={<Darlehensuebersicht />} />
        <Route path="/darlehen/restschuld" element={<Darlehensuebersicht />} />
        <Route path="/darlehen/zinsen" element={<Darlehensuebersicht />} />
        <Route path="/darlehen/historie" element={<Darlehensuebersicht />} />
        <Route path="/darlehen/dokumente" element={<OrganisationHubPage kind="dokumente" />} />
        <Route path="/darlehen/immobilienzuordnung" element={<Darlehensuebersicht />} />
        <Route path="/darlehensübersicht" element={<Navigate to="/darlehen" replace />} />
        <Route path="/darlehensubersicht" element={<Navigate to="/darlehen" replace />} />
        <Route path="/darlehensuebersicht" element={<Navigate to="/darlehen" replace />} />
        <Route path="/darlehensuebersicht/:propertyId" element={<RedirectLoanRoute />} />

        <Route path="/kautionen" element={<Kautionen />} />
        <Route path="/immobilienvermoegen" element={<ImmobilienVermoegen />} />
        <Route path="/immobilienvermoegen/:propertyId" element={<ImmobilienVermoegen />} />
        <Route path="/vermoegen" element={<Navigate to="/immobilienvermoegen" replace />} />
        <Route path="/ticketsystem" element={<Navigate to="/ticketsystem/schadenmeldungen" replace />} />
        <Route
          path="/ticketsystem/schadenmeldungen"
          element={<ModuleWorkspacePage config={workspaceConfigs.ticketSchaden}><TasksMaintenancePage mode="schaden" /></ModuleWorkspacePage>}
        />
        <Route
          path="/ticketsystem/handwerker-beauftragung"
          element={<ModuleWorkspacePage config={workspaceConfigs.ticketHandwerker}><TasksMaintenancePage mode="handwerker" /></ModuleWorkspacePage>}
        />
        <Route path="/ticketing" element={<Navigate to="/ticketsystem/schadenmeldungen" replace />} />
        <Route path="/dokumente" element={<OrganisationHubPage kind="dokumente" />} />
        <Route path="/produktivitaet" element={<OrganisationHubPage kind="produktivitaet" />} />
        <Route path="/benutzer" element={<Navigate to="/einstellungen/benutzer-rechteverwaltung" replace />} />
        <Route path="/einstellungen" element={<Navigate to="/einstellungen/benutzer-rechteverwaltung" replace />} />
        <Route
          path="/einstellungen/benutzer-rechteverwaltung"
          element={<AdminOnlyWorkspace config={workspaceConfigs.einstellungenBenutzer}><Administrator focus="users" /></AdminOnlyWorkspace>}
        />
        <Route
          path="/einstellungen/datenschutz-compliance"
          element={<AdminOnlyWorkspace config={workspaceConfigs.einstellungenDatenschutz}><Datenschutz /></AdminOnlyWorkspace>}
        />
      </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
