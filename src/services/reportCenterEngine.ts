import type { AppObject, FinanceEntry, LoanDashboardRow } from '../state/AppDataContext';
import type { RentAnnualReportSnapshot } from '../pages/Mietuebersicht';
import type { PdfReportSection, PdfReportTable } from '../lib/professionalPdfReport';
import { parseLocaleNumber } from '../utils/numberParser';
import { masterNamesMatch } from './masterDataService';

export type ReportRecord = Record<string, unknown>;
export type ReportSources = Record<string, ReportRecord[]>;
export type ReportModule = PdfReportSection & { id: string };
export const reportNames = [
  ['cover', 'Steuerberater-Report · Deckblatt & Kennzahlen'],
  ['eur', 'Einnahmen-Überschuss-Rechnung (EÜR)'],
  ['tenants', 'Mieterübersicht & Zahlungsmatrix'],
  ['journal', 'Buchungsjournal Detail'],
  ['objects', 'Objektübersicht & Eckdaten'],
  ['adjustments', 'Mietentwicklung & Mietanpassungen'],
  ['mileage', 'Fahrtkosten Einzelnachweis'],
  ['vacancy', 'Leerstand Bericht'],
  ['utilities', 'Nebenkostenabrechnung'],
  ['proofs', 'Inserat-Nachweise für Leerstände'],
  ['register', 'Immobilien-Stammdaten (Portfolio-Register)'],
  ['acquisition', 'Anschaffungskosten & AfA-Basis'],
  ['loans', 'Immobilien-Eigenschaften & Darlehen'],
  ['arrears', 'Mietkonto-Check & Offene Zahlungen'],
  ['cashflow', 'Vermögen Cashflow Report'],
] as const;
export const euro = (v: unknown) => v == null || v === '' ? 'Nicht gepflegt' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(parseLocaleNumber(v, 0));
const percent = (v: number, digits = 1) => `${new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v)} %`;
const n = (v: unknown) => parseLocaleNumber(v, 0);
const record = (v: unknown): ReportRecord => v && typeof v === 'object' && !Array.isArray(v) ? v as ReportRecord : {};
const records = (v: unknown): ReportRecord[] => Array.isArray(v) ? v.map(record) : [];
const str = (v: unknown) => v == null || v === '' ? 'Nicht gepflegt' : String(v);
const text = (v: unknown) => String(v ?? '');
const total = (rows: FinanceEntry[]) => rows.reduce((s, r) => s + Math.abs(r.amount), 0);
const dateIn = (date: unknown, from: string, to: string) => Boolean(date) && text(date).slice(0, 10) >= from && text(date).slice(0, 10) <= to;
const overlaps = (r: ReportRecord, from: string, to: string) => (!r.start_date || text(r.start_date) <= to) && (!r.end_date || text(r.end_date) >= from);
const tenantName = (r: ReportRecord | undefined) => r ? text(r.company_name) || [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Nicht gepflegt' : 'Nicht zugeordnet';
const isParkingText = (value: unknown) => /garage|parking|stellplatz|tiefgarage|\btg\b|\bp\d{2,}\b/i.test(text(value));
const isOwnerOccupied = (object: AppObject | undefined) => Boolean(object && /hohenloher/i.test(object.label));
export function buildReportCenter(input: { objects: AppObject[]; entries: FinanceEntry[]; loans: LoanDashboardRow[]; sources: ReportSources; rent: RentAnnualReportSnapshot | null; from: string; to: string; objectId: string; today?: string }): ReportModule[] {
  const { sources: s, from, to, rent } = input;
  const today = input.today ?? new Date().toLocaleDateString('sv-SE');
  const objects = input.objects.filter(o => !input.objectId || o.id === input.objectId);
  const aliasesByObject = new Map(input.objects.map((o) => {
    const result = new Set([o.id, o.code, o.label, ...(o.aliases ?? [])].filter(Boolean).map(text));
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of s.portfolio_properties ?? []) {
        const values = [row.id, row.core_property_id, row.name, row.property_name, row.address].filter(Boolean).map(text);
        if (!values.some(value => result.has(value) || masterNamesMatch(value, o.label))) continue;
        for (const value of values) if (!result.has(value)) { result.add(value); changed = true; }
      }
      for (const row of [...(s.property_id_aliases ?? []), ...(s.object_bridge ?? [])]) {
        const values = [row.object_id, row.property_id, row.legacy_property_id, row.objekt_code, row.property_name].filter(Boolean).map(text);
        if (!values.some(value => result.has(value) || masterNamesMatch(value, o.label))) continue;
        for (const value of values) if (!result.has(value)) { result.add(value); changed = true; }
      }
    }
    return [o.id, result] as const;
  }));
  const aliases = (o: AppObject) => aliasesByObject.get(o.id) ?? new Set<string>();
  const objectFor = (r: ReportRecord) => input.objects.find((o) => {
    const ids = [r.property_id, r.object_id, r.object_code, r.objekt_code, r.portfolio_property_id].filter(Boolean).map(text);
    if (ids.some(id => aliases(o).has(id))) return true;
    const names = [r.object_label, r.property_label, r.property_name, r.name, r.address].filter(Boolean);
    return names.some(value => masterNamesMatch(value, o.label));
  });
  const scoped = (r: ReportRecord) => !input.objectId || objectFor(r)?.id === input.objectId;
  const label = (r: ReportRecord) => objectFor(r)?.label ?? (text(r.object_label || r.property_label || r.property_name) || 'Nicht zugeordnet / Portfolio');
  const profiles = (o: AppObject): ReportRecord => Object.assign({}, ...(s.property_extra ?? []).filter(r => aliases(o).has(text(r.property_id))).map(r => ({...record(r.wealth_profile), livingArea: r.living_area ?? record(r.wealth_profile).livingArea ?? record(r.wealth_profile).totalArea})));
  const areaForObject = (o: AppObject | undefined): unknown => o ? o.livingAreaM2 ?? profiles(o).livingArea ?? profiles(o).totalArea : undefined;
  const units = (s.portfolio_units ?? []).filter(r => r.is_active !== false && scoped(r));
  const contracts = (s.tenant_contracts ?? []).filter(r => scoped(r) && r.is_deleted !== true && r.status !== 'vacant');
  const people = s.tenant_profiles ?? [];
  const name = (c: ReportRecord) => tenantName(people.find(p => p.id === c.tenant_id));
  const referenceDate = to < today ? to : today;
  const active = contracts.filter(c => overlaps(c, referenceDate, referenceDate) && c.status !== 'planned');
  const entries = input.entries.filter(e => dateIn(e.booking_date, from, to) && scoped(e));
  const incomes = entries.filter(e => e.entry_type === 'income');
  const expenses = entries.filter(e => e.entry_type === 'expense');
  const adjustments = (s.rent_adjustments ?? []).filter(scoped).sort((a,b) => text(b.effective_date).localeCompare(text(a.effective_date)));
  const currentRent = (c: ReportRecord, field: string) => {
    const changes = adjustments.filter(a => objectFor(a)?.id === objectFor(c)?.id && a.tenant_name === name(c) && text(a.effective_date) <= referenceDate && (!a.effective_end_date || text(a.effective_end_date) >= referenceDate));
    return changes[0]?.[`new_${field}`] ?? c[field];
  };
  const firstMonth = Number(from.slice(5,7)); const lastMonth = Number(to.slice(5,7));
  const rentRows = (rent?.rows ?? []).filter(r => !input.objectId || r.objectId === input.objectId);
  const months = rentRows.flatMap(r => r.months.filter(m => m.month >= firstMonth && m.month <= lastMonth));
  const expected = months.reduce((sum,m) => sum + m.expected,0);
  const paid = months.reduce((sum,m) => sum + m.paid,0);
  const reportingUnits = rentRows.map(row => ({ object: input.objects.find(o => o.id === row.objectId), row }));
  const rented = reportingUnits.filter(({row}) => row.months.some(m => m.month >= firstMonth && m.month <= lastMonth && m.expected > 0)).length;
  const table = (title: string, headers: string[], rows: PdfReportTable['rows'], subtitle?: string): PdfReportTable => ({ title, headers, rows, subtitle });
  const module = (id: string, tables: PdfReportTable[], paragraphs: string[] = []): ReportModule => ({ id, title: reportNames.find(r => r[0] === id)![1], tables, paragraphs });
  const rentNote = 'Soll/Ist folgt dem zentralen Mietkonto nach Mietmonat. Bei Teilmonaten wird der vollständige betroffene Mietmonat gezeigt. Künftige Monate sind neutral; Rückstände berücksichtigen nur fällige Monate.';
  const arrears = rentRows.map(r => [r.objectLabel, r.unitLabel, r.tenantName, euro(r.months.filter(m => m.month >= firstMonth && m.month <= lastMonth && `${from.slice(0,4)}-${String(m.month).padStart(2,'0')}-01` <= today).reduce((v,m) => v + m.open,0))]);
  const incomeGroups = new Map<string, FinanceEntry[]>(['Kaltmiete','Nebenkostenzahlungen','Nebenkostennachzahlungen','Mahngebühren'].map(k => [k,[]]));
  const excluded: FinanceEntry[] = [];
  for (const e of incomes) {
    const c = text(e.category).toLowerCase();
    if (e.tax_relevant === false || isOwnerOccupied(objectFor(e)) || /kaution|darlehensauszahlung|darlehensrate|kreditrate|umbuchung/.test(c)) { excluded.push(e); continue; }
    const k = /mahn/.test(c) ? 'Mahngebühren' : /nebenkosten.*nach|nk.*nach/.test(c) ? 'Nebenkostennachzahlungen' : /mietbestandteil.nk|nebenkosten|betriebskosten/.test(c) ? 'Nebenkostenzahlungen' : /kaltmiete/.test(c) ? 'Kaltmiete' : /miete/.test(c) ? 'Mieteinnahmen – Aufteilung Kalt/NK nicht hinterlegt' : `Sonstige Einnahmen: ${e.category ?? 'Ohne Kategorie'}`;
    incomeGroups.set(k,[...(incomeGroups.get(k) ?? []),e]);
  }
  const expenseGroups = new Map<string, number>();
  let deductible = 0;
  for (const e of expenses) {
    const c = text(e.category).toLowerCase();
    if (e.tax_relevant === false || isOwnerOccupied(objectFor(e)) || /umzugskosten|kaution|anschaffung|erwerbsneben|kaufpreis|umbuchung/.test(c)) { excluded.push(e); continue; }
    let amount = Math.abs(e.amount);
    if (/kreditrate|darlehensrate/.test(c)) {
      if (e.loan_interest_amount == null) { excluded.push(e); continue; }
      amount = Math.abs(e.loan_interest_amount);
    }
    const group = /instandhaltung|reparatur|verwaltung|kreditrate|darlehen/.test(c) || e.nk_relevant === false ? 'Nicht umlagefähige Kosten' : e.nk_relevant === true ? 'Umlagefähige Kosten' : 'Umlagefähigkeit nicht gepflegt';
    const key = `${group} · ${/kreditrate|darlehensrate/.test(c) ? 'Darlehenszinsen' : e.category ?? 'Ohne Kategorie'}`;
    expenseGroups.set(key,(expenseGroups.get(key) ?? 0)+amount); deductible += amount;
  }
  const revenue = [...incomeGroups.values()].reduce((sum,rows) => sum+total(rows),0);
  const amountRow = (category: string, amount: number) => [category,'Nicht hinterlegt','Nicht hinterlegt',euro(amount)];
  const eurRows = [...incomeGroups].map(([k,rows]) => amountRow(k,total(rows)));
  eurRows.push(amountRow('Summe Einnahmen',revenue));
  for (const group of ['Umlagefähige Kosten','Nicht umlagefähige Kosten','Umlagefähigkeit nicht gepflegt']) {
    const groupRows = [...expenseGroups].filter(([k]) => k.startsWith(`${group} ·`));
    eurRows.push(...groupRows.map(([k,v]) => amountRow(k,v)),amountRow(`Summe ${group}`,groupRows.reduce((sum,[,v]) => sum+v,0)));
  }
  eurRows.push(amountRow('Summe Ausgaben',deductible),amountRow('Ergebnis (Überschuss)',revenue-deductible));
  const cover = module('cover', [table('Kennzahlen', ['Kennzahl','Summe'], [
    ['Alle Geldbewegungen: Einnahmen',euro(total(incomes))],['Alle Geldbewegungen: Ausgaben',euro(total(expenses))],['Alle Geldbewegungen: Saldo',euro(total(incomes)-total(expenses))],['Steuerlich vorbereitete Einnahmen (EÜR)',euro(revenue)],['Steuerlich vorbereitete Ausgaben (EÜR)',euro(deductible)],['Steuerlich vorbereitetes Ergebnis (EÜR)',euro(revenue-deductible)],['Soll-Mieten', rent ? euro(expected) : 'Wird geladen'],['Ist-Mieten',rent ? euro(paid) : 'Wird geladen'],['Zahlungsquote', expected ? percent(paid/expected*100, 2) : '—'],['Einheiten mit Soll-Miete / Mietkonto-Zeilen', rent ? `${rented}/${reportingUnits.length}` : 'Wird geladen'],
  ])], [rentNote, 'Alle Geldbewegungen stimmen mit dem Buchungsjournal überein. Die EÜR schließt Kautionen, Tilgung, Anschaffungskosten, als nicht steuerrelevant markierte Buchungen und die eigengenutzte Hohenloher Str. 78 aus.']);
  const eur = module('eur',[table('Einnahmen und Ausgaben',['Kategorie','Netto','Steuer','Brutto'],eurRows),table('Separat abzugrenzende Geldbewegungen',['Datum','Kategorie','Brutto'],excluded.map(e => [e.booking_date,e.category,euro(e.amount)]))],['Buchungen haben keine separaten Netto-/Steuerfelder. Unaufgeteilte Miete wird nicht als Kaltmiete ausgegeben. Nicht klassifizierte Kosten sind im Ergebnis enthalten und gesondert zu prüfen. AfA ist in diesem zahlungsbasierten Ergebnis nicht enthalten.']);
  const contractRows = contracts.filter(c => overlaps(c,from,to)).map(c => {
    const u = units.find(u => objectFor(u)?.id === objectFor(c)?.id && (u.name === c.unit_label || u.id === c.unit_label));
    const obj = objectFor(c);
    const residentialContracts = contracts.filter(x => objectFor(x)?.id === obj?.id && !isParkingText(x.unit_label));
    const area = isParkingText(c.unit_label) ? 0 : u?.area_sqm ?? u?.living_area_m2 ?? u?.living_area ?? (residentialContracts.length <= 1 ? areaForObject(obj) : undefined);
    return [label(c),str(c.unit_label),name(c),str(c.start_date),str(c.end_date),euro(c.cold_rent),euro(c.operating_costs), c.total_rent != null && c.cold_rent != null && c.operating_costs != null ? euro(n(c.total_rent)-n(c.cold_rent)-n(c.operating_costs)) : 'Nicht gepflegt',euro(c.total_rent),str(area),n(area)>0 && c.cold_rent != null ? euro(n(c.cold_rent)/n(area)) : '—',euro(c.deposit_amount)];
  });
  const matrix = table('Zahlungsmatrix · Ist / Soll',['Objekt','Einheit','Mieter',...Array.from({length:12},(_,i) => new Date(2025,i,1).toLocaleDateString('de-DE',{month:'short'}))],rentRows.map(r => [r.objectLabel,r.unitLabel,r.tenantName,...r.months.map(m => m.month < firstMonth || m.month > lastMonth ? '—' : `${euro(m.paid)} / ${euro(m.expected)}${`${from.slice(0,4)}-${String(m.month).padStart(2,'0')}-01` > today ? ' · künftig' : m.status === 'inactive' || m.status === 'vacant' || m.status === 'none' ? ' · neutral' : m.paid + 0.005 >= m.expected ? ' · bezahlt' : ' · offen'}`)]));
  const tenants = module('tenants',[table('Vertragsdaten',['Objekt','Einheit','Mieter','Von','Bis','Kaltmiete','NK','Sonstiges','Gesamtmiete','Fläche m²','€/m²','Kaution (vereinbart)'],contractRows),matrix],[rentNote,'Kaution bezeichnet den gespeicherten Vertragsbetrag; ein Zahlungseingang wird daraus nicht abgeleitet.']);
  let balance = 0;
  const journal = module('journal',[table('Alle Geldbewegungen',['Datum','Einheit / Objekt','Mieter','Typ','Kategorie','Beschreibung','Eingang (+)','Ausgaben (-)','Saldo'],[...entries].sort((a,b) => text(a.booking_date).localeCompare(text(b.booking_date)) || text(a.id).localeCompare(text(b.id))).map(e => {
    balance += e.entry_type === 'income' ? Math.abs(e.amount) : e.entry_type === 'expense' ? -Math.abs(e.amount) : 0;
    const candidates = contracts.filter(c => objectFor(c)?.id === objectFor(e)?.id && overlaps(c,text(e.booking_date),text(e.booking_date)));
    return [e.booking_date,label(e),candidates.length === 1 ? name(candidates[0]) : 'Nicht eindeutig zugeordnet',e.entry_type,e.category,e.note,e.entry_type==='income'?euro(Math.abs(e.amount)):'',e.entry_type==='expense'?euro(Math.abs(e.amount)):'',euro(balance)];
  }))],['Saldo = kumulierte Bewegung im gewählten Zeitraum, Anfangswert 0; kein Bankkontostand.']);
  const objectRows = objects.map(o => {
    const rus = reportingUnits.filter(u => u.object?.id === o.id); const cs = active.filter(c => objectFor(c)?.id === o.id);
    const parking = rus.filter(u => isParkingText(u.row.unitLabel)).length;
    const commercial = rus.filter(u => /commercial|gewerbe/i.test(u.row.unitLabel)).length;
    const residential = rus.length-parking-commercial;
    const area = o.livingAreaM2 ?? profiles(o).livingArea ?? profiles(o).totalArea;
    const usefulArea = profiles(o).usableArea ?? profiles(o).commercialArea;
    const cold = cs.reduce((v,c) => v+n(currentRent(c,'cold_rent')),0);
    const occupied = rus.filter(({row}) => row.months.some(m => m.month >= firstMonth && m.month <= lastMonth && m.expected > 0)).length;
    return [o.label,rus.length,residential,commercial,parking,0,/rosenstein/i.test(o.label)?'0':str(area),usefulArea == null ? 'Nicht erforderlich / nicht gepflegt' : str(usefulArea),euro(cold),euro(cs.reduce((v,c)=>v+n(currentRent(c,'operating_costs')),0)),euro(cs.reduce((v,c)=>v+n(currentRent(c,'total_rent')),0)),n(area)>0?euro(cold/n(area)):'—',rus.length?percent(occupied/rus.length*100):'—'];
  });
  const portfolioStats = table('Gesamtbestand · aktueller Stand', ['Kennzahl', 'Wert'], [
    ['Mietkonto-Zeilen gesamt', reportingUnits.length],
    ['Vermietete Einheiten', rented],
    ['Wohneinheiten', reportingUnits.filter(u => !isParkingText(u.row.unitLabel)).length],
    ['Gewerbeeinheiten', reportingUnits.filter(u => /commercial|gewerbe/i.test(u.row.unitLabel)).length],
    ['Garagen / Stellplätze', reportingUnits.filter(u => isParkingText(u.row.unitLabel)).length],
    ['Wohnfläche gesamt m²', objects.filter(o => !/rosenstein/i.test(o.label)).every(o => o.livingAreaM2 != null || profiles(o).livingArea || profiles(o).totalArea) ? objects.reduce((v,o) => v+n(o.livingAreaM2 ?? profiles(o).livingArea ?? profiles(o).totalArea),0) : 'Nicht vollständig gepflegt'],
    ['Nutzfläche gesamt m²', objects.some(o => profiles(o).usableArea != null || profiles(o).commercialArea != null) ? objects.reduce((v,o) => v+n(profiles(o).usableArea ?? profiles(o).commercialArea),0) : 'Nicht erforderlich / nicht gepflegt'],
    ...['cold_rent','operating_costs','total_rent'].map((key,i) => [ ['Kaltmiete monatlich','Nebenkosten monatlich','Gesamtmiete monatlich'][i],active.every(c => currentRent(c,key) != null) ? euro(active.reduce((v,c) => v+n(currentRent(c,key)),0)) : 'Nicht vollständig gepflegt']),
    ['Vermietungsquote im Zeitraum', reportingUnits.length ? percent(rented/reportingUnits.length*100) : '—'],
  ]);
  const areaStatus = objects.map(o => { const area=o.livingAreaM2 ?? profiles(o).livingArea ?? profiles(o).totalArea; const parkingOnly=/rosenstein/i.test(o.label); return [o.label,parkingOnly?'0 m² Wohnfläche (3 Stellplätze)':str(area),parkingOnly?'Nicht anwendbar':area?'Vollständig':'Fehlt',parkingOnly?'Mietkonto/Objektart':'Immobilienvermögen · property_extra_info']; });
  const unitDetails = reportingUnits.map(({object,row}) => { const parking=isParkingText(row.unitLabel); const area=parking?0:areaForObject(object); const activeInPeriod=row.months.some(m=>m.month>=firstMonth&&m.month<=lastMonth&&m.expected>0); return [row.objectLabel,row.unitLabel,parking?'Stellplatz / Garage':'Wohnung',parking?'0 (nicht anwendbar)':str(area),activeInPeriod?'Vermietet im Zeitraum':'Ohne Soll-Miete im Zeitraum',row.tenantName||'—']; });
  const objectModule = module('objects',[table('Datenvollständigkeit Wohnfläche',['Objekt','Wohnfläche','Status','Hauptquelle'],areaStatus),table('Eckdaten · Stand zum Periodenende',['Objekt','Einheiten','Wohnen','Gewerbe','Garagen / Stellplätze','Unklassifiziert','Wohnfläche m²','Nutzfläche m²','Kalt monatlich','NK monatlich','Gesamt monatlich','Kalt €/m²','Vermietungsquote'],objectRows),table('Einheiten-Details aus dem Mietkonto',['Objekt','Einheit','Art','Fläche m²','Status','Mieter'],unitDetails)],['Einheiten und Belegungsstatus stammen aus dem zentralen Mietkonto. Wohnflächen werden direkt aus Immobilienvermögen/property_extra_info übernommen; sie werden nicht in einer zweiten Report-Datenquelle gespeichert. Stellplätze haben keine Wohnfläche.']);
  objectModule.tables?.unshift(portfolioStats);
  const changeModule = module('adjustments',[table('Mietanpassungen im Zeitraum',['Objekt','Mieter','Wirksam ab / letzte Anpassung','Bis','Kalt alt','Kalt neu','NK alt','NK neu','Gesamt neu'],adjustments.filter(a=>dateIn(a.effective_date,from,to)).map(a=>[label(a),str(a.tenant_name),str(a.effective_date),str(a.effective_end_date),euro(a.old_cold_rent),euro(a.new_cold_rent),euro(a.old_operating_costs),euro(a.new_operating_costs),euro(a.new_total_rent)])),table('Fehlende Miete',['Objekt','Einheit','Mieter','Fälliger Rückstand'],arrears)],[rentNote]);
  const mileage = module('mileage',[table('Einzelnachweis',['Datum','Objekt','Anlass','Start','Ziel','km','Hin/Rück','Betrag'],(s.mileage_trips ?? []).filter(r=>scoped(r)&&dateIn(r.datum,from,to)).map(r=>[r.datum,label(r),r.grund,r.start_adresse,r.zieladresse,n(r.distanz_km),r.hin_und_rueckfahrt?'Ja':'Nein',euro(r.berechneter_betrag ?? r.reisekosten_betrag)]).map(r=>r.map(v=>str(v))))]);
  const vacancies = (s.unit_vacancies ?? []).filter(r=>scoped(r)&&overlaps(r,from,to));
  const vacancy = module('vacancy',[table('Leerstände',['Objekt','Einheit','Von','Bis','Status','Grund','Notiz'],vacancies.map(r=>[label(r),str(r.unit_label),str(r.start_date),str(r.end_date),str(r.status),str(r.reason),str(r.notes)]))]);
  const docs = (s.property_documents ?? []).filter(r=>scoped(r)&&Number(r.document_year)===Number(from.slice(0,4)));
  const docTable = (rows: ReportRecord[]) => table('Archivierte Nachweise',['Objekt','Titel','Jahr','Status','Dateiname'],rows.map(r=>[label(r),str(r.title),str(r.document_year),str(r.status),str(r.file_name)]));
  const utilities = module('utilities',[docTable(docs.filter(r=>r.category==='nk_abrechnung')),table('Gebuchte umlagefähige Kosten',['Datum','Objekt','Kategorie','Brutto'],expenses.filter(e=>e.nk_relevant===true).map(e=>[e.booking_date,label(e),e.category,euro(e.amount)]))],['Archivnachweis vorhandener Jahresabrechnungen; Buchungsliste ersetzt keine Abrechnung mit Verteilerschlüsseln und Vorauszahlungen.']);
  for (const billing of s.billing_workspaces ?? []) {
    const payload = record(billing.data);
    const saved = records(payload.billings).map(r => record(r.workspace));
    if (payload.meta) saved.push(payload);
    for (const ws of saved) {
      const meta = record(ws.meta);
      if (Number(meta.billingYear ?? billing.year) !== Number(from.slice(0,4)) || !scoped({object_code:meta.propertyCode ?? billing.object_id})) continue;
      utilities.tables?.push(table(`Gespeicherte Abrechnung · ${str(meta.propertyLabel)}`, ['Einheit','Mieter','Von','Bis','Fläche m²','Monate','Vorauszahlungen','Status'], records(ws.apartments).filter(a=>a.active!==false).map(a=>[str(a.label),str(a.tenantName),str(meta.periodFrom),str(meta.periodTo),n(a.area),n(a.occupancyMonths),euro(a.advancePayments),str(meta.workflowStatus)])));
      utilities.tables?.push(table('Kosten und gespeicherte Verteilerschlüssel',['Kategorie','Gesamtkosten','Verteilung','Gesamtschlüssel','Einheitenschlüssel','Direktbetrag'],records(ws.costs).map(c=>[str(c.label),euro(c.amount),str(c.allocation),n(c.totalKey),n(c.apartmentKey),euro(c.directAmount)])));
    }
    for (const garage of records(payload.records)) {
      const object = objects.find(o => o.label === garage.propertyLabel || aliases(o).has(text(billing.object_id)));
      if (Number(garage.year) !== Number(from.slice(0,4)) || (input.objectId && object?.id !== input.objectId)) continue;
      utilities.tables?.push(table(`Gespeicherte Garagenabrechnung · ${str(garage.propertyLabel)}`,['Einheit','Mieter','Von','Bis','Vorauszahlungen','Freigegeben'],[[str(garage.unitLabel),str(garage.tenantName),str(garage.periodFrom),str(garage.periodTo),euro(garage.tenantPrepayments),garage.finalized?'Ja':'Nein']]));
      utilities.tables?.push(table('Kosten und gespeicherte Verteilerschlüssel',['Kategorie','Gesamtkosten','Verteilung','Gesamteinheiten','Eigene Einheiten'],records(garage.apportionableRows).map(c=>[str(c.label),euro(c.totalCost),str(c.key),n(c.totalUnits),n(c.yourUnits)])));
    }
  }
  const proofs = module('proofs',[docTable(docs.filter(r=>/leerstand|inserat|vermietungsbem|vacancy/i.test(JSON.stringify([r.title,r.notes,r.meta]))))]);
  const register = module('register',[table('Portfolio-Register',['Objekt-ID','Immobilie','Straße','PLZ / Ort','Nutzung','Baujahr','Fläche','Kaufdatum'],objects.map(o=>{const p=profiles(o);return [o.code??o.id,o.label,str(p.street),`${text(p.postalCode)} ${text(p.city)}`,str(p.usageType),str(p.equipmentYear),str(p.totalArea??o.livingAreaM2),str(p.purchaseDate)];}))]);
  const acquisition = module('acquisition',[table(`Anschaffungskosten & AfA-Basis ${from.slice(0,4)}`,['Objekt','Kaufdatum','Kaufpreis','Gebäudeanteil','Grund/Boden','Stellplatzanteil','Nutzen-/Lastenübergang'],objects.map(o=>{const p=profiles(o);return[o.label,str(p.purchaseDate),euro(p.purchasePrice),euro(p.buildingPurchasePrice),euro(p.landPurchasePrice),euro(p.parkingPurchasePrice),str(p.transferBenefitsDate)];})),table('Erwerbs- und Anschaffungsbuchungen im Zeitraum',['Datum','Objekt','Kategorie','Betrag'],expenses.filter(e=>/anschaffung|erwerbsneben|kaufpreis/i.test(text(e.category))).map(e=>[e.booking_date,label(e),e.category,euro(e.amount)]))],['Dokumentation der gespeicherten Kaufpreisaufteilung. AfA-Satz, zu aktivierende Nebenkosten und zeitanteilige Abschreibung werden ohne hinterlegte Grundlage nicht errechnet.']);
  const loans = module('loans',[table('Eigenschaften und Finanzierung',['Objekt','Nutzung','Baujahr','Bank','IBAN / BIC','Darlehensnummer','Ursprungsdarlehen','Monatsrate','Zins %','Zinsbindung','Restschuld (letzter Stand)'],objects.map(o=>{const p=profiles(o);const loan=input.loans.find(l=>aliases(o).has(l.property_id));return[o.label,str(p.usageType),str(p.equipmentYear),str(p.lender),str(p.ibanBic),str(p.loanNumber),euro(p.originalLoanAmount),euro(p.currentMonthlyRate),str(p.interestRate),str(p.interestBinding),euro(loan?.last_balance??p.remainingDebt)];}))]);
  const cashflow = module('cashflow',[table('Gebuchter Netto-Cashflow',['Objekt','Einnahmen','Kosten ohne Kreditraten','Gebuchte Kreditraten','Netto-Cashflow'],[...objects.map(o=>({label:o.label,rows:entries.filter(e=>objectFor(e)?.id===o.id)})),...(!input.objectId?[{label:'Portfolio / nicht zugeordnet',rows:entries.filter(e=>!objectFor(e))}]:[])].map(group=>{
    const inc=total(group.rows.filter(e=>e.entry_type==='income')); const out=group.rows.filter(e=>e.entry_type==='expense');const rates=total(out.filter(e=>/kreditrate|darlehensrate/i.test(text(e.category))));const costs=total(out)-rates;return[group.label,euro(inc),euro(costs),euro(rates),euro(inc-costs-rates)];}))],['Zahlungsbasierter Cashflow: gebuchte Darlehensraten werden genau einmal abgezogen. Nicht gebuchte Raten werden nicht als tatsächliche Zahlung angenommen.']);
  return [cover,eur,tenants,journal,objectModule,changeModule,mileage,vacancy,utilities,proofs,register,acquisition,loans,module('arrears',[table('Offene Zahlungen',['Objekt','Einheit','Mieter','Fälliger Rückstand'],arrears),matrix],[rentNote]),cashflow];
}
