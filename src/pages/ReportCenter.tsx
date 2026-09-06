import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { FileText, Download, RefreshCw, ArrowRight } from 'lucide-react';
import { useAppData } from '../state/AppDataContext';
import { supabase } from '../lib/supabase';
import { isReadonlyApprovalEmail } from '../auth/accessControl';
import { buildReportCenter, reportNames, type ReportSources, type ReportRecord, type ReportModule } from '../services/reportCenterEngine';
import { openProfessionalPdfReport } from '../lib/professionalPdfReport';
import { reportCsv, reportWorkbook } from '../lib/reportCenterExport';
import type { RentAnnualReportSnapshot } from './Mietuebersicht';
import './ReportCenter.css';
const RentOverview = lazy(()=>import('./Mietuebersicht'));
const root='/berichte';
const tableSources: Record<string,string>={billing_workspaces:'apartment_billing_workspaces',property_extra:'property_extra_info',portfolio_properties:'portfolio_properties',portfolio_units:'portfolio_units',tenant_contracts:'tenant_contracts',tenant_profiles:'tenant_profiles',rent_adjustments:'rent_adjustments',mileage_trips:'property_mileage_trips',unit_vacancies:'unit_vacancies',property_documents:'property_documents',property_id_aliases:'property_id_aliases',object_bridge:'v_koenen_object_bridge'};
async function loadSources():Promise<ReportSources>{
  const auth=await supabase.auth.getUser();if(auth.error)throw auth.error;if(!auth.data.user)throw new Error('Bitte erneut anmelden.');
  const user=auth.data.user;
  const results=await Promise.allSettled(Object.entries(tableSources).map(async([key,table])=>{
    const rows:ReportRecord[]=[];
    for(let start=0;;start+=500){
      let query=supabase.from(table).select('*');
      if(key!=='property_id_aliases'&&key!=='object_bridge')query=query.order(table==='property_extra_info'?'property_id':key==='billing_workspaces'?'object_id':'id');
      query=query.range(start,start+499);
      if(key==='billing_workspaces')query=query.order('year');
      // Documents use role-based RLS, as in documentArchiveService; they have no user_id column.
      if(!['billing_workspaces','property_documents','property_id_aliases','object_bridge'].includes(key)&&!isReadonlyApprovalEmail(user.email))query=query.eq('user_id',user.id);
      if(key==='tenant_profiles'||key==='tenant_contracts')query=query.eq('is_deleted',false);
      const {data,error}=await query;if(error)throw new Error(`${table}: ${error.message}`);rows.push(...(data??[]));if((data?.length??0)<500)break;
    }
    return[key,rows] as const;
  }));
  const errors=results.filter(r=>r.status==='rejected');if(errors.length)throw new Error(errors.map(r=>r.status==='rejected'?String(r.reason):'').join('\n'));
  return Object.fromEntries(results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]));
}
function Preview({module}:{module:ReportModule}){
  const cellClass=(value:unknown)=>{const cell=String(value);return cell.endsWith('· bezahlt')||cell.startsWith('Guthaben ·')?'report-paid':cell.endsWith('· offen')||cell.startsWith('Nachzahlung ·')?'report-open':'';};
  return <section className="report-preview" aria-label={module.title}><h2>{module.title}</h2>{module.paragraphs?.map(p=><p key={p} className="report-note">{p}</p>)}{module.tables?.map((t,i)=><div key={i}><h3>{t.title}</h3><div className="report-table-scroll" tabIndex={0} role="region" aria-label={t.title}><table><thead><tr>{t.headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{t.rows.length?t.rows.map((row,ri)=><tr key={ri}>{row.map((v,ci)=><td key={ci} className={cellClass(v)}>{String(v??'—')}</td>)}</tr>):<tr><td colSpan={t.headers.length}>Keine gespeicherten Daten für diese Auswahl.</td></tr>}</tbody></table></div></div>)}</section>;
}
export default function ReportCenter({portfolio=false}:{portfolio?:boolean}){
  const app=useAppData();const year=new Date().getFullYear();
  const [from,setFrom]=useState(`${year}-01-01`);const [to,setTo]=useState(`${year}-12-31`);const [objectId,setObjectId]=useState('');
  const [format,setFormat]=useState('pdf');const [selected,setSelected]=useState<string[]>(reportNames.slice(0,6).map(r=>r[0]));
  const [sources,setSources]=useState<ReportSources|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(true);const [revision,setRevision]=useState(0);
  const [rentStatus,setRentStatus]=useState({loading:true,error:''});
  const [rent,setRent]=useState<RentAnnualReportSnapshot|null>(null);const [opened,setOpened]=useState<string>('register');const [message,setMessage]=useState('');
  const selectedYear=Number(from.slice(0,4));
  useEffect(()=>{let cancelled=false;loadSources().then(data=>{if(!cancelled){setSources(data);setError('');}}).catch(e=>{if(!cancelled)setError(String(e.message??e));}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};},[revision]);
  const valid=Boolean(from&&to&&from<=to&&from.slice(0,4)===to.slice(0,4)&&selectedYear>=1900&&selectedYear<=2200);
  const readyRent=rent?.year===selectedYear&&rent.objectFilter===objectId?rent:null;
  const modules=useMemo(()=>buildReportCenter({objects:app.objects,entries:app.entries,loans:app.loanRows,sources:sources??{},rent:readyRent,from,to,objectId}),[app.objects,app.entries,app.loanRows,sources,readyRent,from,to,objectId]);
  const chosen=portfolio?modules.filter(m=>m.id===opened):modules.filter(m=>selected.includes(m.id));
  const needsRent=chosen.some(m=>['cover','tenants','adjustments','arrears'].includes(m.id));
  const blocked=loading||app.loading||Boolean(error||app.error)||!sources||!valid||!chosen.length||(needsRent&&(!readyRent||rentStatus.loading||Boolean(rentStatus.error)));
  const exportReport=()=>{
    if(blocked)return;
    const title=portfolio?chosen[0].title:'Steuerberater-Report';
    if(format==='pdf'){
      openProfessionalPdfReport({documentName:`${title}-${from}-${to}`,title,subtitle:'Könen Property Management',meta:[{label:'Zeitraum',value:`${from} bis ${to}`},{label:'Objekt',value:app.objects.find(o=>o.id===objectId)?.label??'Alle Immobilien'},{label:'Erstellt',value:new Date().toLocaleString('de-DE')}],sections:chosen.map(m=>({...m,tables:m.tables?.flatMap(t=>t.headers.length<=13?[t]:[0,1].map(half=>({...t,title:`${t.title} · ${half===0?'Januar–Juni':'Juli–Dezember'}`,headers:[...t.headers.slice(0,3),...t.headers.slice(3+half*6,9+half*6)],rows:t.rows.map(r=>[...r.slice(0,3),...r.slice(3+half*6,9+half*6)])})))})),landscape:true});
      setMessage('Druckansicht geöffnet. Im Druckdialog „Als PDF sichern“ wählen.');return;
    }
    const blob=format==='excel'?new Blob([reportWorkbook(chosen) as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}):new Blob([reportCsv(chosen)],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${title}-${from}-${to}.${format==='excel'?'xlsx':'csv'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);setMessage('Report wurde erstellt.');
  };
  return <main className="report-center"><Link className="report-back" to="/berichte">← Berichte & Reports</Link><header className="report-heading"><div><span className="report-eyebrow">BERICHTE & REPORTS</span><h1>{portfolio?'Immobilien- & Portfolio-Analysen':'Steuerberater-Report'}</h1><p>{portfolio?'Fünf Auswertungen für Bestand, Finanzierung und Cashflow.':'Berichte für die Steuerberatung aus Ihren gespeicherten App-Daten.'}</p></div><FileText size={36}/></header>
    <nav className="report-tabs" aria-label="Berichte Unterseiten"><NavLink to={`${root}/steuerberater`}>Steuerberater-Report</NavLink><NavLink to={`${root}/portfolio`}>Immobilien- & Portfolio-Analysen</NavLink></nav>
    <div className="report-config"><section className="report-card"><h2>Zeitraum & Format</h2><label>Abrechnungsjahr<input type="number" min="1900" max="2200" value={selectedYear||''} onChange={e=>{const y=e.target.value;setFrom(`${y}-01-01`);setTo(`${y}-12-31`);setMessage('');}}/></label><div className="report-dates"><label>Datum von<input type="date" value={from} onChange={e=>{setFrom(e.target.value);setMessage('');}}/></label><label>Datum bis<input type="date" value={to} onChange={e=>{setTo(e.target.value);setMessage('');}}/></label></div><label>Immobilie / Einheitengruppe<select value={objectId} onChange={e=>{setObjectId(e.target.value);setMessage('');}}><option value="">Alle Immobilien</option>{app.objects.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label><label>Dateiformat<select value={format} onChange={e=>setFormat(e.target.value)}><option value="pdf">PDF · Druckansicht</option><option value="excel">Excel (.xlsx)</option><option value="csv">CSV</option></select></label>{!valid&&<p role="alert">Bitte einen gültigen Zeitraum innerhalb eines Abrechnungsjahres wählen.</p>}<button className="report-primary" disabled={blocked} onClick={exportReport}><Download size={17}/>Report erstellen</button><button className="report-refresh" disabled={loading||app.loading} onClick={()=>{setLoading(true);setSources(null);setRent(null);setRevision(r=>r+1);void app.refresh();}}><RefreshCw size={15}/>Daten aktualisieren</button><p className="report-note">PDF, Excel und CSV enthalten dieselben ausgewählten Berichtstabellen.</p></section>
    <section className="report-card"><h2>{portfolio?'Strategische Report-Module':'Enthaltene Berichte'}</h2>{portfolio?<div className="report-module-list">{reportNames.slice(10).map(([id,title])=><button key={id} className={opened===id?'selected':''} onClick={()=>{setOpened(id);setMessage('');}}><span>{title}{['acquisition','cashflow'].includes(id)?` ${selectedYear}`:''}</span><ArrowRight size={18}/></button>)}</div>:<><p className="report-note">Mehrere Berichte auswählen und als gemeinsames Dokument erstellen.</p><div className="report-checks">{reportNames.slice(0,10).map(([id,title])=><label key={id}><input type="checkbox" checked={selected.includes(id)} onChange={e=>{setSelected(old=>e.target.checked?[...old,id]:old.filter(v=>v!==id));setMessage('');}}/><span>{title}{['utilities','proofs'].includes(id)?` ${selectedYear}`:''}</span></label>)}</div><p className="report-note">{selected.length} von 10 Berichten ausgewählt</p></>}</section></div>
    {(error||app.error)&&<div className="report-error" role="alert">Die Daten konnten nicht vollständig geladen werden. Der Export ist gesperrt. {error||app.error}</div>}
    {needsRent&&rentStatus.error&&<p role="alert" className="report-error">{rentStatus.error} Bitte Daten aktualisieren.</p>}
    {message&&<p role="status" className="report-message">{message}</p>}
    {(loading||app.loading)&&<p role="status">Berichtsdaten werden geladen …</p>}
    {!loading&&!error&&!app.error&&valid&&<><h2 className="report-preview-title">Report-Vorschau</h2>{needsRent&&!readyRent&&<p role="status">Mietkonto wird abgeglichen …</p>}{chosen.map(m=><Preview key={m.id} module={m}/>)}</>}
    {valid&&<details className="report-source"><summary>Mietkonto-Quelle und Jahresübersicht anzeigen</summary><Suspense fallback={<p>Mietkonto wird geladen …</p>}><RentOverview key={`${selectedYear}-${objectId}-${revision}`} embeddedAnnualReport reportYear={selectedYear} reportObjectId={objectId} onAnnualReportChange={setRent} onAnnualReportStatusChange={setRentStatus}/></Suspense></details>}
  </main>;
}
