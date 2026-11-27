import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const now=Date.parse('2026-11-26T10:00:00Z');class FixedDate extends Date{static now(){return now}}
const c=vm.createContext({URL,URLSearchParams,Date:FixedDate,Intl,WeatherForecast:{condition:code=>['☀',code===0?'Sereno':'Condizioni non disponibili']},AirQualityForecast:{aggregateForecast:(p,key)=>({label:key,unit:'µg/m³',days:[{date:'2026-11-27',mean:0,max:1}]})}});
for(const file of ['environment.js','diary.js'])vm.runInContext(fs.readFileSync(new URL(`../js/${file}`,import.meta.url),'utf8'),c);
const api=c.EnvironmentDiary,env=c.Environment,city={name:'Roma <test>',lat:42,lon:12};
const payload={daily_units:{snowfall_sum:'cm'},daily:{time:['2026-11-26','invalid'],weather_code:[0],temperature_2m_min:[0],temperature_2m_max:[12],snowfall_sum:[0]}};
const weather=api.weatherEvents(payload,city);assert.equal(weather.length,2);assert.equal(weather[0].status,'Previsione modellistica');assert.equal(weather[1].category,'snow');assert.match(weather[1].title,/Nessuna neve prevista/);assert.equal(weather[1].distance,0);assert.match(env.eventHtml(weather[0]),/Roma &lt;test&gt;/);
assert.equal(api.weatherEvents({...payload,daily_units:{snowfall_sum:'m'}},city).length,1,'Unknown snow units must not become centimetres');
assert.throws(()=>api.weatherEvents({},city));
const air=api.airEvents({},city);assert.equal(air.length,6);assert.equal(new Set(air.map(e=>e.id)).size,6);assert.match(air[0].detail,/Non è una misura di stazione/);assert.match(air[0].detail,/Media prevista 0/);
const airCard=env.eventHtml(air[0],{diary:true});assert.match(airCard,/data-environment-open="forecast"/);assert.match(airCard,/Consulta Qualità dell’aria/);assert.match(airCard,/diary-event-source/);assert.match(airCard,/environment-icon-air/);assert.doesNotMatch(env.eventHtml(air[0]),/diary-event-actions/);
for(const category of Object.keys(api.labels)){const html=env.eventHtml({...air[0],category},{diary:true});assert.match(html,new RegExp(`data-environment-open="${category==='air'?'forecast':category}"`));}

const aggregate=c.AirQualityForecast.aggregateForecast;c.AirQualityForecast.aggregateForecast=(p,key)=>{if(key==='CO')throw Error('Missing CO');return aggregate(p,key)};const partialAir=api.airEvents({},city);assert.equal(partialAir.length,5);assert.equal(partialAir.missing.join(','),'CO');c.AirQualityForecast.aggregateForecast=aggregate;
const alert={stale:false,url:'https://example.com',current:[{date:'2026-11-25',zones:[{risks:[{type:'temporali',text:'ALLERTA ROSSA'}]}]},{date:'2026-11-26',zones:[{name:'Zona A',risks:[{type:'temporali',text:'NESSUNA ALLERTA'}]}]}]};
assert.equal(api.alertEvents(alert,city).length,1);assert.match(api.alertEvents(alert,city)[0].locationNote,/Zona di allerta/);assert.equal(api.alertEvents({...alert,stale:true},city).length,0);
const warning={area:'Lazio',level:'Gialla',onset:'2026-11-26T09:00:00Z',expires:'2026-11-26T12:00:00Z'};
const feed={updated:'2026-11-26T09:30:00Z',warnings:[warning,warning,{...warning,expires:'2026-11-25T10:00:00Z'}]};
const warnings=api.snowWarningEvents(feed);assert.equal(warnings.length,1);assert.equal(warnings[0].distance,null);assert.equal(env.point(warnings[0]),false);assert.equal(env.filterEvents(warnings,{radius:10,now}).length,1,'Regional warnings remain explicitly outside the distance filter');assert.equal(api.snowWarningEvents({...feed,stale:true}).length,0);assert.equal(api.snowWarningEvents({...feed,updated:'2026-11-25T09:00:00Z'}).length,0);
const url=new URL(api.fireUrl(city));assert.equal(url.searchParams.get('maxFeatures'),'500');assert.equal(url.searchParams.get('version'),'1.0.0');assert.ok(url.searchParams.get('bbox').split(',').map(Number).every(Number.isFinite));
const polygon={type:'Polygon',coordinates:[[[12,42],[12.01,42],[12.01,42.01],[12,42.01],[12,42]]]};
const fires=api.fireEvents({features:[{properties:{id:1,FIREDATE:'2026-11-25',AREA_HA:0},geometry:polygon},{properties:{},geometry:null}]},city);assert.equal(fires.length,1);assert.ok(fires[0].distance<2);assert.equal(env.filterEvents(fires,{category:'fires',radius:10,now}).length,1);
const nav=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../js/navigation.js',import.meta.url),'utf8'),nav);assert.deepEqual(Object.keys(nav.AppNavigation.pages),['nearby','alerts','snow','weather','forecast','eea','openaq','trees','fires','earthquakes','diary']);
console.log('diary: all categories, units, dates, regional scope, source types and menu order ok');
