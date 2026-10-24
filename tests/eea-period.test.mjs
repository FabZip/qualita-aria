import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const nodes=new Map();
function node(id){
  if(!nodes.has(id)){
    const classes=new Set();
    nodes.set(id,{
      value:id==='yearSelect'?'2025':id==='pollutantSelect'?'PM10':'',
      options:id==='yearSelect'?[{value:'2025'},{value:'2024'}]:[],
      classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)},
      querySelector(){return this.options.find(option=>option.value==='today')||null},
      prepend(option){option.remove=()=>{this.options=this.options.filter(item=>item!==option)};this.options.unshift(option)}
    })
  }
  return nodes.get(id)
}
const fetchedPeriods=[];
let measurements=[{latestAt:'2026-10-17T12:00:00Z'},{latestAt:'2026-10-18T12:00:00Z'}];
const context=vm.createContext({
  console,Date,$:node,state:{mode:'map'},
  document:{createElement:()=>({})},
  source:()=> 'eea',isTemperature:()=>false,eeaScope:()=> 'italy',eeaCity:()=> 'roma',
  SOURCE_INFO:{eea:{years:['2025','2024'],description:'Statistiche annuali'}},
  POLLUTANTS:{PM10:{label:'PM10'},'PM2.5':{label:'PM2.5'},NO2:{label:'NO₂'}},sourceNotice(){return 'Annuale'},
  configureSourceUI(){node('monthField').classList.add('hidden')},
  fillYears(){
    const select=node('yearSelect');select.options=[{value:'2025'},{value:'2024'}];
    if(!['2025','2024'].includes(select.value))select.value='2025'
  },
  async render(){
    fetchedPeriods.push(node('yearSelect').value);
    context.sourceNotice(measurements)
  }
});
vm.runInContext(fs.readFileSync(new URL('../js/eea-current.js',import.meta.url),'utf8'),context);
context.fillYears();context.configureSourceUI();
assert.deepEqual(node('yearSelect').options.map(item=>item.value),['today','2025','2024']);
assert.equal(node('yearSelect').value,'today');
assert.equal(node('yearFieldLabel').textContent,'Periodo');
assert.equal(node('singleYearField').classList.contains('hidden'),false);
assert.equal(node('monthField').classList.contains('hidden'),true);
await context.render();
assert.equal(node('periodValue').textContent,'18/10/2026');
assert.equal(node('mapBadge').textContent,'PM10 - ultima misura');
node('yearSelect').value='2024';
context.fillYears();await context.render();
assert.equal(node('yearSelect').value,'2024');
assert.equal(node('singleYearField').classList.contains('hidden'),false);
assert.equal(node('monthField').classList.contains('hidden'),true);
assert.deepEqual(fetchedPeriods,['today','2024']);
node('yearSelect').value='today';context.fillYears();
assert.equal(node('yearSelect').value,'today');
context.state.mode='compare';context.fillYears();context.configureSourceUI();
assert.deepEqual(node('yearSelect').options.map(item=>item.value),['2025','2024']);
context.state.mode='map';context.fillYears();node('yearSelect').value='today';
for(const [value,label] of [['PM10','PM10'],['PM2.5','PM2.5'],['NO2','NO₂']]){
  node('pollutantSelect').value=value;
  await context.render();
  assert.equal(node('mapBadge').textContent,`${label} - ultima misura`);
  assert.equal(node('periodValue').textContent,'18/10/2026')
}
measurements=[];await context.render();
assert.equal(node('periodValue').textContent,'—');
assert.equal(node('periodValue').title,'Nessuna misura disponibile');
measurements=[{latestAt:'2026-10-18T00:00:00Z',aggregation:'day'}];
await context.render();
assert.equal(node('periodValue').textContent,'18/10/2026');
assert.match(node('periodValue').title,/Media giornaliera/);
console.log('eea-period: ok');
