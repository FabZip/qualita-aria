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
  '[data-admin-event-quantity]':'200'
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
for(const name of ['treeEventSourceKey','treeListHtml','reviewTreeAdminReport'])vm.runInContext(extract(name),context);
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
console.log('trees-admin: ok');
