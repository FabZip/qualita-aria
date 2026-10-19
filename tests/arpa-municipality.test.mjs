import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const context=vm.createContext({});
for(const name of ['normalizeText','normalizeArpaKey','arpaRecordIdentity','arpaMunicipalityName','findArpaRecord']){
  const declaration=name==='normalizeText'
    ?source.match(/function normalizeText\(v\)\{[^\n]+/)[0]
    :source.match(new RegExp(`function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`))[0];
  vm.runInContext(declaration,context)
}
const identity=context.arpaRecordIdentity;
for(const code of ['058091',58091,'58091.0','5.8091E+4','12058091']){
  assert.equal(identity({'Codice ISTAT':code,Comune:'Roma'}).code,'058091')
}
assert.equal(identity({'ISTAT Regione':12,'Codice ISTAT Comune':58091,Comune:'Roma'}).code,'058091');
assert.equal(identity({'Codice comune':58091,'Nome Comune':'Roma'}).name,'Roma');
assert.equal(identity({Comune:'Roma'}).code,'');
const oldRome={Comune:'ROMA CAPITALE','PM10 media annua MED':23};
assert.equal(context.findArpaRecord([oldRome],'058091','Roma'),oldRome);
assert.equal(context.findArpaRecord([oldRome],'058047','Guidonia Montecelio'),undefined);
assert.equal(context.findArpaRecord([oldRome,{...oldRome}],'058091','Roma'),undefined);
assert.equal(context.findArpaRecord([{'Codice ISTAT':58047,Comune:'Roma'}],'058091','Roma'),undefined);
const modern={ISTAT:12058091,Comune:'Roma'};
assert.equal(context.findArpaRecord([modern],'058091','Roma'),modern);
console.log('arpa-municipality: ok');

vm.runInContext(source.slice(source.indexOf('function normalizeArpaKey('),source.indexOf('async function loadArpaStaticRecords(')),context);
const csv='Codice ISTAT;Comune;PM10 media annua MIN;PM10 media annua MED;PM10 media annua MAX\n58091;Roma;10;23;40\n58047;Guidonia Montecelio;9;21;35';
const parsed=context.parseCsvText(csv);
const rome=context.findArpaRecord(parsed.records,'058091','Roma');
assert.ok(rome);
assert.equal(rome['PM10 media annua MED'],'23');
assert.equal(context.csvDelimiter(csv),';');
assert.equal(context.csvDelimiter(csv.replaceAll(';','\t')),'\t');
const comma='Codice ISTAT,Comune,PM10 media annua MED\n58091,"Roma, Capitale",23';
assert.equal(context.parseCsvText(comma).records[0].Comune,'Roma, Capitale');

let selected='058091';
let finishDownload;
Object.assign(context,{
  state:{arpaCache:new Map()},
  diagnostics(){},source:()=> 'arpa',arpaMunicipality:()=>selected,
  $:()=>({selectedOptions:[{textContent:selected==='058091'?'Roma':'Guidonia Montecelio'}]}),
  loadArpaStaticRecords:()=>new Promise(resolve=>{finishDownload=resolve}),
  fetchArpaBoundary:async()=>null,boundsFromGeoJSON:()=>null,
  ROME:{center:[12.5,41.9]},POLLUTANTS:{PM10:{arpaPrefix:'PM10 media annua'}},
  parseNumber:value=>value===null||value===undefined?null:Number(value),
  populateArpaMunicipalities(){}
});
vm.runInContext(source.match(/async function fetchArpaRows\([^)]*\)\{[\s\S]*?\n\}/)[0],context);
const pending=context.fetchArpaRows('2019','PM10');
selected='058047';
finishDownload({records:parsed.records,url:'fixture.csv',format:'CSV'});
const annualRows=await pending;
assert.equal(annualRows[0].id,'ARPA-058091','Il caricamento conserva il Comune richiesto prima del download');
assert.equal(annualRows[0].value,23);
