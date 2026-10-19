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
const context=vm.createContext({
  console,Date,$:node,state:{mode:'map'},
  document:{createElement:()=>({})},
  source:()=> 'eea',isTemperature:()=>false,eeaScope:()=> 'italy',eeaCity:()=> 'roma',
  SOURCE_INFO:{eea:{years:['2025','2024'],description:'Statistiche annuali'}},
  POLLUTANTS:{PM10:{label:'PM10'}},sourceNotice(){return 'Annuale'},
  configureSourceUI(){node('monthField').classList.add('hidden')},
  fillYears(){
    const select=node('yearSelect');select.options=[{value:'2025'},{value:'2024'}];
    if(!['2025','2024'].includes(select.value))select.value='2025'
  },
  async render(){fetchedPeriods.push(node('yearSelect').value)}
});
vm.runInContext(fs.readFileSync(new URL('../js/eea-current.js',import.meta.url),'utf8'),context);
context.fillYears();context.configureSourceUI();
assert.deepEqual(node('yearSelect').options.map(item=>item.value),['today','2025','2024']);
assert.equal(node('yearSelect').value,'today');
assert.equal(node('yearFieldLabel').textContent,'Periodo');
assert.equal(node('singleYearField').classList.contains('hidden'),false);
assert.equal(node('monthField').classList.contains('hidden'),true);
await context.render();
assert.equal(node('periodValue').textContent,'Oggi');
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
console.log('eea-period: ok');
