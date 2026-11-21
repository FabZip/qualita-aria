import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const s=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
function extract(name){const a=s.search(new RegExp(`(?:async )?function ${name}\\(`));const b=Math.min(...[s.indexOf('\nfunction ',a+1),s.indexOf('\nasync function ',a+1)].filter(v=>v>=0));return s.slice(a,b)}
const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='treeAdminCity'?'roma':id==='treeAdminYear'?'2026':'',textContent:'',innerHTML:'',append(text){this.textContent+=text}});return nodes.get(id)};
const original={title:'Misto',city:'roma',year:2026,eventDate:'',locations:['Via A','Via B'],eventType:'unknown',eventStatus:'planned',quantity:null,sourceUrl:'https://example.test/source'};
let renders=0,payload,removed=false,confirms=true;
const c=vm.createContext({console,Date,Response,URL,encodeURIComponent,state:{treeAdminOriginals:new Map([['mixed',original]])},$:node,
 window:{prompt:()=> 'test-only-password',confirm:()=>confirms},isTrees:()=>true,render:async()=>renders++,treeApiBase:async()=> 'https://worker.test',
 TreeStats:{rows:async()=>({documentedEvents:[{id:'local-id',year:'2026',date:'21 novembre 2026',locationName:'Via locale',eventType:'planting',status:'completed',quantity:3,sourceUrl:'https://example.test/local'}],diagnostic:{dynamicAvailable:true}})},
 fetch:async(url,options)=>{payload={url,body:options?.body?JSON.parse(options.body):null};return Response.json({ok:true,children:['child-a','child-b'],geocoding:{attempted:2,geocoded:2}})}
});
for(const name of ['renderTreeAdminReports','reviewTreeAdminReport','treeAdminEventBody','loadTreeAdminEvents'])vm.runInContext(extract(name),c);
const values={title:'Misto',city:'roma',year:'2026',date:'',district:'',locations:'Via A\nVia B',type:'unknown',status:'planned',quantity:'',source:original.sourceUrl,published:'',description:''};
const splitPart=(location,type,quantity)=>({querySelector(selector){const key=selector.match(/data-split-(\w+)/)[1];return{value:{title:'Intervento',locations:location,type,status:'completed',quantity,date:''}[key]}}});
const buttons=[{disabled:false}];
const article={dataset:{sourceKey:'mixed',adminDirect:'true',updatedAt:'revision',reportId:'1',reportType:'event'},
 querySelector(selector){return{value:values[selector.match(/data-admin-event-(\w+)/)[1]]}},
 querySelectorAll(selector){return selector==='button'?buttons:[splitPart('Via A','planting','5'),splitPart('Via B','decrement','2')]},remove(){removed=true}};
await c.reviewTreeAdminReport(article,'split_event');
assert.equal(payload.url,'https://worker.test/v1/trees/admin/events');assert.equal(payload.body.parts.length,2);
assert.deepEqual(payload.body.parts.map(p=>p.quantity),['5','2']);assert.deepEqual(payload.body.parts.map(p=>p.eventType),['planting','decrement']);
assert.equal(payload.body.expectedUpdatedAt,'revision');assert.equal(payload.body.original.sourceUrl,original.sourceUrl);
assert.equal(removed,true);assert.equal(renders,1);assert.equal(buttons[0].disabled,false);
assert.match(node('treeAdminStatus').textContent,/diviso in 2/);
removed=false;confirms=false;payload=null;await c.reviewTreeAdminReport(article,'delete_event');assert.equal(payload,null);assert.equal(removed,false);
confirms=true;await c.reviewTreeAdminReport(article,'delete_event');assert.equal(payload.body.action,'delete_event');assert.equal(payload.body.sourceKey,'mixed');assert.match(node('treeAdminStatus').textContent,/ignorato/);
removed=false;c.fetch=async()=>Response.json({error:'Evento modificato nel frattempo'},{status:409});await c.reviewTreeAdminReport(article,'update_event');assert.equal(removed,false);assert.equal(buttons[0].disabled,false);assert.match(node('treeAdminStatus').textContent,/nel frattempo/);
c.fetch=async()=>{throw Error('offline')};await assert.rejects(()=>c.reviewTreeAdminReport(article,'update_event'),/offline/);assert.equal(buttons[0].disabled,false);assert.equal(removed,false);
c.fetch=async()=>Response.json({adminSchemaVersion:3,events:[{id:1,source_key:'mixed',event_title:'Misto',event_city:'roma',event_year:2026,event_type:'unknown',event_status:'planned',source_url:original.sourceUrl,locations_json:'["Via A","Via B"]',updated_at:'revision'}]});
await c.loadTreeAdminEvents('test-only-password');
assert.match(node('treeAdminEvents').innerHTML,/data-admin-direct="true"/);assert.match(node('treeAdminEvents').innerHTML,/data-source-key="local-id"/);
assert.match(node('treeAdminEvents').innerHTML,/Piantumazione · verde/);assert.match(node('treeAdminEvents').innerHTML,/Abbattimento · rosso/);
assert.match(node('treeAdminEvents').innerHTML,/data-admin-action="split_event"/);assert.match(node('treeAdminEvents').innerHTML,/Rimuovi e ignora evento/);
assert.equal(c.state.treeAdminOriginals.get('local-id').quantity,3);
assert.equal(c.state.treeAdminOriginals.get('local-id').eventDate,'','No invented execution date');
c.fetch=async()=>Response.json({events:[]});await assert.rejects(()=>c.loadTreeAdminEvents('password'),/0\.10\.0/);
console.log('trees-admin-events: ok');

// Filtering preserves editor objects and unsaved values while hiding non-matches.
vm.runInContext(extract('filterTreeAdminEvents'),c);
const searchRows=[
 {dataset:{adminSearch:'Città Studi Via Roma XIV https://comune.test/avviso piantumazione verde 12'},draft:'unsaved quantity 99'},
 {dataset:{adminSearch:'Via Veneto II https://comune.test/altra-fonte abbattimento rosso 5'}}
].map(row=>({...row,hidden:false,classList:{toggle(name,hidden){row.hidden=hidden}},get isHidden(){return row.hidden}}));
node('treeAdminEvents').querySelectorAll=()=>searchRows;
const firstEditor=searchRows[0];
for(const [query,visible] of [['CITTA roma',[true,false]],['veneto rosso',[false,true]],['altra-fonte',[false,true]],['inesistente',[false,false]],['  ',[true,true]]]){
 node('treeAdminSearch').value=query;c.filterTreeAdminEvents();
 assert.deepEqual(searchRows.map(row=>!row.isHidden),visible);
 assert.equal(searchRows[0],firstEditor);assert.equal(firstEditor.draft,'unsaved quantity 99');
 if(query==='inesistente')assert.match(node('treeAdminSearchCount').textContent,/Nessun evento/);
}
assert.equal(node('treeAdminSearchCount').textContent,'2 di 2 eventi');
