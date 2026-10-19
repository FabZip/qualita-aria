import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const storage=new Map();
const upstreamRequests=[];
const urls=Array.from({length:328},(_,index)=>`https://files.eea.test/IT${String(index).padStart(4,'0')}A_PM25.parquet`);
urls.push('https://files.eea.test/unclassified.parquet');
const context=vm.createContext({
  URL,URLSearchParams,Date,Request,Response,Headers,console,crypto,
  caches:{default:{
    async match(request){return storage.get(request.url)?.clone()},
    async put(request,response){storage.set(request.url,response.clone())}
  }},
  async fetch(resource,options){
    const url=new URL(String(resource));
    upstreamRequests.push(url);
    if(url.pathname==='/ParquetFile/urls'){
      const payload=JSON.parse(options.body);
      assert.deepEqual(payload.countries,['IT']);
      assert.deepEqual(payload.cities,[],'Non filtrare il catalogo per il nome Milano');
      assert.deepEqual(payload.pollutants,['PM2.5']);
      return new Response(`\uFEFFParquetFileUrl\n${urls.join('\n')}`)
    }
    if(url.hostname==='discodata.eea.europa.eu'){
      return Response.json({results:[{
        AirQualityStationEoICode:'IT0327A',SampleId:'IT/SPO.IT0327A_6001',
        AirPollutantCode:6001,Latitude:45.46,Longitude:9.18,CountryCode:'IT'
      }]})
    }
    if(url.hostname==='files.eea.test')return new Response(new Uint8Array([1,2,3]));
    throw new Error(`Richiesta inattesa: ${url}`)
  }
});
vm.runInContext(fs.readFileSync(new URL('../cloudflare/eea-proxy/src/index.js',import.meta.url),'utf8').replace('export default{','globalThis.worker={'),context);
const ctx={waitUntil(promise){return promise}};
const query='country=IT&city=Milano&pollutant=PM2.5&year=2026&bbox=8.67,45.1092,9.6948,45.8278';
const response=await context.worker.fetch(new Request(`https://worker.test/v1/utd/files?${query}`),{},ctx);
assert.equal(response.status,200);
const payload=await response.json();
assert.equal(payload.meta.countryFileCount,329,'Non troncare il catalogo ai primi 100 file');
assert.equal(payload.meta.spatialSelection,true);
assert.equal(payload.files.length,2);
assert.equal(payload.files[0].name,'IT0327A_PM25.parquet','La stazione oltre il vecchio limite deve essere presente');
assert.equal(payload.files[1].name,'unclassified.parquet','Non scartare file dal nome sconosciuto');
const binary=await context.worker.fetch(new Request(`https://worker.test/v1/utd/file?${query}&index=0`),{},ctx);
assert.equal(binary.status,200);
assert.equal((await binary.arrayBuffer()).byteLength,3);
assert.ok(upstreamRequests.some(url=>url.pathname==='/IT0327A_PM25.parquet'));
assert.equal(upstreamRequests.filter(url=>url.pathname==='/ParquetFile/urls').length,1,'Riutilizza il catalogo nazionale in cache');
assert.equal(context.parseParquetUrls(urls.join('\n')).length,329);
assert.throws(()=>context.parseParquetUrls(Array.from({length:2001},(_,i)=>`https://files.test/${i}.parquet`).join('\n')),/troppo grande/);
const bad=await context.worker.fetch(new Request(`https://worker.test/v1/utd/files?country=IT&pollutant=PM2.5&bbox=wrong`),{},ctx);
assert.equal(bad.status,400);
console.log('worker-eea-spatial: ok');
