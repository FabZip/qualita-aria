import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-24T12:00:00Z']))}}
const c=vm.createContext({Date:FixedDate,URL,Response,Headers,TextEncoder,TextDecoder,crypto});
vm.runInContext(fs.readFileSync(new URL('../cloudflare/temperature-proxy/src/index.js',import.meta.url),'utf8').replace('export default{','globalThis.worker={'),c);
const url='https://www.comune.roma.it/web/it/informazione-di-servizio.page?contentId=IDS1658896';
const fixture=fs.readFileSync(new URL('fixtures/tree-mixed-xiv.html',import.meta.url),'utf8');
const events=c.classifyTreePage(fixture,url);
assert.equal(events.length,2);
const cut=events.find(e=>e.eventType==='decrement'),planting=events.find(e=>e.eventType==='planting');
assert.equal(cut.eventDate,'2026-10-30');
assert.equal(cut.sourcePublishedAt,'2026-10-20');
assert.equal(cut.sourceKey,'IDS1658896');
assert.deepEqual([...cut.locations],['Parco Beata Elena Aiello','Via Stresa','Via Bitossi']);
assert.equal(cut.quantity,null,'Non sommare solo le quantità parziali o attribuire 19 piantumazioni ai tagli');
assert.equal(cut.status,'planned');
assert.equal(cut.title,'Abbattimenti a carattere di urgenza nel XIV Municipio');
assert.equal(cut.district,'Municipio XIV');
assert.equal(planting.sourceKey,'IDS1658896--planting');
assert.equal(planting.quantity,19);
assert.deepEqual([...planting.locations],['Via Bitossi']);
assert.equal(planting.eventDate,null,'La data limite degli abbattimenti non va copiata sulle piantumazioni');
assert.equal(planting.year,2026);
assert.equal(planting.sourcePublishedAt,'2026-10-20');
assert.equal(planting.status,'planned');
assert.equal(planting.validation,'automatic_pending');

// Un blocco davvero ambiguo rimane visibile e revisionabile, senza quantità attribuita.
const ambiguous=c.classifyTreePage('<h1>Interventi misti</h1><meta name="date" content="2026-10-20"><p>Abbattimenti e piantumazioni di 30 alberi in Via Roma.</p>',url);
assert.equal(ambiguous.length,1);
assert.equal(ambiguous[0].eventType,'unknown');
assert.equal(ambiguous[0].quantity,null);
assert.equal(ambiguous[0].validation,'automatic_pending');

// Due tipi con quantità esplicite e località multiple: nessuna contaminazione tra blocchi.
const structured=c.classifyTreePage(`<h1>Interventi arborei</h1><meta name="date" content="2026-10-20">
<p>Abbattimento programmato di 5 alberi entro il 30 ottobre 2026. Ubicazione: Via Roma</p>
<p>Piantumazione programmata di 12 alberi. Ubicazione: Via Milano</p>`,url);
assert.equal(structured.length,2);
assert.equal(structured.find(e=>e.eventType==='decrement').quantity,5);
assert.equal(structured.find(e=>e.eventType==='planting').quantity,12);

// Contenuti di menu e metadati non cambiano il tipo del comunicato.
const single=c.classifyTreePage('<h1>Roma Capitale</h1><nav>Piantumazioni di 100 alberi</nav><h2>Abbattimenti urgenti</h2><article><p>Abbattimento di 2 alberi. Ubicazione: Via Roma</p><p>Data di esecuzione: 27 ottobre 2026</p><p>Pubblicato il 20 ottobre 2026</p></article>',url);
assert.equal(single.length,1);
assert.equal(single[0].eventType,'decrement');
assert.equal(single[0].sourcePublishedAt,'2026-10-20');
assert.equal(c.treeExecutionDate('Intervento entro venerdì 30 ottobre 2026','2026-10-20'),'2026-10-30');
const plantingParagraph='<p>In Via Bitossi sono programmate 19 nuove piantumazioni</p>';
const reordered=c.classifyTreePage(fixture.replace(plantingParagraph,'').replace('<article>',`<article>${plantingParagraph}`),url);
assert.equal(reordered.find(event=>event.eventType==='decrement').sourceKey,cut.sourceKey);
assert.equal(reordered.find(event=>event.eventType==='planting').sourceKey,planting.sourceKey);
console.log('worker-tree-mixed: ok');
