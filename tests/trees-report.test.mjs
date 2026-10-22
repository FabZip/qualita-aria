import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
function extract(name){
  const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start>=0,name);
  return source.slice(start,Math.min(...[
    source.indexOf('\nfunction ',start+1),source.indexOf('\nasync function ',start+1)
  ].filter(value=>value>=0)))
}
const nodes=new Map();
function node(id){
  if(!nodes.has(id))nodes.set(id,{
    value:id==='treeReportLocation'?'0':'Dato inserito',textContent:'',disabled:false,open:true,
    setAttribute(key,value){this[key]=value},
    close(){this.open=false},
    querySelector(){return node(`${id}-submit`)}
  });
  return nodes.get(id)
}
const event={id:'dynamic-test',sourceKey:'test',locationName:'Parco Antonino Saetta',locations:['Parco Antonino Saetta']};
const map={center:{lng:12.72,lat:41.99},zoom:18,getCenter(){return this.center},setStyle(style){this.style=style}};
const satellite={version:8,sources:{},layers:[]};
const toasts=[];
const context=vm.createContext({URL,console,Response,
  state:{treeReportMap:map,treeReportMapStyle:'satellite',treeReportEvent:event,treeEventReportEvent:event},
  $:node,MAP_STYLE:'https://tiles.openfreemap.org/styles/positron',TREE_REPORT_SATELLITE_STYLE:satellite,
  treeApiBase:async()=> 'https://worker.test',treeEventSourceKey:()=> 'test',
  showToast:message=>toasts.push(message)
});
for(const name of ['toggleTreeReportMapStyle','submitTreeLocationReport','submitTreeEventReport'])vm.runInContext(extract(name),context);
context.toggleTreeReportMapStyle();
assert.equal(map.style,'https://tiles.openfreemap.org/styles/positron');
assert.equal(context.state.treeReportMapStyle,'map');
assert.equal(node('treeReportMapToggle').textContent,'Satellite');
assert.equal(node('treeReportMapToggle')['aria-label'],'Passa alla vista satellitare');
assert.deepEqual(map.center,{lng:12.72,lat:41.99});
assert.equal(map.zoom,18);
context.toggleTreeReportMapStyle();
assert.equal(map.style,satellite);
assert.equal(node('treeReportMapToggle').textContent,'Mappa stradale');
assert.equal(node('treeReportMapToggle')['aria-label'],'Passa alla mappa stradale');

for(const type of ['Location','Event']){
  const location=type==='Location';
  const prefix=location?'treeReport':'treeEventReport';
  const form=node(`${prefix}Form`),button=form.querySelector('[type=submit]');
  const dialog=node(`${prefix}Dialog`),status=node(`${prefix}Status`);
  const submit={preventDefault(){},target:form};
  const fn=context[`submitTree${type}Report`];
  let calls=0,release;
  context.fetch=async(url,options)=>{
    calls++;
    assert.ok(button.disabled,'Il pulsante viene disabilitato prima della richiesta');
    assert.equal(dialog.open,true,'La modale resta aperta fino alla conferma del server');
    assert.match(url,location?/location-reports$/:/event-reports$/);
    const body=JSON.parse(options.body);
    assert.equal(body.sourceKey,'test');
    if(location)assert.deepEqual(body.suggestedCoordinates,[12.72,41.99]);
    await new Promise(resolve=>{release=resolve});
    return Response.json({ok:true,reportId:42})
  };
  const pending=fn(submit);
  await Promise.resolve();
  await fn(submit);
  assert.equal(calls,1,'Un doppio invio non deve creare due segnalazioni');
  release();await pending;
  assert.equal(dialog.open,false);
  assert.match(toasts.at(-1),/Segnalazione n. 42 inviata/);
  assert.equal(status.textContent,'');

  // Errori HTTP o di rete: non chiudere il modulo, non perdere i dati e consentire un nuovo invio.
  for(const failure of ['http','network']){
    button.disabled=false;dialog.open=true;
    const previousToasts=toasts.length;
    context.fetch=async()=>{
      if(failure==='network')throw Error('Connessione assente');
      return Response.json({error:'Coordinate non valide'},{status:400})
    };
    await fn(submit);
    assert.equal(dialog.open,true);
    assert.equal(button.disabled,false);
    assert.match(status.textContent,failure==='network'?/Connessione assente/:/Coordinate non valide/);
    assert.equal(toasts.length,previousToasts);
    assert.equal(node(location?'treeReportReason':'treeEventReportReason').value,'Dato inserito')
  }
}
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(html,/id="treeReportMapToggle"[^>]*type="button"/);
assert.match(source,/\$\('treeReportMapToggle'\)\?\.addEventListener\('click',toggleTreeReportMapStyle\)/);
console.log('trees-report: ok');
