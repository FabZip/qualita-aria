import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const now=Date.parse('2026-11-26T10:00:00Z');
class FixedDate extends Date{static now(){return now}}
const entry=({event='Yellow Snow-ice Warning',status='Actual',type='Update',expires='2026-11-27T12:00:00Z',id='one'}={})=>`<entry><cap:event>${event}</cap:event><cap:status>${status}</cap:status><cap:scope>Public</cap:scope><cap:message_type>${type}</cap:message_type><cap:severity>Moderate</cap:severity><cap:identifier>${id}</cap:identifier><cap:areaDesc>Trentino Alto Adige</cap:areaDesc><cap:onset>2026-11-26T09:00:00Z</cap:onset><cap:expires>${expires}</cap:expires></entry>`;
const feed=body=>`<feed xmlns="http://www.w3.org/2005/Atom"><updated>2026-11-26T09:30:00Z</updated>${body}</feed>`;
let upstream=feed(entry()+entry()+entry({event:'Yellow Rain Warning'})+entry({status:'Test'})+entry({type:'Cancel'})+entry({expires:'2026-11-25T12:00:00Z'})),calls=0;
const c=vm.createContext({URL,Request,Response,Headers,TextEncoder,TextDecoder,Date:FixedDate,crypto,console,setTimeout,clearTimeout,AbortController,fetch:async (url,options)=>{assert.equal(options.redirect,'manual');calls++;assert.equal(url,'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-italy');return new Response(upstream)}});
vm.runInContext(fs.readFileSync(new URL('../cloudflare/temperature-proxy/src/index.js',import.meta.url),'utf8').replace('export default{','globalThis.worker={'),c);
const parsed=c.parseSnowAlerts(upstream);assert.equal(parsed.warnings.length,1);assert.equal(parsed.warnings[0].level,'Gialla');assert.equal(parsed.stale,false);
assert.equal(c.parseSnowAlerts(upstream.replace('2026-11-26T09:30:00Z','2026-11-25T09:30:00Z')).stale,true);
assert.throws(()=>c.parseSnowAlerts('<html>Unavailable</html>'),/non valido/);assert.throws(()=>c.parseSnowAlerts(feed('<!DOCTYPE xx>')),/non valido/);
const url='https://worker.test/v1/weather/snow-alerts';
const response=await c.worker.fetch(new Request(url,{headers:{Origin:'https://fabzip.github.io'}}),{},{});assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://fabzip.github.io');assert.equal((await response.json()).warnings.length,1);
const blocked=await c.worker.fetch(new Request(url,{headers:{Origin:'https://untrusted.test'}}),{},{});assert.equal(blocked.status,403);assert.equal(calls,1);
upstream='invalid';const unavailable=await c.worker.fetch(new Request(url),{},{});assert.equal(unavailable.status,502);assert.match((await unavailable.json()).error,/non disponibili/);
upstream='x'.repeat(2000001);assert.equal((await c.worker.fetch(new Request(url),{},{})).status,502);
assert.equal((await c.worker.fetch(new Request(url,{method:'POST'}),{},{})).status,405);
console.log('worker snow alerts: validity, deduplication, status, CORS, size limits and errors ok');

// Cache only validated successes and add CORS after retrieval, per requesting origin.
let stored=null,puts=0;
c.caches={default:{async match(){return stored?.clone()},async put(key,response){puts++;stored=response}}};
upstream=feed(entry());const cachedFirst=await c.worker.fetch(new Request(url,{headers:{Origin:'https://fabzip.github.io'}}),{},{});assert.equal(cachedFirst.status,200);assert.equal(puts,1);
const before=calls;const cachedOtherOrigin=await c.worker.fetch(new Request(url,{headers:{Origin:'http://localhost:8768'}}),{},{});assert.equal(calls,before);assert.equal(cachedOtherOrigin.headers.get('Access-Control-Allow-Origin'),'http://localhost:8768');
