import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir=await mkdtemp(join(tmpdir(),'report-center-'));
await build({entryPoints:['src/services/reportCenterEngine.ts','src/lib/reportCenterExport.ts'],bundle:true,platform:'node',format:'esm',outdir:dir});
const {buildReportCenter}=await import(pathToFileURL(join(dir,'services/reportCenterEngine.js')));
const {reportCsv,reportWorkbook}=await import(pathToFileURL(join(dir,'lib/reportCenterExport.js')));
const objects=[{id:'core-1',code:'A',label:'Testobjekt',livingAreaM2:50,aliases:['portfolio-1']},{id:'core-2',code:'B',label:'Zweites Objekt'}];
const sources={portfolio_properties:[{id:'portfolio-1',core_property_id:'core-1'}],portfolio_units:[{id:'u1',property_id:'portfolio-1',name:'Wohnung 1',unit_type:'apartment',area_sqm:50,is_active:true}],tenant_profiles:[{id:'t1',first_name:'Ada',last_name:'Test'}],tenant_contracts:[{id:'c1',tenant_id:'t1',property_id:'core-1',unit_label:'Wohnung 1',start_date:'2025-01-01',end_date:null,status:'active',cold_rent:800,operating_costs:200,total_rent:1000,deposit_amount:2400}],property_extra:[{property_id:'core-1',wealth_profile:{buildingPurchasePrice:'100000',landPurchasePrice:'30000'}}],rent_adjustments:[]};
const entry=(id,category,amount,type='expense',extra={})=>({id,object_id:'core-1',booking_date:'2026-02-03',entry_type:type,category,amount,note:null,...extra});
const entries=[entry('1','Kaltmiete',800,'income'),entry('2','Nebenkosten',200,'income'),entry('3','Kaution',2400,'income'),entry('4','Wasser',100,'expense',{nk_relevant:true}),entry('5','Verwaltungskosten',50,'expense',{nk_relevant:true}),entry('6','Kreditrate',500,'expense',{loan_interest_amount:200,loan_principal_amount:300}),entry('7','Kaltmiete',777,'income',{booking_date:'2025-12-31'}),entry('8','Kaltmiete',999,'income',{object_id:'core-2'})];
const rent={year:2026,objectFilter:'core-1',rows:[{key:'u1',objectId:'core-1',objectLabel:'Testobjekt',unitLabel:'Wohnung 1',tenantName:'Ada Test',months:Array.from({length:12},(_,i)=>({month:i+1,expected:1000,paid:i===1?900:1000,open:i===1?100:0,status:i===1?'partial':'paid'}))}],totals:{},propertyTotals:[],kpis:{}};
const input={objects,entries,loans:[],sources,rent,from:'2026-01-01',to:'2026-12-31',objectId:'core-1',today:'2026-09-06'};
const modules=buildReportCenter(input);assert.equal(modules.length,15);
const module=id=>modules.find(m=>m.id===id);
const row=(id,label)=>module(id).tables[0].rows.find(r=>r[0]===label);
assert.equal(row('cover','Alle Geldbewegungen: Einnahmen')[1],'3.400,00 €');
assert.equal(row('cover','Steuerlich vorbereitete Einnahmen (EÜR)')[1],'1.000,00 €');
assert.equal(row('eur','Summe Einnahmen')[3],'1.000,00 €');
assert.equal(row('eur','Summe Ausgaben')[3],'350,00 €');
assert.equal(row('eur','Ergebnis (Überschuss)')[3],'650,00 €');
assert.equal(row('eur','Summe Nicht umlagefähige Kosten')[3],'250,00 €');
assert.equal(module('cashflow').tables[0].rows[0][4],'2.750,00 €');
assert.equal(module('journal').tables[0].rows.at(-1).at(-1),'2.750,00 €');
assert.equal(row('cover','Einheiten mit Soll-Miete / Mietkonto-Zeilen')[1],'1/1');
assert.match(module('tenants').tables[1].rows[0][4],/offen$/);
assert.match(module('tenants').tables[1].rows[0][14],/künftig$/);
assert.equal(module('arrears').tables[0].rows[0][3],'100,00 €');
const other=buildReportCenter({...input,objectId:'core-2'});assert.equal(other.find(m=>m.id==='journal').tables[0].rows.length,1);
const ownerOccupiedEntry={...entry('9','Miete',1960,'income'),object_id:'owner-core'};
const ownerOccupied=buildReportCenter({...input,objects:[...objects,{id:'owner-core',label:'Hohenloher Str. 78',code:'H'}],entries:[...entries,ownerOccupiedEntry]});
assert.equal(ownerOccupied.find(m=>m.id==='eur').tables[0].rows.find(r=>r[0]==='Summe Einnahmen')[3],'1.000,00 €','Eigennutzung darf nicht in die EÜR fließen');
const aliasReport=buildReportCenter({...input,sources:{...sources,portfolio_properties:[{id:'portfolio-shadow',core_property_id:'legacy-1',name:'Testobjekt Core Shadow'}],property_id_aliases:[{legacy_property_id:'legacy-1',object_id:'core-1'}],portfolio_units:[{id:'u-shadow',property_id:'portfolio-shadow',name:'Wohnung 1',unit_type:'apartment',is_active:true}]}});
assert.equal(aliasReport.find(m=>m.id==='objects').tables[3].rows[0][0],'Testobjekt');
assert.equal(aliasReport.find(m=>m.id==='objects').tables[3].rows[0][3],'50','Wohnfläche muss aus Immobilienvermögen übernommen werden');
const empty=buildReportCenter({...input,entries:[],sources:{},rent:null});assert.equal(empty.length,15);assert.equal(empty.find(m=>m.id==='journal').tables[0].rows.length,0);
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
  for (const request of queries.filter(q => !['property_documents','apartment_billing_workspaces','property_id_aliases','v_koenen_object_bridge'].includes(q.table))) {
    assert.equal(request.filters.some(([column, value]) => column === 'user_id' && value === 'test-user'), !readonly, 'Keep existing owner filters on owner-scoped tables');
  }
}
console.log('Document schema regression passed for normal and read-only accounts, including pagination.');
