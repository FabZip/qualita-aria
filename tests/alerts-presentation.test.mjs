import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const now=Date.parse('2026-11-26T10:00:00Z');class FixedDate extends Date{static now(){return now}}
const c=vm.createContext({URL,URLSearchParams,Date:FixedDate,Intl});vm.runInContext(fs.readFileSync(new URL('../js/environment.js',import.meta.url),'utf8'),c);const api=c.Environment;
for(const [text,level] of [['Assenza / NESSUNA ALLERTA',0],['Ordinaria / ALLERTA GIALLA',1],['Moderata / ALLERTA ARANCIONE',2],['Elevata / ALLERTA ROSSA',3],['Valutazione non trasmessa',null],['',null]])assert.equal(api.alertLevel(text),level);
const period=(date,level='NESSUNA ALLERTA')=>({date,zones:[{name:'Zona <Test>',risks:['idraulico','temporali','idrogeologico'].map(type=>({type,text:level}))}]});
const data={title:'Bollettino <Test>',stale:false,current:[period('2026-11-26'),period('2026-11-27')]};
assert.equal(api.alertStatus(data).key,'green');assert.match(api.alertHeroHtml(data,true),/Nessuna allerta segnalata/);assert.match(api.alertHeroHtml(data,true),/<svg/);
const upcoming={...data,current:[period('2026-11-26'),period('2026-11-27','ALLERTA ARANCIONE')]};const status=api.alertStatus(upcoming);assert.equal(status.key,'orange');assert.match(status.detail,/Prevista/);assert.equal(status.selected.date,'2026-11-27');
assert.match(api.alertHtml(upcoming),/data-alert-panel="2026-11-26" hidden/);assert.match(api.alertHtml(upcoming),/data-alert-day="2026-11-27" aria-pressed="true"/);
assert.equal(api.alertStatus({...data,stale:true}).key,'unknown');assert.equal(api.alertStatus({...data,current:[period('2026-11-25','ALLERTA ROSSA')]}).label,'Bollettino scaduto');assert.equal(api.alertStatus(null).label,'Dati non disponibili');
const unknown={...data,current:[period('2026-11-26','Informazione non disponibile')]};assert.equal(api.alertStatus(unknown).key,'unknown');assert.doesNotMatch(api.alertHeroHtml(unknown),/Nessuna allerta segnalata/);
assert.equal(api.alertStatus({...data,current:[{date:'2026-11-26',zones:[]}]}).key,'unknown');
const mixed=period('2026-11-26','ALLERTA GIALLA');mixed.zones[0].risks[1].text='Valutazione non trasmessa';assert.equal(api.alertStatus({...data,current:[mixed]}).key,'yellow');assert.equal(api.alertStatus({...data,current:[mixed]}).partial,true);
assert.match(api.alertHtml(data),/Zona &lt;Test&gt;/);assert.match(api.alertHtml(data),/Bollettino &lt;Test&gt;/);assert.match(api.alertHtml(data),/Rischio idraulico/);assert.match(api.alertHtml(data),/Rischio idrogeologico/);assert.match(api.alertHtml(data),/role="group"/);
console.log('alerts presentation: severity, unknowns, expired dates, future warnings, escaping and day selection ok');
