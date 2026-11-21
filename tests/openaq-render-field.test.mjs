import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const nodes=new Map();
function node(id){
  if(!nodes.has(id)){
    const classes=new Set();
    nodes.set(id,{value:id==='pollutantSelect'?'PM2.5':'latest',classList:{
      add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),
      toggle(c,on){on?classes.add(c):classes.delete(c)}
    }});
  }
  return nodes.get(id);
}
let active='openaq',resolveRows,rejectRows;
const context=vm.createContext({console:{error(){}},state:{map:{},mode:'map',renderToken:0},
  $:node,source:()=>active,isTrees:()=>active==='trees',isTemperature:()=>active==='temperature',
  document:{documentElement:node('html')},window:{},
  setLoading(){},updateArpaHistoryVisibility(){},showAirOnSingle(){},fitCurrentScope(){},renderList(){},
  requestTemperatureOverlay(){},rememberViewportBaseline(){},diagnostics(){},showToast(){},
  sourceNotice:()=>'',currentEeaScope:()=>({label:'Roma'}),
  POLLUTANTS:{'PM2.5':{label:'PM2.5'}},
  SOURCE_INFO:{openaq:{name:'OpenAQ'},eea:{name:'EEA'},arpa:{name:'ARPA'}},
  rowsFor:()=>new Promise((resolve,reject)=>{resolveRows=resolve;rejectRows=reject}),
  renderTreesMode:async()=>{},renderTemperatureMode:async()=>{}
});
const source=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const start=source.indexOf('async function render(){'),end=source.indexOf('\nfunction updateSwipe(',start);
vm.runInContext(source.slice(start,end),context);
for(const fails of [false,true]){
  const pending=context.render();
  assert.equal(node('singleYearField').classList.contains('hidden'),true,'Hidden while the request is pending');
  if(fails)rejectRows(new Error('upstream unavailable'));else resolveRows([]);
  await pending;
  assert.equal(node('singleYearField').classList.contains('hidden'),true,'Hidden after completion or error');
}
for(const name of ['eea','arpa','temperature','trees']){
  active=name;context.state.mode='map';
  const pending=context.render();
  assert.equal(node('singleYearField').classList.contains('hidden'),false,`${name} retains the year field`);
  if(['eea','arpa'].includes(name))resolveRows([]);
  await pending;
}
