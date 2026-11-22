import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/weather.js',import.meta.url),'utf8');
const times=Array.from({length:48},(_,i)=>`2026-11-${22+Math.floor(i/24)}T${String(i%24).padStart(2,'0')}:00`);
const payload={timezone:'Europe/Rome',current:{time:'2026-11-22T10:15',temperature_2m:0,weather_code:0,is_day:0,relative_humidity_2m:null},hourly:{time:times,temperature_2m:times.map(()=>0),precipitation_probability:times.map(()=>null)},daily:{time:['2026-11-22','2026-11-23'],temperature_2m_min:[0,null],temperature_2m_max:[10,12],weather_code:[61,3]}};
const city={name:'Roma <script>',lat:41.9,lon:12.5};
let calls=0,clock=Date.now(),failure=null;
class TestDate extends Date{static now(){return clock}}
const storage=new Map();
const context=vm.createContext({URL,URLSearchParams,Date:TestDate,Intl,AbortController,setTimeout,clearTimeout,localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},fetch:async()=>{calls++;if(failure)throw failure;return Response.json(payload)}});
vm.runInContext(source,context);const api=context.WeatherForecast;
const url=new URL(api.buildUrl(city));assert.equal(url.origin,'https://api.open-meteo.com');assert.equal(url.searchParams.get('forecast_days'),'7');assert.equal(url.searchParams.get('timezone'),'auto');assert.ok(!url.searchParams.has('apikey'));
for(const coords of [{lat:null,lon:0},{lat:91,lon:0},{lat:0,lon:181}])assert.throws(()=>api.buildUrl(coords),/Coordinate/);
await Promise.all([api.fetchWeather(city),api.fetchWeather(city)]);assert.equal(calls,1,'Concurrent requests share one call');
await api.fetchWeather(city);assert.equal(calls,1,'Fresh response is reused');
clock+=16*60*1000;await api.fetchWeather(city);assert.equal(calls,2,'Expired data is refreshed');
await api.fetchWeather({...city,lat:45.4});assert.equal(calls,3,'Different cities have separate cache entries');
const rows=api.hourlyRows(payload);assert.equal(rows.length,24);assert.equal(rows[0].time,'2026-11-22T10:00');assert.equal(rows.at(-1).time,'2026-11-23T09:00');
const html=api.renderContent(payload,city,clock);assert.match(html,/Roma &lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/0 °C/);assert.match(html,/Umidità<strong>—/);assert.match(html,/CC BY 4.0/);assert.match(html,/Europe\/Rome/);assert.match(html,/0° \/ 10°/);
assert.equal(api.condition(0,0)[0],'🌙');assert.equal(api.condition(95)[1],'Temporali');assert.equal(api.condition(null)[1],'Condizioni non disponibili');assert.equal(api.condition(-1)[1],'Condizioni non disponibili');
assert.throws(()=>api.validate({daily:{time:[]}}),/non valida/);
// Browser persistence works across a new module lifetime, and unavailable storage is harmless.
vm.runInContext(source,context);await context.WeatherForecast.fetchWeather(city);assert.equal(calls,3);
clock+=16*60*1000;failure=Error('offline');await assert.rejects(()=>context.WeatherForecast.fetchWeather(city),/offline/);failure=null;await context.WeatherForecast.fetchWeather(city);assert.equal(calls,5,'Failure does not poison later requests');
context.localStorage={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};vm.runInContext(source,context);await context.WeatherForecast.fetchWeather(city);assert.equal(calls,6);
assert.match(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),/option value="weather" selected/);

assert.match(fs.readFileSync(new URL('../service-worker.js',import.meta.url),'utf8'),/url.hostname==='api.open-meteo.com'/);
// UI failures and old geolocation callbacks cannot overwrite a newly selected city.
let selected='geolocate',denyGeo,uiCalls=0;
const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',classList:{add(){},remove(){},toggle(){}},setAttribute(){},addEventListener(){}});return nodes.get(id)};
const ui=vm.createContext({URL,URLSearchParams,Date,Intl,AbortController,setTimeout,clearTimeout,console,
 document:{documentElement:node('html'),querySelector:node},$:node,source:()=> 'weather',isTemperature:()=>false,
 SOURCE_INFO:{},configureSourceUI(){},render(){},setTemperatureModeLock(){},configureTreeCityOptions(){},clearTemperatureOverlays(){},
 state:{renderToken:0,eeaCities:new Map([['roma',{name:'Roma',lat:41.9,lon:12.5}]])},EEA_DEFAULT_CITY:'roma',eeaCity:()=>selected,
 navigator:{geolocation:{getCurrentPosition(resolve,reject){denyGeo=reject}}},window:{},localStorage:{getItem(){return null},setItem(){}},
 fetch:async()=>{uiCalls++;return Response.json(payload)}
});
vm.runInContext(source,ui);
const pendingGeo=ui.render();selected='roma';await ui.render();denyGeo();await pendingGeo;
assert.match(node('weatherContent').innerHTML,/Previsioni meteo · Roma/);assert.doesNotMatch(node('weatherContent').innerHTML,/Posizione non disponibile/);assert.equal(uiCalls,1);
selected='geolocate';const denied=ui.render();denyGeo();await denied;assert.match(node('weatherContent').innerHTML,/Posizione non disponibile/);assert.match(node('weatherContent').innerHTML,/data-weather-retry/);
// Geolocation labels identify the actual requested point and the returned model grid independently.
const detected={name:'La tua posizione',lat:41.9,lon:12.5,geolocated:true,accuracy:24,locatedAt:Date.now()};
const locality={lookupSource:'coordinates',latitude:41.9,longitude:12.5,locality:'Quartiere <Test>',city:'Roma',principalSubdivision:'Lazio',countryName:'Italia'};
assert.equal(api.localityName(locality,detected),'Quartiere <Test> · Roma · Lazio · Italia');
assert.equal(api.localityName({...locality,lookupSource:'ipGeolocation'},detected),null);
assert.equal(api.localityName({...locality,latitude:45},detected),null);
assert.equal(api.localityName({...locality,city:'',locality:''},detected),null);
assert.equal(api.coordinateLabel(null,0),'Coordinate non disponibili');
assert.equal(api.coordinateLabel(0,0),'0.00000° N · 0.00000° E');
assert.equal(api.coordinateLabel(-12.3,-45.6),'12.30000° S · 45.60000° O');
assert.ok(api.distanceKm({lat:0,lon:0},{lat:0,lon:1})>110);
const locatedPayload={...payload,latitude:41.91,longitude:12.52,elevation:58};
const detail=api.renderContent(locatedPayload,{...detected,name:api.localityName(locality,detected),locationResolved:true},clock);
assert.match(detail,/Quartiere &lt;Test&gt; · Roma · Lazio · Italia/);assert.match(detail,/41\.90000° N/);assert.match(detail,/41\.91000° N/);assert.match(detail,/circa 24 m/);assert.match(detail,/Non sono letture di una stazione meteo/);assert.match(detail,/Best Match/);assert.match(detail,/58 m/);assert.match(detail,/Verifica sulla mappa/);assert.match(detail,/BigDataCloud/);
const unknown=api.locationDetails({},detected);assert.match(unknown,/Nome della località non disponibile/);assert.match(unknown,/Coordinate non disponibili/);assert.doesNotMatch(unknown,/null m|NaN|undefined/);
let reverseCalls=0,releaseReverse;
context.fetch=async url=>{reverseCalls++;assert.equal(new URL(url).hostname,'api.bigdatacloud.net');assert.equal(new URL(url).searchParams.get('latitude'),'41.9');await new Promise(resolve=>releaseReverse=resolve);return Response.json(locality)};
const lookupA=api.resolveLocation(detected),lookupB=api.resolveLocation(detected);releaseReverse();
const locations=await Promise.all([lookupA,lookupB]);assert.equal(reverseCalls,1);assert.equal(locations[0].name,locations[1].name);assert.equal(locations[0].accuracy,24);
await api.resolveLocation(detected);assert.equal(reverseCalls,1,'Resolved location is cached');
await api.resolveLocation(city);assert.equal(reverseCalls,1,'Catalog cities never use the client-only reverse endpoint');
context.fetch=async()=>{throw Error('offline')};const failedPlace=await api.resolveLocation({...detected,lat:42});assert.equal(failedPlace.locationResolved,false);assert.equal(failedPlace.lat,42);
// Failed place lookup still renders the weather for the device coordinates, not a default city.
let successGeo;
ui.navigator.geolocation.getCurrentPosition=resolve=>successGeo=resolve;
ui.fetch=async url=>{if(String(url).includes('bigdatacloud'))throw Error('lookup unavailable');return Response.json(locatedPayload)};
const geoView=ui.render();successGeo({coords:{latitude:42,longitude:13,accuracy:38},timestamp:Date.now()});await geoView;
assert.match(node('weatherContent').innerHTML,/42\.00000° N · 13\.00000° E/);assert.match(node('weatherContent').innerHTML,/Nome della località non disponibile/);assert.match(node('weatherContent').innerHTML,/0 °C/);
ui.fetch=async url=>String(url).includes('bigdatacloud')?Response.json({...locality,latitude:42,longitude:13,locality:'Località rilevata',city:'Comune rilevato'}):Response.json(locatedPayload);
const namedGeo=ui.render();successGeo({coords:{latitude:42,longitude:13,accuracy:38},timestamp:Date.now()});await namedGeo;
assert.match(node('weatherContent').innerHTML,/Previsioni meteo · Località rilevata · Comune rilevato/);assert.match(node('weatherContent').innerHTML,/circa 38 m/);
