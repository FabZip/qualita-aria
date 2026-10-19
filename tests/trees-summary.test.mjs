import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const treeCatalog=JSON.parse(fs.readFileSync(path.join(root,'data/trees.json'),'utf8'));

async function treeStats(dynamicEvents=[]){
  const context=vm.createContext({
    URL,
    Date,
    console,
    setTimeout,
    window:{},
    fetch:async resource=>{
      const url=String(resource);
      if(url.startsWith('data/')){
        const file=url.split('?')[0];
        return new Response(fs.readFileSync(path.join(root,file)))
      }
      return Response.json({events:dynamicEvents,lastSync:null})
    }
  });

  vm.runInContext(
    fs.readFileSync(path.join(root,'js/trees.js'),'utf8'),
    context
  );

  return context.window.TreeStats
}

const pending={
  id:'dynamic-pending',
  sourceKey:'pending',
  year:'2026',
  date:'2026-10-01',
  locationName:'Roma',
  eventType:'planting',
  status:'completed',
  validation:'automatic_pending',
  quantity:100,
  sourceUrl:'https://example.test/pending'
};

const withPending=await (await treeStats([pending])).rows('roma','2026');
assert.equal(withPending.documentedSummary.plantings,603);
assert.equal(withPending.documentedSummary.decrements,19);
assert.ok(withPending.documentedEvents.some(event=>event.sourceKey==='pending'));

const confirmed={
  ...pending,
  id:'dynamic-confirmed',
  sourceKey:'confirmed',
  validation:'automatic_confirmed',
  quantity:7,
  sourceUrl:'https://example.test/confirmed'
};

const withConfirmed=await (await treeStats([confirmed])).rows('roma','2026');
assert.equal(withConfirmed.documentedSummary.plantings,610);
assert.equal(withConfirmed.documentedSummary.decrements,19);

const localEvent=treeCatalog.cities.roma.documentedEvents.find(event=>event.id==='roma-2026-via-meropia');
const sameSourceDuplicate={
  ...localEvent,
  id:'dynamic-mun08-via-meropia',
  sourceKey:'mun08-via-meropia',
  validation:'automatic_pending'
};
const withDuplicate=await (await treeStats([sameSourceDuplicate])).rows('roma','2026');
assert.equal(
  withDuplicate.documentedEvents.filter(event=>event.sourceUrl===localEvent.sourceUrl).length,
  1
);

const distinctSameSource={
  ...sameSourceDuplicate,
  id:'dynamic-mun08-via-meropia--2',
  sourceKey:'mun08-via-meropia--2',
  date:'2026-07-15',
  locationName:'Via del Bosco Nuovo',
  locations:['Via del Bosco Nuovo'],
  eventType:'planting',
  status:'completed',
  validation:'automatic_confirmed',
  quantity:7
};
const withDistinctSameSource=await (await treeStats([sameSourceDuplicate,distinctSameSource])).rows('roma','2026');
assert.equal(
  withDistinctSameSource.documentedEvents.filter(event=>event.sourceUrl===localEvent.sourceUrl).length,
  2
);
assert.ok(withDistinctSameSource.documentedEvents.some(event=>event.sourceKey==='mun08-via-meropia--2'));
assert.equal(withDistinctSameSource.documentedSummary.plantings,610);
assert.equal(withDistinctSameSource.documentedSummary.decrements,19);

const planned={...pending,id:'dynamic-future',sourceKey:'future',date:'2026-12-20',status:'planned',quantity:null};
const withFuture=await(await treeStats([planned])).rows('roma','2026');
assert.equal(withFuture.documentedEvents[0].sourceKey,'future');
assert.equal(withFuture.documentedSummary.plantings,603);
assert.equal(withFuture.documentedSummary.decrements,19);

// Una revisione remota non deve riutilizzare la geometria locale della vecchia ubicazione.
const revised={...localEvent,sourceKey:localEvent.id,id:`dynamic-${localEvent.id}`,locationName:'Via corretta',validation:'manual_confirmed',coordinates:[12.51,41.91],path:undefined};
const withRevision=await(await treeStats([revised])).rows('roma','2026');
const corrected=withRevision.documentedEvents.find(event=>event.id===localEvent.id);
assert.equal(corrected.locationName,'Via corretta');
assert.equal(corrected.path,null);
assert.deepEqual([...corrected.coordinates],[12.51,41.91]);
const unresolvedRevision=await(await treeStats([{...revised,coordinates:undefined}])).rows('roma','2026');
const unresolved=unresolvedRevision.documentedEvents.find(event=>event.id===localEvent.id);
assert.equal(unresolved.coordinates,undefined);
assert.equal(unresolved.path,null);

console.log('trees-summary: ok');
