import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class FixedDate extends Date{
  constructor(...args){super(...(args.length?args:['2026-10-24T10:00:00Z']))}
  static now(){return Date.parse('2026-10-24T10:00:00Z')}
}
const scope={label:'Italia · Roma',cityLabel:'Roma',bbox:[12.5932,41.886,12.8348,42.0656]};
const metadata=[0,1].map(index=>({SampleId:`IT/sample-${index}`,AQStationName:`Stazione giornaliera ${index}`,AirQualityStationEoICode:`IT-daily-${index}`,Latitude:41.98,Longitude:12.71,CountryCode:'IT',ReportingYear:2026}));
// Stesse cardinalità della diagnostica ricevuta: 2 file, 582 righe, 556 valide.
// Fixture sintetica di stazioni che pubblicano soltanto medie giornaliere.
const files=metadata.map((station,index)=>Array.from({length:291},(_,day)=>({
  Samplingpoint:station.SampleId,AggType:'day',
  Start:new Date(Date.UTC(2026,0,day+1)).toISOString(),
  End:new Date(Date.UTC(2026,0,day+2)).toISOString(),
  Value:10+index,Validity:day<13?-1:1,Unit:'ug/m3'
})));
let diagnostic=null;
const context=vm.createContext({Date:FixedDate,URL,performance,console,
  state:{},SOURCE_INFO:{eea:{}},fetchEeaRows:async()=>[],sourceNotice(){},
  source:()=> 'eea',eeaScope:()=> 'italy',eeaCity:()=> 'geolocate',
  currentEeaScope:()=>scope,eeaSelectedScope:()=>scope,
  normalizeText:value=>String(value??'').toLowerCase(),parseNumber:Number,eeaStationName:value=>value,
  $:()=>({textContent:''}),diagnostics:value=>{diagnostic=value},
  QualitaAriaEEAProxy:{
    async metadata(){return{data:{results:metadata},cache:'MISS'}},
    async utdFiles(){return{data:{files:[{index:0},{index:1}],meta:{count:2,countryFileCount:334,spatialSelection:true}},cache:'MISS'}},
    async utdFile({index}){return{data:new Uint8Array([index]).buffer}}
  },
  parquetTools:{parquet:{async parquetReadObjects({file}){return files[new Uint8Array(file)[0]]}},compressors:{}}
});
const source=fs.readFileSync(new URL('../js/eea-utd.js',import.meta.url),'utf8');
// Sostituisce soltanto il caricamento della dipendenza remota Parquet.
vm.runInContext(source.replace('globalThis.QualitaAriaEEAUTD={','loadHyparquet=async()=>globalThis.parquetTools;\n  globalThis.QualitaAriaEEAUTD={'),context);
const rows=await context.fetchEeaRows('today','PM2.5');
assert.equal(diagnostic.parquetRows,582);
assert.equal(diagnostic.acceptedObservationRows,556);
assert.equal(diagnostic.observationsByAggregation.day,556);
assert.equal(diagnostic.samplingPoints,2);
assert.equal(diagnostic.stationsInCityCache,2);
assert.equal(rows.length,2);
for(const row of rows){
  assert.equal(row.aggregation,'day');
  assert.equal(row.latestAt,'2026-10-18T00:00:00.000Z');
  assert.equal(row.latestPeriodEnd,'2026-10-19T00:00:00.000Z')
}
assert.equal((await context.fetchEeaRows('today','PM2.5')).length,2,'Anche la cache conserva le ultime medie giornaliere');
assert.equal(diagnostic.cache,'memory-city');

const annual=await context.fetchEeaRows('2026','PM2.5');
assert.equal(annual.length,2,'Il percorso annuale continua a usare la copertura delle serie');
for(const row of annual){
  assert.ok(row.coverage>=75);
  assert.equal(row.latestAt,undefined);
  assert.equal(row.latestPeriodEnd,undefined)
}

// Renderer: nessun orario inventato per le medie giornaliere.
const listSource=fs.readFileSync(new URL('../js/station-list.js',import.meta.url),'utf8');
const start=listSource.indexOf('  function normalRowHtml(');
const end=listSource.indexOf('  function comparisonRowHtml(',start);
const rendering=vm.createContext({Date,Number,listState:{isDiff:false},
  fmtValue:String,escapeHtml:String,coordinatesForRow:()=>null,stationRowAttributes:()=>'',colorForValue:()=> '#000'
});
vm.runInContext(listSource.slice(start,end),rendering);
const html=rendering.normalRowHtml(rows[0],0);
assert.match(html,/media giornaliera del 18\/10\/2026/);
assert.doesNotMatch(html,/00:00/);
console.log('eea-daily: ok');
