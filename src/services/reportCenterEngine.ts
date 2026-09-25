import type { AppObject, FinanceEntry, LoanDashboardRow } from '../state/AppDataContext';
import type { RentAnnualReportSnapshot } from '../pages/Mietuebersicht';
import type { PdfReportSection, PdfReportTable } from '../lib/professionalPdfReport';
import { parseLocaleNumber } from '../utils/numberParser';
import { masterNamesMatch } from './masterDataService';
import { classifyNkRelevance } from '../lib/nkClassification';
import { rentBalancePart } from '../lib/rentPaymentBalance';
import { effectiveRentYearMonth, rentPaymentCutoffDay } from '../lib/rentMonth';
import { buildTaxReportPreflight, taxPreflightModule } from './taxReportPreflight';
import { allocateRosensteinThird, detectRosensteinTaxUnit, detectRosensteinTaxUnits, isRosensteinLabel, ROSENSTEIN_TAX_UNITS, rosensteinTaxUnitLabel, type RosensteinTaxUnitCode } from '../lib/rosensteinTaxUnit';

export type ReportRecord = Record<string, unknown>;
export type ReportSources = Record<string, ReportRecord[]>;
export type ReportModule = PdfReportSection & { id: string };
export const reportNames = [
  ['validation', 'Datenprüfung vor Steuerexport'],
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
  ['wealth-statement', 'Aufstellung Ihres Immobilienvermögens'],
  ['register', 'Immobilien-Stammdaten (Portfolio-Register)'],
  ['acquisition', 'Anschaffungskosten & AfA-Basis'],
  ['loans', 'Immobilien-Eigenschaften & Darlehen'],
  ['arrears', 'Mietkonto-Check & Offene Zahlungen'],
  ['cashflow', 'Vermögen Cashflow Report'],
  ['loan-interest', 'Tilgung & Zins · Laufzeit- und Monatsreport'],
] as const;
export const taxAdvisorReportIds = [
  'validation',
  'cover',
  'objects',
  'acquisition',
  'tenants',
  'adjustments',
  'eur',
  'journal',
  'mileage',
  'vacancy',
  'utilities',
  'proofs',
  'loan-interest',
] as const;
export const portfolioReportIds = ['wealth-statement', 'register', 'acquisition', 'loans', 'arrears', 'cashflow', 'loan-interest'] as const;
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
const normalizePerson = (value: unknown) => text(value).toLowerCase().replaceAll('ß','ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ae/g,'a').replace(/oe/g,'o').replace(/ue/g,'u').replace(/[^a-z0-9]+/g,' ').trim();
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
type RentReportMonth = RentAnnualReportSnapshot['rows'][number]['months'][number];
const paymentMatrixStatus = (month: RentReportMonth, monthStart: string, today: string): string => {
  if (monthStart > today) return 'künftig';
  if (month.status === 'vacant') return 'Leerstand';
  if (month.status === 'inactive' || month.status === 'none') return 'neutral';
  if (rentBalancePart(month.expected, month.paid, 'open') === 0) return 'bezahlt';
  return month.paid > 0 ? 'teilweise' : 'fehlt';
};
export function buildReportCenter(input: { objects: AppObject[]; entries: FinanceEntry[]; loans: LoanDashboardRow[]; sources: ReportSources; rent: RentAnnualReportSnapshot | null; from: string; to: string; objectId: string; rosensteinUnit?: RosensteinTaxUnitCode; today?: string }): ReportModule[] {
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
  const recordUnit = (r: ReportRecord) => detectRosensteinTaxUnit(r.unit_label, r.unit_name, r.name, r.reference, r.object_code, r.objekt_code, r.note, r.notes, r.title, r.file_name, r.grund);
  const unitScoped = (r: ReportRecord) => !input.rosensteinUnit || recordUnit(r) === input.rosensteinUnit;
  const profiles = (o: AppObject): ReportRecord => Object.assign(
    {},
    ...(s.portfolio_properties ?? [])
      .filter(r => [r.id,r.core_property_id,r.name,r.property_name,r.address].filter(Boolean).some(value => aliases(o).has(text(value)) || masterNamesMatch(value,o.label)))
      .map(r => ({...r,...record(r.wealth_profile)})),
    ...(s.property_extra ?? [])
      .filter(r => aliases(o).has(text(r.property_id)))
      .map(r => ({...record(r.wealth_profile), livingArea: r.living_area ?? record(r.wealth_profile).livingArea ?? record(r.wealth_profile).totalArea})),
  );
  const areaForObject = (o: AppObject | undefined): unknown => o ? o.livingAreaM2 ?? profiles(o).livingArea ?? profiles(o).totalArea : undefined;
  const allUnits = (s.portfolio_units ?? []).filter(r => r.is_active !== false && scoped(r));
  const areaForUnit = (o: AppObject | undefined, unitLabel: unknown): unknown => {
    if (!o) return undefined;
    const code = detectRosensteinTaxUnit(unitLabel);
    const unit = allUnits.find(candidate => objectFor(candidate)?.id === o.id && (
      candidate.id === unitLabel
      || normalizePerson(candidate.name) === normalizePerson(unitLabel)
      || (code && detectRosensteinTaxUnit(candidate.name, candidate.id) === code)
    ));
    return unit?.area_sqm ?? unit?.living_area_m2 ?? unit?.living_area ?? areaForObject(o);
  };
  const rawRentals = (s.portfolio_property_rentals ?? []).filter(r => scoped(r) && overlaps(r,from,to));
  const directRentalUnitCode = (r: ReportRecord) => detectRosensteinTaxUnit(allUnits.find(unit => unit.id === r.unit_id)?.name,r.unit_label,r.unit_name);
  const inferredRentalUnitCode = (r: ReportRecord): RosensteinTaxUnitCode | null => {
    const direct = directRentalUnitCode(r);
    if (direct) return direct;
    const object = objectFor(r);
    if (!isRosensteinLabel(object?.label)) return null;
    const samePeriod = rawRentals.filter(candidate => objectFor(candidate)?.id === object?.id
      && text(candidate.start_date).slice(0,10) === text(r.start_date).slice(0,10)
      && text(candidate.end_date).slice(0,10) === text(r.end_date).slice(0,10));
    const assigned = new Set(samePeriod.map(directRentalUnitCode).filter(Boolean));
    const unassigned = samePeriod.filter(candidate => !directRentalUnitCode(candidate)).sort((left,right)=>text(left.id).localeCompare(text(right.id)));
    const remaining = ROSENSTEIN_TAX_UNITS.map(unit=>unit.code).filter(code=>!assigned.has(code));
    if (unassigned.length !== remaining.length) return null;
    return remaining[unassigned.indexOf(r)] ?? null;
  };
  const rentalUnitLabel = (r: ReportRecord) => text(allUnits.find(unit => unit.id === r.unit_id)?.name || inferredRentalUnitCode(r) || r.unit_label || 'Gesamte Immobilie');
  const contracts = (s.tenant_contracts ?? []).filter(r => scoped(r) && unitScoped(r) && r.is_deleted !== true && r.status !== 'vacant');
  const rentals = rawRentals.filter(r => !input.rosensteinUnit || inferredRentalUnitCode(r) === input.rosensteinUnit);
  const rentalHistory = rentals
    .filter((r,index,rows) => rows.findIndex(candidate => (
      objectFor(candidate)?.id === objectFor(r)?.id
      && normalizePerson(rentalUnitLabel(candidate)) === normalizePerson(rentalUnitLabel(r))
      && text(candidate.start_date).slice(0,10) === text(r.start_date).slice(0,10)
      && text(candidate.end_date).slice(0,10) === text(r.end_date).slice(0,10)
      && n(candidate.rent_monthly) === n(r.rent_monthly)
      && n(candidate.kaltmiete_laut_mietvertrag) === n(r.kaltmiete_laut_mietvertrag)
      && n(candidate.nebenkosten) === n(r.nebenkosten)
    )) === index)
    .sort((a,b) => text(a.start_date).localeCompare(text(b.start_date)) || rentalUnitLabel(a).localeCompare(rentalUnitLabel(b),'de'));
  const people = s.tenant_profiles ?? [];
  const name = (c: ReportRecord) => tenantName(people.find(p => p.id === c.tenant_id));
  const referenceDate = to < today ? to : today;
  const active = contracts.filter(c => overlaps(c, referenceDate, referenceDate) && c.status !== 'planned');
  const activeRentals = rentalHistory.filter(r => overlaps(r,referenceDate,referenceDate));
  const preflight = buildTaxReportPreflight({ objects: input.objects, entries: input.entries, sources: input.sources, from, to, objectId: input.objectId, rosensteinUnit: input.rosensteinUnit });
  const entries = preflight.entries
    .filter(e => dateIn(e.booking_date, from, to) && scoped(e))
    .flatMap((entry) => {
      if (!input.rosensteinUnit) return [entry];
      const mentionedUnits = detectRosensteinTaxUnits(entry.objekt_code, entry.category, entry.note);
      const directUnit = mentionedUnits.length === 1 ? mentionedUnits[0] : null;
      if (directUnit) return directUnit === input.rosensteinUnit ? [entry] : [];
      if (entry.entry_type !== 'expense' || !isRosensteinLabel(objectFor(entry)?.label)) return [];
      const originalAmount = entry.amount;
      return [{
        ...entry,
        amount: allocateRosensteinThird(entry.amount, input.rosensteinUnit),
        loan_interest_amount: entry.loan_interest_amount == null ? entry.loan_interest_amount : allocateRosensteinThird(n(entry.loan_interest_amount), input.rosensteinUnit),
        loan_principal_amount: entry.loan_principal_amount == null ? entry.loan_principal_amount : allocateRosensteinThird(n(entry.loan_principal_amount), input.rosensteinUnit),
        _report_original_amount: originalAmount,
        _report_allocation: `Centgenauer Anteil 1/3 · ${rosensteinTaxUnitLabel(input.rosensteinUnit)}`,
        note: `${entry.note ?? entry.category ?? 'Gemeinsame Rosenstein-Ausgabe'} · gemeinsamer Beleg, Anteil 1/3`,
      }];
    })
    .sort((a,b) => text(a.booking_date).localeCompare(text(b.booking_date)) || text(a.id).localeCompare(text(b.id)));
  const incomes = entries.filter(e => e.entry_type === 'income');
  const expenses = entries.filter(e => e.entry_type === 'expense');
  const adjustments = (s.rent_adjustments ?? []).filter(r => scoped(r) && unitScoped(r)).sort((a,b) => text(b.effective_date).localeCompare(text(a.effective_date)));
  const currentRent = (c: ReportRecord, field: string) => {
    const changes = adjustments.filter(a => objectFor(a)?.id === objectFor(c)?.id && a.tenant_name === name(c) && text(a.effective_date) <= referenceDate && (!a.effective_end_date || text(a.effective_end_date) >= referenceDate));
    return changes[0]?.[`new_${field}`] ?? c[field];
  };
  const firstMonth = Number(from.slice(5,7)); const lastMonth = Number(to.slice(5,7));
  const rentRows = (rent?.rows ?? []).filter(r => (!input.objectId || r.objectId === input.objectId) && (!input.rosensteinUnit || detectRosensteinTaxUnit(r.unitLabel) === input.rosensteinUnit));
  const savedBillingWorkspaces = (s.billing_workspaces ?? []).flatMap((billing) => {
    const payload = record(billing.data);
    const workspaces = records(payload.billings).map(r => record(r.workspace));
    if (payload.meta) workspaces.push(payload);
    return workspaces.map(ws => ({ billing, ws, meta: record(ws.meta) }));
  });
  const sameUnit = (left: unknown, right: unknown) => {
    const leftCode = detectRosensteinTaxUnit(left); const rightCode = detectRosensteinTaxUnit(right);
    return leftCode || rightCode ? leftCode === rightCode : normalizePerson(left) === normalizePerson(right);
  };
  type TenantPeriod = { object?: AppObject; tenant: string; unit: string; from: string; to: string; area: unknown; advancePayments?: number; occupancyMonths?: number; source: 'Nebenkostenabrechnung' | 'Mietvertrag' | 'Mietkonto/Vermietungszeitraum'; workspace?: ReportRecord };
  const billingPeriods: TenantPeriod[] = savedBillingWorkspaces.flatMap(({billing,ws,meta}) => {
    const object = objectFor({object_code: meta.propertyCode ?? billing.object_id, property_label: meta.propertyLabel});
    const periodFrom = text(meta.periodFrom || `${meta.billingYear ?? billing.year}-01-01`).slice(0,10);
    const periodTo = text(meta.periodTo || `${meta.billingYear ?? billing.year}-12-31`).slice(0,10);
    return records(ws.apartments).filter(a => a.active !== false && text(a.tenantName)).map(a => ({ object, tenant: text(a.tenantName), unit: text(a.label), from: periodFrom, to: periodTo, area: a.area, advancePayments: n(a.advancePayments), occupancyMonths: n(a.occupancyMonths), source: 'Nebenkostenabrechnung' as const, workspace: ws }));
  }).filter(p => (!input.objectId || p.object?.id === input.objectId) && (!input.rosensteinUnit || detectRosensteinTaxUnit(p.unit) === input.rosensteinUnit) && p.from <= to && p.to >= from);
  const contractPeriods: TenantPeriod[] = contracts.map(c => ({ object: objectFor(c), tenant: name(c), unit: text(c.unit_label), from: text(c.start_date || '0000-01-01').slice(0,10), to: text(c.end_date || '9999-12-31').slice(0,10), area: areaForUnit(objectFor(c),c.unit_label), source: 'Mietvertrag' as const }));
  const meaningfulTenant = (value: unknown) => {
    const normalized = normalizePerson(value);
    return normalized && !['nicht gepflegt','nicht zugeordnet','nicht eindeutig zugeordnet'].includes(normalized) && normalized !== '';
  };
  const nextDay = (value: unknown) => {
    const date = new Date(`${text(value).slice(0,10)}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return '';
    date.setUTCDate(date.getUTCDate()+1);
    return date.toISOString().slice(0,10);
  };
  const tenantForRental = (rental: ReportRecord, fallback: unknown) => {
    const object = objectFor(rental);
    const unit = rentalUnitLabel(rental);
    const rentalFrom = text(rental.start_date || '0000-01-01').slice(0,10);
    const rentalTo = text(rental.end_date || '9999-12-31').slice(0,10);
    const unitContracts = contracts.filter(contract => objectFor(contract)?.id === object?.id && sameUnit(contract.unit_label,unit));
    const overlapping = unitContracts.find(contract => overlaps(contract,rentalFrom,rentalTo));
    if (overlapping) return name(overlapping);
    // Historische Vermietungszeiträume besitzen keine eigene Mieter-ID. Wenn der
    // zentrale Mietvertrag am direkt folgenden Tag beginnt, ist dies derselbe
    // belegte Mieterwechsel und keine unsichere Namensschätzung.
    const adjacent = unitContracts.find(contract => text(contract.start_date).slice(0,10) === nextDay(rentalTo));
    if (adjacent) return name(adjacent);
    return meaningfulTenant(fallback) ? text(fallback) : 'Nicht gepflegt';
  };
  const rentPeriods: TenantPeriod[] = rentRows.flatMap(row => rentalHistory
    .filter(r => objectFor(r)?.id === row.objectId && sameUnit(rentalUnitLabel(r),row.unitLabel))
    .map(r => ({ object: objectFor(r), tenant: tenantForRental(r,row.tenantName), unit: row.unitLabel, from: text(r.start_date || '0000-01-01').slice(0,10), to: text(r.end_date || '9999-12-31').slice(0,10), area: areaForUnit(objectFor(r),row.unitLabel), source: 'Mietkonto/Vermietungszeitraum' as const })));
  const tenancyPeriods = [
    ...billingPeriods,
    ...contractPeriods.filter(c => !billingPeriods.some(b => b.object?.id === c.object?.id && normalizePerson(b.tenant) === normalizePerson(c.tenant) && b.from <= c.to && b.to >= c.from)),
    ...rentPeriods.filter(r => ![...billingPeriods,...contractPeriods].some(existing => existing.object?.id === r.object?.id && sameUnit(existing.unit,r.unit) && existing.from <= r.to && existing.to >= r.from)),
  ];
  const periodsFor = (r: ReportRecord) => tenancyPeriods.filter(p => p.object?.id === objectFor(r)?.id);
  const tenantForRentRow = (row: RentAnnualReportSnapshot['rows'][number]) => {
    const names = tenancyPeriods
      .filter(period => period.object?.id === row.objectId && sameUnit(period.unit,row.unitLabel) && period.from <= to && period.to >= from && meaningfulTenant(period.tenant))
      .sort((left,right) => left.from.localeCompare(right.from))
      .map(period => period.tenant)
      .filter((tenant,index,all) => all.indexOf(tenant) === index);
    return names.join(' / ') || (meaningfulTenant(row.tenantName) ? row.tenantName : 'Nicht gepflegt');
  };
  const tenantForDate = (r: ReportRecord, date: string, unitCode = recordUnit(r)) => periodsFor(r).find(p => p.from <= date && p.to >= date && (!unitCode || detectRosensteinTaxUnit(p.unit) === unitCode))?.tenant;
  const tenantForEntry = (e: FinanceEntry) => {
    const mentionedUnits = detectRosensteinTaxUnits(e.objekt_code,e.category,e.note);
    const directUnit = (mentionedUnits.length === 1 ? mentionedUnits[0] : null) ?? input.rosensteinUnit ?? null;
    const periods = periodsFor(e).filter(p => !directUnit || detectRosensteinTaxUnit(p.unit) === directUnit);
    const bookingDate = text(e.booking_date).slice(0,10);
    const normalizedNote = normalizePerson(e.note);
    const named = periods.find(p => {
      const candidate = normalizePerson(p.tenant); const surname = candidate.split(' ').at(-1) ?? '';
      return candidate.length > 4 && (normalizedNote.includes(candidate) || (surname.length > 4 && normalizedNote.includes(surname)));
    });
    if (named) return named.tenant;
    if (e.entry_type === 'expense' && /kaution/i.test(text(e.category)) && /rueck|rück|guthaben/i.test(text(e.note))) {
      const previous = periods.filter(p => p.to < bookingDate).sort((a,b) => b.to.localeCompare(a.to))[0];
      if (previous) return previous.tenant;
    }
    return tenantForDate(e, bookingDate, directUnit) ?? 'Nicht eindeutig zugeordnet';
  };
  const months = rentRows.flatMap(r => r.months.filter(m => m.month >= firstMonth && m.month <= lastMonth));
  const expected = months.reduce((sum,m) => sum + m.expected,0);
  const paid = months.reduce((sum,m) => sum + m.paid,0);
  const reportingUnits = rentRows.map(row => ({ object: input.objects.find(o => o.id === row.objectId), row }));
  const rented = reportingUnits.filter(({row}) => row.months.some(m => m.month >= firstMonth && m.month <= lastMonth && m.expected > 0)).length;
  const table = (title: string, headers: string[], rows: PdfReportTable['rows'], subtitle?: string): PdfReportTable => ({ title, headers, rows, subtitle });
  const module = (id: string, tables: PdfReportTable[], paragraphs: string[] = []): ReportModule => ({ id, title: reportNames.find(r => r[0] === id)![1], tables, paragraphs });
  const rentNote = 'Soll/Ist folgt dem zentralen Mietkonto nach Mietmonat. Bei Teilmonaten wird der vollständige betroffene Mietmonat gezeigt. Künftige Monate sind neutral; Rückstände berücksichtigen nur fällige Monate.';
  const arrears = rentRows.map(r => [r.objectLabel, r.unitLabel, tenantForRentRow(r), euro(r.months.filter(m => m.month >= firstMonth && m.month <= lastMonth && `${from.slice(0,4)}-${String(m.month).padStart(2,'0')}-01` <= today).reduce((v,m) => v + rentBalancePart(m.expected,m.paid,'open'),0))]);
  const incomeGroups = new Map<string, number>(['Kaltmiete','Nebenkostenzahlungen','Nebenkostennachzahlungen','Mahngebühren'].map(k => [k,0]));
  const addIncome = (key: string, amount: number) => incomeGroups.set(key, roundMoney((incomeGroups.get(key) ?? 0) + amount));
  const splitGenericRent = (e: FinanceEntry): { cold: number; nk: number } | null => {
    const object = objectFor(e); const amount = Math.abs(e.amount); const bookingDate = text(e.booking_date).slice(0,10);
    const effectiveMonth = effectiveRentYearMonth(bookingDate,rentPaymentCutoffDay(object?.label),e.note);
    const effectiveFrom = effectiveMonth ? `${effectiveMonth.year}-${String(effectiveMonth.month).padStart(2,'0')}-01` : bookingDate;
    const effectiveTo = effectiveMonth ? new Date(effectiveMonth.year,effectiveMonth.month,0).toLocaleDateString('sv-SE') : bookingDate;
    const matchingRentalSplits = rentalHistory
      .filter(r => objectFor(r)?.id === object?.id && overlaps(r,effectiveFrom,effectiveTo))
      .filter(r => Math.abs(n(r.gesamt_mietkosten ?? r.rent_monthly) - amount) <= 0.02)
      .map(r => ({ cold: roundMoney(n(r.kaltmiete_laut_mietvertrag)), nk: roundMoney(n(r.nebenkosten)) }))
      .filter((value,index,values) => value.cold > 0 && value.nk >= 0 && values.findIndex(candidate => candidate.cold === value.cold && candidate.nk === value.nk) === index);
    if (matchingRentalSplits.length === 1) return matchingRentalSplits[0];
    const rentMonth = rentRows.find(r => r.objectId === object?.id)?.months.find(m => m.month === effectiveMonth?.month);
    if (!rentMonth || rent?.year !== effectiveMonth?.year || Math.abs(rentMonth.expected - amount) > 0.02) return null;
    const billing = billingPeriods.find(p => p.object?.id === object?.id && p.from <= effectiveTo && p.to >= effectiveFrom && n(p.occupancyMonths) > 0);
    if (billing && n(billing.advancePayments) > 0) {
      const nk = roundMoney(n(billing.advancePayments) / n(billing.occupancyMonths));
      return nk <= amount ? { cold: roundMoney(amount - nk), nk } : null;
    }
    const adjustment = adjustments.find(a => objectFor(a)?.id === object?.id && text(a.effective_date) <= effectiveTo && (!a.effective_end_date || text(a.effective_end_date) >= effectiveFrom) && Math.abs(n(a.new_total_rent) - amount) <= 0.02);
    if (adjustment) return { cold: n(adjustment.new_cold_rent), nk: n(adjustment.new_operating_costs) };
    const contract = contracts.find(c => objectFor(c)?.id === object?.id && overlaps(c,effectiveFrom,effectiveTo) && Math.abs(n(c.total_rent)-amount) <= 0.02);
    return contract ? { cold: n(contract.cold_rent), nk: n(contract.operating_costs) } : null;
  };
  const nkRuleFor = (e: FinanceEntry) => classifyNkRelevance({entry_type:e.entry_type === 'income' ? 'income' : 'expense',category:e.category,note:e.note,objectLabel:objectFor(e)?.label});
  const isReportNkRelevant = (e: FinanceEntry) => e.nk_relevant === true || nkRuleFor(e).nkRelevant;
  const billingResult = (ws: ReportRecord, apartment: ReportRecord) => {
    const occupancy = Math.min(12, Math.max(0, n(apartment.occupancyMonths)));
    const costs = records(ws.costs).map(cost => {
      const allocation = text(cost.allocation);
      const direct = /directAmount|heatingDirect/.test(allocation);
      const base = direct ? n(cost.directAmount) : n(cost.totalKey) > 0 ? n(cost.amount) * n(cost.apartmentKey) / n(cost.totalKey) : 0;
      const share = cost.prorateByOccupancy ? base * occupancy / 12 : base;
      return { share, heating: /heiz|wärme|waerme|warmwasser|kalo/i.test(text(cost.label)) || allocation === 'heatingDirect' };
    });
    const heating = costs.filter(c=>c.heating).reduce((sum,c)=>sum+c.share,0);
    const manualCo2 = Math.min(heating, Math.max(0,n(apartment.co2LandlordDeductionKalo)));
    const tenantCosts = roundMoney(Math.max(0,costs.reduce((sum,c)=>sum+c.share,0)-manualCo2));
    const balance = roundMoney(n(apartment.advancePayments)-tenantCosts);
    return { tenantCosts, balance, result: `${balance >= 0 ? 'Guthaben' : 'Nachzahlung'} · ${euro(Math.abs(balance))}` };
  };
  const excluded: FinanceEntry[] = [];
  for (const e of incomes) {
    const c = text(e.category).toLowerCase();
    if (e.tax_relevant === false || isOwnerOccupied(objectFor(e)) || /kaution|darlehensauszahlung|darlehensrate|kreditrate|umbuchung/.test(c)) { excluded.push(e); continue; }
    if (/miete/.test(c) && !/kalt|nebenkosten|betriebskosten/.test(c)) {
      const split = splitGenericRent(e);
      if (split) { addIncome('Kaltmiete',split.cold); addIncome('Nebenkostenzahlungen',split.nk); continue; }
    }
    const k = /mahn/.test(c) ? 'Mahngebühren' : /nebenkosten.*nach|nk.*nach/.test(c) ? 'Nebenkostennachzahlungen' : /mietbestandteil.nk|nebenkosten|betriebskosten/.test(c) ? 'Nebenkostenzahlungen' : /kaltmiete/.test(c) ? 'Kaltmiete' : /miete/.test(c) ? (/nachzahlung/.test(text(e.note).toLowerCase()) ? 'Mietnachzahlung – Aufteilung Kalt/NK nicht belegt' : 'Mieteinnahmen – Aufteilung Kalt/NK nicht hinterlegt') : `Sonstige Einnahmen: ${e.category ?? 'Ohne Kategorie'}`;
    addIncome(k,Math.abs(e.amount));
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
    const nkRule = nkRuleFor(e);
    const group = /instandhaltung|reparatur|verwaltung|kreditrate|darlehen/.test(c) ? 'Nicht umlagefähige Kosten' : e.nk_relevant === true || nkRule.nkRelevant ? 'Umlagefähige Kosten' : e.nk_relevant === false ? 'Nicht umlagefähige Kosten' : 'Umlagefähigkeit nicht gepflegt';
    const key = `${group} · ${/kreditrate|darlehensrate/.test(c) ? 'Darlehenszinsen' : e.category ?? 'Ohne Kategorie'}`;
    expenseGroups.set(key,(expenseGroups.get(key) ?? 0)+amount); deductible += amount;
  }
  const revenue = [...incomeGroups.values()].reduce((sum,amount) => sum+amount,0);
  const amountRow = (category: string, amount: number) => [category,'Nicht hinterlegt','Nicht hinterlegt',euro(amount)];
  const eurRows = [...incomeGroups].map(([k,amount]) => amountRow(k,amount));
  eurRows.push(amountRow('Summe Einnahmen',revenue));
  for (const group of ['Umlagefähige Kosten','Nicht umlagefähige Kosten','Umlagefähigkeit nicht gepflegt']) {
    const groupRows = [...expenseGroups].filter(([k]) => k.startsWith(`${group} ·`));
    eurRows.push(...groupRows.map(([k,v]) => amountRow(k,v)),amountRow(`Summe ${group}`,groupRows.reduce((sum,[,v]) => sum+v,0)));
  }
  eurRows.push(amountRow('Summe Ausgaben',deductible),amountRow('Ergebnis (Überschuss)',revenue-deductible));
  const cover = module('cover', [table('Kennzahlen', ['Kennzahl','Summe'], [
    ['Alle Geldbewegungen: Einnahmen',euro(total(incomes))],['Alle Geldbewegungen: Ausgaben',euro(total(expenses))],['Alle Geldbewegungen: Saldo',euro(total(incomes)-total(expenses))],['Steuerlich vorbereitete Einnahmen (EÜR)',euro(revenue)],['Steuerlich vorbereitete Ausgaben (EÜR)',euro(deductible)],['Steuerlich vorbereitetes Ergebnis (EÜR)',euro(revenue-deductible)],['Soll-Mieten', rent ? euro(expected) : 'Wird geladen'],['Ist-Mieten',rent ? euro(paid) : 'Wird geladen'],['Zahlungsquote', expected ? percent(paid/expected*100, 2) : '—'],['Einheiten mit Soll-Miete / Mietkonto-Zeilen', rent ? `${rented}/${reportingUnits.length}` : 'Wird geladen'],
  ])], [rentNote, 'Alle Geldbewegungen stimmen mit dem Buchungsjournal überein. Die EÜR schließt Kautionen, Tilgung, Anschaffungskosten, als nicht steuerrelevant markierte Buchungen und die eigengenutzte Hohenloher Str. 78 aus.', ...(input.rosensteinUnit ? [`Berichtseinheit: ${rosensteinTaxUnitLabel(input.rosensteinUnit)}. Sämtliche einheitenbezogenen Tabellen und Nachweise sind auf diesen Stellplatz begrenzt.`] : [])]);
  const eur = module('eur',[table('Einnahmen und Ausgaben',['Kategorie','Netto','Steuer','Brutto'],eurRows),table('Separat abzugrenzende Geldbewegungen',['Datum','Objekt','Mieter / Bezug','Kategorie','Beschreibung','Brutto'],excluded
    .slice()
    .sort((a,b) => text(a.booking_date).localeCompare(text(b.booking_date)) || text(a.id).localeCompare(text(b.id)))
    .map(e => [e.booking_date,label(e),tenantForEntry(e),e.category,e.note,euro(e.amount)]))],['Regelmäßige Warmmieten werden anhand des gespeicherten Abrechnungszeitraums in Kaltmiete und Nebenkostenvorauszahlung aufgeteilt. Nicht belegbar aufteilbare Nachzahlungen bleiben gesondert ausgewiesen. AfA ist in diesem zahlungsbasierten Ergebnis nicht enthalten.']);
  const contractRows = contracts.filter(c => overlaps(c,from,to)).map(c => {
    const obj = objectFor(c);
    const residentialContracts = contracts.filter(x => objectFor(x)?.id === obj?.id && !isParkingText(x.unit_label));
    const area = areaForUnit(obj,c.unit_label) ?? (residentialContracts.length <= 1 ? areaForObject(obj) : undefined);
    return [label(c),str(c.unit_label),name(c),str(c.start_date),str(c.end_date),euro(c.cold_rent),euro(c.operating_costs), c.total_rent != null && c.cold_rent != null && c.operating_costs != null ? euro(n(c.total_rent)-n(c.cold_rent)-n(c.operating_costs)) : 'Nicht gepflegt',euro(c.total_rent),str(area),n(area)>0 && c.cold_rent != null ? euro(n(c.cold_rent)/n(area)) : '—',euro(c.deposit_amount)];
  });
  for (const period of rentPeriods.filter(period => !contractPeriods.some(contract => contract.object?.id === period.object?.id && sameUnit(contract.unit,period.unit) && contract.from <= period.to && contract.to >= period.from))) {
    const rental = rentalHistory.find(row => objectFor(row)?.id === period.object?.id && sameUnit(rentalUnitLabel(row),period.unit) && text(row.start_date).slice(0,10) === period.from && text(row.end_date || '9999-12-31').slice(0,10) === period.to);
    const totalRent = rental?.gesamt_mietkosten ?? rental?.rent_monthly;
    const coldRent = rental?.kaltmiete_laut_mietvertrag ?? totalRent;
    const operatingCosts = rental?.nebenkosten ?? (totalRent != null && coldRent != null ? roundMoney(n(totalRent)-n(coldRent)) : null);
    contractRows.push([period.object?.label ?? 'Nicht zugeordnet',period.unit,period.tenant,period.from,period.to,euro(coldRent),euro(operatingCosts),totalRent != null&&coldRent != null&&operatingCosts != null?euro(n(totalRent)-n(coldRent)-n(operatingCosts)):'Nicht gepflegt',euro(totalRent),str(period.area),n(period.area)>0&&coldRent!=null?euro(n(coldRent)/n(period.area)):'—','Nicht gepflegt']);
  }
  contractRows.sort((left,right)=>String(left[0]).localeCompare(String(right[0]),'de')||String(left[1]).localeCompare(String(right[1]),'de')||String(left[3]).localeCompare(String(right[3])));
  const matrix = table('Zahlungsmatrix · Ist / Soll',['Objekt','Einheit','Mieter',...Array.from({length:12},(_,i) => new Date(2025,i,1).toLocaleDateString('de-DE',{month:'short'}))],rentRows.map(r => [r.objectLabel,r.unitLabel,tenantForRentRow(r),...r.months.map(m => {
    if (m.month < firstMonth || m.month > lastMonth) return '—';
    const monthStart = `${from.slice(0,4)}-${String(m.month).padStart(2,'0')}-01`;
    return `${euro(m.paid)} / ${euro(m.expected)} · ${paymentMatrixStatus(m, monthStart, today)}`;
  })]));
  const tenants = module('tenants',[table('Vertragsdaten',['Objekt','Einheit','Mieter','Von','Bis','Kaltmiete','NK','Sonstiges','Gesamtmiete','Fläche m²','€/m²','Kaution (vereinbart)'],contractRows),matrix],[rentNote,'Kaution bezeichnet den gespeicherten Vertragsbetrag aus der zentralen Quelle tenant_contracts.deposit_amount; ein Zahlungseingang wird daraus nicht abgeleitet. Historische Berichtsjahre verwenden jeweils den im betreffenden Mietvertrag vereinbarten Betrag.']);
  if (billingPeriods.length) tenants.tables?.splice(1,0,table('Vermietungszeiträume aus gespeicherten Abrechnungen',['Objekt','Einheit','Mieter','Von','Bis','Fläche m²','NK-Vorauszahlungen','Monate','Quelle'],billingPeriods.map(p=>[p.object?.label ?? 'Nicht zugeordnet',p.unit,p.tenant,p.from,p.to,str(p.area),euro(p.advancePayments),p.occupancyMonths ?? '—',p.source])));
  let balance = 0;
  const journal = module('journal',[table('Alle Geldbewegungen',['Datum','Einheit / Objekt','Mieter','Typ','Kategorie','Beschreibung','Eingang (+)','Ausgaben (-)','Saldo'],[...entries].sort((a,b) => text(a.booking_date).localeCompare(text(b.booking_date)) || text(a.id).localeCompare(text(b.id))).map(e => {
    balance += e.entry_type === 'income' ? Math.abs(e.amount) : e.entry_type === 'expense' ? -Math.abs(e.amount) : 0;
    return [e.booking_date,label(e),tenantForEntry(e),e.entry_type,e.category,e.note,e.entry_type==='income'?euro(Math.abs(e.amount)):'',e.entry_type==='expense'?euro(Math.abs(e.amount)):'',euro(balance)];
  }))],['Saldo = kumulierte Bewegung im gewählten Zeitraum, Anfangswert 0; kein Bankkontostand.']);
  const rentValueForObject = (o: AppObject, field: 'cold_rent' | 'operating_costs'): number | null => {
    const objectContracts = active.filter(c => objectFor(c)?.id === o.id);
    if (objectContracts.length && objectContracts.every(c => currentRent(c,field) != null)) {
      return roundMoney(objectContracts.reduce((sum,c) => sum + n(currentRent(c,field)),0));
    }
    const objectRentals = activeRentals.filter(r => objectFor(r)?.id === o.id);
    const rentalField = (r: ReportRecord) => field === 'cold_rent' ? r.kaltmiete_laut_mietvertrag : r.nebenkosten;
    return objectRentals.length && objectRentals.every(r => rentalField(r) != null)
      ? roundMoney(objectRentals.reduce((sum,r) => sum + n(rentalField(r)),0))
      : null;
  };
  const objectRows = objects.map(o => {
    const rus = reportingUnits.filter(u => u.object?.id === o.id);
    const parking = rus.filter(u => isParkingText(u.row.unitLabel)).length;
    const commercial = rus.filter(u => /commercial|gewerbe/i.test(u.row.unitLabel)).length;
    const residential = rus.length-parking-commercial;
    const area = o.livingAreaM2 ?? profiles(o).livingArea ?? profiles(o).totalArea;
    const usefulArea = profiles(o).usableArea ?? profiles(o).commercialArea;
    const completeRentSum = (field: 'cold_rent' | 'operating_costs'): number | null => rentValueForObject(o,field);
    const cold = completeRentSum('cold_rent');
    const operatingCosts = completeRentSum('operating_costs');
    const referenceMonth = Number(referenceDate.slice(5,7));
    const totalRentFromMietkonto = rent
      ? roundMoney(rus.reduce((sum,{row}) => sum + (row.months.find(month => month.month === referenceMonth)?.expected ?? 0),0))
      : null;
    const occupied = rus.filter(({row}) => row.months.some(m => m.month >= firstMonth && m.month <= lastMonth && m.expected > 0)).length;
    return [o.label,rus.length,residential,commercial,parking,0,str(area),usefulArea == null ? 'Nicht erforderlich / nicht gepflegt' : str(usefulArea),euro(cold),euro(operatingCosts),euro(totalRentFromMietkonto),cold != null&&n(area)>0?euro(cold/n(area)):'—',rus.length?percent(occupied/rus.length*100):'—'];
  });
  const portfolioStats = table('Gesamtbestand · aktueller Stand', ['Kennzahl', 'Wert'], [
    ['Mietkonto-Zeilen gesamt', reportingUnits.length],
    ['Vermietete Einheiten', rented],
    ['Wohneinheiten', reportingUnits.filter(u => !isParkingText(u.row.unitLabel)).length],
    ['Gewerbeeinheiten', reportingUnits.filter(u => /commercial|gewerbe/i.test(u.row.unitLabel)).length],
    ['Garagen / Stellplätze', reportingUnits.filter(u => isParkingText(u.row.unitLabel)).length],
    ['Wohnfläche gesamt m²', objects.filter(o => !/rosenstein/i.test(o.label)).every(o => o.livingAreaM2 != null || profiles(o).livingArea || profiles(o).totalArea) ? objects.reduce((v,o) => v+n(o.livingAreaM2 ?? profiles(o).livingArea ?? profiles(o).totalArea),0) : 'Nicht vollständig gepflegt'],
    ['Nutzfläche gesamt m²', objects.some(o => profiles(o).usableArea != null || profiles(o).commercialArea != null) ? objects.reduce((v,o) => v+n(profiles(o).usableArea ?? profiles(o).commercialArea),0) : 'Nicht erforderlich / nicht gepflegt'],
    ...(['cold_rent','operating_costs'] as const).map((key,i) => {
      const values=objects.map(o=>rentValueForObject(o,key));
      return [['Kaltmiete monatlich','Nebenkosten monatlich'][i],values.every(value=>value!=null)?euro(values.reduce((sum,value)=>sum+n(value),0)):'Nicht vollständig gepflegt'];
    }),
    ['Gesamtmiete monatlich', rent ? euro(reportingUnits.reduce((sum,{row}) => sum + (row.months.find(month => month.month === Number(referenceDate.slice(5,7)))?.expected ?? 0),0)) : 'Nicht vollständig gepflegt'],
    ['Vermietungsquote im Zeitraum', reportingUnits.length ? percent(rented/reportingUnits.length*100) : '—'],
  ]);
  const areaStatus = objects.map(o => { const area=areaForObject(o); const parkingOnly=/rosenstein/i.test(o.label); return [o.label,str(area),area?'Vollständig':'Fehlt',parkingOnly?'Immobilienvermögen · Stellplatzfläche je TG-Einheit':'Immobilienvermögen · property_extra_info']; });
  const unitDetails = reportingUnits.map(({object,row}) => { const parking=isParkingText(row.unitLabel); const area=areaForUnit(object,row.unitLabel); const activeInPeriod=row.months.some(m=>m.month>=firstMonth&&m.month<=lastMonth&&m.expected>0); return [row.objectLabel,row.unitLabel,parking?'Stellplatz / Garage':'Wohnung',str(area),activeInPeriod?'Vermietet im Zeitraum':'Ohne Soll-Miete im Zeitraum',tenantForRentRow(row)]; });
  const objectModule = module('objects',[table('Datenvollständigkeit Fläche',['Objekt','Fläche m²','Status','Hauptquelle'],areaStatus),table('Eckdaten · Stand zum Periodenende',['Objekt','Einheiten','Wohnen','Gewerbe','Garagen / Stellplätze','Unklassifiziert','Fläche m²','Nutzfläche m²','Kalt monatlich','NK monatlich','Gesamt monatlich','Kalt €/m²','Vermietungsquote'],objectRows),table('Einheiten-Details aus dem Mietkonto',['Objekt','Einheit','Art','Fläche m²','Status','Mieter'],unitDetails)],['Einheiten und Belegungsstatus stammen aus dem zentralen Mietkonto. Flächen werden direkt aus Immobilienvermögen/property_extra_info übernommen; sie werden nicht in einer zweiten Report-Datenquelle gespeichert. Bei Rosenstein gilt die dort gepflegte Fläche je TG-Stellplatz.']);
  objectModule.tables?.unshift(portfolioStats);
  const rentalHistoryRows = rentalHistory.map(r => {
    const object = objectFor(r);
    const unitLabel = rentalUnitLabel(r);
    const area = areaForUnit(object,unitLabel);
    const cold = n(r.kaltmiete_laut_mietvertrag);
    return [label(r),unitLabel,str(r.start_date),str(r.end_date),euro(cold),euro(r.nebenkosten),euro(r.gesamt_mietkosten ?? r.rent_monthly),str(area),n(area)>0&&cold>0?euro(cold/n(area)):'—','Vermietungszeitraum · zentrale Mietquelle'];
  });
  const changeModule = module('adjustments',[
    table('Mietsituation aus Vermietungszeiträumen',['Objekt','Einheit','Von','Bis','Kaltmiete','NK','Warmmiete','Fläche m²','Kalt €/m²','Hauptquelle'],rentalHistoryRows),
    table('Mietanpassungen im Zeitraum',['Objekt','Mieter','Wirksam ab / letzte Anpassung','Bis','Kalt alt','Kalt neu','NK alt','NK neu','Gesamt neu'],adjustments.filter(a=>dateIn(a.effective_date,from,to)).map(a=>[label(a),tenantForDate(a,text(a.effective_date)) ?? str(a.tenant_name),str(a.effective_date),str(a.effective_end_date),euro(a.old_cold_rent),euro(a.new_cold_rent),euro(a.old_operating_costs),euro(a.new_operating_costs),euro(a.new_total_rent)])),
    table('Fehlende Miete',['Objekt','Einheit','Mieter','Fälliger Rückstand'],arrears),
  ],[rentNote,'Historische Mietwerte stammen ausschließlich aus portfolio_property_rentals. Manuelle Anpassungen bleiben ergänzende Ereignisse und überschreiben die Vermietungszeiträume nicht.']);
  const mileage = module('mileage',[table('Einzelnachweis',['Datum','Objekt','Anlass','Start','Ziel','km','Hin/Rück','Betrag'],(s.mileage_trips ?? []).filter(r=>scoped(r)&&dateIn(r.datum,from,to)&&(!input.rosensteinUnit||unitScoped(r))).map(r=>[r.datum,label(r),r.grund,r.start_adresse,r.zieladresse,n(r.distanz_km),r.hin_und_rueckfahrt?'Ja':'Nein',euro(r.berechneter_betrag ?? r.reisekosten_betrag)]).map(r=>r.map(v=>str(v))))]);
  const vacancies = (s.unit_vacancies ?? []).filter(r=>scoped(r)&&overlaps(r,from,to)&&(!input.rosensteinUnit||unitScoped(r)));
  const vacancy = module('vacancy',[table('Leerstände',['Objekt','Einheit','Von','Bis','Status','Grund','Notiz'],vacancies.map(r=>[label(r),str(r.unit_label),str(r.start_date),str(r.end_date),str(r.status),str(r.reason),str(r.notes)]))]);
  const docs = (s.property_documents ?? []).filter(r=>scoped(r)&&(!input.rosensteinUnit||!recordUnit(r)||unitScoped(r))&&Number(r.document_year)===Number(from.slice(0,4)));
  const docTable = (rows: ReportRecord[]) => table('Archivierte Nachweise',['Objekt','Titel','Jahr','Status','Dateiname'],rows.map(r=>[label(r),str(r.title),str(r.document_year),str(r.status),str(r.file_name)]));
  const utilities = module('utilities',[docTable(docs.filter(r=>r.category==='nk_abrechnung')),table('Gebuchte umlagefähige Kosten',['Datum','Objekt','Kategorie','Beschreibung','Brutto','Prüfgrundlage'],expenses.filter(isReportNkRelevant).map(e=>[e.booking_date,label(e),e.category,e.note,euro(e.amount),e.nk_relevant===true?'Gespeichertes NK-Kennzeichen':nkRuleFor(e).reason]))],['Archivnachweis vorhandener Jahresabrechnungen; eindeutige umlagefähige Betriebskosten werden anhand der zentralen NK-Klassifizierung auch dann berücksichtigt, wenn bei einer historischen Buchung das Kennzeichen noch fehlt.']);
  for (const {billing,ws,meta} of savedBillingWorkspaces) {
      if (Number(meta.billingYear ?? billing.year) !== Number(from.slice(0,4)) || !scoped({object_code:meta.propertyCode ?? billing.object_id})) continue;
      for (const apartment of records(ws.apartments).filter(a=>a.active!==false&&(!input.rosensteinUnit||detectRosensteinTaxUnit(a.label)===input.rosensteinUnit))) {
        const result=billingResult(ws,apartment);
        const monthly=n(apartment.occupancyMonths)>0?roundMoney(n(apartment.advancePayments)/n(apartment.occupancyMonths)):0;
        const periodFrom=str(meta.periodFrom);
        const periodTo=str(meta.periodTo);
        utilities.tables?.push(table(`Nebenkostenabrechnung für ${str(apartment.tenantName)} (${periodFrom} bis ${periodTo})`, ['Objekt','Einheit','Mieter','Von','Bis','Fläche m²','Monate','Vorauszahlungen','Umlagefähige Kosten','Abrechnungsergebnis','Buchungs-/Quellenhinweis'], [[str(meta.propertyLabel),str(apartment.label),str(apartment.tenantName),periodFrom,periodTo,n(apartment.area),n(apartment.occupancyMonths),euro(apartment.advancePayments),euro(result.tenantCosts),result.result,n(apartment.occupancyMonths)>0?`NK-Vorauszahlung aus Warmmiete: ${n(apartment.occupancyMonths)} × ${euro(monthly)} = ${euro(apartment.advancePayments)}`:'Vorauszahlungen gemäß gespeicherter Abrechnung']]));
      }
      utilities.tables?.push(table('Kosten und gespeicherte Verteilerschlüssel',['Kategorie','Gesamtkosten','Verteilung','Gesamtschlüssel','Einheitenschlüssel','Direktbetrag'],records(ws.costs).map(c=>[str(c.label),euro(c.amount),str(c.allocation),n(c.totalKey),n(c.apartmentKey),euro(c.directAmount)])));
  }
  for (const billing of s.billing_workspaces ?? []) {
    const payload = record(billing.data);
    for (const garage of records(payload.records)) {
      const object = objects.find(o => o.label === garage.propertyLabel || aliases(o).has(text(billing.object_id)));
      if (Number(garage.year) !== Number(from.slice(0,4)) || (input.objectId && object?.id !== input.objectId) || (input.rosensteinUnit && detectRosensteinTaxUnit(garage.unitLabel) !== input.rosensteinUnit)) continue;
      utilities.tables?.push(table(`Nebenkostenabrechnung für ${str(garage.tenantName)} (${str(garage.periodFrom)} bis ${str(garage.periodTo)})`,['Objekt','Einheit','Mieter','Von','Bis','Vorauszahlungen','Freigegeben'],[[str(garage.propertyLabel),str(garage.unitLabel),str(garage.tenantName),str(garage.periodFrom),str(garage.periodTo),euro(garage.tenantPrepayments),garage.finalized?'Ja':'Nein']]));
      utilities.tables?.push(table('Kosten und gespeicherte Verteilerschlüssel',['Kategorie','Gesamtkosten','Verteilung','Gesamteinheiten','Eigene Einheiten'],records(garage.apportionableRows).map(c=>[str(c.label),euro(c.totalCost),str(c.key),n(c.totalUnits),n(c.yourUnits)])));
    }
  }
  const proofs = module('proofs',[docTable(docs.filter(r=>/leerstand|inserat|vermietungsbem|vacancy/i.test(JSON.stringify([r.title,r.notes,r.meta]))))]);
  const statementMoney = (value: unknown) => value == null || value === '' ? 'Nicht gepflegt' : euro(value);
  const statementArea = (value: unknown, suffix = 'm²') => value == null || value === '' || !Number.isFinite(n(value)) ? 'Nicht gepflegt' : `${new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}).format(n(value))} ${suffix}`;
  const statementPercent = (value: unknown) => value == null || value === '' ? 'Nicht gepflegt' : /%/.test(text(value)) ? text(value) : `${text(value)} %`;
  const statementAddress = (object: AppObject, profile: ReportRecord) => {
    const street = [profile.street,profile.houseNumber].filter(Boolean).map(text).join(' ').trim();
    const city = [profile.postalCode,profile.city].filter(Boolean).map(text).join(' ').trim();
    return [street || text(profile.address) || object.label,city].filter(Boolean).join(', ');
  };
  const wealthTables: PdfReportTable[] = [];
  const statementValues: Array<{market:number;debt:number}> = [];
  objects.forEach((object,index) => {
    const profile = profiles(object);
    const objectUnits = allUnits.filter(unit => objectFor(unit)?.id === object.id);
    const unitCount = n(profile.unitCount) || objectUnits.length || 1;
    const parkingOnly = isRosensteinLabel(object.label) || isParkingText(profile.propertyType) || isParkingText(profile.usageType);
    const centralArea = n(areaForObject(object));
    const totalResidentialArea = parkingOnly ? 0 : centralArea;
    const usableAreaRaw = profile.usableArea ?? profile.commercialArea ?? profile.nutzflaeche;
    const usableArea = parkingOnly && centralArea > 0 ? centralArea * unitCount : usableAreaRaw;
    const objectContracts = active.filter(contract => objectFor(contract)?.id === object.id);
    const contractUnits = new Set(objectContracts.map(contract => text(contract.unit_label) || 'Gesamte Immobilie'));
    const objectRentals = activeRentals.filter(rental => objectFor(rental)?.id === object.id && !Array.from(contractUnits).some(unit => sameUnit(unit,rentalUnitLabel(rental))));
    const occupiedUnits = [
      ...objectContracts.map(contract => ({unit:text(contract.unit_label) || 'Gesamte Immobilie',cold:n(currentRent(contract,'cold_rent'))})),
      ...objectRentals.map(rental => ({unit:rentalUnitLabel(rental),cold:n(rental.kaltmiete_laut_mietvertrag)})),
    ];
    const residentialUnits = occupiedUnits.filter(row => !isParkingText(row.unit));
    const rentedResidentialArea = isOwnerOccupied(object) ? 0 : residentialUnits.length
      ? Array.from(new Set(residentialUnits.map(row=>row.unit))).reduce((sum,unit)=>sum+n(areaForUnit(object,unit)),0)
      : 0;
    const currentColdRent = isOwnerOccupied(object) ? null : occupiedUnits.reduce((sum,row)=>sum+row.cold,0);
    const propertyType = text(profile.propertyType) || (parkingOnly ? 'Tiefgaragenstellplätze' : 'Nicht gepflegt');
    const marketValueRaw = profile.marketValue ?? profile.estimatedMarketValue;
    const marketValue = marketValueRaw == null || marketValueRaw === '' ? 0 : n(marketValueRaw);
    const objectLedger = (s.property_loan_ledger ?? [])
      .filter(row => objectFor(row)?.id === object.id && Number(row.year) <= Number(to.slice(0,4)))
      .sort((left,right)=>Number(left.year)-Number(right.year));
    const ledgerCurrent = objectLedger.at(-1);
    const dashboardLoan = input.loans.find(row => aliases(object).has(text(row.property_id)));
    const remainingDebtRaw = ledgerCurrent?.balance ?? dashboardLoan?.last_balance ?? profile.remainingDebt;
    const remainingDebt = remainingDebtRaw == null || remainingDebtRaw === '' ? 0 : n(remainingDebtRaw);
    const objectPlans = (s.property_loan_rate_plan ?? [])
      .filter(row => objectFor(row)?.id === object.id && text(row.plan_date).slice(0,10) <= referenceDate)
      .sort((left,right)=>text(left.plan_date).localeCompare(text(right.plan_date)));
    const currentPlan = objectPlans.at(-1);
    const monthlyRateRaw = currentPlan?.payment_amount ?? profile.currentMonthlyRate;
    const principalPartRaw = currentPlan?.principal_amount;
    const areaSource = 'Immobilienvermögen · property_extra_info';
    const tenancySource = isOwnerOccupied(object) ? 'Immobilienvermögen · Nutzungstyp Eigennutzung' : 'Mieterregister · tenant_contracts / Vermietungszeiträume';
    const loanBalanceSource = ledgerCurrent ? `Darlehen · property_loan_ledger (${ledgerCurrent.year})` : dashboardLoan ? 'Darlehen · zentrale Restschuld' : 'Immobilienvermögen · Darlehensprofil';
    const rateSource = currentPlan ? `Darlehen · property_loan_rate_plan (${text(currentPlan.plan_date).slice(0,7)})` : 'Immobilienvermögen · Darlehensprofil';
    statementValues.push({market:marketValue,debt:remainingDebt});
    wealthTables.push({
      title:`${object.label} · Angaben zum Objekt`,
      subtitle:`Aktueller Datenstand zum ${referenceDate}. Fehlende Werte werden nicht geschätzt.`,
      pageBreakBefore:index>0,
      headers:['Feld','Aktueller Wert','Verbindliche Hauptquelle'],
      rows:[
        ['Objektart',propertyType,areaSource],
        ['Adresse des Objekts',statementAddress(object,profile),areaSource],
        ['Gesamte Wohnfläche',statementArea(totalResidentialArea),areaSource],
        ['Davon vermietete Wohnfläche',parkingOnly?'Nicht zutreffend (TG-Stellplätze)':isOwnerOccupied(object)?'0 m² · Eigennutzung':statementArea(rentedResidentialArea),tenancySource],
        ['Nutz-/Stellplatzfläche',parkingOnly&&centralArea>0?`${statementArea(usableArea)} · ${unitCount} × ${statementArea(centralArea)}`:statementArea(usableAreaRaw),areaSource],
        ['Baujahr',str(profile.equipmentYear),areaSource],
        ['Kaufpreis',statementMoney(profile.purchasePrice),areaSource],
        ['Geschätzter Wert heute',statementMoney(marketValueRaw),areaSource],
        ['Nettokaltmiete pro Monat',isOwnerOccupied(object)?'Nicht zutreffend · Eigennutzung':statementMoney(currentColdRent),tenancySource],
        ['Anzahl Einheiten',String(unitCount),objectUnits.length?'Immobilienvermögen · portfolio_units':areaSource],
      ],
    });
    wealthTables.push({
      title:`${object.label} · Verbindlichkeiten`,
      subtitle:'Restschuld und Rate werden nicht im Report gespeichert, sondern bei jeder Erstellung direkt aus Darlehen geladen.',
      headers:['Feld','Aktueller Wert','Verbindliche Hauptquelle'],
      rows:[
        ['Darlehensgeber',str(profile.lender),'Immobilienvermögen · Darlehensprofil'],
        ['Ursprüngliche Darlehenssumme / Grundschuld',statementMoney(profile.originalLoanAmount),'Immobilienvermögen · Darlehensprofil'],
        ['Darlehensstand zum Stichtag',statementMoney(remainingDebtRaw),loanBalanceSource],
        ['Sollzinssatz',statementPercent(profile.interestRate),'Immobilienvermögen · Darlehensprofil'],
        ['Tilgungsanteil der aktuellen Rate',statementMoney(principalPartRaw),currentPlan ? rateSource : 'Nicht gepflegt'],
        ['Sollzinsbindung',str(profile.interestBinding),'Immobilienvermögen · Darlehensprofil'],
        ['Monatliche Darlehensrate',statementMoney(monthlyRateRaw),rateSource],
        ['Tilgungsersatz / Lebensversicherung',str(profile.lifeInsuranceContribution),'Immobilienvermögen · Darlehensprofil'],
      ],
    });
  });
  const wealthMarketTotal = roundMoney(statementValues.reduce((sum,row)=>sum+row.market,0));
  const wealthDebtTotal = roundMoney(statementValues.reduce((sum,row)=>sum+row.debt,0));
  const wealthStatement = module('wealth-statement',wealthTables,[
    'Die Struktur orientiert sich an der Vorlage „Aufstellung Ihres Immobilienvermögens“. Statt anonymer Nummern wird jede Immobilie mit ihrem echten Namen ausgewiesen.',
    'Single Source of Truth: Objekt-, Flächen-, Kaufpreis- und Wertangaben stammen aus Immobilienvermögen. Mieten und Vermietungsflächen stammen aus den zum Stichtag gültigen Mietverträgen beziehungsweise Vermietungszeiträumen. Restschuld, Rate und Tilgungsanteil stammen aus Darlehen.',
    'Nicht gespeicherte Werte bleiben ausdrücklich als „Nicht gepflegt“ sichtbar; Werte aus der hochgeladenen Vorlage werden nicht als zweite Datenquelle übernommen.',
  ]);
  wealthStatement.metrics = [
    {label:'Immobilien',value:String(objects.length)},
    {label:'Marktwert gesamt',value:euro(wealthMarketTotal),hint:'Nur gepflegte Marktwerte'},
    {label:'Restschuld gesamt',value:euro(wealthDebtTotal),hint:`Stand bis ${to.slice(0,4)}`},
    {label:'Rechnerisches Nettovermögen',value:euro(wealthMarketTotal-wealthDebtTotal),hint:'Marktwert minus Restschuld'},
  ];
  const register = module('register',[table('Portfolio-Register',['Objekt-ID','Immobilie','Straße','PLZ / Ort','Nutzung','Baujahr','Fläche','Kaufdatum'],objects.map(o=>{const p=profiles(o);return [o.code??o.id,o.label,str(p.street),`${text(p.postalCode)} ${text(p.city)}`,str(p.usageType),str(p.equipmentYear),str(p.totalArea??o.livingAreaM2),str(p.purchaseDate)];}))]);
  const acquisitionValue = (value: unknown) => input.rosensteinUnit && value != null && value !== '' ? allocateRosensteinThird(n(value),input.rosensteinUnit) : value;
  const acquisitionEntries = expenses.filter(e=>/anschaffung|erwerbsneben|kaufpreis|grundbuch|notar|immobilienmakler|makler/i.test(`${text(e.category)} ${text(e.note)}`));
  const acquisition = module('acquisition',[
    table(`Anschaffungskosten & AfA-Basis ${from.slice(0,4)}`,['Objekt / Einheit','Kaufdatum','Kaufpreis','Gebäudeanteil','Grund/Boden','Stellplatzanteil','Nutzen-/Lastenübergang'],objects.map(o=>{const p=profiles(o);return[input.rosensteinUnit?rosensteinTaxUnitLabel(input.rosensteinUnit):o.label,str(p.purchaseDate),euro(acquisitionValue(p.purchasePrice)),euro(acquisitionValue(p.buildingPurchasePrice)),euro(acquisitionValue(p.landPurchasePrice)),euro(acquisitionValue(p.parkingPurchasePrice)),str(p.transferBenefitsDate)];})),
    table('Erwerbs- und Anschaffungsbelege im Zeitraum',['Datum','Objekt / Einheit','Rechnung / Belegnummer','Kategorie','Gesamtbeleg','Anteil im Einzelreport','Zuordnung'],acquisitionEntries.map(e=>[
      e.booking_date,
      input.rosensteinUnit?rosensteinTaxUnitLabel(input.rosensteinUnit):label(e),
      e.note || 'Nicht gepflegt',
      e.category,
      euro(record(e)._report_original_amount ?? e.amount),
      euro(e.amount),
      str(record(e)._report_allocation ?? (recordUnit(e)?'Direkte Einheitenzuordnung':'Gesamtobjekt')),
    ])),
  ],['Dokumentation der gespeicherten Kaufpreisaufteilung. AfA-Satz, zu aktivierende Nebenkosten und zeitanteilige Abschreibung werden ohne hinterlegte Grundlage nicht errechnet.',...(input.rosensteinUnit?[`Gemeinsame Rosenstein-Kaufpreise und Erwerbsbelege werden centgenau zu einem Drittel auf ${rosensteinTaxUnitLabel(input.rosensteinUnit)} verteilt. Die Summe der drei Einzelreports entspricht stets exakt dem Gesamtbeleg; Rechnungsnummer und Originalbetrag bleiben sichtbar.`]:[])]);
  const loans = module('loans',[table('Eigenschaften und Finanzierung',['Objekt','Nutzung','Baujahr','Bank','IBAN / BIC','Darlehensnummer','Ursprungsdarlehen','Monatsrate','Zins %','Zinsbindung','Restschuld (letzter Stand)'],objects.map(o=>{const p=profiles(o);const loan=input.loans.find(l=>aliases(o).has(l.property_id));return[o.label,str(p.usageType),str(p.equipmentYear),str(p.lender),str(p.ibanBic),str(p.loanNumber),euro(p.originalLoanAmount),euro(p.currentMonthlyRate),str(p.interestRate),str(p.interestBinding),euro(loan?.last_balance??p.remainingDebt)];}))]);
  const cashflow = module('cashflow',[table('Gebuchter Netto-Cashflow',['Objekt','Einnahmen','Kosten ohne Kreditraten','Gebuchte Kreditraten','Netto-Cashflow'],[...objects.map(o=>({label:o.label,rows:entries.filter(e=>objectFor(e)?.id===o.id)})),...(!input.objectId?[{label:'Portfolio / nicht zugeordnet',rows:entries.filter(e=>!objectFor(e))}]:[])].map(group=>{
    const inc=total(group.rows.filter(e=>e.entry_type==='income')); const out=group.rows.filter(e=>e.entry_type==='expense');const rates=total(out.filter(e=>/kreditrate|darlehensrate/i.test(text(e.category))));const costs=total(out)-rates;return[group.label,euro(inc),euro(costs),euro(rates),euro(inc-costs-rates)];}))],['Zahlungsbasierter Cashflow: gebuchte Darlehensraten werden genau einmal abgezogen. Nicht gebuchte Raten werden nicht als tatsächliche Zahlung angenommen.']);
  const allocateLoanRow = (row: ReportRecord, fields: string[]): ReportRecord[] => {
    const selectedUnit = input.rosensteinUnit;
    if (!selectedUnit) return [row];
    const directUnit = recordUnit(row);
    if (directUnit) return directUnit === selectedUnit ? [row] : [];
    if (!isRosensteinLabel(objectFor(row)?.label)) return [];
    return [{...row,...Object.fromEntries(fields.map(field=>[field,row[field]==null?row[field]:allocateRosensteinThird(n(row[field]),selectedUnit)])),source:`${str(row.source ?? row.source_file)} · centgenauer Anteil 1/3`,source_file:`${str(row.source_file ?? row.source)} · centgenauer Anteil 1/3`}];
  };
  const loanYears = (s.property_loan_ledger ?? [])
    .filter(r => scoped(r) && Number.isFinite(Number(r.year)))
    .flatMap(r=>allocateLoanRow(r,['interest','principal','balance']))
    .sort((a,b) => label(a).localeCompare(label(b),'de') || Number(a.year)-Number(b.year));
  const allLoanMonths = (s.property_loan_rate_plan ?? [])
    .filter(r => scoped(r))
    .flatMap(r=>allocateLoanRow(r,['payment_amount','interest_amount','principal_amount','fee_amount','opening_balance','closing_balance']))
    .sort((a,b) => label(a).localeCompare(label(b),'de') || text(a.plan_date).localeCompare(text(b.plan_date)));
  const loanMonths = allLoanMonths.filter(r => dateIn(r.plan_date,from,to));
  const allLoanEntries = input.entries
    .filter(e=>scoped(e) && e.entry_type==='expense' && /kreditrate|darlehensrate/i.test(text(e.category)))
    .flatMap(e=>{
      if(!input.rosensteinUnit)return[e];
      const mentionedUnits=detectRosensteinTaxUnits(e.objekt_code,e.category,e.note);
      const directUnit=mentionedUnits.length===1?mentionedUnits[0]:null;
      if(directUnit)return directUnit===input.rosensteinUnit?[e]:[];
      if(!isRosensteinLabel(objectFor(e)?.label))return[];
      return [{...e,amount:allocateRosensteinThird(e.amount,input.rosensteinUnit),loan_interest_amount:e.loan_interest_amount==null?e.loan_interest_amount:allocateRosensteinThird(n(e.loan_interest_amount),input.rosensteinUnit),loan_principal_amount:e.loan_principal_amount==null?e.loan_principal_amount:allocateRosensteinThird(n(e.loan_principal_amount),input.rosensteinUnit),loan_split_source:`${str(e.loan_split_source||'Buchungen / finance_entry')} · centgenauer Anteil 1/3`}];
    })
    .sort((a,b)=>text(a.booking_date).localeCompare(text(b.booking_date)) || text(a.id).localeCompare(text(b.id)));
  const loanEntries = allLoanEntries.filter(e=>dateIn(e.booking_date,from,to));
  const loanMonthKey = (row: ReportRecord) => `${objectFor(row)?.id ?? label(row)}:${text(row.booking_date || row.plan_date).slice(0,7)}`;
  const bookedMonthKeys = new Set(loanEntries.map(loanMonthKey));
  const plannedFallback = loanMonths.filter(row=>!bookedMonthKeys.has(loanMonthKey(row)));
  const planForEntry = (entry: FinanceEntry) => allLoanMonths.find(plan=>loanMonthKey(plan)===loanMonthKey(entry));
  const splitForEntry = (entry: FinanceEntry) => {
    const hasBookedSplit = entry.loan_interest_amount != null && entry.loan_principal_amount != null;
    const plan = planForEntry(entry);
    return {
      interest: hasBookedSplit ? n(entry.loan_interest_amount) : plan ? n(plan.interest_amount) : null,
      principal: hasBookedSplit ? n(entry.loan_principal_amount) : plan ? n(plan.principal_amount) : null,
      source: hasBookedSplit ? str(entry.loan_split_source || 'Buchungen / finance_entry') : plan ? str(plan.source_file || 'Darlehen / property_loan_rate_plan') : 'Nicht gepflegt',
      plan,
    };
  };
  const loanReportLabel = (row: ReportRecord) => input.rosensteinUnit ? rosensteinTaxUnitLabel(input.rosensteinUnit) : label(row);
  const actualByObjectYear = new Map<string,{object:string;year:number;interest:number;principal:number;rates:number;count:number}>();
  for(const entry of allLoanEntries){
    const object=objectFor(entry);if(!object)continue;const year=Number(text(entry.booking_date).slice(0,4));if(!Number.isFinite(year))continue;
    const split=splitForEntry(entry);
    const key=`${object.id}:${year}`;const current=actualByObjectYear.get(key)??{object:input.rosensteinUnit?rosensteinTaxUnitLabel(input.rosensteinUnit):object.label,year,interest:0,principal:0,rates:0,count:0};
    current.interest+=split.interest??0;current.principal+=split.principal??0;current.rates+=Math.abs(n(entry.amount));current.count+=1;actualByObjectYear.set(key,current);
  }
  const bookedYears=Array.from(actualByObjectYear.values()).map(row=>({...row,interest:roundMoney(row.interest),principal:roundMoney(row.principal),rates:roundMoney(row.rates)})).sort((a,b)=>a.object.localeCompare(b.object,'de')||a.year-b.year);
  const chartYears = Array.from(new Set(bookedYears.map(r=>r.year))).sort((a,b)=>a-b);
  const chartInterest = chartYears.map(year=>roundMoney(bookedYears.filter(r=>r.year===year).reduce((sum,r)=>sum+r.interest,0)));
  const chartPrincipal = chartYears.map(year=>roundMoney(bookedYears.filter(r=>r.year===year).reduce((sum,r)=>sum+r.principal,0)));
  const periodInterest = loanEntries.reduce((sum,r)=>sum+(splitForEntry(r).interest??0),0);
  const periodPrincipal = loanEntries.reduce((sum,r)=>sum+(splitForEntry(r).principal??0),0);
  const periodRates = loanEntries.reduce((sum,r)=>sum+Math.abs(n(r.amount)),0);
  const latestYearRows = objects.flatMap(o=>{
    const rows=loanYears.filter(r=>objectFor(r)?.id===o.id);
    return rows.length?[rows.at(-1)!]:[];
  });
  const loanInterest = module('loan-interest',[
    table('Jahresübersicht Tilgungsplan je Immobilie',['Immobilie / Einheit','Jahr','Zinsen (steuerlich relevant / Werbungskosten)','Tilgung (steuerlich nicht relevant)','Kapitaldienst Plan','Restschuld Jahresende','Quelle'],loanYears.map(r=>[loanReportLabel(r),Number(r.year),euro(r.interest),euro(r.principal),euro(n(r.interest)+n(r.principal)),euro(r.balance),str(r.source)]),'Nach Immobilie und innerhalb der Immobilie chronologisch nach Jahr sortiert.'),
    table('Gebuchte Tilgung & Zinsen je Jahr',['Immobilie','Jahr','Gebuchte Raten','Zinsen Ist (steuerlich relevant / Werbungskosten)','Tilgung Ist (steuerlich nicht relevant)','Buchungen'],bookedYears.map(r=>[r.object,r.year,euro(r.rates),euro(r.interest),euro(r.principal),r.count]),'Ist-Buchungen; bei fehlender Buchungsaufteilung wird ausschließlich der passende Monatswert aus property_loan_rate_plan verwendet.'),
    table(`Monatsdetails · ${from} bis ${to}`,['Immobilie','Buchungsmonat','Status','Kreditrate','Zinsen (steuerlich relevant / Werbungskosten)','Tilgung (steuerlich nicht relevant)','Gebühren','Restschuld','Quelle'],[
      ...loanEntries.map(entry=>{const split=splitForEntry(entry);const fee=split.interest==null||split.principal==null?null:Math.max(0,roundMoney(Math.abs(n(entry.amount))-split.interest-split.principal));return[loanReportLabel(entry),text(entry.booking_date).slice(0,7),'Gebucht',euro(Math.abs(n(entry.amount))),euro(split.interest),euro(split.principal),euro(fee),split.plan?.closing_balance==null?'—':euro(split.plan.closing_balance),split.source];}),
      ...plannedFallback.map(plan=>[loanReportLabel(plan),text(plan.plan_date).slice(0,7),text(plan.plan_date).slice(0,10)<=today?'Plan · nicht gebucht':'Plan',euro(plan.payment_amount),euro(plan.interest_amount),euro(plan.principal_amount),euro(plan.fee_amount),euro(plan.closing_balance),str(plan.source_file)]),
    ].sort((a,b)=>String(a[0]).localeCompare(String(b[0]),'de')||String(a[1]).localeCompare(String(b[1]))),'Ist-Buchungen haben Vorrang. Ein importierter Monatsplan erscheint nur, wenn für dieselbe Immobilie und denselben Monat keine Kreditrate gebucht wurde.'),
  ],['Steuerliche Trennung: Zinsen sind bei vermieteten Immobilien als Werbungskosten steuerlich relevant. Tilgung ist steuerlich nicht relevant und wird ausschließlich informativ dokumentiert.','Single Source of Truth: Tatsächliche Raten stammen aus Buchungen/finance_entry. Die dort gespeicherte Zins-/Tilgungsaufteilung hat Vorrang; nur bei fehlender Aufteilung wird der exakt passende Immobilienmonat aus Darlehen/property_loan_rate_plan verwendet. Jahresplan und Restschuld stammen aus Darlehen/property_loan_ledger. Im Report werden keine Darlehenswerte separat gespeichert oder doppelt gezählt.',...(input.rosensteinUnit? [`Einheitenfilter: ${rosensteinTaxUnitLabel(input.rosensteinUnit)}. Gemeinsame Darlehenswerte des Gesamtobjekts werden centgenau zu einem Drittel verteilt. Die Summe aus P250, P253 und P254 entspricht exakt dem Gesamtwert.`]:[])]);
  loanInterest.metrics=[
    {label:'Gebuchte Zinsen',value:euro(periodInterest)},
    {label:'Gebuchte Tilgung',value:euro(periodPrincipal)},
    {label:'Gebuchte Kreditraten',value:euro(periodRates)},
    {label:'Letzte Restschuld',value:latestYearRows.length?euro(latestYearRows.reduce((sum,r)=>sum+n(r.balance),0)):'Nicht gepflegt',hint:input.objectId?'Gewählte Immobilie':'Summe der gewählten Immobilien'},
  ];
  loanInterest.charts=chartYears.length?[{
    title:'Laufzeit-Diagramm · gebuchte Zinsen und Tilgung',
    subtitle:`${input.objectId?(objects[0]?.label??'Gewählte Immobilie'):'Alle Immobilien'} · Ist-Werte aus Kreditraten-Buchungen`,
    labels:chartYears.map(String),
    series:[
      {label:'Zinsen',values:chartInterest,color:'#0f766e'},
      {label:'Tilgung',values:chartPrincipal,color:'#c9972b'},
    ],
  }]:[];
  return [taxPreflightModule(preflight),cover,eur,tenants,journal,objectModule,changeModule,mileage,vacancy,utilities,proofs,wealthStatement,register,acquisition,loans,module('arrears',[table('Offene Zahlungen',['Objekt','Einheit','Mieter','Fälliger Rückstand'],arrears),matrix],[rentNote]),cashflow,loanInterest];
}
