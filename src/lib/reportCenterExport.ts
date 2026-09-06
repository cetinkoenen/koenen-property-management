import type { ReportModule } from '../services/reportCenterEngine';
const xml = (v: unknown) => Array.from(String(v ?? '')).filter(c => c.charCodeAt(0) >= 32 || ['\t','\n','\r'].includes(c)).join('').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function reportCsv(modules: ReportModule[]): string {
  const cell = (v: unknown) => { const s=String(v??'');return `"${(/^[=+@-]/.test(s)?"'":'')+s.replace(/"/g,'""')}"`; };
  return '\uFEFF'+modules.flatMap(m=>[[m.title],...(m.paragraphs??[]).map(p=>[p]),...(m.tables??[]).flatMap(t=>[[t.title],t.headers,...t.rows,[]])]).map(r=>r.map(cell).join(';')).join('\r\n');
}
// Minimal, uncompressed Open XML workbook. Text is stored as inline strings, never formulas.
export function reportWorkbook(modules: ReportModule[]): Uint8Array {
  const sheets=modules.flatMap(m=>(m.tables??[]).map(t=>({title:t.title,rows:[[m.title],...(m.paragraphs??[]).map(p=>[p]),t.headers,...t.rows]})));
  const col=(index:number):string=>index<26?String.fromCharCode(65+index):col(Math.floor(index/26)-1)+col(index%26);
  const files: Record<string,string>={
    '[Content_Types].xml':`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xml(`${i+1} ${s.title.replace(/[\\/*?:[\]]/g,' ')}`.slice(0,31))}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`,
  };
  sheets.forEach((s,i)=>{ files[`xl/worksheets/sheet${i+1}.xml`]=`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${s.rows.map((r,ri)=>`<row r="${ri+1}">${r.map((v,ci)=>typeof v==='number'?`<c r="${col(ci)}${ri+1}"><v>${v}</v></c>`:`<c r="${col(ci)}${ri+1}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`; });
  const encode=new TextEncoder();const bytes:number[]=[];const central:number[]=[];
  const put=(out:number[],v:number,size:number)=>{for(let i=0;i<size;i++)out.push((v>>>(8*i))&255);};
  const crc=(data:Uint8Array)=>{let v=0xffffffff;for(const b of data){v^=b;for(let k=0;k<8;k++)v=(v>>>1)^((v&1)?0xedb88320:0);}return(v^0xffffffff)>>>0;};
  for(const [path,content] of Object.entries(files)){
    const name=encode.encode(path);const data=encode.encode(content);const checksum=crc(data);const offset=bytes.length;
    put(bytes,0x04034b50,4);put(bytes,20,2);put(bytes,0,2);put(bytes,0,2);put(bytes,0,2);put(bytes,33,2);put(bytes,checksum,4);put(bytes,data.length,4);put(bytes,data.length,4);put(bytes,name.length,2);put(bytes,0,2);for(const b of name)bytes.push(b);for(const b of data)bytes.push(b);
    put(central,0x02014b50,4);put(central,20,2);put(central,20,2);put(central,0,2);put(central,0,2);put(central,0,2);put(central,33,2);put(central,checksum,4);put(central,data.length,4);put(central,data.length,4);put(central,name.length,2);put(central,0,2);put(central,0,2);put(central,0,2);put(central,0,2);put(central,0,4);put(central,offset,4);for(const b of name)central.push(b);
  }
  const offset=bytes.length;for(const b of central)bytes.push(b);put(bytes,0x06054b50,4);put(bytes,0,2);put(bytes,0,2);put(bytes,Object.keys(files).length,2);put(bytes,Object.keys(files).length,2);put(bytes,central.length,4);put(bytes,offset,4);put(bytes,0,2);return new Uint8Array(bytes);
}
