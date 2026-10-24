import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const nodes=new Map();
function node(id){
  if(!nodes.has(id))nodes.set(id,{value:'',options:[],classList:{toggle(){}}});
  return nodes.get(id)
}
function options(id,values){
  const select=node(id),old=select.value;
  select.options=values.map(value=>({value}));
  select.value=values.includes(old)?old:values[0]||''
}
options('eeaScopeSelect',['italy','europe']);
options('arpaCitySelect',['058091','058047']);
const modes=['map','compare','difference'].map(mode=>({dataset:{mode},classList:{toggle(){}}}));
const context=vm.createContext({console,
  state:{mode:'map',activeSource:'eea',sourceSettings:new Map()},$:node,
  document:{querySelectorAll:()=>modes},source:()=>node('sourceSelect').value,
  isTrees:()=>node('sourceSelect').value==='trees',
  resetEeaViewport(){},clearTemperatureOverlays(){},focusSelectedEeaScope(){},render(){},
  currentTreePeriods:()=>[{value:'2026'},{value:'2025'}],
  configureSourceUI(){
    const active=node('sourceSelect').value;
    if(['openaq','forecast'].includes(active))context.state.mode='map';
    options('eeaCitySelect',active==='trees'?['roma','guidonia-montecelio']:active==='eea'?['geolocate','roma','milano']:['roma','milano']);
    options('pollutantSelect',active==='openaq'||active==='forecast'?['PM2.5','PM10','NO2','O3','SO2','CO']:['PM2.5','PM10','NO2']);
    options('monthSelect',active==='openaq'?['today','7','15','30']:['0']);
    if(active==='openaq')node('monthSelect').value='today';
  },
  fillYears(){
    const active=node('sourceSelect').value;
    const years=active==='openaq'?['latest']:active==='forecast'?['forecast']:active==='trees'&&node('eeaCitySelect').value==='guidonia-montecelio'?['2026','2025','2024']:['2025','2024','2020','2019','2018'];
    for(const id of ['yearSelect','compareYearA','compareYearB'])options(id,id==='yearSelect'&&active==='eea'&&node('eeaScopeSelect').value==='italy'&&context.state.mode==='map'?['today',...years]:years)
  }
});
for(const name of ['sourceSettingFields','rememberSourceSettings','restoreSourceSelect','changeSource']){
  const start=source.indexOf(`function ${name}(`),end=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0,name);vm.runInContext(source.slice(start,end),context)
}
const set=(id,value)=>{node(id).value=value};
const switchTo=name=>{set('sourceSelect',name);context.changeSource()};
set('sourceSelect','eea');context.configureSourceUI();context.fillYears();
set('eeaCitySelect','geolocate');set('yearSelect','today');set('pollutantSelect','PM10');
switchTo('forecast');set('eeaCitySelect','milano');set('pollutantSelect','CO');
switchTo('openaq');set('monthSelect','15');set('pollutantSelect','SO2');
switchTo('trees');set('eeaCitySelect','guidonia-montecelio');context.fillYears();set('yearSelect','2025');set('compareYearA','2024');set('compareYearB','2026');
switchTo('arpa');set('arpaCitySelect','058047');set('yearSelect','2019');set('pollutantSelect','NO2');context.state.mode='compare';set('compareYearA','2018');set('compareYearB','2020');

for(let iteration=0;iteration<2;iteration++){
  switchTo('eea');
  assert.equal(node('eeaCitySelect').value,'geolocate');assert.equal(node('yearSelect').value,'today');assert.equal(node('pollutantSelect').value,'PM10');assert.equal(context.state.mode,'map');
  switchTo('forecast');
  assert.equal(node('eeaCitySelect').value,'milano');assert.equal(node('pollutantSelect').value,'CO');assert.equal(context.state.mode,'map');
  switchTo('openaq');
  assert.equal(node('monthSelect').value,'15');assert.equal(node('pollutantSelect').value,'SO2');assert.equal(context.state.mode,'map');
  switchTo('trees');
  assert.equal(node('eeaCitySelect').value,'guidonia-montecelio');assert.equal(node('yearSelect').value,'2025');assert.equal(node('compareYearA').value,'2024');assert.equal(node('compareYearB').value,'2026');
  switchTo('arpa');
  assert.equal(node('arpaCitySelect').value,'058047');assert.equal(node('yearSelect').value,'2019');assert.equal(node('pollutantSelect').value,'NO2');assert.equal(node('compareYearA').value,'2018');assert.equal(context.state.mode,'compare');
}
// I valori salvati ma non più disponibili non devono lasciare select vuote.
context.state.sourceSettings.get('eea').values.pollutantSelect='CO';
context.state.sourceSettings.get('eea').values.yearSelect='1900';
switchTo('eea');
assert.ok(node('pollutantSelect').options.some(option=>option.value===node('pollutantSelect').value));
assert.ok(node('yearSelect').options.some(option=>option.value===node('yearSelect').value));
// Anche il passaggio all'area Europa e la modalità di confronto restano indipendenti.
set('eeaScopeSelect','europe');context.state.mode='difference';context.fillYears();set('yearSelect','2020');set('eeaCitySelect','milano');
switchTo('forecast');switchTo('eea');
assert.equal(node('eeaScopeSelect').value,'europe');assert.equal(context.state.mode,'difference');assert.equal(node('yearSelect').value,'2020');
console.log('source-settings: ok');
