import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
const database=new DatabaseSync(':memory:');
const migrations=new URL('../cloudflare/temperature-proxy/migrations/',import.meta.url);
for(const file of fs.readdirSync(migrations).filter(f=>f.endsWith('.sql')).sort())database.exec(fs.readFileSync(new URL(file,migrations),'utf8'));
database.exec('DELETE FROM tree_events; DELETE FROM tree_location_reports; DELETE FROM tree_location_overrides;');
let failBatch=false,beforeBatch=null;
const db={prepare(sql){return{args:[],bind(...args){this.args=args;return this},async first(){return database.prepare(sql).get(...this.args)||null},async all(){return{results:database.prepare(sql).all(...this.args)}},async run(){return{meta:{changes:database.prepare(sql).run(...this.args).changes}}}}},async batch(commands){if(beforeBatch){const run=beforeBatch;beforeBatch=null;run()}database.exec('BEGIN');try{for(const [i,c] of commands.entries()){await c.run();if(failBatch&&i===2)throw Error('simulated failure')}database.exec('COMMIT')}catch(e){database.exec('ROLLBACK');throw e}}};
const c=vm.createContext({URL,Request,Response,Headers,TextEncoder,TextDecoder,Date,crypto,console,setTimeout:cb=>cb(),fetch:async()=>Response.json([{lon:'12.53',lat:'41.9'}])});
vm.runInContext(fs.readFileSync(new URL('../cloudflare/temperature-proxy/src/index.js',import.meta.url),'utf8').replace('export default{','globalThis.worker={'),c);
const original={title:'Intervento misto',city:'roma',year:2026,eventDate:'2026-10-20',locations:['Via Roma','Via Milano'],eventType:'unknown',eventStatus:'completed',quantity:null,sourceUrl:'https://example.test/source',sourcePublishedAt:'2026-10-01',description:'Un documento, due interventi'};
const request=body=>new Request('https://worker.test/v1/trees/admin/events',{method:'POST',body:JSON.stringify(body)});
const call=body=>c.editAdminTreeEvent(request(body),{TREE_DB:db},{});
const row=key=>database.prepare('SELECT * FROM tree_events WHERE source_key=?').get(key);
const part=(patch={})=>({...original,...patch});
const split={sourceKey:'original',action:'split_event',original,parts:[part({locations:['Via Roma'],eventType:'planting',quantity:5}),part({locations:['Via Milano'],eventType:'decrement',quantity:2,sourceUrl:'https://evil.test/ignored'})]};
// Invalid divisions do not import/exclude the original or create partial children.
for(const parts of [[part()], [part(),part({quantity:-1})],[part(),part({locations:[]})],Array(21).fill(part())]){
 assert.equal((await call({...split,parts})).status,400);
 assert.equal(row('original'),undefined);
}
failBatch=true;await assert.rejects(()=>call(split),/simulated failure/);failBatch=false;
assert.equal(row('original'),undefined);
assert.equal(database.prepare('SELECT COUNT(*) AS n FROM tree_admin_audit').get().n,0);
const response=await call(split);assert.equal(response.status,200);
const result=await response.json();assert.equal(result.children.length,2);assert.equal(result.geocoding.geocoded,2);
assert.equal(row('original').validation,'manual_rejected');assert.equal(row('original').split_parent,1);
const [green,red]=result.children.map(row);
assert.equal(green.event_type,'planting');assert.equal(green.quantity,5);
assert.equal(red.event_type,'decrement');assert.equal(red.quantity,2);
for(const child of [green,red]){assert.equal(child.source_url,original.sourceUrl);assert.equal(child.source_published_at,original.sourcePublishedAt);assert.equal(child.parent_source_key,'original');assert.equal(child.validation,'manual_confirmed');assert.equal(JSON.parse(child.location_points_json).length,1)}
assert.notEqual(green.source_key,red.source_key);
const publicData=await(await c.treeEventsResponse({TREE_DB:db},{},new URL('https://worker.test/events?city=roma&year=2026'))).json();
assert.equal(publicData.events.length,2);assert.equal(publicData.events.reduce((n,e)=>n+e.quantity,0),7);assert.ok(publicData.events.every(e=>e.parentSourceKey==='original'));
assert.equal((await call(split)).status,409,'Repeat requests cannot duplicate children');
// Refresh ignores the original, new parser groups for the split source, and preserves children.
const automatic={sourceKey:'original',city:'roma',year:2026,eventDate:'2026-10-20',locations:['wrong'],locationName:'wrong',eventType:'planting',quantity:999,status:'completed',validation:'automatic_confirmed',title:'automatic',sourceUrl:original.sourceUrl,sourcePublishedAt:null,rawExcerpt:''};
assert.equal(await c.upsertTreeEvent(db,automatic,new Date().toISOString()),'ignored');
assert.equal(await c.upsertTreeEvent(db,{...automatic,sourceKey:'original--new-parser-group'},new Date().toISOString()),'ignored');
assert.equal(row('original--new-parser-group'),undefined);
await c.upsertTreeEvent(db,{...automatic,sourceKey:green.source_key},new Date().toISOString());assert.equal(row(green.source_key).quantity,5);
// Independent child revisions retain the shared source; stale editors are rejected.
let child=row(green.source_key);
assert.equal((await call({sourceKey:child.source_key,action:'update_event',expectedUpdatedAt:'stale',...part({quantity:9})})).status,409);
assert.equal((await call({sourceKey:child.source_key,action:'update_event',expectedUpdatedAt:child.updated_at,...part({quantity:9,eventType:'decrement',sourceUrl:'https://example.test/different'})})).status,200);
child=row(child.source_key);assert.equal(child.quantity,9);assert.equal(child.event_type,'decrement');assert.equal(child.source_url,original.sourceUrl);
// Removal is an exclusion and remains excluded after automated refresh.
assert.equal((await call({sourceKey:child.source_key,action:'delete_event',expectedUpdatedAt:child.updated_at})).status,200);
assert.equal(row(child.source_key).validation,'manual_rejected');
assert.equal(await c.upsertTreeEvent(db,{...automatic,sourceKey:child.source_key},new Date().toISOString()),'ignored');
assert.equal(row(child.source_key).validation,'manual_rejected');
// Static catalog events can be edited or removed without a prior user report.
assert.equal((await call({sourceKey:'static-id',action:'update_event',original:part({eventType:'planting'}),...part({quantity:11,eventType:'planting'})})).status,200);
assert.equal(row('static-id').quantity,11);
let staticRow=row('static-id');assert.equal((await call({sourceKey:'static-id',action:'delete_event',expectedUpdatedAt:staticRow.updated_at})).status,200);
const listing=await(await c.listAdminTreeEvents({TREE_DB:db},{},new URL('https://worker.test/admin?city=roma&year=2026'))).json();
assert.equal(listing.adminSchemaVersion,3);assert.ok(!listing.events.some(e=>e.source_key==='static-id'));
assert.ok(database.prepare('SELECT COUNT(*) AS n FROM tree_admin_audit').get().n>=5);
// Auth covers both new operations; no database read or write before authorization.
for(const method of ['GET','POST'])assert.equal((await c.worker.fetch(new Request('https://worker.test/v1/trees/admin/events?city=roma&year=2026',{method}),{TREE_DB:db,TREE_ADMIN_PASSWORD:'secret'},{})).status,401);
const authorized=await c.worker.fetch(new Request('https://worker.test/v1/trees/admin/events?city=roma&year=2026',{headers:{Authorization:'Bearer secret'}}),{TREE_DB:db,TREE_ADMIN_PASSWORD:'secret'},{});assert.equal(authorized.status,200);

// A race between loading the event and starting the transaction fails atomically.
const race=row(red.source_key),auditCount=database.prepare('SELECT COUNT(*) AS n FROM tree_admin_audit').get().n;
beforeBatch=()=>database.prepare("UPDATE tree_events SET quantity=42,updated_at='concurrent' WHERE source_key=?").run(race.source_key);
const conflict=await call({sourceKey:race.source_key,action:'split_event',expectedUpdatedAt:race.updated_at,parts:[part(),part()]});
assert.equal(conflict.status,409);assert.equal(row(race.source_key).quantity,42);assert.equal(row(race.source_key).validation,'manual_confirmed');
assert.equal(database.prepare('SELECT COUNT(*) AS n FROM tree_admin_audit').get().n,auditCount);

// Geocoding stays bounded for large splits; remaining children stay queued.
const many=await(await call({sourceKey:'many',action:'split_event',original:part({sourceUrl:'https://example.test/many'}),parts:Array.from({length:10},(_,i)=>part({title:`Part ${i}`,locations:[`Via ${i}`],quantity:1,eventType:'planting'}))})).json();
assert.equal(many.children.length,10);assert.equal(many.geocoding.attempted,8);
assert.equal(many.children.map(row).filter(e=>e.geocoded_at===null).length,2);
// New automatically generated keys for an excluded source cannot resurrect it.
assert.equal(await c.upsertTreeEvent(db,{...automatic,sourceKey:'static-id--new',sourceUrl:original.sourceUrl},new Date().toISOString()),'ignored');

// Production regression IDS1677374: the parser stored locations=[] and location_name=''.
const incomplete={...original,district:null,title:'Municipio II: intervento di abbattimento di un Cercis in piazza San Saturnino e di un Prunus in via Avigliana',locations:[],eventType:'decrement',status:'planned',quantity:null,sourceUrl:'https://www.comune.roma.it/web/it/informazione-di-servizio.page?contentId=IDS1677374'};
for(const key of ['IDS1677374','empty-update','empty-delete','empty-invalid'])await c.adminTreeInsert(db,key,incomplete,'2026-11-19T03:00:24.300Z').run();
assert.equal(row('IDS1677374').location_name,'');
const division=await call({sourceKey:'IDS1677374',action:'split_event',expectedUpdatedAt:row('IDS1677374').updated_at,parts:[part({title:'Cercis',locations:['Piazza San Saturnino'],eventType:'decrement',eventStatus:'planned',quantity:1}),part({title:'Prunus',locations:['Via Avigliana'],eventType:'decrement',eventStatus:'planned',quantity:1})]});
assert.equal(division.status,200);
const splitResult=await division.json();assert.equal(splitResult.children.length,2);
assert.deepEqual(splitResult.children.map(key=>row(key).quantity),[1,1]);
assert.deepEqual(splitResult.children.map(key=>JSON.parse(row(key).locations_json)),[['Piazza San Saturnino'],['Via Avigliana']]);
assert.ok(splitResult.children.every(key=>row(key).source_url===incomplete.sourceUrl));
assert.equal(row('IDS1677374').validation,'manual_rejected');
const invalidPart=await call({sourceKey:'empty-invalid',action:'split_event',expectedUpdatedAt:row('empty-invalid').updated_at,parts:[part(),part({locations:[]})]});
assert.equal(invalidPart.status,400);assert.match((await invalidPart.json()).error,/Intervento 2: Inserire da 1 a 100 località/);
assert.equal(row('empty-invalid').validation,'manual_confirmed');
assert.equal((await call({sourceKey:'empty-update',action:'update_event',expectedUpdatedAt:row('empty-update').updated_at,...part({locations:['Via Avigliana'],eventType:'decrement',quantity:1})})).status,200);
assert.equal(row('empty-update').location_name,'Via Avigliana');
assert.equal((await call({sourceKey:'empty-delete',action:'delete_event',expectedUpdatedAt:row('empty-delete').updated_at})).status,200);
assert.equal(row('empty-delete').validation,'manual_rejected');
// The same correction also applies to incomplete events imported from the local catalog.
assert.equal((await call({sourceKey:'empty-local',action:'split_event',original:{...original,locations:[]},parts:[part({locations:['Piazza San Saturnino']}),part({locations:['Via Avigliana']})]})).status,200);
database.close();console.log('worker-tree-admin: ok');
