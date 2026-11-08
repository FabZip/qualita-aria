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
