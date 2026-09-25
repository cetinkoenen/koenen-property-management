import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir=await mkdtemp(join(tmpdir(),'report-center-'));
await build({entryPoints:['src/services/reportCenterEngine.ts','src/lib/reportCenterExport.ts','src/lib/rentPaymentBalance.ts'],bundle:true,platform:'node',format:'esm',outdir:dir});
const {buildReportCenter}=await import(pathToFileURL(join(dir,'services/reportCenterEngine.js')));
const {reportCsv,reportWorkbook}=await import(pathToFileURL(join(dir,'lib/reportCenterExport.js')));
const {rentBalancePart}=await import(pathToFileURL(join(dir,'lib/rentPaymentBalance.js')));
assert.equal(rentBalancePart(1562.07,1562,'open'),0,'7-Cent-Differenzen sind technische Rundungstoleranz');
assert.equal(rentBalancePart(1590,1588,'open'),2,'Echte Rückstände bleiben erhalten');
assert.equal(rentBalancePart(1590,0,'open'),1590,'Fehlende Monatsmiete bleibt vollständig offen');
const objects=[{id:'core-1',code:'A',label:'Testobjekt',livingAreaM2:50,aliases:['portfolio-1']},{id:'core-2',code:'B',label:'Zweites Objekt'}];
const sources={portfolio_properties:[{id:'portfolio-1',core_property_id:'core-1'}],portfolio_units:[{id:'u1',property_id:'portfolio-1',name:'Wohnung 1',unit_type:'apartment',area_sqm:50,is_active:true}],tenant_profiles:[{id:'t1',first_name:'Ada',last_name:'Test'}],tenant_contracts:[{id:'c1',tenant_id:'t1',property_id:'core-1',unit_label:'Wohnung 1',start_date:'2025-01-01',end_date:null,status:'active',cold_rent:800,operating_costs:200,total_rent:1000,deposit_amount:2400}],portfolio_property_rentals:[{id:'legacy-rental',property_id:'portfolio-1',unit_id:null,unit_label:'Gesamte Immobilie',tenant_name:'Ada Test',start_date:'2025-01-01',end_date:null,kaltmiete_laut_mietvertrag:800,nebenkosten:200,gesamt_mietkosten:1000,rent_monthly:1000}],property_extra:[{property_id:'core-1',living_area:50,wealth_profile:{propertyType:'Eigentumswohnung',street:'Teststr.',houseNumber:'1',postalCode:'12345',city:'Teststadt',equipmentYear:'1999',unitCount:'1',totalArea:'50',purchasePrice:'130000',marketValue:'180000',buildingPurchasePrice:'100000',landPurchasePrice:'30000',lender:'Testbank',originalLoanAmount:'100000',interestRate:'1,5',interestBinding:'2030'}}],rent_adjustments:[],property_loan_ledger:[{property_id:'core-1',year:2025,interest:1200,principal:3600,balance:96400,source:'Tilgungsplan'},{property_id:'core-1',year:2026,interest:1100,principal:3700,balance:92700,source:'Tilgungsplan'}],property_loan_rate_plan:[{property_id:'core-1',property_name:'Testobjekt',plan_date:'2026-01-31',payment_amount:400,interest_amount:95,principal_amount:305,fee_amount:0,closing_balance:96095,source_file:'test.xlsx'},{property_id:'core-1',property_name:'Testobjekt',plan_date:'2026-02-28',payment_amount:400,interest_amount:90,principal_amount:310,fee_amount:0,closing_balance:95785,source_file:'test.xlsx'}]};
const entry=(id,category,amount,type='expense',extra={})=>({id,object_id:'core-1',booking_date:'2026-02-03',entry_type:type,category,amount,note:null,...extra});
const entries=[entry('1','Kaltmiete',800,'income'),entry('2','Nebenkosten',200,'income'),entry('3','Kaution',2400,'income'),entry('4','Wasser',100,'expense',{nk_relevant:true}),entry('5','Verwaltungskosten',50,'expense',{nk_relevant:true}),entry('6','Kreditrate',500,'expense',{loan_interest_amount:200,loan_principal_amount:300}),entry('7','Kaltmiete',777,'income',{booking_date:'2025-12-31'}),entry('8','Kaltmiete',999,'income',{object_id:'core-2'})];
const rent={year:2026,objectFilter:'core-1',rows:[{key:'u1',objectId:'core-1',objectLabel:'Testobjekt',unitLabel:'Wohnung 1',tenantName:'Ada Test',months:Array.from({length:12},(_,i)=>({month:i+1,expected:1000,paid:i===1?900:1000,open:i===1?100:0,status:i===1?'partial':'paid'}))}],totals:{},propertyTotals:[],kpis:{}};
const input={objects,entries,loans:[],sources,rent,from:'2026-01-01',to:'2026-12-31',objectId:'core-1',today:'2026-09-06'};
const modules=buildReportCenter(input);assert.equal(modules.length,18);
const module=id=>modules.find(m=>m.id===id);
const row=(id,label)=>module(id).tables[0].rows.find(r=>r[0]===label);
assert.equal(row('cover','Alle Geldbewegungen: Einnahmen')[1],'3.400,00 €');
assert.equal(row('cover','Steuerlich vorbereitete Einnahmen (EÜR)')[1],'1.000,00 €');
assert.equal(row('eur','Summe Einnahmen')[3],'1.000,00 €');
assert.equal(row('eur','Summe Ausgaben')[3],'350,00 €');
assert.equal(row('eur','Ergebnis (Überschuss)')[3],'650,00 €');
assert.equal(row('eur','Summe Nicht umlagefähige Kosten')[3],'250,00 €');
assert.equal(module('cashflow').tables[0].rows[0][4],'2.750,00 €');
assert.equal(module('wealth-statement').tables[0].title,'Testobjekt · Angaben zum Objekt');
assert.equal(module('wealth-statement').tables[0].rows.find(row=>row[0]==='Geschätzter Wert heute')?.[1],'180.000,00 €','Marktwert muss direkt aus Immobilienvermögen stammen');
assert.equal(module('wealth-statement').tables[0].rows.find(row=>row[0]==='Nettokaltmiete pro Monat')?.[1],'800,00 €','Aktuelle Kaltmiete muss aus dem gültigen Mietvertrag stammen');
assert.equal(module('wealth-statement').tables[0].rows.find(row=>row[0]==='Davon vermietete Wohnfläche')?.[1],'50 m²','Migrierte Parallelzeilen dürfen die vermietete Fläche nicht verdoppeln');
assert.equal(module('wealth-statement').tables[0].rows.find(row=>row[0]==='Anzahl Einheiten')?.[1],'1','Migrierte Parallelzeilen dürfen keine zusätzliche Einheit erzeugen');
assert.equal(module('wealth-statement').tables[1].rows.find(row=>row[0]==='Darlehensstand zum Stichtag')?.[1],'92.700,00 €','Restschuld muss aus dem Darlehens-Ledger des ausgewählten Jahres stammen');
assert.equal(module('wealth-statement').tables[1].rows.find(row=>row[0]==='Monatliche Darlehensrate')?.[1],'400,00 €','Aktuelle Rate muss aus dem Darlehensplan stammen');
assert.match(module('wealth-statement').paragraphs.join(' '),/Single Source of Truth/);
assert.equal(module('journal').tables[0].rows.at(-1).at(-1),'2.750,00 €');
assert.equal(row('cover','Einheiten mit Soll-Miete / Mietkonto-Zeilen')[1],'1/1');
assert.match(module('tenants').tables[1].rows[0][4],/teilweise$/);
assert.match(module('tenants').tables[1].rows[0][14],/künftig$/);
assert.equal(module('tenants').tables[0].rows[0][11],'2.400,00 €','Vereinbarte Kaution muss aus dem zeitlich passenden Mietvertrag übernommen werden');
assert.match(module('tenants').paragraphs.join(' '),/tenant_contracts\.deposit_amount/,'Der Steuerberater-Report muss die eindeutige Kautionsquelle ausweisen');
assert.equal(module('arrears').tables[0].rows[0][3],'100,00 €');
assert.deepEqual(module('loan-interest').charts[0].labels,['2026']);
assert.deepEqual(module('loan-interest').charts[0].series[0].values,[200]);
assert.equal(module('loan-interest').tables[0].rows.length,2,'Jahresübersicht enthält die vollständige Laufzeit');
assert.equal(module('loan-interest').tables[1].rows.length,1,'Gebuchte Jahressummen müssen aus den Ist-Buchungen entstehen');
assert.equal(module('loan-interest').tables[2].rows.length,2,'Ist-Buchung ersetzt den Plan nur im gleichen Objekt und Monat');
assert.equal(module('loan-interest').tables[2].rows.find(r=>r[1]==='2026-02')[2],'Gebucht');
assert.equal(module('loan-interest').metrics[0].value,'200,00 €');
const januaryLoanReport=buildReportCenter({...input,from:'2026-01-01',to:'2026-01-31'}).find(m=>m.id==='loan-interest');
assert.equal(januaryLoanReport.tables[2].rows.length,1,'Monatsfilter muss die Monatsdetails begrenzen');
assert.equal(januaryLoanReport.metrics[0].value,'0,00 €','Planwerte dürfen nicht als gebuchte Ist-Werte summiert werden');
const elsasserReport=buildReportCenter({...input,objects:[{id:'els-core',code:'Objekt_2',label:'Elsasser Str. 52',aliases:['els-legacy']}],objectId:'els-core',entries:[{id:'els-rate',object_id:'els-core',booking_date:'2026-09-14',entry_type:'expense',category:'Kreditrate',amount:430.49,note:'CHF-Kreditrate',loan_interest_amount:130.49,loan_principal_amount:300,loan_rate_plan_id:null,loan_split_source:'rule:CHF-fixed-principal:300:owner-confirmed-2026-09-11'}],sources:{property_loan_ledger:[{property_id:'els-legacy',year:2026,interest:1200,principal:3600,balance:78000,source:'Tilgungsplan'}],property_loan_rate_plan:[]},rent:null});
const elsLoan=elsasserReport.find(m=>m.id==='loan-interest');
assert.equal(elsLoan.tables[2].rows[0][3],'430,49 €','Elsasser Ist-Kreditrate muss auch ohne direkte Plan-ID erscheinen');
assert.equal(elsLoan.tables[2].rows[0][4],'130,49 €');
assert.equal(elsLoan.tables[2].rows[0][5],'300,00 €');
assert.equal(elsLoan.tables[0].rows[0][0],'Elsasser Str. 52','Historische Ledger-ID muss über Objektaliase aufgelöst werden');
const planFallbackReport=buildReportCenter({...input,entries:[{id:'missing-split',object_id:'core-1',booking_date:'2026-01-15',entry_type:'expense',category:'Kreditrate',amount:400,note:'Rate laut Darlehensplan'}]});
const fallbackLoanRow=planFallbackReport.find(m=>m.id==='loan-interest').tables[2].rows.find(r=>r[1]==='2026-01');
assert.equal(fallbackLoanRow[4],'95,00 €','Fehlender Buchungs-Zins muss exakt aus dem passenden Monatsplan kommen');
assert.equal(fallbackLoanRow[5],'305,00 €','Fehlende Buchungs-Tilgung muss exakt aus dem passenden Monatsplan kommen');
assert.equal(fallbackLoanRow[8],'test.xlsx','Der verwendete Monatsplan muss als eindeutige Quelle ausgewiesen werden');
const roundingRent={...rent,year:2025,rows:[{...rent.rows[0],months:Array.from({length:12},(_,i)=>({month:i+1,expected:1562.07,paid:[5,6,7].includes(i)?1562:1562.07,open:[5,6,7].includes(i)?0.07:0,status:[5,6,7].includes(i)?'partial':'paid'}))}]};
const roundingReport=buildReportCenter({...input,rent:roundingRent,from:'2025-01-01',to:'2025-12-31',today:'2026-09-07'});
assert.equal(roundingReport.find(m=>m.id==='arrears').tables[0].rows[0][3],'0,00 €','Drei 7-Cent-Rundungsabweichungen dürfen keinen Scheinrückstand von 0,21 € erzeugen');
const realArrearsRent={...rent,rows:[{...rent.rows[0],months:Array.from({length:12},(_,i)=>({month:i+1,expected:i<9?1590:0,paid:i===5?1588:i===6?0:i<9?1590:0,open:i===5?2:i===6?1590:0,status:i===5?'partial':i===6?'missing':'paid'}))}]};
const realArrearsReport=buildReportCenter({...input,rent:realArrearsRent,from:'2026-01-01',to:'2026-12-31',today:'2026-09-07'});
assert.equal(realArrearsReport.find(m=>m.id==='arrears').tables[0].rows[0][3],'1.592,00 €','Echter Rückstand 2026 muss vollständig erhalten bleiben');
assert.match(realArrearsReport.find(m=>m.id==='tenants').tables[1].rows[0][8],/teilweise$/,'Juni mit Teilzahlung muss im Bericht eindeutig als teilweise erscheinen');
assert.match(realArrearsReport.find(m=>m.id==='tenants').tables[1].rows[0][9],/fehlt$/,'Juli ohne Zahlung muss im Bericht eindeutig als fehlt erscheinen');
const other=buildReportCenter({...input,objectId:'core-2'});assert.equal(other.find(m=>m.id==='journal').tables[0].rows.length,1);
const ownerOccupiedEntry={...entry('9','Miete',1960,'income'),object_id:'owner-core'};
const ownerOccupied=buildReportCenter({...input,objects:[...objects,{id:'owner-core',label:'Hohenloher Str. 78',code:'H'}],entries:[...entries,ownerOccupiedEntry]});
assert.equal(ownerOccupied.find(m=>m.id==='eur').tables[0].rows.find(r=>r[0]==='Summe Einnahmen')[3],'1.000,00 €','Eigennutzung darf nicht in die EÜR fließen');

const rosensteinObject={id:'rosen-core',code:'Objekt_6',label:'Rosenstein Str. 25'};
const rosensteinUnits=[
  {id:'u250',property_id:'rosen-core',name:'Garage 1',unit_type:'garage',is_active:true},
  {id:'u253',property_id:'rosen-core',name:'Garage 2',unit_type:'garage',is_active:true},
  {id:'u254',property_id:'rosen-core',name:'Garage 3',unit_type:'garage',is_active:true},
];
const rosensteinSources={
  portfolio_units:rosensteinUnits,
  property_extra:[{property_id:'rosen-core',wealth_profile:{totalArea:'7',purchasePrice:57000,buildingPurchasePrice:39900,landPurchasePrice:17100}}],
  tenant_profiles:[{id:'t250-old',first_name:'Miriam',last_name:'Frommer'},{id:'t250',first_name:'Steffen',last_name:'Aicher'},{id:'t253',first_name:'Lena',last_name:'Huhn'},{id:'t254',first_name:'Sebastian',last_name:'Pilsl'}],
  tenant_contracts:[
    {id:'c250-old',tenant_id:'t250-old',property_id:'rosen-core',unit_label:'P250 - E008440000121',start_date:'2026-01-01',end_date:'2026-01-31',status:'ended',cold_rent:75,operating_costs:0,total_rent:75},
    {id:'c250',tenant_id:'t250',property_id:'rosen-core',unit_label:'P250 - E008440000121',start_date:'2026-03-01',status:'active',cold_rent:85,operating_costs:0,total_rent:85},
    {id:'c253',tenant_id:'t253',property_id:'rosen-core',unit_label:'P253 - E008440000122',start_date:'2026-01-01',status:'active',cold_rent:85,operating_costs:0,total_rent:85},
    {id:'c254',tenant_id:'t254',property_id:'rosen-core',unit_label:'P254 - E008440000123',start_date:'2026-01-01',end_date:'2026-05-31',status:'ended',cold_rent:90,operating_costs:0,total_rent:90},
  ],
  portfolio_property_rentals:[
    {id:'r250',property_id:'rosen-core',unit_id:'u250',start_date:'2025-11-14',end_date:'2025-12-31',kaltmiete_laut_mietvertrag:75,nebenkosten:0,gesamt_mietkosten:75,rent_monthly:75},
    {id:'r253',property_id:'rosen-core',unit_id:null,start_date:'2025-11-14',end_date:'2025-12-31',kaltmiete_laut_mietvertrag:85,nebenkosten:0,gesamt_mietkosten:85,rent_monthly:85},
    {id:'r254',property_id:'rosen-core',unit_id:'u254',start_date:'2025-11-14',end_date:'2025-12-31',kaltmiete_laut_mietvertrag:90,nebenkosten:0,gesamt_mietkosten:90,rent_monthly:90},
  ],
  property_loan_ledger:[{property_id:'rosen-core',year:2025,interest:853.45,principal:355.30,balance:59949.70,source:'Gesamtdarlehen'}],
  property_loan_rate_plan:[
    {id:'plan-nov',property_id:'rosen-core',plan_date:'2025-11-30',payment_amount:305,interest_amount:0,principal_amount:305,fee_amount:0,opening_balance:59695,closing_balance:59390,source_file:'Rosenstein-Tilgungsplan.csv'},
    {id:'plan-dec',property_id:'rosen-core',plan_date:'2025-12-31',payment_amount:305,interest_amount:559.70,principal_amount:-254.70,fee_amount:0,opening_balance:59390,closing_balance:59949.70,source_file:'Rosenstein-Tilgungsplan.csv'},
  ],
  mileage_trips:[
    {property_id:'rosen-core',datum:'2025-12-12',grund:'Belegprüfung P250',distanz_km:4,berechneter_betrag:1.2},
    {property_id:'rosen-core',datum:'2025-12-13',grund:'Belegprüfung P253',distanz_km:6,berechneter_betrag:1.8},
  ],
  unit_vacancies:[
    {property_id:'rosen-core',unit_label:'P250 - E008440000121',start_date:'2025-01-01',end_date:'2025-11-13',status:'ended'},
    {property_id:'rosen-core',unit_label:'P253 - E008440000122',start_date:'2025-01-01',end_date:'2025-11-13',status:'ended'},
  ],
};
const rosensteinEntries=[
  {id:'p250-rent',object_id:'rosen-core',booking_date:'2025-12-03',entry_type:'income',category:'Miete Garage',amount:42.50,note:'P250 - E008440000121 · Mietmonat November'},
  {id:'p253-rent',object_id:'rosen-core',booking_date:'2025-12-03',entry_type:'income',category:'Miete Garage',amount:42.50,note:'P253 - E008440000122 · Mietmonat November'},
  {id:'p254-rent',object_id:'rosen-core',booking_date:'2025-12-03',entry_type:'income',category:'Miete Garage',amount:45.90,note:'P254 - E008440000123 · Mietmonat November'},
  {id:'p253-cost',object_id:'rosen-core',booking_date:'2025-12-10',entry_type:'expense',category:'Grundsteuer',amount:3,note:'P253 - E008440000122',nk_relevant:true},
  {id:'shared-cost',object_id:'rosen-core',booking_date:'2025-12-11',entry_type:'expense',category:'Verwaltungskosten',amount:30,note:'Rosenstein gemeinsame Verwaltung',nk_relevant:false},
  {id:'notar-1',object_id:'rosen-core',booking_date:'2025-09-22',entry_type:'expense',category:'Erwerbsnebenkosten',amount:1173.06,note:'Rechnung Notar R20252087 TT',tax_relevant:false},
  {id:'makler',object_id:'rosen-core',booking_date:'2025-09-29',entry_type:'expense',category:'Erwerbsnebenkosten',amount:2713.20,note:'Rechnung Immobilienmakler Rosenstein Str. 25, TG Stellplätze P250-253-254',tax_relevant:false},
  {id:'grundbuch',object_id:'rosen-core',booking_date:'2025-10-13',entry_type:'expense',category:'Erwerbsnebenkosten',amount:333,note:'Rechnung 2547528109538 Grundbucheintragung',tax_relevant:false},
  {id:'notar-2',object_id:'rosen-core',booking_date:'2025-12-15',entry_type:'expense',category:'Erwerbsnebenkosten',amount:225.01,note:'Rechnung R20252787 TT',tax_relevant:false},
  {id:'rate-nov',object_id:'rosen-core',booking_date:'2025-11-03',entry_type:'expense',category:'Kreditrate',amount:305,note:'Rosenstein Darlehensrate November',loan_interest_amount:0,loan_principal_amount:305,loan_rate_plan_id:'plan-nov',loan_split_source:'Tilgungsplan'},
  {id:'rate-dec',object_id:'rosen-core',booking_date:'2025-12-01',entry_type:'expense',category:'Kreditrate',amount:305,note:'Rosenstein Darlehensrate Dezember',loan_interest_amount:559.70,loan_principal_amount:-254.70,loan_rate_plan_id:'plan-dec',loan_split_source:'Tilgungsplan'},
];
const rosensteinRent={year:2025,objectFilter:'rosen-core',rows:[
  {key:'p250',objectId:'rosen-core',objectLabel:'Rosenstein Str. 25',unitLabel:'P250 - E008440000121',tenantName:'—',months:Array.from({length:12},(_,i)=>({month:i+1,expected:i===10?42.5:0,paid:i===10?42.5:0,open:0,status:i===10?'paid':'inactive'}))},
  {key:'p253',objectId:'rosen-core',objectLabel:'Rosenstein Str. 25',unitLabel:'P253 - E008440000122',tenantName:'—',months:Array.from({length:12},(_,i)=>({month:i+1,expected:i===10?42.5:0,paid:i===10?42.5:0,open:0,status:i===10?'paid':'inactive'}))},
  {key:'p254',objectId:'rosen-core',objectLabel:'Rosenstein Str. 25',unitLabel:'P254 - E008440000123',tenantName:'—',months:Array.from({length:12},(_,i)=>({month:i+1,expected:i===10?45.9:0,paid:i===10?45.9:0,open:0,status:i===10?'paid':'inactive'}))},
],totals:{},propertyTotals:[],kpis:{}};
const p253Report=buildReportCenter({objects:[rosensteinObject],entries:rosensteinEntries,loans:[],sources:rosensteinSources,rent:rosensteinRent,from:'2025-01-01',to:'2025-12-31',objectId:'rosen-core',rosensteinUnit:'P253',today:'2026-09-23'});
const p253Module=id=>p253Report.find(module=>module.id===id);
assert.equal(p253Module('tenants').tables[0].rows.length,1,'P253-Einzelreport darf nur den P253-Mietvertrag enthalten');
assert.match(String(p253Module('tenants').tables[0].rows[0][1]),/P253/);
assert.equal(p253Module('tenants').tables[0].rows[0][2],'Lena Huhn','Historischer Mieter muss aus Mietkonto und Vermietungszeitraum stammen');
assert.equal(p253Module('tenants').tables[0].rows[0][3],'2025-11-14');
assert.equal(p253Module('tenants').tables[0].rows[0][4],'2025-12-31');
assert.equal(p253Module('tenants').tables[0].rows[0][9],'7','Stellplatzfläche muss aus Immobilienvermögen übernommen werden');
assert.equal(p253Module('tenants').tables[1].rows.length,1,'P253-Einzelreport darf nur die P253-Zahlungsmatrix enthalten');
assert.equal(p253Module('tenants').tables[1].rows[0][2],'Lena Huhn','Zahlungsmatrix muss den zeitlich passenden historischen Mieter statt eines Platzhalters zeigen');
assert.ok(p253Module('journal').tables[0].rows.length>=7,'P253 enthält direkte Buchungen sowie gemeinsame Erwerbs- und Kreditbuchungen anteilig');
assert.equal(p253Module('journal').tables[0].rows.find(row=>String(row[5]).includes('gemeinsame Verwaltung'))?.[7],'10,00 €','Gemeinsame Rosenstein-Ausgabe muss nachvollziehbar zu einem Drittel erscheinen');
assert.equal(p253Module('objects').tables[3].rows[0][3],'7','Einheitendetail muss die gepflegte TG-Fläche zeigen');
assert.equal(p253Module('acquisition').tables[0].rows[0][2],'19.000,00 €','Gesamtkaufpreis muss exakt zu einem Drittel zugeordnet werden');
assert.equal(p253Module('acquisition').tables[1].rows.find(row=>String(row[2]).includes('R20252087'))?.[5],'391,02 €','Notarrechnung muss mit Rechnungsnummer und exaktem Anteil erscheinen');
assert.equal(p253Module('acquisition').tables[1].rows.find(row=>String(row[2]).includes('Immobilienmakler'))?.[5],'904,40 €','Maklerrechnung mit allen Stellplatzcodes ist ein gemeinsamer Beleg');
assert.equal(p253Module('loan-interest').tables[0].rows.length,1,'Gesamtdarlehen muss anteilig P253 zugeordnet werden');
assert.equal(p253Module('loan-interest').tables[0].rows[0][2],'284,48 €');
assert.equal(p253Module('loan-interest').tables[2].rows.find(row=>row[1]==='2025-11')?.[3],'101,67 €','November-Kreditrate muss anteilig erscheinen');
assert.equal(p253Module('loan-interest').tables[2].rows.find(row=>row[1]==='2025-12')?.[4],'186,57 €','Dezember-Zins muss anteilig erscheinen');
assert.match(p253Module('loan-interest').paragraphs.join(' '),/centgenau zu einem Drittel verteilt/);
assert.match(p253Module('cover').paragraphs.join(' '),/Berichtseinheit: TG-Stellplatz P253/,'Deckblatt muss den gewählten Stellplatz eindeutig ausweisen');
assert.equal(p253Module('mileage').tables[0].rows.length,1,'Fahrtkosten im P253-Einzelreport müssen stellplatzbezogen gefiltert sein');
assert.match(String(p253Module('mileage').tables[0].rows[0][2]),/P253/);
assert.equal(p253Module('vacancy').tables[0].rows.length,1,'Leerstände im P253-Einzelreport müssen stellplatzbezogen gefiltert sein');
assert.match(String(p253Module('vacancy').tables[0].rows[0][1]),/P253/);
const individualRosensteinReports=['P250','P253','P254'].map(rosensteinUnit=>buildReportCenter({objects:[rosensteinObject],entries:rosensteinEntries,loans:[],sources:rosensteinSources,rent:rosensteinRent,from:'2025-01-01',to:'2025-12-31',objectId:'rosen-core',rosensteinUnit,today:'2026-09-23'}));
assert.deepEqual(individualRosensteinReports.map(report=>report.find(module=>module.id==='tenants').tables[0].rows[0][2]),['Miriam Frommer','Lena Huhn','Sebastian Pilsl'],'Alle drei Einzelreports müssen den aus dem anschließenden zentralen Mietvertrag belegten historischen Mieter zeigen');
const parseEuro=value=>Number(String(value).replace(/[^0-9,\-]/g,'').replace(',','.'));
const invoiceShares=individualRosensteinReports.map(report=>parseEuro(report.find(module=>module.id==='acquisition').tables[1].rows.find(row=>String(row[2]).includes('R20252787'))[5]));
assert.equal(invoiceShares.reduce((sum,value)=>sum+value,0).toFixed(2),'225.01','Drei Einzelreports müssen den gemeinsamen Beleg centgenau reproduzieren');
const novemberRates=individualRosensteinReports.map(report=>parseEuro(report.find(module=>module.id==='loan-interest').tables[2].rows.find(row=>row[1]==='2025-11')[3]));
assert.equal(novemberRates.reduce((sum,value)=>sum+value,0).toFixed(2),'305.00','Drei Einzelreports müssen die November-Kreditrate centgenau reproduzieren');
const decemberInterest=individualRosensteinReports.map(report=>parseEuro(report.find(module=>module.id==='loan-interest').tables[2].rows.find(row=>row[1]==='2025-12')[4]));
assert.equal(decemberInterest.reduce((sum,value)=>sum+value,0).toFixed(2),'559.70','Drei Einzelreports müssen den Dezember-Zins centgenau reproduzieren');
const allRosensteinReport=buildReportCenter({objects:[rosensteinObject],entries:rosensteinEntries,loans:[],sources:rosensteinSources,rent:rosensteinRent,from:'2025-01-01',to:'2025-12-31',objectId:'rosen-core',today:'2026-09-23'});
assert.equal(allRosensteinReport.find(module=>module.id==='tenants').tables[0].rows.length,3,'Gesamtreport muss alle drei Rosenstein-Stellplätze enthalten');
assert.equal(allRosensteinReport.find(module=>module.id==='journal').tables[0].rows.length,11,'Gesamtreport darf direkte oder gemeinsame Rosenstein-Buchungen nicht verlieren');
assert.equal(allRosensteinReport.find(module=>module.id==='validation').metrics.find(metric=>metric.label==='Blocker')?.value,'0','Exakt als Gesamtmiete minus Kaltmiete ableitbare TG-Nebenkosten dürfen den Export nicht blockieren');
assert.match(allRosensteinReport.find(module=>module.id==='validation').tables[0].rows.map(row=>row.join(' ')).join(' '),/7\.00 m²/,'Vorprüfung muss die zentrale Stellplatzfläche verwenden');

// Colmarer 2025: Mieterwechsel, Mietaufteilung, Kautionsrückgabe und NK-Abrechnung.
const colmarerObjects=[{id:'colmarer-core',code:'COL',label:'Colmarer Str. 45',livingAreaM2:36,aliases:['colmarer-billing']}];
const colmarerBillings=[
  {meta:{billingYear:2025,propertyCode:'colmarer-billing',propertyLabel:'Colmarer Str. 45',periodFrom:'2025-01-01',periodTo:'2025-07-31'},apartments:[{label:'Wohnung 1',tenantName:'Cansu Kurt',area:36,occupancyMonths:7,advancePayments:770,active:true}],costs:[{label:'Abfall',amount:700,allocation:'directAmount',directAmount:700}]},
  {meta:{billingYear:2025,propertyCode:'colmarer-billing',propertyLabel:'Colmarer Str. 45',periodFrom:'2025-08-01',periodTo:'2025-12-31'},apartments:[{label:'Wohnung 2',tenantName:'Nicholas Kraeft-Wendte',area:36,occupancyMonths:5,advancePayments:600,active:true}],costs:[{label:'Abfall',amount:650,allocation:'directAmount',directAmount:650}]},
];
const colmarerSources={portfolio_properties:[{id:'colmarer-billing',core_property_id:'colmarer-core'}],tenant_profiles:[{id:'nicholas',first_name:'Nicholas',last_name:'Kraeft-Wendte'}],tenant_contracts:[{id:'new-contract',tenant_id:'nicholas',property_id:'colmarer-core',unit_label:'Wohnung 2',start_date:'2025-08-01',end_date:null,status:'active',cold_rent:550,operating_costs:120,total_rent:670}],rent_adjustments:[{property_id:'colmarer-core',tenant_name:'Mieterdaten aus Vermietungszeitraum',effective_date:'2025-01-01',effective_end_date:'2025-07-31',old_cold_rent:475,new_cold_rent:485,old_operating_costs:110,new_operating_costs:110,new_total_rent:595}],billing_workspaces:[{object_id:'colmarer-billing',year:'2025',data:{billings:colmarerBillings.map((workspace,index)=>({id:`billing-${index}`,workspace}))}}]};
const colmarerEntries=[
  ...Array.from({length:7},(_,i)=>({id:`old-rent-${i}`,object_id:'colmarer-core',booking_date:`2025-${String(i+1).padStart(2,'0')}-03`,entry_type:'income',category:'Miete',amount:595,note:'Monatsmiete'})),
  ...Array.from({length:5},(_,i)=>({id:`new-rent-${i}`,object_id:'colmarer-core',booking_date:`2025-${String(i+8).padStart(2,'0')}-03`,entry_type:'income',category:'Miete',amount:670,note:'Monatsmiete'})),
  {id:'backpay',object_id:'colmarer-core',booking_date:'2025-06-12',entry_type:'income',category:'Miete',amount:192.09,note:'Colmarer Str. 45 Nachzahlung'},
  {id:'deposit-in',object_id:'colmarer-core',booking_date:'2025-07-31',entry_type:'income',category:'Kaution',amount:1650,note:'Mietsicherheit Nicholas Kraeft-Wendte'},
  {id:'deposit-out',object_id:'colmarer-core',booking_date:'2025-08-04',entry_type:'expense',category:'Kaution',amount:940,note:'Rückgabe Kaution Guthaben'},
  {id:'tax',object_id:'colmarer-core',booking_date:'2025-02-15',entry_type:'expense',category:'Steuer',amount:321.60,note:'1 JV 2025 Steuer 057/123/45678',nk_relevant:false},
  {id:'waste',object_id:'colmarer-core',booking_date:'2025-04-01',entry_type:'expense',category:'Abfallgebühr',amount:14.76,note:'Abfall 2025',nk_relevant:false},
];
const colmarerRent={year:2025,objectFilter:'colmarer-core',rows:[{key:'col',objectId:'colmarer-core',objectLabel:'Colmarer Str. 45',unitLabel:'Wohnung',tenantName:'Nicholas Kraeft-Wendte',months:Array.from({length:12},(_,i)=>({month:i+1,expected:i<7?595:670,paid:i<7?595:670,open:0,status:'paid'}))}],totals:{},propertyTotals:[],kpis:{}};
const colmarer=buildReportCenter({objects:colmarerObjects,entries:colmarerEntries,loans:[],sources:colmarerSources,rent:colmarerRent,from:'2025-01-01',to:'2025-12-31',objectId:'colmarer-core',today:'2026-09-06'});
const colModule=id=>colmarer.find(m=>m.id===id);
const colEur=label=>colModule('eur').tables[0].rows.find(r=>r[0]===label)?.[3];
assert.equal(colEur('Kaltmiete'),'6.145,00 €');
assert.equal(colEur('Nebenkostenzahlungen'),'1.370,00 €');
assert.equal(colEur('Mietnachzahlung – Aufteilung Kalt/NK nicht belegt'),'192,09 €');
assert.equal(colModule('eur').tables[1].rows.find(r=>r[3]==='Kaution'&&r[5]==='940,00 €')?.[2],'Cansu Kurt');
assert.equal(colModule('journal').tables[0].rows.find(r=>r[0]==='2025-01-03')?.[2],'Cansu Kurt');
assert.equal(colModule('adjustments').tables[1].rows[0][1],'Cansu Kurt');
assert.equal(colModule('utilities').tables[1].rows.reduce((sum,r)=>sum+Number(String(r[4]).replace(/[^0-9,]/g,'').replace(',','.')),0).toFixed(2),'336.36');
assert.match(colModule('utilities').tables[2].title,/Nebenkostenabrechnung für Cansu Kurt \(2025-01-01 bis 2025-07-31\)/);
assert.match(colModule('utilities').tables[4].title,/Nebenkostenabrechnung für Nicholas Kraeft-Wendte \(2025-08-01 bis 2025-12-31\)/);
assert.match(String(colModule('utilities').tables[2].rows[0][9]),/^Guthaben ·/);
assert.match(String(colModule('utilities').tables[4].rows[0][9]),/^Nachzahlung ·/);
const aliasReport=buildReportCenter({...input,sources:{...sources,portfolio_properties:[{id:'portfolio-shadow',core_property_id:'legacy-1',name:'Testobjekt Core Shadow'}],property_id_aliases:[{legacy_property_id:'legacy-1',object_id:'core-1'}],portfolio_units:[{id:'u-shadow',property_id:'portfolio-shadow',name:'Wohnung 1',unit_type:'apartment',is_active:true}]}});
assert.equal(aliasReport.find(m=>m.id==='objects').tables[3].rows[0][0],'Testobjekt');
assert.equal(aliasReport.find(m=>m.id==='objects').tables[3].rows[0][3],'50','Wohnfläche muss aus Immobilienvermögen übernommen werden');
const rentalHistoryReport=buildReportCenter({...input,objects:[{id:'els-core',code:'ELS',label:'Elsasser Str. 52',livingAreaM2:39,aliases:['els-portfolio']}],objectId:'els-core',entries:[{id:'rent-620',object_id:'els-core',booking_date:'2025-09-30',entry_type:'income',category:'Miete',amount:620,note:'Monatsmiete'}],sources:{portfolio_properties:[{id:'els-portfolio',core_property_id:'els-core',name:'Elsasser Str. 52'}],portfolio_property_rentals:[{id:'els-old',property_id:'els-portfolio',unit_id:'els-unit',start_date:'2024-10-01',end_date:'2025-09-29',kaltmiete_laut_mietvertrag:530,nebenkosten:80,gesamt_mietkosten:610,rent_monthly:610},{id:'els-oct',property_id:'els-portfolio',unit_id:'els-unit',start_date:'2025-10-01',end_date:'2025-11-17',kaltmiete_laut_mietvertrag:540,nebenkosten:80,gesamt_mietkosten:620,rent_monthly:620}],rent_adjustments:[]},rent:{...rent,year:2025,objectFilter:'els-core',rows:[{...rent.rows[0],objectId:'els-core',objectLabel:'Elsasser Str. 52',months:rent.rows[0].months.map(month=>({...month,expected:620,paid:620,open:0,status:'paid'}))}]},from:'2025-01-01',to:'2025-12-31'});
const elsHistory=rentalHistoryReport.find(m=>m.id==='adjustments').tables[0];
assert.equal(elsHistory.rows.length,2,'Alle Elsasser-Vermietungszeiträume vor November müssen im Report erscheinen');
assert.equal(elsHistory.rows.find(row=>row[2]==='2025-10-01')?.[8],'13,85 €','Kaltmiete je m² muss aus zentraler Wohnfläche und Kaltmiete berechnet werden');
assert.equal(rentalHistoryReport.find(m=>m.id==='eur').tables[0].rows.find(row=>row[0]==='Kaltmiete')?.[3],'540,00 €','Eine am Monatsende eingegangene Miete muss über den Vermietungszeitraum des Folgemonats aufgeteilt werden');
assert.equal(rentalHistoryReport.find(m=>m.id==='eur').tables[0].rows.find(row=>row[0]==='Nebenkostenzahlungen')?.[3],'80,00 €');
const empty=buildReportCenter({...input,entries:[],sources:{},rent:null});assert.equal(empty.length,18);assert.equal(empty.find(m=>m.id==='journal').tables[0].rows.length,0);
assert.equal(empty.find(m=>m.id==='objects').tables[2].rows[0][8],'Nicht gepflegt','Fehlende Kaltmiete darf nicht als scheinbarer Nullwert erscheinen');
assert.equal(empty.find(m=>m.id==='objects').tables[2].rows[0][9],'Nicht gepflegt','Fehlende Nebenkosten dürfen nicht als scheinbarer Nullwert erscheinen');
assert.equal(empty.find(m=>m.id==='objects').tables[2].rows[0][10],'Nicht gepflegt','Fehlende Gesamtmiete darf nicht als scheinbarer Nullwert erscheinen');
const hostile=[{id:'test',title:'=HYPERLINK("bad")',tables:[{title:'Test / Sheet',headers:['Text'],rows:[['=1+1'],['<script>'],['Müller; Name'],['line\nwrap']]}]}];
assert.match(reportCsv(hostile),/"'=1\+1"/);
await writeFile(join(dir,'report.xlsx'),reportWorkbook([...modules,...hostile]));
await writeFile(join(dir,'fixture.json'),JSON.stringify({objects,entries,sources,rent}));
console.log('Report regression checks passed. XLSX and fixture:',dir);

// Exercise the actual page loader against the document schema, including pagination.
const { readFile } = await import('node:fs/promises');
const ts = await import('typescript');
const { runInNewContext } = await import('node:vm');
const pageSource = await readFile('src/pages/ReportCenter.tsx', 'utf8');
const pdfSource = await readFile('src/lib/professionalPdfReport.ts', 'utf8');
const mileageSource = await readFile('src/services/mileageTripService.ts', 'utf8');
const taxAdvisorMigration = await readFile('supabase/migrations/20260915114500_tax_advisor_report_requirements.sql', 'utf8');
assert.match(pageSource, /const maxColumnsPerTable = repeatedColumns \+ columnsPerPart;/, 'PDF tables need a bounded column count');
assert.match(pageSource, /sections:pdfSections\(chosen\)/, 'Every selected report module must use the PDF table splitter');
assert.match(pdfSource, /size: \$\{options\.landscape \? "A4 landscape" : "A4"\}/, 'Landscape must be declared in the top-level @page rule');
assert.match(pdfSource, /td, th \{ overflow-wrap: break-word; word-break: normal;/, 'Normal PDF cells must wrap at safe boundaries');
assert.doesNotMatch(pdfSource, /text\.includes\("€"\)/, 'Descriptions containing Euro values must not become non-wrapping money cells');
assert.match(pdfSource, /td\.money-cell \{ text-align: right; white-space: nowrap;/, 'Financial amounts must be right-aligned and stay on one line');
assert.match(pdfSource, /class="payment-amount"/, 'Payment matrix values must render in separate Ist/Soll lines');
assert.match(pdfSource, /normalized\.includes\("teilweise"\)[\s\S]*normalized\.includes\("fehlt"\)/, 'Teilzahlungen und fehlende Mieten müssen im PDF als echte offene Positionen eingefärbt bleiben');
assert.match(pdfSource, /<colgroup>/, 'PDF tables need weighted column widths');
assert.match(pdfSource, /\.hero \{ break-after: page; \}/, 'The cover page must end before the first report section');
assert.match(pdfSource, /class="report-chart"/, 'Tilgung-und-Zins-Diagramme müssen im PDF als echte Grafik ausgegeben werden');
assert.match(pdfSource, /class="\$\{isSummaryRow\(row\) \? "summary-row" : ""\}"/, 'Summen- und Ergebniszeilen müssen im PDF eigens markiert werden');
assert.match(pdfSource, /tr\.summary-row td[\s\S]*font-weight: 950;[\s\S]*border-bottom: 4px double/, 'Summenzeilen müssen fett und mit doppelter Abschlusslinie formatiert sein');
assert.match(pageSource, /taxAdvisorReportIds\.filter\(id=>selected\.includes\(id\)\)/, 'Der Steuerberaterbericht muss die fachlich definierte Modulreihenfolge verwenden');
assert.match(pageSource, /id==='objects'\|\|id==='acquisition'\|\|id==='loan-interest'/, 'Objektübersicht, Anschaffungskosten und Finanzierungsabschluss müssen verbindlich bleiben');
assert.match(mileageSource, /"Immobilienmakler"[\s\S]*"Besichtigungstermin"/, 'Beide neuen Fahrtgründe müssen aus der zentralen Optionsliste kommen');
assert.match(taxAdvisorMigration, /property_mileage_trips_grund_check[\s\S]*'Immobilienmakler'[\s\S]*'Besichtigungstermin'/, 'Die Datenbank muss dieselben Fahrtgründe akzeptieren');
assert.match(taxAdvisorMigration, /tenant_profiles[\s\S]*'wolfgang'[\s\S]*'stange'[\s\S]*tenant_contracts/, 'Die Fürther Garage muss mit dem vorhandenen Mieter Wolfgang Stange verknüpft werden');
const ast = ts.createSourceFile('ReportCenter.tsx', pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const loaderSource = ast.statements.filter(statement =>
  ts.isFunctionDeclaration(statement) && statement.name?.text === 'loadSources'
  || ts.isVariableStatement(statement) && statement.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === 'tableSources'),
).map(statement => statement.getText(ast)).join('\n');
const loaderJs = ts.transpileModule(loaderSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const documentSchemaSql = await readFile('supabase/migrations/20260518220000_phase5a_storage_documents_tasks_audit.sql', 'utf8');
const documentDefinition = documentSchemaSql.split('create table if not exists public.property_documents (')[1].split('\n);')[0];
assert.doesNotMatch(documentDefinition, /\buser_id\b/);
for (const readonly of [false, true]) {
  const queries = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'test-user', email: 'test@example.com' } } }) },
    from(table) {
      const request = { table, filters: [], start: 0 }; queries.push(request);
      const query = {
        select: () => query, order: () => query,
        range(start) { request.start = start; return query; },
        eq(column, value) { request.filters.push([column, value]); return query; },
        then(resolve) {
          const invalid = table === 'property_documents' && request.filters.some(([c]) => c === 'user_id');
          resolve(invalid ? { data: null, error: { message: 'column property_documents.user_id does not exist' } } : {
            data: table === 'property_documents' ? Array.from({ length: request.start === 0 ? 500 : 1 }, (_,i) => ({ id: `doc-${request.start+i}` })) : [], error: null,
          });
        },
      };
      return query;
    },
  };
  const loaded = await runInNewContext(`${loaderJs}\nloadSources()`, { supabase, isReadonlyApprovalEmail: () => readonly });
  assert.equal(loaded.property_documents.length, 501, 'Documents must load across pages without a user_id filter');
  assert.equal(queries.filter(q => q.table === 'property_documents').length, 2);
  for (const request of queries.filter(q => !['property_documents','apartment_billing_workspaces','property_id_aliases','v_koenen_object_bridge','property_loan_ledger'].includes(q.table))) {
    assert.equal(request.filters.some(([column, value]) => column === 'user_id' && value === 'test-user'), !readonly, 'Keep existing owner filters on owner-scoped tables');
  }
}
console.log('Document schema regression passed for normal and read-only accounts, including pagination.');
