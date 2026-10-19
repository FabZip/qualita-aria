import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

const frontendContext=vm.createContext({Date,console});
vm.runInContext(
  fs.readFileSync(path.join(root,'js/openaq-world.js'),'utf8'),
  frontendContext
);

const localNow=new Date(2026,9,14,12,30,0);
const expectedMidnight=new Date(2026,9,14,0,0,0).toISOString();
const today=frontendContext.OpenAQPeriod.periodFromValue('today',localNow);
assert.equal(today.label,'Oggi');
assert.equal(today.datetimeMin,expectedMidnight);
assert.equal(today.maxAgeDays,null);
assert.match(today.key,/^today:/);

const recent=frontendContext.OpenAQPeriod.periodFromValue('7',localNow);
assert.equal(recent.maxAgeDays,7);
assert.equal(recent.datetimeMin,'');
assert.equal(frontendContext.OpenAQPeriod.periodFromValue('invalid',localNow).maxAgeDays,30);

const workerContext=vm.createContext({
  URL,
  URLSearchParams,
  Date,
  console,
  Request,
  Response,
  Headers,
  TextEncoder,
  TextDecoder,
  crypto
});
const workerSource=fs.readFileSync(
  path.join(root,'cloudflare/openaq-proxy/src/index.js'),
  'utf8'
).replace('export default{','globalThis.worker={');
vm.runInContext(workerSource,workerContext);

assert.equal(
  workerContext.viewportCutoffIso(30,'2026-10-13T22:00:00.000Z',Date.parse('2026-10-14T12:00:00Z')),
  '2026-10-13T22:00:00.000Z'
);
assert.equal(
  workerContext.viewportCutoffIso(7,'',Date.parse('2026-10-14T12:00:00Z')),
  '2026-10-07T12:00:00.000Z'
);

const health=await workerContext.worker.fetch(
  new Request('https://worker.test/health'),
  {},
  {waitUntil(){}}
);
const healthPayload=await health.json();
assert.equal(healthPayload.version,'0.4.1');
assert.equal(healthPayload.viewportToday,true);

const invalidDate=await workerContext.worker.fetch(
  new Request('https://worker.test/v1/viewport/latest?pollutant=pm25&bbox=12,41,13,42&datetime_min=not-a-date'),
  {OPENAQ_API_KEY:'test'},
  {waitUntil(){}}
);
assert.equal(invalidDate.status,400);

workerContext.caches={default:{
  async match(){return null},
  async put(){}
}};
workerContext.fetch=async resource=>{
  const url=new URL(String(resource));
  if(url.pathname==='/v3/locations'){
    return Response.json({
      meta:{found:2},
      results:[
        {
          id:1,
          name:'Roma oggi',
          locality:'Roma',
          isMonitor:true,
          isMobile:false,
          datetimeLast:{utc:'2026-10-14T08:00:00.000Z'},
          coordinates:{latitude:41.9,longitude:12.5},
          country:{code:'IT',name:'Italia'},
          provider:{name:'Test'},
          sensors:[{id:11,parameter:{id:2}}]
        },
        {
          id:2,
          name:'Roma ieri',
          isMonitor:true,
          isMobile:false,
          datetimeLast:{utc:'2026-10-13T18:00:00.000Z'},
          sensors:[{id:22,parameter:{id:2}}]
        }
      ]
    })
  }
  if(url.pathname==='/v3/locations/1/latest'){
    assert.equal(url.searchParams.get('datetime_min'),'2026-10-13T22:00:00.000Z');
    return Response.json({results:[{
      sensorsId:11,
      value:12.4,
      datetime:{utc:'2026-10-14T08:00:00.000Z',local:'2026-10-14T10:00:00+02:00'},
      coordinates:{latitude:41.9,longitude:12.5}
    }]})
  }
  throw new Error(`Richiesta inattesa: ${url}`)
};

const todayResponse=await workerContext.worker.fetch(
  new Request('https://worker.test/v1/viewport/latest?pollutant=pm25&bbox=12,41,13,42&datetime_min=2026-10-13T22:00:00.000Z'),
  {OPENAQ_API_KEY:'test'},
  {waitUntil(){}}
);
assert.equal(todayResponse.status,200);
const todayPayload=await todayResponse.json();
assert.equal(todayPayload.meta.period,'today');
assert.equal(todayPayload.meta.datetimeMin,'2026-10-13T22:00:00.000Z');
assert.equal(todayPayload.meta.maxAgeDays,null);
assert.equal(todayPayload.results.length,1);
assert.equal(todayPayload.results[0].name,'Roma oggi');

console.log('openaq-today: ok');
