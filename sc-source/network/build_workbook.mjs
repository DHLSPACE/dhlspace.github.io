import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SpreadsheetFile,Workbook} from '@oai/artifact-tool';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const d=JSON.parse(await fs.readFile(path.join(root,'exports/catalog.json'),'utf8'));
const source=Object.fromEntries(d.sources.map(s=>[s.source_id,s]));
const wb=Workbook.create();
const specs=[
 {name:'人物目录',title:'学者目录',note:`${d.as_of}更新；${d.counts.people}位人物，含物理专题${d.counts.physics_people||0}位。各来源时效见正文。`,table:'ScholarCatalog',
  headers:['姓名','学校/机构','建库分组','细分研究方向','资料时效与边界','官方来源'],widths:[100,230,155,420,450,530],
  rows:d.people.map(p=>[p.name_zh,p.institution,d.priority[p.priority],p.directions.map(x=>x.title).join('；'),p.source_note||'官方方向已定位；近五年活跃性待论文核实。',p.official_url])},
 {name:'方向明细',title:'研究方向与证据',note:`${d.counts.directions}条方向；问题与方法用于后续阅读核验。`,table:'ResearchDirections',
  headers:['姓名','研究主类','具体方向','研究对象','待回答的问题','证据依据','来源网址'],widths:[100,170,300,300,420,220,560],
  rows:d.people.flatMap(p=>p.directions.map(x=>[p.name_zh,x.area_name,x.title,x.objects.join('；'),x.reading_question,x.evidence_label,x.source_ids.map(id=>source[id].url).join('\n')]))}
];
const physics=d.people.filter(p=>p.research_archive);
if(physics.length)specs.push({name:'物理论文',title:'物理与应用物理论文清单',note:'来源有界清单，非全集；日期保留已知精度，作者位置1仅表示第一署名。',table:'PhysicsPapers',
 headers:['人物','发表日期与精度','论文题名','期刊','DOI','作者位置','归属证据','元数据状态','来源网址'],widths:[100,170,560,250,280,90,110,240,530],
 rows:physics.flatMap(p=>p.research_archive.papers.map(x=>[p.name_zh,`${x.published_date||x.year||'待核'} (${x.date_precision||'待核'})`,x.title,x.journal||'',x.doi||'',x.author_position??null,x.evidence_grade||'',x.metadata_status||'',x.source_urls.join('\n')]))});
for(const spec of specs){
 const sh=wb.worksheets.add(spec.name),n=spec.rows.length,cols=spec.headers.length,last=String.fromCharCode(64+cols);
 sh.showGridLines=false;sh.tabColor='#284C59';
 sh.getRange(`A1:${last}${n+5}`).format.font={name:'Microsoft YaHei',size:10,color:'#203840'};
 sh.getRange('A2').values=[[spec.title]];sh.getRange('A2').format.font={name:'Microsoft YaHei',size:16,bold:true,color:'#203840'};
 sh.getRange('A3').values=[[spec.note]];sh.getRange('A3').format.font={name:'Microsoft YaHei',size:10,italic:true,color:'#536C74'};
 sh.getRange(`A5:${last}5`).values=[spec.headers];sh.getRange(`A6:${last}${n+5}`).values=spec.rows;
 // Keep provenance in the sortable table so each source stays attached to its row.
 const contentLast=last;
 const tbl=sh.tables.add(`A5:${contentLast}${n+5}`,true,spec.table);tbl.showFilterButton=true;
 sh.getRange(`A5:${contentLast}5`).format={fill:'#284C59',font:{name:'Microsoft YaHei',size:10,bold:true,color:'#FFFFFF'},horizontalAlignment:'center',verticalAlignment:'center',wrapText:true};
 sh.getRange(`A6:${last}${n+5}`).format.wrapText=true;sh.getRange(`A6:${last}${n+5}`).format.verticalAlignment='center';
 for(let c=0;c<cols;c++)sh.getRangeByIndexes(0,c,n+5,1).format.columnWidthPx=spec.widths[c];
 sh.getRange('A2').format.rowHeightPx=32;sh.getRange('A3').format.rowHeightPx=26;sh.getRange(`A5:${last}5`).format.rowHeightPx=32;
 for(let r=0;r<n;r++){
  const lines=Math.max(...spec.rows[r].map((value,c)=>Math.max(...String(value).split('\n').map(s=>Math.ceil([...s].reduce((a,ch)=>a+(ch.charCodeAt(0)>255?2:1),0)/(spec.widths[c]/6.8))))));
  sh.getRange(`A${r+6}:${last}${r+6}`).format.rowHeightPx=Math.max(44,lines*18+14);
 }
 sh.freezePanes.freezeRows(5);
}
wb.recalculate();
const check=await wb.inspect({kind:'sheet,table',maxChars:2500,tableMaxRows:2,tableMaxCols:3});
await fs.writeFile(path.join(root,'validation/workbook_inspection.txt'),check.ndjson);
const errors=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:50},summary:'final formula error scan'});
await fs.writeFile(path.join(root,'validation/workbook_error_scan.txt'),errors.ndjson);
for(const [i,spec] of specs.entries()){
 const last=String.fromCharCode(64+spec.headers.length);
 const blob=await wb.render({sheetName:spec.name,range:`A1:${last}10`,scale:1,format:'png'});
 await fs.writeFile(path.join(root,`validation/workbook-preview-${i+1}.png`),new Uint8Array(await blob.arrayBuffer()));
}
const out=await SpreadsheetFile.exportXlsx(wb);await out.save(path.join(root,'exports/学者与方向索引.xlsx'));
const inspection=path.join(root,'exports/学者与方向索引.xlsx.inspect.ndjson');
if(await fs.stat(inspection).catch(()=>null))await fs.rename(inspection,path.join(root,'validation/workbook_export_inspection.ndjson'));
console.log(JSON.stringify({file:'exports/学者与方向索引.xlsx',sheets:specs.map(s=>({name:s.name,rows:s.rows.length}))}));
