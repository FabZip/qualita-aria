import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../js/weather-radar.js',import.meta.url),'utf8');
let calls=0;
const payload={host:'https://tilecache.rainviewer.com',generated:1795338923,radar:{past:[{time:100,path:'/v2/radar/a1'},{time:200,path:'/v2/radar/b2'},{time:100,path:'/v2/radar/a1'},{time:300,path:'//evil.test/x'}],nowcast:[{time:400,path:'/v2/radar/future'}]}};
const c=vm.createContext({URL,Date,AbortController,DOMException,setTimeout,clearTimeout,fetch:async()=>{calls++;return Response.json(payload)}});
vm.runInContext(src,c);const api=c.WeatherRadar;
const data=api.parseManifest(payload);assert.equal(data.frames.length,2);assert.equal(data.frames[0].time,100);assert.equal(data.frames[1].time,200,'Only valid past frames, sorted and deduplicated');
assert.throws(()=>api.parseManifest({...payload,host:'http://tilecache.rainviewer.com'}),/Origine/);assert.throws(()=>api.parseManifest({...payload,host:'https://tilecache.rainviewer.com.evil.test'}),/Origine/);assert.throws(()=>api.parseManifest({...payload,radar:{past:[]}}),/Nessuna/);
assert.equal(api.tiles(data,1),'https://tilecache.rainviewer.com/v2/radar/b2/512/{z}/{x}/{y}/2/1_1.png');assert.match(api.tiles(data,0,true),/coverage\/0\/512\/\{z\}/);
await Promise.all([api.manifest(),api.manifest()]);assert.equal(calls,1);await api.manifest();assert.equal(calls,1);
let clock=0,network=0;const loader=api.tileLoader({now:()=>clock,wait:async ms=>clock+=ms,fetcher:async()=>{network++;return new Response(new Uint8Array([1,2,3]))}});
const tile=i=>`https://tilecache.rainviewer.com/v2/radar/a${i}/512/7/68/47/2/1_1.png`;
await loader(tile(0));await loader(tile(0));assert.equal(network,1,'Repeated tiles reuse memory');
for(let i=1;i<80;i++)await loader(tile(i));assert.equal(network,80);assert.ok(clock>=79*800,'At least 800ms between fresh requests');
const controller=new AbortController();controller.abort();await assert.rejects(()=>loader(tile(99),controller.signal),/Annullato/);assert.equal(network,80);
await assert.rejects(()=>loader('https://evil.test/x'),/URL radar/);
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.match(html,/id="weatherRadarMap"/);assert.match(html,/id="weatherSearch"/);assert.match(html,/id="radarTimeline"/);
// Radar lifecycle: last frame, keyboard scrubbing, opacity, and leaving the source.
const handlers=new Map(),elements=new Map();
const element=id=>{if(!elements.has(id))elements.set(id,{value:'0',textContent:'',disabled:true,attributes:{},classList:{remove(){}},setAttribute(name,value){this.attributes[name]=value},addEventListener(type,fn){handlers.set(`${id}:${type}`,fn)}});return elements.get(id)};
let mapInstance;
class FakeMap{
 constructor(){this.sources=new Map();this.layers=new Map();mapInstance=this}
 addControl(){} resize(){} jumpTo(){} flyTo(){}
 on(type,callback){if(type==='load')queueMicrotask(callback)}
 getSource(id){return this.sources.get(id)}getLayer(id){return this.layers.get(id)}
 addSource(id,source){this.sources.set(id,{...source,setTiles(tiles){this.tiles=tiles}})}
 addLayer(layer){this.layers.set(layer.id,layer)}
 setPaintProperty(id,name,value){this.layers.get(id).paint[name]=value}
 setLayoutProperty(id,name,value){this.layers.get(id)[name]=value}
 isSourceLoaded(){return true}
}
class FakeMarker{setLngLat(){return this}addTo(){return this}getElement(){return element('marker')}}
const ui=vm.createContext({URL,Date,Intl,AbortController,DOMException,setTimeout,clearTimeout,queueMicrotask,
 document:{hidden:false,getElementById:element,addEventListener(type,fn){handlers.set(`document:${type}`,fn)}},source:()=> 'weather',MAP_STYLE:'style',
 maplibregl:{Map:FakeMap,Marker:FakeMarker,NavigationControl:class{},FullscreenControl:class{},ScaleControl:class{},addProtocol(){}},
 fetch:async()=>Response.json(payload)
});
vm.runInContext(src,ui);await ui.WeatherRadar.show({name:'Guidonia',lat:42,lon:12.7,timezone:'Europe/Rome'});
assert.equal(element('radarTimeline').max,'1');assert.equal(element('radarTimeline').value,'1');assert.equal(element('radarPlay').disabled,false);
handlers.get('radarTimeline:input')({target:{value:'0'}});assert.equal(element('radarTimeline').value,'0');assert.match(mapInstance.getSource('weather-radar').tiles[0],/aria-radar:\/\/.*a1/);
handlers.get('radarOpacity:input')({target:{value:'40'}});assert.equal(mapInstance.getLayer('weather-radar').paint['raster-opacity'],.4);
handlers.get('radarCoverage:change')({target:{checked:true}});assert.equal(mapInstance.getLayer('weather-coverage').visibility,'visible');
handlers.get('radarPlay:click')();assert.equal(element('radarPlay').attributes['aria-pressed'],'true');ui.WeatherRadar.suspend();assert.equal(element('radarPlay').attributes['aria-pressed'],'false');

ui.document.hidden=true;handlers.get('document:visibilitychange')();assert.equal(element('radarPlay').attributes['aria-pressed'],'false');ui.document.hidden=false;await handlers.get('document:visibilitychange')();assert.equal(element('radarTimeline').value,'1','Returning to the page restores the latest available frame');
