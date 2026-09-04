import assert from "node:assert/strict";

const EMPTY_DRAFT = {
  name: "",
  marketValue: "",
  estimatedMarketValue: "",
  remainingDebt: "",
  currentMonthlyRate: "",
};

const TEMPLATES = [
  { key: "lilienthaler-str-54", match: ["lilienthaler"], defaults: { ...EMPTY_DRAFT, name: "Lilienthaler Str. 54", marketValue: "530000", remainingDebt: "41667", currentMonthlyRate: "1100" } },
  { key: "elsasser-str-52", match: ["elsasser", "elsaesser"], defaults: { ...EMPTY_DRAFT, name: "Elsasser Str. 52", marketValue: "160000", remainingDebt: "78168", currentMonthlyRate: "300" } },
  { key: "colmarer-str-45", match: ["colmarer"], defaults: { ...EMPTY_DRAFT, name: "Colmarer Str. 45", marketValue: "145000", remainingDebt: "105616", currentMonthlyRate: "411" } },
  { key: "fuerther-str-74", match: ["fürther", "fuerther"], defaults: { ...EMPTY_DRAFT, name: "Fürther Str. 74", marketValue: "140000", remainingDebt: "125063", currentMonthlyRate: "439" } },
  { key: "hohenloher-str-78", match: ["hohenloher"], defaults: { ...EMPTY_DRAFT, name: "Hohenloher Str. 78", marketValue: "530000", remainingDebt: "400000", currentMonthlyRate: "1690" } },
  { key: "rosensteinstr-25", match: ["rosenstein"], defaults: { ...EMPTY_DRAFT, name: "Rosensteinstr. 25", marketValue: "60000", remainingDebt: "60000", currentMonthlyRate: "" } },
];

const ROSENSTEIN_PARKING_UNITS = [
  { key: "p250", shortLabel: "P250", reference: "P250 - E008440000121", status: "rented", monthlyRent: 85 },
  { key: "p253", shortLabel: "P253", reference: "P253 - E008440000122", status: "rented", monthlyRent: 85 },
  { key: "p254", shortLabel: "P254", reference: "P254 - E008440000123", status: "vacant", monthlyRent: 85 },
];

const roundCurrency = (value) => Math.round(Number(value || 0) * 100) / 100;

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replace(/[ä]/g, "a")
    .replace(/[ö]/g, "o")
    .replace(/[ü]/g, "u")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactReference(value) {
  return normalize(value).replace(/\s+/g, "");
}

function parkingCode(value) {
  return compactReference(value).match(/p25[034]/)?.[0] ?? null;
}

function parseAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeRatio(value, base) {
  if (!base) return 0;
  return (value / base) * 100;
}

function findTemplate(rowName) {
  const normalized = normalize(rowName);
  return TEMPLATES.find((template) => template.match.some((term) => normalized.includes(normalize(term))));
}

function withoutEmptyValues(draft = {}) {
  return Object.fromEntries(Object.entries(draft).filter(([, value]) => String(value ?? "").trim() !== ""));
}

function mergeDraft(row, template, stored) {
  return {
    ...template.defaults,
    ...(row ? { name: template.defaults.name || row.property_name } : {}),
    ...withoutEmptyValues(stored[template.key]),
    ...(row?.portfolio_property_id ? withoutEmptyValues(stored[row.portfolio_property_id]) : {}),
    ...(row?.property_id ? withoutEmptyValues(stored[row.property_id]) : {}),
  };
}

function buildCards(rows, stored = {}) {
  const usedRowIds = new Set();
  const cards = TEMPLATES.map((template) => {
    const row = rows.find((candidate) => {
      if (usedRowIds.has(candidate.property_id)) return false;
      return findTemplate(candidate.property_name)?.key === template.key;
    });
    if (row) usedRowIds.add(row.property_id);
    return { id: template.key, row, draft: mergeDraft(row, template, stored) };
  });

  rows.forEach((row) => {
    if (usedRowIds.has(row.property_id)) return;
    const id = row.portfolio_property_id ?? row.property_id;
    cards.push({
      id,
      row,
      draft: {
        ...EMPTY_DRAFT,
        ...(stored[id] ?? {}),
        ...(stored[row.property_id] ?? {}),
        name: stored[row.property_id]?.name || stored[id]?.name || row.property_name,
        remainingDebt: stored[row.property_id]?.remainingDebt || stored[id]?.remainingDebt || String(Math.round(row.last_balance || 0)),
      },
    });
  });

  return cards;
}

function isRosensteinCard(card) {
  return normalize(`${card.draft.name} ${card.row?.property_name ?? ""}`).includes("rosenstein");
}

function vacancyMatchesWealthCard(vacancy, card) {
  const row = card.row;
  const vacancyLabel = normalize([vacancy.property_id, vacancy.object_code, vacancy.object_label].filter(Boolean).join(" "));
  const cardLabel = normalize([card.id, card.draft.name, row?.property_id, row?.portfolio_property_id, row?.property_name].filter(Boolean).join(" "));
  return Boolean(
    (row?.property_id && vacancy.property_id === row.property_id) ||
      (row?.portfolio_property_id && vacancy.property_id === row.portfolio_property_id) ||
      (vacancyLabel && cardLabel && (vacancyLabel.includes(cardLabel) || cardLabel.includes(vacancyLabel))) ||
      (isRosensteinCard(card) && vacancyLabel.includes("rosenstein")),
  );
}

function vacancyMatchesParkingUnit(vacancy, card, unit) {
  if (!vacancyMatchesWealthCard(vacancy, card)) return false;
  const vacancyParkingCode = parkingCode([vacancy.unit_label, vacancy.object_code, vacancy.object_label].filter(Boolean).join(" "));
  const unitParkingCode = parkingCode(`${unit.shortLabel} ${unit.reference}`);
  if (vacancyParkingCode || unitParkingCode) return Boolean(vacancyParkingCode && unitParkingCode && vacancyParkingCode === unitParkingCode);
  const vacancyUnit = compactReference(vacancy.unit_label);
  if (!vacancyUnit) return true;
  const unitLabel = compactReference(`${unit.shortLabel} ${unit.reference}`);
  return Boolean(unitLabel && (unitLabel.includes(vacancyUnit) || vacancyUnit.includes(unitLabel)));
}

function contractMatchesWealthCard(contract, card, objects) {
  const row = card.row;
  const cardLabel = normalize(`${card.draft.name} ${row?.property_name ?? ""}`);
  const matchingObjects = objects.filter((object) => {
    const objectLabel = normalize(object.label);
    return Boolean(
      (row?.property_id && (object.id === row.property_id || object.aliases?.includes(row.property_id))) ||
      (row?.portfolio_property_id && (object.id === row.portfolio_property_id || object.aliases?.includes(row.portfolio_property_id))) ||
      (objectLabel && cardLabel && (objectLabel.includes(cardLabel) || cardLabel.includes(objectLabel))),
    );
  });
  const identifiers = new Set(
    [card.id, row?.property_id, row?.portfolio_property_id, ...matchingObjects.flatMap((object) => [object.id, object.code, ...(object.aliases ?? [])])]
      .flatMap((value) => (value ? [normalize(value)] : [])),
  );
  if ([contract.property_id, contract.object_code].some((value) => Boolean(value && identifiers.has(normalize(value))))) return true;
  const contractLabel = normalize(`${contract.object_code ?? ""} ${contract.unit_label ?? ""}`);
  return Boolean(contractLabel && cardLabel && contractLabel.includes("rosenstein") && cardLabel.includes("rosenstein"));
}

function isContractActiveOn(contract, date) {
  if (contract.status === "vacant") return false;
  if (contract.start_date && contract.start_date > date) return false;
  if (contract.end_date && contract.end_date < date) return false;
  if (contract.status === "ended" && !contract.end_date) return false;
  return true;
}

function isVacancyEffectivelyActiveInRange(vacancy, start, end) {
  if (vacancy.status === "ended") return false;
  if (vacancy.start_date > end) return false;
  if (vacancy.end_date && vacancy.end_date < start) return false;
  return true;
}

function buildRosensteinParkingUnits(card, vacancies, isoDate) {
  return ROSENSTEIN_PARKING_UNITS.map((unit) => {
    const vacancy = vacancies.find(
      (candidate) =>
        vacancyMatchesParkingUnit(candidate, card, unit) &&
        isVacancyEffectivelyActiveInRange(candidate, isoDate, isoDate),
    );
    return vacancy ? { ...unit, status: "vacant", vacancy } : unit;
  });
}

function findSnapshotForCard(card, snapshots) {
  const row = card.row;
  const cardName = normalize(card.draft.name || row?.property_name || "");
  return snapshots.find((snapshot) => {
    const snapshotName = normalize(snapshot.propertyName);
    return (
      (row?.property_id && snapshot.propertyId === row.property_id) ||
      (row?.portfolio_property_id && snapshot.portfolioPropertyId === row.portfolio_property_id) ||
      (snapshotName && cardName && (cardName.includes(snapshotName) || snapshotName.includes(cardName) || cardName.includes(snapshotName.split(" ")[0])))
    );
  });
}

function financeForCard(card, { snapshots = [], summaries = {}, extras = {}, nkEntries = {} }) {
  const row = card.row;
  const propertyId = row?.property_id ?? card.id;
  const extra = extras[propertyId] ?? {};
  const snapshot = findSnapshotForCard(card, snapshots);
  const summary = summaries[propertyId] ?? null;

  const income = snapshot?.income ?? Number(summary?.einnahmen ?? 0);
  const expenses = snapshot?.expenses ?? Number(summary?.ausgaben ?? 0);
  const rentIncome = snapshot?.rentIncome ?? Number(summary?.mieteingaenge ?? 0);
  const nebenkosten = (nkEntries[propertyId] ?? []).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const lastBalance = row?.last_balance ?? parseAmount(card.draft.remainingDebt);
  const value = parseAmount(extra.marketValue) || parseAmount(card.draft.marketValue || card.draft.estimatedMarketValue) || lastBalance || 0;
  const netCashflow = income - expenses;

  return {
    income,
    expenses,
    rentIncome,
    netCashflow,
    nebenkosten,
    value,
    lastBalance,
    repaidPercent: row?.repaid_percent ?? 0,
    grossYield: safeRatio(income, value),
    netYield: safeRatio(netCashflow, value),
  };
}

function totalsForCards(cards, data) {
  const sum = cards.reduce(
    (acc, card) => {
      const finance = financeForCard(card, data);
      acc.income += finance.income;
      acc.expenses += finance.expenses;
      acc.rentIncome += finance.rentIncome;
      acc.netCashflow += finance.netCashflow;
      acc.nebenkosten += finance.nebenkosten;
      acc.value += finance.value;
      acc.lastBalance += finance.lastBalance;
      acc.repaidPercent += finance.repaidPercent;
      return acc;
    },
    { income: 0, expenses: 0, rentIncome: 0, netCashflow: 0, nebenkosten: 0, value: 0, lastBalance: 0, repaidPercent: 0 },
  );

  return {
    ...sum,
    repaidPercent: cards.length ? sum.repaidPercent / cards.length : 0,
    grossYield: safeRatio(sum.income, sum.value),
    netYield: safeRatio(sum.netCashflow, sum.value),
  };
}

const rows = [
  { property_id: "p1", portfolio_property_id: "pf1", property_name: "Lilienthaler Str. 54", last_balance: 41667.11, repaid_percent: 34 },
  { property_id: "p2", portfolio_property_id: "pf2", property_name: "Elsasser Str. 52", last_balance: 78168.22, repaid_percent: 22 },
  { property_id: "p3", portfolio_property_id: "pf3", property_name: "Colmarer Str. 45", last_balance: 105615.68, repaid_percent: 17.49 },
  { property_id: "p4", portfolio_property_id: "pf4", property_name: "Fürther Str. 74", last_balance: 125063.44, repaid_percent: 12 },
  { property_id: "p5", portfolio_property_id: "pf5", property_name: "Hohenloher Str. 78", last_balance: 415000, repaid_percent: 0 },
  { property_id: "p6", portfolio_property_id: "pf6", property_name: "Rosensteinstr. 25", last_balance: 60000, repaid_percent: 0 },
];

const snapshots = [
  { propertyId: "p1", portfolioPropertyId: "pf1", propertyName: "Lilienthaler Str. 54", income: 5197.77, expenses: 3460, rentIncome: 5197.77 },
  { propertyId: "p2", portfolioPropertyId: "pf2", propertyName: "Elsasser Str. 52", income: 660, expenses: 1223.65, rentIncome: 660 },
  { propertyId: "p3", portfolioPropertyId: "pf3", propertyName: "Colmarer Str. 45", income: 670, expenses: 0, rentIncome: 670 },
  { propertyId: "p4", portfolioPropertyId: "pf4", propertyName: "Fürther Str. 74", income: 747.33, expenses: 0, rentIncome: 747.33 },
  { propertyId: "p5", portfolioPropertyId: "pf5", propertyName: "Hohenloher Str. 78", income: 1960, expenses: 2930.9, rentIncome: 1960 },
  { propertyId: "p6", portfolioPropertyId: "pf6", propertyName: "Rosensteinstr. 25", income: 170, expenses: 0, rentIncome: 170 },
];

const stored = {
  "lilienthaler-str-54": { marketValue: "530.000,00" },
  "hohenloher-str-78": { remainingDebt: "400000" },
};

const tests = [
  () => {
    const cards = buildCards(rows, stored);
    assert.equal(cards.length, 6);
    assert.deepEqual(cards.map((card) => card.id), TEMPLATES.map((template) => template.key));
  },
  () => {
    const cards = buildCards(rows, stored);
    for (const card of cards) {
      const routeId = card.id;
      const found = cards.find((candidate) => candidate.id === routeId || candidate.row?.property_id === routeId || candidate.row?.portfolio_property_id === routeId);
      assert.ok(found, `Detailroute fuer ${card.id} muss aufloesbar sein`);
    }
    assert.equal(cards.find((card) => card.row?.property_id === "p4")?.id, "fuerther-str-74");
  },
  () => {
    const cards = buildCards(rows, stored);
    const data = { snapshots };
    const totals = totalsForCards(cards, data);
    const expectedIncome = snapshots.reduce((sum, row) => sum + row.income, 0);
    const expectedExpenses = snapshots.reduce((sum, row) => sum + row.expenses, 0);
    const expectedBalance = rows.reduce((sum, row) => sum + row.last_balance, 0);

    assert.equal(roundCurrency(totals.income), roundCurrency(expectedIncome));
    assert.equal(roundCurrency(totals.expenses), roundCurrency(expectedExpenses));
    assert.equal(roundCurrency(totals.netCashflow), roundCurrency(expectedIncome - expectedExpenses));
    assert.equal(roundCurrency(totals.lastBalance), roundCurrency(expectedBalance));
  },
  () => {
    const cards = buildCards(rows, stored);
    const totals = totalsForCards(cards, { snapshots });
    const value = cards.reduce((sum, card) => sum + financeForCard(card, { snapshots }).value, 0);
    assert.equal(roundCurrency(totals.grossYield), roundCurrency((totals.income / value) * 100));
    assert.equal(roundCurrency(totals.netYield), roundCurrency((totals.netCashflow / value) * 100));
  },
  () => {
    const cards = buildCards(rows, stored);
    const hohenloher = cards.find((card) => card.id === "hohenloher-str-78");
    assert.ok(hohenloher);
    const finance = financeForCard(hohenloher, { snapshots });
    assert.equal(finance.lastBalance, 415000, "Live-Darlehenswert muss Draft-Restschuld uebersteuern");
  },
  () => {
    const cards = buildCards(rows, stored);
    const rosenstein = cards.find((card) => card.id === "rosensteinstr-25");
    const vacancies = [{ property_id: "p6", object_label: "Rosenstein Str. 25", unit_label: "P254", status: "active", start_date: "2026-06-01", end_date: "2026-07-31" }];
    const julyUnits = buildRosensteinParkingUnits(rosenstein, vacancies, "2026-07-31");
    const augustUnits = buildRosensteinParkingUnits(rosenstein, vacancies, "2026-08-01");
    assert.equal(julyUnits.filter((unit) => unit.status === "vacant").map((unit) => unit.shortLabel).join(","), "P254");
    assert.equal(julyUnits.filter((unit) => unit.status === "rented").reduce((sum, unit) => sum + unit.monthlyRent, 0), 170);
    assert.equal(augustUnits.filter((unit) => unit.status === "vacant").length, 1, "Basis-P254 bleibt als Leerstand gefuehrt, bis Vermietung explizit gepflegt wird");
  },
  () => {
    const cards = buildCards(rows, stored);
    const rosenstein = cards.find((card) => card.id === "rosensteinstr-25");
    const objects = [{
      id: "object-master-rosenstein",
      code: "Objekt_6",
      label: "Rosenstein Str. 25",
      aliases: ["p6", "pf6"],
    }];
    assert.equal(
      contractMatchesWealthCard({ property_id: "object-master-rosenstein", object_code: "Objekt_6", unit_label: "P250" }, rosenstein, objects),
      true,
      "Rosenstein-Vertraege muessen ueber die zentrale Objektbruecke mit der Vermoegenskarte verknuepft werden",
    );
    assert.equal(
      contractMatchesWealthCard({ property_id: "foreign-object", object_code: "Objekt_2", unit_label: "P250" }, rosenstein, objects),
      false,
      "Eine gleiche Einheitsbezeichnung allein darf kein anderes Objekt verknuepfen",
    );
    assert.equal(
      isContractActiveOn({ status: "ended", start_date: "2026-01-01", end_date: "2026-09-29" }, "2026-09-04"),
      true,
      "Ein wegen geplantem Leerstand technisch beendeter Vertrag muss bis zu seinem Enddatum aktiv bleiben",
    );
    assert.equal(
      isContractActiveOn({ status: "ended", start_date: "2026-01-01", end_date: "2026-09-29" }, "2026-10-01"),
      false,
      "Nach dem Vertragsende darf der Stellplatz nicht mehr als vermietet gelten",
    );
  },
  () => {
    const cards = buildCards(rows, stored);
    const extraOverride = { p3: { marketValue: "150000" } };
    const finance = financeForCard(cards.find((card) => card.id === "colmarer-str-45"), { snapshots, extras: extraOverride });
    assert.equal(finance.value, 150000, "Extra-Marktwert muss fuer Karte, Detail und Dashboard identisch verwendet werden");
    assert.equal(roundCurrency(finance.netCashflow), 670);
    assert.equal(roundCurrency(finance.netYield), roundCurrency((670 / 150000) * 100));
  },
  () => {
    const cards = buildCards(rows, stored);
    const nkEntries = { p1: [{ amount: 120.11 }, { amount: 49.89 }] };
    const finance = financeForCard(cards.find((card) => card.id === "lilienthaler-str-54"), { snapshots, nkEntries });
    assert.equal(roundCurrency(finance.nebenkosten), 170);
  },
  () => {
    const cards = buildCards(rows, {
      "lilienthaler-str-54": { marketValue: "111000", notes: "lokale Vorlage" },
      pf1: { marketValue: "222000", notes: "lokale Portfolio-ID" },
      p1: { marketValue: "333000", notes: "zentrale Supabase-Quelle" },
    });
    const lilienthaler = cards.find((card) => card.id === "lilienthaler-str-54");
    assert.equal(lilienthaler?.draft.marketValue, "333000", "Supabase-Profil der Kernobjekt-ID muss lokale Altdaten uebersteuern");
    assert.equal(lilienthaler?.draft.notes, "zentrale Supabase-Quelle");
  },
];

for (const [index, run] of tests.entries()) {
  run();
  console.log(`ok ${index + 1} - Immobilienvermoegen-Stressfall bestanden`);
}

console.log(`\n${tests.length} Stressfaelle fuer Immobilienvermoegen, Detailverlinkung und KPI-Mathematik bestanden.`);
