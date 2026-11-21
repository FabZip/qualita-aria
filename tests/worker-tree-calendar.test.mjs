import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-11-21T12:00:00Z']))}static now(){return new Date('2026-11-21T12:00:00Z').getTime()}}
const sql=new DatabaseSync(':memory:');
const dir=new URL('../cloudflare/temperature-proxy/migrations/',import.meta.url);
for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL(file,dir),'utf8'));
sql.exec('DELETE FROM tree_events; DELETE FROM tree_location_reports; DELETE FROM tree_location_overrides;');
let fetches=0,batches=0;
const db={prepare(query){return{args:[],bind(...args){this.args=args;return this},async first(){return sql.prepare(query).get(...this.args)||null},async all(){return{results:sql.prepare(query).all(...this.args)}},async run(){return sql.prepare(query).run(...this.args)}}},async batch(commands){batches++;sql.exec('BEGIN');try{for(const cmd of commands)await cmd.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};
const origin='https://www.comune.roma.it';
const url=`${origin}/web/it/scheda-servizi.page?contentId=INF1520290&pagina=2`;
const row=(dates,address,type,id)=>`<tr><td>${dates}</td><td>${address}</td><td>${type}</td><td><a href="/ordinanza-${id}.pdf">DD ${id}</a></td></tr>`;
const active=row('20.10.2026 al 31.03.2027','Piazza Albania, Via Roma e Viale Aventino','Lavori di piantumazione di essenze arboree',1);
const upcoming=row('23.11.2026 al 04.12.2026','Via Test','Abbattimento di 2 alberi',2);
const html=`<table>${active}${upcoming}${row('09.11.2026 al 28.11.2026','Via Cava Aurelia','Potatura e/o abbattimento',3)}${row('23.11.2026 al 05.12.2026','Via Parioli','Potatura',4)}${row('23.11.2026 al 04.12.2026','Via Tuscia','Messa in sicurezza',5)}${row('16.11.2026 al 15.11.2026','Via Salaria','Abbattimenti',6)}${row('30.02.2026 al 01.12.2026','Via Errata','Piantumazione',7)}${row('01.10.2026 al 01.11.2026','Via Passata','Piantumazione',8)}${row('fino al 04.12.26','Diverse strade','Piantumazione',9)}</table>`;
const c=vm.createContext({URL,Request,Response,Headers,TextEncoder,TextDecoder,Date:FixedDate,crypto,console,setTimeout:cb=>cb(),fetch:async resource=>{fetches++;return new Response(String(resource).endsWith('pagina=2')?html:row('23.11.2026 al 04.12.2026','Via Tuscia','Messa in sicurezza',5))}});
vm.runInContext(fs.readFileSync(new URL('../cloudflare/temperature-proxy/src/index.js',import.meta.url),'utf8').replace('export default{','globalThis.worker={'),c);
const parsed=await c.parseTreeCalendar(html,url,1);
assert.equal(parsed.events.length,4);assert.equal(parsed.diagnostic.invalidDates,2);assert.equal(parsed.diagnostic.skippedOtherWork,2);assert.equal(parsed.diagnostic.skippedPast,1);
const [planting,cut,conditional,endOnly]=parsed.events;
assert.deepEqual(Array.from(planting.locations),['Piazza Albania','Via Roma','Viale Aventino']);
assert.equal(planting.eventEndDate,'2027-03-31');assert.equal(planting.sourcePublishedAt,null);assert.equal(planting.quantity,null);
assert.equal(cut.quantity,2);assert.equal(cut.eventDate,'2026-11-23');assert.equal(conditional.eventType,'unknown');assert.equal(conditional.quantity,null);
assert.equal(endOnly.eventDate,null);assert.equal(endOnly.locations.length,0);
assert.equal(planting.calendarUrl,url);assert.equal(planting.sourceUrl,`${origin}/ordinanza-1.pdf`);
const extended=await c.parseTreeCalendar(upcoming+active.replace('31.03.2027','30.04.2027'),url,1);
assert.equal(extended.events[1].sourceKey,planting.sourceKey,'Dates and row order do not change identity');
let result=await c.syncTreeCalendars({TREE_DB:db});assert.equal(fetches,15);assert.equal(batches,1);assert.equal(result.events,4);assert.equal(result.errors,0);
// Explicit manual dates and exclusions survive calendar refresh, including split tombstones.
sql.prepare("UPDATE tree_events SET validation='manual_confirmed',event_end_date='2027-05-01',quantity=7 WHERE source_key=?").run(planting.sourceKey);
sql.prepare("UPDATE tree_events SET validation='manual_rejected',split_parent=1 WHERE source_key=?").run(cut.sourceKey);
await c.syncTreeCalendars({TREE_DB:db});
assert.equal(sql.prepare('SELECT event_end_date FROM tree_events WHERE source_key=?').get(planting.sourceKey).event_end_date,'2027-05-01');
assert.equal(sql.prepare('SELECT validation FROM tree_events WHERE source_key=?').get(cut.sourceKey).validation,'manual_rejected');
const publicData=async year=>(await c.treeEventsResponse({TREE_DB:db},{},new URL(`https://test/events?city=roma&year=${year}`))).json();
let data=await publicData(2026);assert.equal(data.events.length,3);assert.equal(data.calendarSync.events,4);
assert.equal(data.events.find(e=>e.sourceKey===planting.sourceKey).dateType,'interval');
// An interval beginning in an earlier year remains visible during its end year.
sql.prepare("UPDATE tree_events SET year=2025,event_date='2025-12-01' WHERE source_key=?").run(planting.sourceKey);
data=await publicData(2026);assert.ok(data.events.some(e=>e.sourceKey===planting.sourceKey));
// Old automatic publication fallbacks are exposed as publication, never as a work date.
assert.equal(c.treeEventExecutionDate({event_date:'2026-11-20',source_published_at:'2026-11-20',raw_excerpt:'Avviso di abbattimento',validation:'automatic_pending'}),null);
assert.equal(c.treeEventExecutionDate({event_date:'2026-11-20',source_published_at:'2026-11-20',raw_excerpt:'Data di esecuzione: 20 novembre 2026',validation:'automatic_pending'}),'2026-11-20');
assert.equal(c.treeEventExecutionDate({event_date:'2026-11-20',source_published_at:'2026-11-20',validation:'manual_confirmed'}),'2026-11-20');
// Interval validation, update and split retain the source calendar and per-child end date.
const original=sql.prepare('SELECT * FROM tree_events WHERE source_key=?').get(conditional.sourceKey);
const body={sourceKey:original.source_key,expectedUpdatedAt:original.updated_at,action:'update_event',title:'Correzione',city:'roma',year:2026,eventDate:'2026-11-09',eventEndDate:'2026-12-10',locations:['Via Cava Aurelia'],eventType:'decrement',eventStatus:'planned',quantity:1,sourceUrl:original.source_url};
const edit=body=>c.editAdminTreeEvent(new Request('https://test/events',{method:'POST',body:JSON.stringify(body)}),{TREE_DB:db},{});
assert.equal((await edit({...body,eventEndDate:'2026-11-01'})).status,400);
assert.equal((await edit(body)).status,200);
const changed=sql.prepare('SELECT * FROM tree_events WHERE source_key=?').get(body.sourceKey);
assert.equal(changed.event_end_date,'2026-12-10');assert.equal(changed.calendar_url,url);
const split=await edit({...body,action:'split_event',expectedUpdatedAt:changed.updated_at,parts:[{...body,eventEndDate:'2026-12-11'},{...body,eventEndDate:'2026-12-12',locations:['Via Seconda']}]});
assert.equal(split.status,200);const children=(await split.json()).children;
for(const [i,key] of children.entries()){const child=sql.prepare('SELECT * FROM tree_events WHERE source_key=?').get(key);assert.equal(child.source_kind,'calendar');assert.equal(child.calendar_url,url);assert.equal(child.event_end_date,`2026-12-${11+i}`)}
// A malformed/failed source is diagnosed, without discarding other municipalities.
c.fetch=async resource=>String(resource).endsWith('pagina=2')?new Response('unavailable',{status:503}):new Response(html);
result=await c.syncTreeCalendars({TREE_DB:db});assert.equal(result.errors,1);assert.equal(result.ok,false);assert.ok(result.events>0);
assert.equal((await c.worker.fetch(new Request('https://test/v1/trees/refresh?scope=calendars',{method:'POST'}),{TREE_DB:db},{})).status,401);
