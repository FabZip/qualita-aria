import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/snow.js',import.meta.url),'utf8');
const now=Date.parse('2026-11-26T10:30:00Z');
class FixedDate extends Date{static now(){return now}}
const c=vm.createContext({URL,URLSearchParams,Date:FixedDate,Intl,AbortController,setTimeout,clearTimeout});vm.runInContext(source,c);const api=c.Snow;
const time=Array.from({length:48},(_,i)=>new Date(Date.parse('2026-11-26T00:00:00Z')+i*3600000).toISOString().slice(0,16));
const payload={utc_offset_seconds:3600,timezone:'Europe/Rome',current_units:{snowfall:'cm'},hourly_units:{snowfall:'cm',snow_depth:'m'},current:{time:'2026-11-26T11:30',snowfall:0,weather_code:0,interval:900},hourly:{time,snowfall:time.map(()=>.5),snow_depth:time.map(()=>.2)}};
const r=api.report(payload);assert.equal(r.snowfall,0);assert.equal(r.snowing,false);assert.equal(r.next24,12);assert.equal(r.depth,20);
assert.equal(api.report({...payload,current:{...payload.current,snowfall:1}}).snowing,true);
assert.equal(api.report({...payload,current:{...payload.current,snowfall:0,weather_code:71}}).snowing,true);
assert.equal(api.report({...payload,current:{...payload.current,snowfall:null}}).snowing,null);
assert.equal(api.report({...payload,current:{...payload.current,time:'2026-11-25T11:30'}}).snowing,null);
const missing=structuredClone(payload);missing.hourly.snowfall[12]=null;assert.equal(api.report(missing).next24,null);
assert.throws(()=>api.report({...payload,hourly_units:{snowfall:'cm',snow_depth:'cm'}}),/Dati neve/);
assert.equal(api.report({...payload,hourly:{...payload.hourly,time:time.slice(0,5)}}).depth,null);
assert.match(api.localHtml({...r,time:'<script>'}),/&lt;script&gt;/);
const u=new URL(api.gridUrl());assert.equal(u.searchParams.get('latitude').split(',').length,18);assert.equal(u.searchParams.get('hourly'),'snowfall,snow_depth');
const warning={area:'Test',onset:'2026-11-26T09:00:00Z',expires:'2026-11-26T12:00:00Z',level:'Gialla'};
const warnings={updated:'2026-11-26T10:00:00Z',stale:false,warnings:[warning,{...warning,expires:'2026-11-25T12:00:00Z'}]};assert.equal(api.validAlerts(warnings).length,1);assert.match(api.alertSummary(warnings),/1 avvisi in Italia/);assert.match(api.alertSummary({...warnings,updated:'2026-11-25T00:00:00Z'}),/non aggiornati/);assert.match(api.alertSummary({...warnings,warnings:[]}),/Nessun avviso/);
assert.match(api.alertsHtml({...warnings,warnings:[{...warning,area:'<img>'}]}),/&lt;img&gt;/);
// Dashboard order and only one diary entry point, in its own final card.
const environment=fs.readFileSync(new URL('../js/environment.js',import.meta.url),'utf8');
const overview=environment.slice(environment.indexOf('async function overview'),environment.indexOf('    const trees=',environment.indexOf('async function overview')));
const headings=[...overview.matchAll(/<span>([^<]+)<\/span><\/h3>/g)].map(m=>m[1]);assert.deepEqual(headings,['Allerte','Neve','Meteo','Qualità dell’aria','Alberi · entro 50 km','Incendi','Terremoti · entro 100 km','Diario ambientale']);
assert.equal((overview.match(/data-environment-open="diary"/g)||[]).length,1);
const treeCard=overview.slice(overview.indexOf("${icon('trees')}"),overview.indexOf("${icon('fires')}"));assert.doesNotMatch(treeCard,/Apri diario/);assert.match(treeCard,/Fonti comunali/);
console.log('snow: units, missing data, time windows, expired alerts and dashboard order ok');
