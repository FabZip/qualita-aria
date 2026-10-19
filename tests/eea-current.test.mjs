import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context=vm.createContext({
  Date,console,state:{},SOURCE_INFO:{eea:{}},fetchEeaRows(){},sourceNotice(){}
});
vm.runInContext(fs.readFileSync(new URL('../js/eea-utd.js',import.meta.url),'utf8'),context);
const now=new Date(2026,9,19,12,30);
const midnight=new Date(now);midnight.setHours(0,0,0,0);
const time=offset=>new Date(midnight.getTime()+offset*3600000).toISOString();
const groups=new Map([
  ['hour',{sample:'station-a',kind:'hour',values:new Map([[time(-1),99],[time(1),0],[time(2),12],[time(23),999]])}],
  ['day',{sample:'station-b',kind:'day',values:new Map([[time(0),45]])}],
  ['old',{sample:'station-c',kind:'hour',values:new Map([[time(-1),99]])}]
]);
const rows=context.QualitaAriaEEAUTD.selectLatestCandidates(groups,now);
assert.equal(rows.length,2);
assert.equal(rows[0].sample,'station-a');
assert.equal(rows[0].value,12);
assert.equal(rows[0].latestAt,time(2));
groups.get('hour').values=new Map([[time(1),0]]);
assert.equal(context.QualitaAriaEEAUTD.selectLatestCandidates(groups,now)[0].value,0);
assert.equal(rows[1].latestAt,time(-1));
assert.equal(rows[1].value,99);
groups.get('old').values=new Map([[time(-240),42],[time(-48),9]]);
assert.equal(context.QualitaAriaEEAUTD.selectLatestCandidates(groups,now)[1].value,9);
assert.equal(context.QualitaAriaEEAUTD.selectLatestCandidates(new Map(),now).length,0);
console.log('eea-current: ok');
