import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, FileText } from 'lucide-react';
import './ReportCenter.css';

export default function ReportsHome() {
  return (
    <main className="report-center">
      <header className="report-heading">
        <div>
          <span className="report-eyebrow">BERICHTE</span>
          <h1>Berichte & Reports</h1>
          <p>Wählen Sie den gewünschten Berichtsbereich.</p>
        </div>
        <BarChart3 size={36} aria-hidden="true" />
      </header>
      <section className="report-home-grid" aria-label="Berichtsbereiche">
        <Link to="/berichte/steuerberater" className="report-home-card">
          <FileText size={32} aria-hidden="true" />
          <h2>Steuerberater-Report</h2>
          <p>Zeitraum und Dateiformat wählen, Berichte zusammenstellen und gemeinsam exportieren.</p>
          <ul>
            <li>Deckblatt, EÜR und Buchungsjournal</li>
            <li>Mieterübersicht und Zahlungsmatrix</li>
            <li>Objekte, Mietentwicklung und weitere Nachweise</li>
          </ul>
          <span className="report-home-action">Steuerberater-Report öffnen <ArrowRight size={18} /></span>
        </Link>
        <Link to="/berichte/portfolio" className="report-home-card">
          <BarChart3 size={32} aria-hidden="true" />
          <h2>Immobilien- & Portfolio-Analysen</h2>
          <p>Fünf eigenständige Berichte für Ihren Immobilienbestand und die Finanzplanung.</p>
          <ul>
            <li>Stammdaten, Anschaffungskosten und AfA-Basis</li>
            <li>Eigenschaften und Darlehen</li>
            <li>Offene Zahlungen und Vermögen-Cashflow</li>
          </ul>
          <span className="report-home-action">Portfolio-Analysen öffnen <ArrowRight size={18} /></span>
        </Link>
      </section>
    </main>
  );
}
