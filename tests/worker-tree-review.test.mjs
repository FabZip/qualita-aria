import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';

const root=new URL('../',import.meta.url);
const database=new DatabaseSync(':memory:');
const migrations=new URL('cloudflare/temperature-proxy/migrations/',root);
for(const file of fs.readdirSync(migrations).filter(file=>file.endsWith('.sql')).sort()){
  database.exec(fs.readFileSync(new URL(file,migrations),'utf8'))
}
database.exec('DELETE FROM tree_location_reports; DELETE FROM tree_location_overrides; DELETE FROM tree_events;');
const db={
  prepare(sql){
    return{
      args:[],
      bind(...args){this.args=args;return this},
      async first(){return database.prepare(sql).get(...this.args)||null},
      async all(){return{results:database.prepare(sql).all(...this.args)}},
      async run(){return{meta:{changes:database.prepare(sql).run(...this.args).changes}}}
    }
  },
  async batch(statements){
    database.exec('BEGIN');
    try{const result=await Promise.all(statements.map(statement=>statement.run()));database.exec('COMMIT');return result}
    catch(error){database.exec('ROLLBACK');throw error}
  }
};
class FixedDate extends Date{
  constructor(...args){super(...(args.length?args:['2026-10-19T12:00:00Z']))}
  static now(){return Date.parse('2026-10-19T12:00:00Z')}
}
const context=vm.createContext({URL,Date:FixedDate,console,Request,Response,Headers,TextEncoder,TextDecoder,crypto,setTimeout:callback=>callback()});
vm.runInContext(fs.readFileSync(new URL('cloudflare/temperature-proxy/src/index.js',root),'utf8').replace('export default{','globalThis.worker={'),context);

// Nessuna coordinata precedente: l'approvazione cerca subito soltanto l'evento corretto.
const key='test-guidonia-corrected';
database.prepare(`INSERT INTO tree_events(source_key,city,year,event_date,location_name,locations_json,event_type,quantity,status,validation,title,source_url,first_seen_at,last_checked_at,updated_at)
  VALUES (?,'guidonia-montecelio',2025,'2025-03-11','Località errata','["Località errata"]','planting',200,'reported','automatic_pending','Evento di Guidonia','https://example.test/event','2025-01-01','2025-01-01','2025-01-01')`).run(key);
function report(){
  return Number(database.prepare(`INSERT INTO tree_location_reports(source_key,location_index,location_name,reason,created_at) VALUES (?,-1,'Località errata','Correggere località','2026-10-19')`).run(key).lastInsertRowid)
}
function update(reportId,locations=['Piazza Matteotti'],title='Evento corretto'){
  return context.reviewTreeLocationReport(new Request('https://worker.test/v1/trees/location-reports/review',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reportId,action:'update_event',title,eventDate:'2025-03-11',locations,eventType:'planting',eventStatus:'reported',quantity:200})
  }),{TREE_DB:db},{})
}
let calls=0;
context.fetch=async resource=>{
  calls++;
  const url=new URL(String(resource));
  assert.match(url.searchParams.get('q'),/Piazza Matteotti, Guidonia Montecelio/);
  assert.equal(url.searchParams.get('bounded'),'1');
  assert.equal(url.searchParams.get('viewbox'),'12.55,42.12,12.85,41.88');
  return Response.json([{display_name:'Piazza Matteotti, Guidonia Montecelio',lon:'12.7268',lat:'41.9938'}])
};
const response=await update(report());
assert.equal(response.status,200);
assert.equal((await response.json()).geocoding.geocoded,1);
assert.equal(calls,1);
let row=database.prepare('SELECT * FROM tree_events WHERE source_key=?').get(key);
assert.equal(row.longitude,12.7268);
assert.equal(row.latitude,41.9938);
assert.equal(row.validation,'manual_confirmed');
assert.equal(row.year,2025);
const payloadResponse=await context.treeEventsResponse({TREE_DB:db},{},new URL('https://worker.test/v1/trees/events?city=guidonia-montecelio&year=2025'));
assert.equal(payloadResponse.headers.get('Cache-Control'),'no-store');
const event=(await payloadResponse.json()).events.find(event=>event.sourceKey===key);
assert.deepEqual(event.coordinates,[12.7268,41.9938]);
assert.deepEqual(event.markerCoordinates,[[12.7268,41.9938]]);

// Correggere solo il titolo non deve cancellare punti e override già approvati.
database.prepare(`INSERT INTO tree_location_overrides(source_key,location_index,location_name,longitude,latitude) VALUES (?,0,'Piazza Matteotti',12.727,41.994)`).run(key);
await update(report(),['Piazza Matteotti'],'Titolo aggiornato');
assert.equal(calls,1);
assert.equal(database.prepare('SELECT longitude FROM tree_events WHERE source_key=?').get(key).longitude,12.7268);
assert.equal(database.prepare('SELECT COUNT(*) AS n FROM tree_location_overrides WHERE source_key=?').get(key).n,1);

// Indirizzo sconosciuto: niente coordinate inventate o vecchi override mantenuti.
context.fetch=async()=>Response.json([]);
await update(report(),['Località inesistente']);
row=database.prepare('SELECT * FROM tree_events WHERE source_key=?').get(key);
assert.equal(row.longitude,null);
assert.equal(row.latitude,null);
assert.equal(database.prepare('SELECT COUNT(*) AS n FROM tree_location_overrides WHERE source_key=?').get(key).n,0);

// Una correzione manuale già salvata e rimasta senza posizione viene ritentata.
database.prepare("UPDATE tree_events SET geocoded_at='2020-01-01' WHERE source_key=?").run(key);
context.fetch=async()=>Response.json([{lon:'12.72',lat:'41.99'}]);
assert.equal((await context.geocodePendingTreeEvents(db)).geocoded,1);

// Un errore temporaneo non completa definitivamente la geocodifica.
context.fetch=async()=>new Response('temporaneo',{status:503});
await update(report(),['Via nuova']);
row=database.prepare('SELECT * FROM tree_events WHERE source_key=?').get(key);
assert.equal(row.geocoded_at,null);
assert.equal(JSON.parse(row.location_points_json)[0].geometryChecked,false);
context.fetch=async()=>Response.json([{lon:'12.73',lat:'41.99'}]);
assert.equal((await context.geocodePendingTreeEvents(db,key)).geocoded,1);

// Il risultato del geocoder va comunque verificato rispetto al Comune.
context.fetch=async()=>Response.json([{lon:'9.19',lat:'45.46'}]);
await update(report(),['Via fuori area']);
assert.equal(database.prepare('SELECT longitude FROM tree_events WHERE source_key=?').get(key).longitude,null);

// Refresh integrato: un avviso appena pubblicato non deve attendere il backfill a pagina 50.
for(const sourceId of ['roma-service','roma-news','guidonia-determine','guidonia-ordinanze']){
  database.prepare(`INSERT INTO tree_source_cursors(source_id,city,next_page,scan_year,scan_complete,updated_at) VALUES (?,'roma',50,2026,0,'2026-10-01')`).run(sourceId)
}
context.fetch=async resource=>{
  const url=String(resource);
  if(url.includes('nominatim'))return Response.json([]);
  if(url.includes('/informazioni-di-servizio.page')&&url.includes('pagina=1'))return new Response('<a href="/web/it/informazione-di-servizio.page?contentId=IDS9999999">Nuovo avviso</a>');
  if(url.includes('contentId=IDS9999999'))return new Response('<h1>Abbattimento alberi</h1><meta property="article:published_time" content="2026-10-01"><p>Ubicazione: Via Roma</p><p>Data di esecuzione: dal 20 al 24 dicembre 2026</p>');
  return new Response('')
};
const refresh=await context.refreshTreeSources({TREE_DB:db});
assert.equal(refresh.errors,0);
assert.equal(refresh.futureEventsFound,1);
assert.equal(refresh.recentPagesChecked,1);
const future=database.prepare("SELECT * FROM tree_events WHERE source_key='IDS9999999'").get();
assert.equal(future.event_date,'2026-12-20');
assert.equal(future.status,'planned');
assert.equal(future.quantity,null);
database.close();
console.log('worker-tree-review: ok');
