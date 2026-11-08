import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const endpoint='https://discodata.eea.europa.eu/sql';
const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const frontend=app.slice(app.indexOf('async function fetchDiscodataPages('),app.indexOf('\nfunction acceptedRank('));
const worker=fs.readFileSync(new URL('../cloudflare/eea-proxy/src/index.js',import.meta.url),'utf8').replace('export default{','globalThis.worker={');
const sql="SELECT AQStationName FROM [AirQualityDataFlows].[latest].[Measurements] WHERE CountryCode='IT'";

for(const implementation of ['browser','worker']){
  function client(fetch){
    const context=vm.createContext({URL,URLSearchParams,FormData,Date,Request,Response,Headers,console,crypto,fetch,EEA_SQL_API:endpoint});
    vm.runInContext(implementation==='browser'?frontend:worker,context);
    return implementation==='browser'?context.fetchDiscodataPages:context.discodataPages;
  }

  test(`${implementation}: POST multipart, SQL nel corpo e paginazione`,async()=>{
    let calls=0;
    const read=client(async(url,options)=>{
      assert.equal(url,endpoint);
      assert.equal(options.method,'POST');
      assert.ok(options.body instanceof FormData);
      assert.equal(options.body.get('query'),sql);
      assert.equal(options.body.get('p'),String(++calls));
      assert.equal(options.body.get('nrOfHits'),'1000');
      if(implementation==='worker')assert.equal(new Headers(options.headers).get('User-Agent'),'QualitaAria/0.2.2 (+https://fabzip.github.io/qualita-aria/)');
      // Nessuna boundary manuale: viene generata dal client HTTP.
      const request=new Request(url,options);
      assert.match(request.headers.get('Content-Type'),/^multipart\/form-data; boundary=/);
      assert.equal((await request.formData()).get('query'),sql);
      return Response.json({results:calls===1?Array.from({length:1000},()=>({name:'CITTÀ STUDI'})):[{name:'GUIDONIA'}]});
    });
    const result=await read(sql);
    assert.equal(calls,2);
    assert.equal(result.pages,2);
    assert.equal(result.truncated,false);
    assert.equal(result.rows.length,1001);
    assert.equal(result.rows[1000].name,'GUIDONIA');
  });

  test(`${implementation}: risposte vuote e limite pagine`,async()=>{
    const empty=await client(async()=>Response.json({results:[]}))(sql);
    assert.equal(empty.rows.length,0);
    assert.equal(empty.pages,1);
    assert.equal(empty.truncated,false);
    const capped=await client(async()=>Response.json({results:Array(1000).fill({value:1})}))(sql,{maxPages:1});
    assert.equal(capped.rows.length,1000);
    assert.equal(capped.truncated,true);
  });

  test(`${implementation}: gli errori non diventano risultati vuoti`,async()=>{
    let calls=0;
    const read=client(async()=>{
      calls++;
      return calls===1?Response.json({results:Array(1000).fill({value:1})}):new Response('Forbidden',{status:403});
    });
    await assert.rejects(read(sql),/HTTP 403 · pagina 2/);
    assert.equal(calls,2,'Nessun tentativo GET dopo il fallimento POST');
    await assert.rejects(client(async()=>{throw new Error('offline')})(sql),/offline/);
  });
}

test('worker: diagnostica gateway limitata e stato upstream propagato a UTD',async()=>{
  const context=vm.createContext({URL,URLSearchParams,FormData,Date,Request,Response,Headers,console,crypto,
    caches:{default:{async match(){},async put(){}}},
    async fetch(url,options){
      if(String(url).includes('/ParquetFile/urls'))return new Response('ParquetFileUrl\nhttps://files.test/IT0887A.parquet');
      assert.equal(options.method,'POST');
      assert.match(options.headers['User-Agent'],/^QualitaAria\//);
      return new Response('<html><title>403 Forbidden</title><center>Microsoft-Azure-Application-Gateway/v2</center><div>NOT_PUBLIC</div></html>',{status:403});
    }
  });
  vm.runInContext(worker,context);
  const query='year=2026&pollutant=PM2.5&country=IT&city=Roma&bbox=12.59,41.88,12.84,42.06';
  for(const path of ['/v1/metadata','/v1/utd/files']){
    const response=await context.worker.fetch(new Request(`https://worker.test${path}?${query}`,{headers:{Origin:'https://fabzip.github.io'}}),{},{waitUntil(){}});
    assert.equal(response.status,502);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://fabzip.github.io');
    const payload=await response.json();
    assert.equal(payload.upstreamStatus,403);
    assert.match(payload.error,/403 Forbidden · Microsoft-Azure-Application-Gateway\/v2/);
    assert.doesNotMatch(payload.error,/NOT_PUBLIC/);
  }
});
