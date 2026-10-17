const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../src/renderer/duels'),T=require('../src/renderer/teams'),statsCache=require('../src/services/stats-cache');
const app=fs.readFileSync('src/renderer/app.js','utf8'),main=fs.readFileSync('src/main.js','utf8');
const account={gameName:'Measured',tagLine:'EUW',platform:'EUW1'};
function backend(){
 const data={},calls=[];let fail=false,partial=false;
 const c=vm.createContext({key:()=>true,Riot:function(){},statsCache,store:{get:k=>data[k]||{},set:(k,v)=>data[k]=v},require:p=>p.includes('ouat-roles')?{normalizeRole:T.normalizeRole||((r)=>T.roles.includes(r)?r:null)}:{collectRoleReport:async(_riot,a,role,options)=>{calls.push({a,role,options});if(fail)throw Error('Quota bloqué');return {role,games:calls.length,sampledAt:Date.now(),coverage:{partial,stop:'complete'}};}}});
 vm.runInContext(main.slice(main.indexOf('async function playerRoleStats('),main.indexOf('async function rankBatch(')),c);
 return {data,calls,run:(...args)=>c.playerRoleStats(...args),fail:()=>fail=true,partial:v=>partial=v};
}
for(const role of T.roles)test('explicit '+role+' refresh bypasses a fresh disk report but ordinary reads keep caching',async()=>{
 const b=backend(),old=await b.run(account,role);assert.equal((await b.run(account,role)).games,old.games);assert.equal(b.calls.length,1);
 const fresh=await b.run(account,role,false,true);assert.notEqual(fresh,old);assert.equal(b.calls.length,2);assert.equal((await b.run(account,role)).games,fresh.games);
 assert.equal(b.calls[1].role,role);assert.equal(b.calls[1].options.patchOnly,false);
});
test('refresh flag is strict, patch cache stays isolated and refresh failure never returns old report as fresh',async()=>{
 const b=backend(),old=await b.run(account,'MID');
 for(const flag of ['true',1,{},null])assert.equal((await b.run(account,'MID',false,flag)).games,old.games);
 const patch=await b.run(account,'MID',true);assert.notEqual(patch,old);assert.equal((await b.run(account,'MID')).games,old.games);
 await b.run(account,'MID',true,true);assert.equal(b.calls.length,3);assert.equal(b.calls[2].options.patchOnly,true);
 b.fail();await assert.rejects(b.run(account,'MID',false,true),/Quota bloqué/);assert.equal((await b.run(account,'MID')).games,old.games);
});
test('preload and IPC propagate strict explicit refresh through the existing foreground scheduler',async()=>{
 let bridge,args,queued=0;const c=vm.createContext({require:()=>({contextBridge:{exposeInMainWorld:(_name,value)=>bridge=value},ipcRenderer:{invoke:(...v)=>args=v}})});
 vm.runInContext(fs.readFileSync('src/preload.js','utf8'),c);bridge.roleStats(account,'ADC');assert.deepEqual(args.slice(2),['ADC',false,false]);bridge.roleStats(account,'ADC',false,true);assert.deepEqual(args.slice(2),['ADC',false,true]);
 let handler;const ipc=vm.createContext({ipcMain:{handle:(_name,h)=>handler=h},foregroundRiot:fn=>{queued++;return fn();},playerRoleStats:(...v)=>args=v});
 vm.runInContext(main.split('\n').find(line=>line.startsWith('ipcMain.handle("riot:roleStats"')),ipc);
 handler(null,account,'ADC',1,'true');assert.deepEqual(args.slice(2),[false,false]);handler(null,account,'ADC',false,true);assert.deepEqual(args.slice(2),[false,true]);assert.equal(queued,2);
});
function ui(b){
 const nodes={},$=id=>nodes[id]??={value:'',disabled:false},team=id=>({id,name:id,players:T.roles.map(role=>({id:id+role,role,name:id+role,accounts:[{...account,gameName:id+role}]}))}),op=team('Opponent'),home=team('UWU GANG');let html='';
 const c=vm.createContext({document:{querySelectorAll:()=>[]},DuelScouting:D,TeamScouting:T,$,S:{hasKey:true},view:'TEAMS',esc:String,roleStatReport:r=>'SAMPLE '+r.games,patchReport:()=>'',window:{mw:{roleStats:(...args)=>b.run(...args)}},render:()=>{html=c.duelPanel(op,home);c.bindDuel(op,home);}});
 vm.runInContext(app.slice(app.indexOf('let teamDivision='),app.indexOf('function groupBoardHtml(')),c);c.render();return {nodes,c,op,home,html:()=>html};
}
test('actual role refresh button recollects through backend cache while navigation and filters stay offline',async()=>{
 const b=backend(),u=ui(b);await u.nodes['#loadDuel'].onclick();assert.equal(b.calls.length,2);assert.match(u.html(),/Actualiser depuis Riot/);
 await u.nodes['#loadDuel'].onclick();assert.equal(b.calls.length,4);assert.match(u.html(),/SAMPLE 3/);assert.match(u.html(),/SAMPLE 4/);
 u.nodes['#duelRole'].onchange({target:{value:'TOP'}});u.nodes['#duelRole'].onchange({target:{value:'MID'}});u.nodes['#duelPatch'].onchange({target:{value:'ALL'}});u.nodes['#duelChampion'].onchange({target:{value:'ALL'}});assert.equal(b.calls.length,4);
 assert.match(u.html(),/délais de quota restent respectés/);
 b.fail();await u.nodes['#loadDuel'].onclick();assert.match(u.html(),/Quota bloqué/);assert.doesNotMatch(u.html(),/SAMPLE 3/);assert.equal(b.calls.length,5);
});
test('actual five-role button retries partial disk reports and reuses complete session reports without calls',async()=>{
 const b=backend(),u=ui(b);b.partial(true);await u.nodes['#loadTeamDuels'].onclick();assert.equal(b.calls.length,10);
 b.partial(false);await u.nodes['#loadTeamDuels'].onclick();assert.equal(b.calls.length,20);
 const rows=u.c.roleMemories(u.op,u.home);assert.ok(rows.every(r=>r.saved.sides.every(s=>s.report.coverage.partial===false)));
 await u.nodes['#loadTeamDuels'].onclick();assert.equal(b.calls.length,20);
});
