import assert from "node:assert/strict";

const roundCurrency = (value) => Math.round(Number(value || 0) * 100) / 100;
const money = (value) => (Number.isFinite(Number(value)) ? roundCurrency(Number(value)) : 0);
const toIso = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (value, days) => {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toIso(date);
};
const monthStart = (year, month) => toIso(new Date(year, month - 1, 1));
const monthEnd = (year, month) => toIso(new Date(year, month, 0));

function isEndedTenancyVacancySignal(vacancy) {
  if (!vacancy.end_date) return false;
  return vacancy.vacancy_type === "contract_ended";
}

function effectiveVacancyStartDate(vacancy) {
  if (vacancy.status !== "ended" && isEndedTenancyVacancySignal(vacancy)) {
    return addDays(vacancy.end_date, 1);
  }
  return vacancy.start_date;
}

function isVacancyActiveInRange(vacancy, start, end) {
  if (vacancy.status === "ended") return false;
  if (vacancy.start_date > end) return false;
  if (vacancy.end_date && vacancy.end_date < start) return false;
  return true;
}

function isVacancyInRange(vacancy, start, end) {
  if (vacancy.start_date > end) return false;
  if (vacancy.end_date && vacancy.end_date < start) return false;
  return true;
}

function isVacancyEffectivelyActiveInRange(vacancy, start, end) {
  if (vacancy.status === "ended") return false;
  if (isEndedTenancyVacancySignal(vacancy)) {
    return effectiveVacancyStartDate(vacancy) <= end;
  }
  return isVacancyActiveInRange(vacancy, start, end);
}

function effectiveRentMonth(entry, isLilienthaler = false) {
  const date = new Date(`${entry.booking_date}T00:00:00`);
  const day = Number(entry.booking_date.slice(8, 10));
  if (!isLilienthaler && day >= 25 && /miete|warmmiete|kaltmiete|mietbestandteil/i.test(`${entry.category} ${entry.note}`)) {
    date.setMonth(date.getMonth() + 1);
  }
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function rentReferenceText(entry) {
  return String(`${entry.category ?? ""} ${entry.note ?? ""} ${entry.objekt_code ?? ""}`)
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replace(/[ä]/g, "a")
    .replace(/[ö]/g, "o")
    .replace(/[ü]/g, "u")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isExcludedFromRentReceipt(entry) {
  const text = rentReferenceText(entry);
  if (entry.entry_type === "income") {
    return (
      text.includes("kaution") ||
      text.includes("erstattung") ||
      text.includes("rueckzahlung") ||
      text.includes("ruckzahlung") ||
      text.includes("darlehen") ||
      text.includes("loan") ||
      text.includes("zinsen") ||
      text.includes("versicherung") ||
      text.includes("steuer")
    );
  }

  return text.includes("nebenkosten") || text.includes("nk");
}

function manualNewTotal(adjustment) {
  return money((adjustment.new_cold_rent ?? 0) + (adjustment.new_operating_costs ?? 0));
}

function manualOldTotal(adjustment) {
  return money((adjustment.old_cold_rent ?? 0) + (adjustment.old_operating_costs ?? 0));
}

function rentalOverlapsMonth(rental, year, month) {
  const start = monthStart(year, month);
  const end = monthEnd(year, month);
  if (!rental.start_date || rental.start_date > end) return false;
  if (rental.end_date && rental.end_date < start) return false;
  return money(rental.rent_monthly) > 0;
}

function compactReference(value) {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replace(/[ä]/g, "a")
    .replace(/[ö]/g, "o")
    .replace(/[ü]/g, "u")
    .replace(/[^a-z0-9]+/g, "");
}

function parkingCode(value) {
  return compactReference(value).match(/p25[034]/)?.[0] ?? null;
}

function vacancyMatchesParkingUnit(vacancy, unit) {
  const vacancyParkingCode = parkingCode([vacancy.unit_label, vacancy.object_code, vacancy.object_label].filter(Boolean).join(" "));
  const unitParkingCode = parkingCode(`${unit.shortLabel} ${unit.reference}`);
  return Boolean(vacancyParkingCode && unitParkingCode && vacancyParkingCode === unitParkingCode);
}

function rentStatusFromVacancy(vacancy, year, month) {
  return isVacancyInRange(vacancy, monthStart(year, month), monthEnd(year, month)) ? "Leerstand" : "Pruefen";
}

function wealthParkingStatus(unit, vacancies, isoDate) {
  const vacancy = vacancies.find((candidate) => vacancyMatchesParkingUnit(candidate, unit) && isVacancyEffectivelyActiveInRange(candidate, isoDate, isoDate));
  return vacancy ? "Leerstand" : unit.status === "rented" ? "Vermietet" : "Leerstand";
}

function taxVacancyRows(vacancies, year) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  return vacancies
    .filter((vacancy) => isVacancyInRange(vacancy, start, end))
    .map((vacancy) => ({
      object: vacancy.object_label || vacancy.object_code || vacancy.property_id,
      unit: vacancy.unit_label || "Gesamte Immobilie",
      period: `${vacancy.start_date} bis ${vacancy.end_date ?? "offen"}`,
      hint: "Leerstand aus Seite Leerstand fuer Steuer-Nachweis uebernommen",
    }));
}

const tests = [
  () => {
    const vacancy = { vacancy_type: "notice", status: "active", start_date: "2026-06-01", end_date: "2026-07-31" };
    assert.equal(effectiveVacancyStartDate(vacancy), "2026-06-01", "Manueller Kündigungs-Leerstand muss seinen Beginn behalten");
    assert.equal(isVacancyEffectivelyActiveInRange(vacancy, "2026-06-01", "2026-07-31"), true);
    assert.equal(isVacancyEffectivelyActiveInRange(vacancy, "2026-08-01", "2026-08-31"), false);
  },
  () => {
    const vacancy = { vacancy_type: "contract_ended", status: "active", start_date: "2026-02-28", end_date: "2026-02-28" };
    assert.equal(effectiveVacancyStartDate(vacancy), "2026-03-01", "Abgeleiteter Vertragsende-Leerstand startet am Folgetag");
  },
  () => {
    const vacancy = { vacancy_type: "manual", status: "planned", start_date: "2026-10-01", end_date: null };
    assert.equal(isVacancyEffectivelyActiveInRange(vacancy, "2026-07-01", "2026-07-31"), false);
    assert.equal(isVacancyEffectivelyActiveInRange(vacancy, "2026-10-01", "2026-10-31"), true);
  },
  () => {
    assert.equal(rentalOverlapsMonth({ start_date: "2026-01-01", end_date: "2026-09-29", rent_monthly: 85 }, 2026, 7), true);
    assert.equal(rentalOverlapsMonth({ start_date: "2026-01-01", end_date: "2026-09-29", rent_monthly: 85 }, 2026, 10), false);
    assert.equal(rentalOverlapsMonth({ start_date: "2026-08-01", end_date: null, rent_monthly: 94 }, 2026, 7), false);
    assert.equal(rentalOverlapsMonth({ start_date: "2026-08-01", end_date: null, rent_monthly: 94 }, 2026, 8), true);
  },
  () => {
    assert.deepEqual(effectiveRentMonth({ booking_date: "2026-01-25", category: "Miete", note: "" }), { year: 2026, month: 2 });
    assert.deepEqual(effectiveRentMonth({ booking_date: "2026-01-25", category: "Miete", note: "" }, true), { year: 2026, month: 1 });
  },
  () => {
    assert.equal(
      isExcludedFromRentReceipt({
        entry_type: "income",
        category: "Miete",
        note: "Lilienthaler Str. 54 inkl. Nachzahlung Nebenkosten",
        objekt_code: "Objekt_1",
      }),
      false,
      "Warmmiete/Nachzahlung mit Nebenkosten darf im Mieteingang nicht fehlen",
    );
    assert.equal(
      isExcludedFromRentReceipt({
        entry_type: "income",
        category: "Kaution",
        note: "Lilienthaler Str. 54",
        objekt_code: "Objekt_1",
      }),
      true,
      "Kaution bleibt vom Mieteingang ausgeschlossen",
    );
  },
  () => {
    const adjustment = {
      old_cold_rent: 560.58,
      old_operating_costs: 110,
      new_cold_rent: 672.33,
      new_operating_costs: 75,
    };
    assert.equal(manualOldTotal(adjustment), 670.58);
    assert.equal(manualNewTotal(adjustment), 747.33);
  },
  () => {
    const vacancy = {
      property_id: "rosenstein-id",
      object_code: "Rosenstein Str. 25",
      object_label: "Rosenstein Str. 25",
      unit_label: "P254",
      vacancy_type: "notice",
      status: "active",
      start_date: "2026-06-01",
      end_date: "2026-07-31",
    };
    assert.equal(rentStatusFromVacancy(vacancy, 2026, 7), "Leerstand");
    assert.equal(rentStatusFromVacancy(vacancy, 2026, 8), "Pruefen");
  },
  () => {
    const p253 = { shortLabel: "P253", reference: "P253 - E008440000122", status: "rented" };
    const p254 = { shortLabel: "P254", reference: "P254 - E008440000123", status: "rented" };
    const vacancies = [
      {
        property_id: "rosenstein-id",
        object_code: "Rosenstein Str. 25",
        object_label: "Rosenstein Str. 25",
        unit_label: "P254",
        vacancy_type: "notice",
        status: "active",
        start_date: "2026-06-01",
        end_date: "2026-07-31",
      },
    ];
    assert.equal(wealthParkingStatus(p253, vacancies, "2026-07-31"), "Vermietet");
    assert.equal(wealthParkingStatus(p254, vacancies, "2026-07-31"), "Leerstand");
  },
  () => {
    const rows = taxVacancyRows(
      [
        {
          property_id: "rosenstein-id",
          object_code: "Rosenstein Str. 25",
          object_label: "Rosenstein Str. 25",
          unit_label: "P254",
          vacancy_type: "notice",
          status: "active",
          start_date: "2026-06-01",
          end_date: "2026-07-31",
        },
      ],
      2026,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].unit, "P254");
    assert.match(rows[0].hint, /Steuer-Nachweis/);
  },
];

for (const [index, run] of tests.entries()) {
  run();
  console.log(`ok ${index + 1} - Stressfall bestanden`);
}

console.log(`\n${tests.length} Stressfaelle fuer Mietentwicklung und Leerstand bestanden.`);
