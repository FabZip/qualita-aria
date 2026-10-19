import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const RealDate=Date;

class FixedDate extends RealDate{
  constructor(...args){
    super(...(args.length?args:['2026-10-13T12:00:00.000Z']))
  }

  static now(){
    return new RealDate('2026-10-13T12:00:00.000Z').getTime()
  }
}

const context=vm.createContext({
  URL,
  Date:FixedDate,
  console,
  setTimeout,
  clearTimeout,
  Request,
  Response,
  Headers,
  TextEncoder,
  TextDecoder,
  crypto
});

const workerSource=fs.readFileSync(
  path.join(root,'cloudflare/temperature-proxy/src/index.js'),
  'utf8'
).replace('export default{','globalThis.worker={');

vm.runInContext(workerSource,context);

const sourceUrl='https://www.comune.roma.it/web/it/informazione-di-servizio.page?contentId=IDS9999999';
const notice=date=>`
  <h1>Abbattimento di alberi</h1>
  <meta property="article:published_time" content="2026-10-01">
  <p>Ubicazione: Via Roma</p>
  <p>Caratteristiche botaniche: n. 4 alberi</p>
  <p>Data di esecuzione: ${date}</p>
`;

const future=context.classifyTreePage(notice('20 dicembre 2026'),sourceUrl)[0];
assert.equal(future.eventDate,'2026-12-20');
assert.equal(future.status,'planned');
assert.equal(future.validation,'automatic_pending');

for(const date of ['dal 20 al 24 dicembre 2026','20 e 21 dicembre 2026','20 dicembre','2026-12-20']){
  const event=context.classifyTreePage(notice(date),sourceUrl)[0];
  assert.equal(event.eventDate,'2026-12-20',date);
  assert.equal(event.status,'planned',date)
}
const futureWithoutQuantity=context.classifyTreePage(`
  <h1>Abbattimenti programmati</h1>
  <meta property="article:published_time" content="2026-10-01">
  <p>Gli abbattimenti programmati si svolgeranno il 20 dicembre 2026. Ubicazione: Via Roma</p>
`,'https://www.comune.roma.it/web/it/notizia/abbattimenti-programmati.page')[0];
assert.equal(futureWithoutQuantity.eventDate,'2026-12-20');
assert.equal(futureWithoutQuantity.quantity,null);
assert.equal(futureWithoutQuantity.status,'planned');
assert.equal(futureWithoutQuantity.validation,'automatic_pending');
assert.equal(context.classifyTreePage('<h1>Abbattimenti e manutenzioni</h1><p>1 ottobre 2026</p>','https://www.comune.roma.it/web/it/notizia/generica.page').length,0);

const past=context.classifyTreePage(notice('20 settembre 2026'),sourceUrl)[0];
assert.equal(past.eventDate,'2026-09-20');
assert.equal(past.status,'emergency_completed');
assert.equal(past.validation,'automatic_confirmed');

const guidoniaUrl='https://guidonia.halleyweb.it/zf/index.php/atti-amministrativi/determine/dettaglio/atto/ABC';
const determination=context.classifyTreePage(`
  <h1>Determina n. 123 del 3 ottobre 2026</h1>
  <meta property="article:published_time" content="2026-10-03">
  <p>Abbattimento di 5 alberi in Via Roma.</p>
`,guidoniaUrl,'guidonia-montecelio')[0];
assert.equal(determination.quantity,5);

assert.equal(context.treeQuantity(`
  <h1>Ordinanza n. 32/2026</h1>
  <p>Potatura e abbattimento di alberi in Via Roma.</p>
`),null);

assert.equal(context.treeQuantity(`
  Ubicazione: Via Roma
  Caratteristiche botaniche: n° 2 Quercus ilex e n. 3 Pinus pinea
  Data di esecuzione: 20 settembre 2026
`),5);

assert.equal(context.treeQuantity('Sono state messe a dimora 12 nuove piante.'),12);

assert.equal(context.coordinatesInsideTreeArea(12.7268,41.9938,'guidonia-montecelio'),true);
assert.equal(context.coordinatesInsideTreeArea(12.3,41.9,'guidonia-montecelio'),false);

let geocodeTarget=null;
context.fetch=async resource=>{
  geocodeTarget=new URL(String(resource));
  return Response.json([{display_name:'Via Roma, Guidonia Montecelio',lon:'12.72',lat:'41.99'}])
};
const geocodeResponse=await context.treeGeocodeSearchResponse(
  {},
  new URL('https://worker.test/v1/trees/geocode?q=Via%20Roma&city=guidonia-montecelio')
);
assert.equal(geocodeResponse.status,200);
assert.equal(geocodeTarget.searchParams.get('q'),'Via Roma, Guidonia Montecelio');
assert.equal(geocodeTarget.searchParams.get('viewbox'),'12.55,42.12,12.85,41.88');
assert.equal(
  (await context.treeGeocodeSearchResponse({},new URL('https://worker.test/v1/trees/geocode?q=Via%20Roma&city=milano'))).status,
  400
);

function applyCursorMigrations(database){
  for(const migration of ['0010_tree_source_cursors.sql','0011_tree_source_cursor_offsets.sql']){
    database.exec(fs.readFileSync(
      path.join(root,'cloudflare/temperature-proxy/migrations',migration),
      'utf8'
    ))
  }
}

function cursorDb(database){
  return{
  prepare(sql){
    return{
      args:[],
      bind(...args){this.args=args;return this},
      async first(){return database.prepare(sql).get(...this.args)||null},
      async run(){return database.prepare(sql).run(...this.args)}
    }
  }
  }
}

const sqlite=new DatabaseSync(':memory:');
applyCursorMigrations(sqlite);
const db=cursorDb(sqlite);

context.fetch=async resource=>{
  const url=String(resource);
  const isGuidonia=url.includes('guidonia.halleyweb.it');
  const kind=url.includes('determine')?'determine':'ordinanze';
  const links=Array.from({length:20},(_,index)=>{
    const href=isGuidonia
      ?`https://guidonia.halleyweb.it/zf/index.php/atti-amministrativi/${kind}/dettaglio/atto/${kind}-${index}`
      :url.includes('/notizie.page')
        ?`https://www.comune.roma.it/web/it/notizia/alberi-${index}.page`
        :`https://www.comune.roma.it/web/it/informazione-di-servizio.page?contentId=IDS${1000000+index}`;
    return`<a href="${href}">Atto</a>`
  }).join('');
  return new Response(`<p>1 ottobre 2026</p>${links}`)
};

const firstDiscovery=await context.discoverTreePages(db);
assert.equal(firstDiscovery.links.length,40);
assert.equal(firstDiscovery.sources.filter(source=>source.deferred).length,2);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS total FROM tree_source_cursors').get().total,0);
await context.persistTreeSourceCursors(db,firstDiscovery.cursorUpdates);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS total FROM tree_source_cursors').get().total,2);

const secondDiscovery=await context.discoverTreePages(db);
assert.equal(secondDiscovery.links.length,40);
assert.equal(secondDiscovery.sources.filter(source=>source.deferred).length,2);
await context.persistTreeSourceCursors(db,secondDiscovery.cursorUpdates);

const discoveredSources=new Set([
  ...firstDiscovery.links.map(link=>link.sourceId),
  ...secondDiscovery.links.map(link=>link.sourceId)
]);
assert.equal(discoveredSources.size,4);
assert.equal(new Set([
  ...firstDiscovery.links.map(link=>link.url),
  ...secondDiscovery.links.map(link=>link.url)
]).size,80);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS total FROM tree_source_cursors').get().total,4);

const offsetSqlite=new DatabaseSync(':memory:');
applyCursorMigrations(offsetSqlite);
const offsetDb=cursorDb(offsetSqlite);
let expandedArchive=false;
context.fetch=async resource=>{
  const url=String(resource);
  if(url.includes('/informazioni-di-servizio.page')){
    const ids=Array.from({length:45},(_,index)=>2000000+index);
    if(expandedArchive)ids.unshift(2999999);
    const links=ids.map(id=>
      `<a href="/web/it/informazione-di-servizio.page?contentId=IDS${id}">Atto</a>`
    ).join('');
    return new Response(`<p>1 ottobre 2026</p>${links}`)
  }
  return new Response('<p>1 ottobre 2026</p>')
};

const firstOffsetDiscovery=await context.discoverTreePages(offsetDb);
const firstOffsetSource=firstOffsetDiscovery.sources.find(source=>source.sourceId==='roma-service');
assert.equal(firstOffsetDiscovery.links.length,40);
assert.equal(firstOffsetSource.totalLinks,45);
assert.equal(firstOffsetSource.partial,true);
await context.persistTreeSourceCursors(offsetDb,firstOffsetDiscovery.cursorUpdates);
const partialCursor=offsetSqlite.prepare("SELECT next_page,next_link_offset,page_signature FROM tree_source_cursors WHERE source_id='roma-service'").get();
assert.equal(partialCursor.next_page,1);
assert.equal(partialCursor.next_link_offset,40);
assert.match(partialCursor.page_signature,/^45:/);

expandedArchive=true;
const secondOffsetDiscovery=await context.discoverTreePages(offsetDb);
const changedOffsetSource=secondOffsetDiscovery.sources.find(source=>source.sourceId==='roma-service');
assert.equal(secondOffsetDiscovery.links.length,40);
assert.equal(changedOffsetSource.pageChanged,true);
assert.equal(changedOffsetSource.linkOffset,0);
await context.persistTreeSourceCursors(offsetDb,secondOffsetDiscovery.cursorUpdates);

const thirdOffsetDiscovery=await context.discoverTreePages(offsetDb);
assert.equal(thirdOffsetDiscovery.links.length,6);
await context.persistTreeSourceCursors(offsetDb,thirdOffsetDiscovery.cursorUpdates);
assert.equal(new Set([
  ...firstOffsetDiscovery.links.map(link=>link.url),
  ...secondOffsetDiscovery.links.map(link=>link.url),
  ...thirdOffsetDiscovery.links.map(link=>link.url)
]).size,46);
const completedPageCursor=offsetSqlite.prepare("SELECT next_page,next_link_offset,page_signature FROM tree_source_cursors WHERE source_id='roma-service'").get();
assert.equal(completedPageCursor.next_page,2);
assert.equal(completedPageCursor.next_link_offset,0);
assert.equal(completedPageCursor.page_signature,null);

// Una data vecchia nella pagina non interrompe una pagina contenente avvisi del 2026.
context.fetch=async resource=>new Response(String(resource).includes('/informazioni-di-servizio.page')
  ?'<p>1 ottobre 2026</p><p>1 gennaio 2020</p><a href="/web/it/informazione-di-servizio.page?contentId=IDS3333333">Avviso</a>'
  :'');
const mixedDates=await context.discoverTreePages(offsetDb);
assert.equal(mixedDates.cursorUpdates.find(source=>source.sourceId==='roma-service').scanComplete,false);

// La prima pagina viene ricontrollata anche se il cursore è già su pagine storiche.
context.fetch=async resource=>new Response(String(resource).includes('/informazioni-di-servizio.page')
  ?Array.from({length:10},(_,i)=>`<a href="/web/it/informazione-di-servizio.page?contentId=IDS${4000000+i}">Avviso</a>`).join('')
  :'');
const freshLinks=new Set();
for(let run=0;run<5;run++){
  const recent=await context.recentTreePages(new Map(),run);
  assert.equal(recent.links.length,4);
  assert.ok(recent.links.some(link=>link.url.includes('IDS4000000')));
  recent.links.forEach(link=>freshLinks.add(link.url))
}
assert.equal(freshLinks.size,10);

const cursorWrites=[];
const refreshDb={
  prepare(sql){
    return{
      args:[],
      bind(...args){this.args=args;return this},
      async first(){
        if(sql.includes('INSERT INTO tree_sync_runs'))return{id:1};
        return null
      },
      async all(){return{results:[]}},
      async run(){
        if(sql.includes('INSERT INTO tree_source_cursors'))cursorWrites.push(this.args[0]);
        return{meta:{changes:1}}
      }
    }
  },
  async batch(){return[]}
};

context.fetch=async resource=>{
  const url=String(resource);
  if(url.includes('/informazioni-di-servizio.page')){
    return new Response('<p>1 ottobre 2026</p><a href="/web/it/informazione-di-servizio.page?contentId=IDS9999999">Atto</a>')
  }
  if(url.includes('/notizie.page')){
    return new Response('<p>1 ottobre 2026</p><a href="/web/it/notizia/alberi-success.page">Atto</a>')
  }
  if(url.includes('/determine/index/')){
    return new Response('<p>Data registro generale 01/10/2026</p><a href="/zf/index.php/atti-amministrativi/determine/dettaglio/table-determine-public-page/1/atto/DET">Atto</a>')
  }
  if(url.includes('/ordinanze/index/')){
    return new Response('<p>Data registro generale 01/10/2026</p><a href="/zf/index.php/atti-amministrativi/ordinanze/dettaglio/table-ordinanze-public-page/1/atto/ORD">Atto</a>')
  }
  if(url.includes('contentId=IDS9999999'))return new Response('Errore temporaneo',{status:503});
  return new Response('<h1>Pagina senza eventi arborei</h1>')
};

const refreshResult=await context.refreshTreeSources({TREE_DB:refreshDb});
assert.equal(refreshResult.errors,1);
assert.equal(refreshResult.scanComplete,false);
assert.deepEqual(
  [...cursorWrites].sort(),
  ['guidonia-determine','guidonia-ordinanze','roma-news']
);
assert.equal(
  refreshResult.archiveSources.find(source=>source.sourceId==='roma-service').cursorAdvanced,
  false
);
assert.equal(
  refreshResult.archiveSources.find(source=>source.sourceId==='roma-news').cursorAdvanced,
  true
);

console.log('worker-tree-parser: ok');
