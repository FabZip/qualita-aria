import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
function extract(name){
  const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));
  const end=source.indexOf('\nfunction ',start+1);
  const asyncEnd=source.indexOf('\nasync function ',start+1);
  return source.slice(start,Math.min(...[end,asyncEnd].filter(value=>value>=0)))
}
let renders=0,removed=false;
const status={textContent:'',append(text){this.textContent+=text}};
const fields={
  '[data-admin-event-title]':'Evento corretto',
  '[data-admin-event-date]':'2025-03-11',
  '[data-admin-event-locations]':'Piazza Matteotti',
  '[data-admin-event-type]':'planting',
  '[data-admin-event-status]':'reported',
  '[data-admin-event-quantity]':'200',
  '[data-admin-event-city]':'roma','[data-admin-event-year]':'2026',
  '[data-admin-event-district]':'XIV','[data-admin-event-source]':'https://example.test/source',
  '[data-admin-event-published]':'2026-10-20','[data-admin-event-description]':'Descrizione corretta'
};
const article={dataset:{reportId:'1',reportType:'event'},querySelector:selector=>({value:fields[selector]}),remove(){removed=true}};
class FixedDate extends Date{
  static now(){return Date.parse('2026-10-19T12:00:00Z')}
}
const context=vm.createContext({
  URL,Date:FixedDate,console,TREE_EVENTS_PER_PAGE:6,
  TreeStats:{fmt:value=>String(value),iconSvg:()=>'<svg></svg>'},
  window:{prompt:()=> 'test-password-not-a-real-secret'},$:()=>status,
  treeApiBase:async()=> 'https://worker.test',isTrees:()=>true,render:async()=>renders++,
  showToast:message=>{throw Error(message)},
  fetch:async(url,options)=>{
    assert.match(url,/location-reports\/review$/);
    const body=JSON.parse(options.body);
    assert.deepEqual(body.locations,['Piazza Matteotti']);
    assert.equal(body.action,'update_event');
    assert.match(status.textContent,/ricerca della posizione/);
    return Response.json({ok:true,geocoding:{attempted:1,geocoded:1}})
  }
});
for(const name of ['treeEventSourceKey','treeListHtml','reviewTreeAdminReport','renderTreeAdminReports','loadTreeAdminReports'])vm.runInContext(extract(name),context);
const future={id:'future',date:'2026-12-20',eventType:'decrement',status:'planned',validation:'automatic_pending',quantity:null,locationName:'Via futura',sourceUrl:'https://example.test'};
const html=context.treeListHtml({city:{available:true},events:[],documentedEvents:[future]},'2026');
assert.match(html,/Abbattimento · Programmato · da verificare · posizione non disponibile/);
assert.doesNotMatch(html,/Programmato · data trascorsa/);
await context.reviewTreeAdminReport(article,'update_event');
assert.equal(removed,true);
assert.equal(renders,1,'La revisione deve ricaricare lista e puntatori senza cambiare selettore');
assert.equal(status.textContent,'Revisione salvata.');
context.fetch=async()=>Response.json({ok:true,geocoding:{attempted:1,geocoded:0}});
await context.reviewTreeAdminReport(article,'update_event');
assert.match(status.textContent,/Posizione non trovata/);
assert.equal(renders,2);
// Anche una segnalazione di posizione deve inviare la revisione completa.
article.dataset.reportType='location';
context.fetch=async(url,options)=>{
  const body=JSON.parse(options.body);
  assert.equal(body.city,'roma');assert.equal(body.year,2026);assert.equal(body.district,'XIV');
  assert.equal(body.sourcePublishedAt,'2026-10-20');assert.equal(body.description,'Descrizione corretta');
  assert.equal(body.sourceUrl,'https://example.test/source');
  return Response.json({ok:true})
};
await context.reviewTreeAdminReport(article,'update_event');
assert.equal(renders,3);
context.renderTreeAdminReports([{id:1,location_index:0,event_title:'<script>alert(1)</script>',created_at:'2026-10-24',locations_json:'["Via Roma","Via Milano"]',event_city:'roma',event_year:2026}]);
for(const field of ['title','date','locations','type','status','quantity','city','year','district','source','published','description'])assert.match(status.innerHTML,new RegExp(`data-admin-event-${field}`));
assert.match(status.innerHTML,/Salva dati evento/);
assert.match(status.innerHTML,/Via Roma\nVia Milano/);
assert.doesNotMatch(status.innerHTML,/<script>/);
// Non mostrare un editor nuovo contro un backend che ignora i campi aggiunti.
context.fetch=async()=>Response.json({reports:[]});
await assert.rejects(()=>context.loadTreeAdminReports('test-password'),/0\.9\.14/);
removed=false;
context.fetch=async()=>Response.json({error:'Data lavori e anno non coerenti'},{status:400});
await context.reviewTreeAdminReport(article,'update_event');
assert.equal(removed,false);
assert.match(status.textContent,/Data lavori e anno non coerenti/);
console.log('trees-admin: ok');
