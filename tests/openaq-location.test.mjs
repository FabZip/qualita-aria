import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const nodes=new Map();
function node(id){
  if(!nodes.has(id)){
    const classes=new Set();
    nodes.set(id,{
      value:id==='pollutantSelect'?'PM2.5':'30',dataset:{},childNodes:[],
      classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
      querySelector:()=>null,addEventListener(){},replaceChildren(...items){this.options=items}
    })
  }
  return nodes.get(id)
}
let zoom=8;
let center={lng:0,lat:0};
let active='openaq';
const queriedZooms=[];
const map={
  getZoom:()=>zoom,getCenter:()=>center,getBearing:()=>0,getPitch:()=>0,
  setMinZoom(){},setRenderWorldCopies(){},
  jumpTo(options){zoom=options.zoom??zoom;if(options.center)center={lng:options.center[0],lat:options.center[1]}},
  getBounds(){const radius=12/2**(zoom-5);return{
    getWest:()=>center.lng-radius,getEast:()=>center.lng+radius,
    getSouth:()=>center.lat-radius,getNorth:()=>center.lat+radius
  }}
};
const context=vm.createContext({
  Date,console,setTimeout,clearTimeout,
  document:{querySelectorAll:()=>[],createElement:()=>({})},
  navigator:{geolocation:{getCurrentPosition:success=>success({coords:{longitude:12.5,latitude:41.9}})}},
  state:{map,mode:'map'},SOURCE_INFO:{},$:node,
  source:()=>active,isTemperature:()=>false,
  fillYears(){},configureSourceUI(){},rowsFor(){},fitCurrentScope(){},setLoading(){},sourceNotice(){},render(){},initMaps(){},
  withMapRefreshSuppressed:callback=>callback(),showToast(){},diagnostics(){},parseNumber:Number,
  QualitaAriaOpenAQProxy:{async viewportLatest(params){
    queriedZooms.push(zoom);
    assert.ok(params.datetimeMin);
    return{data:{meta:{pollutant:{units:'µg/m³'}},results:zoom<=9?[{locationId:1,latitude:41.8,longitude:12.4,value:12}]:[]}}
  }}
});
vm.runInContext(fs.readFileSync(new URL('../js/openaq-world.js',import.meta.url),'utf8'),context);
context.configureSourceUI();
assert.equal(node('monthSelect').value,'today');
assert.equal(node('eeaCityField').classList.contains('hidden'),true);
assert.equal(node('pollutantField').classList.contains('hidden'),false);
assert.deepEqual(node('pollutantSelect').options.map(item=>item.value),['PM2.5','PM10','NO2','O3','SO2','CO']);
const rows=await context.rowsFor('latest');
assert.equal(rows.length,1);
assert.deepEqual(queriedZooms,[11,10,9]);
assert.equal(zoom,9);
assert.equal(center.lng,12.5);
active='eea';context.configureSourceUI();
active='openaq';context.configureSourceUI();
assert.equal(node('monthSelect').value,'today');
console.log('openaq-location: ok');
