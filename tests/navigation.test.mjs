import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../js/navigation.js',import.meta.url),'utf8');
const bare=vm.createContext({});vm.runInContext(src,bare);assert.equal(bare.AppNavigation.route('#earthquakes'),'earthquakes');assert.equal(bare.AppNavigation.route('#invalid'),null);
const events=new Map(),nodes=new Map(),windowEvents=new Map(),writes=[];let changes=0;
function node(id){if(!nodes.has(id))nodes.set(id,{value:'nearby',hidden:true,textContent:'',dataset:{},attrs:{},addEventListener:(type,handler)=>events.set(`${id}:${type}`,handler),setAttribute(name,value){this.attrs[name]=value},removeAttribute(name){delete this.attrs[name]},focus(){this.focused=true},contains:target=>target?.inside===true,querySelectorAll:()=>links});return nodes.get(id)}
const links=Object.keys(bare.AppNavigation.pages).map(name=>({dataset:{page:name},attrs:{},setAttribute(name,value){this.attrs[name]=value},removeAttribute(name){delete this.attrs[name]}}));
const location={hash:'#fires'};const history={replaceState(state,unused,hash){location.hash=hash;writes.push(['replace',hash])},pushState(state,unused,hash){location.hash=hash;writes.push(['push',hash])}};
const context=vm.createContext({document:{getElementById:node,addEventListener:(type,fn)=>events.set(`document:${type}`,fn)},window:{addEventListener:(type,fn)=>windowEvents.set(type,fn),scrollTo(){}},location,history,source:()=>node('sourceSelect').value,changeSource:()=>{changes++},Environment:{icon:()=>'<svg></svg>'}});
vm.runInContext(src,context);assert.equal(node('sourceSelect').value,'fires');assert.equal(node('appCurrentPage').textContent,'Incendi');
events.get('appMenuToggle:click')();assert.equal(node('appMenu').hidden,false);assert.equal(node('appMenuToggle').attrs['aria-expanded'],'true');
events.get('document:keydown')({key:'Escape',preventDefault(){}});assert.equal(node('appMenu').hidden,true);assert.equal(node('appMenuToggle').focused,true);
context.AppNavigation.navigate('nearby');assert.equal(changes,1);assert.equal(location.hash,'#nearby');assert.equal(writes.at(-1)[0],'push');assert.equal(links[0].attrs['aria-current'],'page');
const before=writes.length;location.hash='#fires';windowEvents.get('popstate')();assert.equal(changes,2);assert.equal(node('sourceSelect').value,'fires');assert.equal(writes.length,before,'Back restores the page without adding history');
context.AppNavigation.navigate('invalid');assert.equal(changes,2);
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.match(html,/<label id="pollutantSourceField" hidden>/);assert.ok(html.indexOf('id="appNavigation"')<html.indexOf('</header>'));assert.ok(html.indexOf('aria-header-logo')<html.indexOf('id="appNavigation"'));
console.log('navigation: menu, keyboard, URL and Back ok');
