import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../js/environment.js',import.meta.url),'utf8');
const c=vm.createContext({URL,URLSearchParams,Date,Intl,setTimeout,clearTimeout,AbortController});vm.runInContext(src,c);const api=c.Environment,city={lat:42,lon:12};
assert.equal(api.point({lat:null,lon:12}),false);assert.equal(api.point({lat:0,lon:0}),true);assert.ok(api.distance(city,{lat:43,lon:12})>110);
const url=new URL(api.quakeUrl(city,7,100,Date.parse('2026-11-22T10:00:00Z')));assert.equal(url.origin,'https://webservices.ingv.it');assert.equal(url.searchParams.get('maxradiuskm'),'100');assert.equal(url.searchParams.get('starttime'),'2026-11-15T10:00:00');assert.throws(()=>api.quakeUrl({lat:999,lon:0}));
const quake={properties:{eventId:12,time:'2026-11-21T10:00:00.000000',mag:0,magType:'ML',place:'Evento <test>'},geometry:{type:'Point',coordinates:[12,42,0]}};
const rows=api.earthquakes({features:[quake,{...quake,geometry:{coordinates:[null,42,0]}}]},city);assert.equal(rows.length,1);assert.equal(rows[0].date,'2026-11-21T10:00:00.000000Z');assert.match(rows[0].detail,/profondità 0 km/);assert.equal(rows[0].distance,0);assert.throws(()=>api.earthquakes({},city));
const polygon={type:'Polygon',coordinates:[[[10,40],[14,40],[14,44],[10,44],[10,40]],[[11,41],[11.5,41],[11.5,41.5],[11,41.5],[11,41]]]};
assert.equal(api.contains(polygon,city),true);assert.equal(api.contains(polygon,{lat:41.2,lon:11.2}),false);assert.equal(api.contains(polygon,{lat:50,lon:12}),false);assert.equal(api.contains({type:'MultiPolygon',coordinates:[polygon.coordinates]},city),true);
const geo={features:[{geometry:polygon,properties:{'Nome zona':'Zona test','Per rischio idraulico':'ALLERTA GIALLA'}}]};const zones=api.alertZones(geo,city);assert.equal(zones.length,1);assert.equal(zones[0].risks[0].text,'ALLERTA GIALLA');assert.equal(api.alertZones(geo,{lat:0,lon:0}).length,0);
const tree=api.treeEvents([{id:'x',title:'Via <test>',date:'2026-11-20',eventEndDate:'2027-01-01',eventType:'planting',status:'planned',quantity:null,coordinates:[12,42],source:{publisher:'Comune',url:'https://example.com'}},{id:'no-position',date:'2026-11-21'}],city);assert.equal(tree[0].status,'Programmato');assert.match(tree[0].detail,/quantità non indicata/);assert.equal(tree[1].distance,null);
const now=Date.parse('2026-11-22T12:00:00Z'),all=[...rows,...tree];assert.equal(api.filterEvents(all,{days:1,radius:50,now}).length,1,'Future/planned intervals remain visible, unknown positions excluded');assert.equal(api.filterEvents(all,{query:'piantumazione',now}).length,1);assert.equal(api.filterEvents(all,{category:'earthquakes',now}).length,1);assert.equal(api.filterEvents(all,{query:'absent',now}).length,0);assert.equal(api.filterEvents([{...tree[0],distance:300}],{radius:50,now}).length,0);
assert.equal(api.link('javascript:alert(1)','bad'),'');assert.match(api.esc('<script>'),/&lt;script&gt;/);
// Official publication date controls validity; a stale bulletin never becomes today's alert.
let calls=0;c.fetch=async u=>{calls++;const s=String(u);if(s.includes('/commits?'))return Response.json([{sha:'abc'}]);if(s.endsWith('/commits/abc'))return Response.json({files:[{filename:'files/preview/20200101_1200_domani.png'}]});if(s.endsWith('/20200101_1200.json'))return Response.json({name:'Old official bulletin'});return Response.json(geo)};
const stale=await api.alerts(city);assert.equal(stale.stale,true);assert.equal(stale.current.length,0);assert.equal(stale.periods[1].date,'2020-01-02');const oldCalls=calls;await api.alerts(city);assert.equal(calls,oldCalls,'Repeated reads use bounded cache');
console.log('environment: parsing, geographic filters, stale alerts and cache ok');

assert.match(api.fireTile('week'),/layers=modis\.ba\.week/);assert.match(api.fireTile('today'),/bbox=\{bbox-epsg-3857\}/);assert.throws(()=>api.fireTile('invalid'));
// The day after publication uses the tomorrow geometry, never the expired today geometry.
class FixedDate extends Date{static now(){return Date.parse('2026-11-22T10:00:00Z')}}
const currentContext=vm.createContext({URL,URLSearchParams,Date:FixedDate,Intl,setTimeout,clearTimeout,AbortController});
currentContext.fetch=async u=>{const s=String(u);if(s.includes('/commits?'))return Response.json([{sha:'current'}]);if(s.endsWith('/commits/current'))return Response.json({files:[{filename:'files/20261121_1449.json'}]});if(s.endsWith('/20261121_1449.json'))return Response.json({name:'Bollettino valido'});return Response.json(geo)};
vm.runInContext(src,currentContext);const valid=await currentContext.Environment.alerts(city);assert.equal(valid.stale,false);assert.equal(valid.current.length,1);assert.equal(valid.current[0].date,'2026-11-22');assert.equal(valid.current[0].zones[0].name,'Zona test');
// An unavailable publication is an error, not a fabricated no-alert result.
const unavailable=vm.createContext({URL,URLSearchParams,Date,Intl,setTimeout,clearTimeout,AbortController,fetch:async()=>new Response('',{status:503})});vm.runInContext(src,unavailable);await assert.rejects(()=>unavailable.Environment.alerts(city),/HTTP 503/);
