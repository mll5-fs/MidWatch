const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const LiveMonitor=require('../src/renderer/live-monitor'),PlayerIdentity=require('../src/renderer/identity'),{createLiveQueue}=require('../src/services/live-queue');
const player=id=>({id,name:id,accounts:[{gameName:id,tagLine:'EUW'}]});
const app=fs.readFileSync('src/renderer/app.js','utf8');
test('selected team at the end of a 1419-player roster is checked immediately, with background progress',()=>{
 const ps=Array.from({length:1419},(_,i)=>player(String(i))),ids=ps.slice(-10).map(p=>p.id),queue=createLiveQueue();
 const first=queue.select(ps,ids),second=queue.select(ps,ids);
 assert.equal(first.length,8);assert.equal(first.filter(p=>ids.includes(p.id)).length,6);
 assert.equal(new Set([...first,...second].filter(p=>ids.includes(p.id)).map(p=>p.id)).size,10);
 assert.equal(first.filter(p=>!ids.includes(p.id)).length,2);
 assert.ok(second.filter(p=>!ids.includes(p.id)).every(p=>!first.includes(p)));
});
test('without priorities all linked players rotate with no duplicate within a batch',()=>{
 const ps=Array.from({length:19},(_,i)=>player(String(i))),queue=createLiveQueue(),seen=new Set();
 for(let i=0;i<3;i++){const b=queue.select(ps);assert.equal(new Set(b.map(p=>p.id)).size,b.length);for(const p of b)seen.add(p.id);}
 assert.equal(seen.size,19);
});
test('changing selected team and replacing an account cannot strand an unattempted account',()=>{
 const ps=Array.from({length:30},(_,i)=>player(String(i))),queue=createLiveQueue();
 queue.select(ps,ps.slice(0,10).map(p=>p.id));
 assert.ok(queue.select(ps,ps.slice(-5).map(p=>p.id)).some(p=>p.id==='29'));
 ps[0]={...ps[0],accounts:[{gameName:'Replacement',tagLine:'NEW'}]};
 assert.ok(queue.select(ps,['0']).some(p=>p.id==='0'));
});
test('invalid IPC priorities and players without linked accounts cannot expand the batch',()=>{
 const queue=createLiveQueue(),ps=[...Array.from({length:12},(_,i)=>player(String(i))),{id:'missing',accounts:[]}];
 for(const ids of [null,{},['missing',{},42,'not-in-roster'],Array.from({length:300},(_,i)=>String(i))]){
  const b=queue.select(ps,ids);assert.equal(b.length,8);assert.ok(b.every(p=>p.id!=='missing'));
 }
});
test('LIVE expires after two minutes and does not retain the spectator account',()=>{
 const p=player('p'),meta={liveCheckedAt:1000,liveAccount:p.accounts[0]};
 assert.equal(LiveMonitor.project(p,true,meta,1000+LiveMonitor.TTL).live,true);
 const expired=LiveMonitor.project(p,true,meta,1001+LiveMonitor.TTL);
 assert.equal(expired.live,null);assert.equal(expired.liveAccount,null);assert.equal(expired.liveStale,true);
 assert.match(LiveMonitor.label(expired),/À REVÉRIFIER/);
});
test('confirmed offline expires to unknown rather than becoming a permanent offline fact',()=>{
 const p=player('p'),fresh=LiveMonitor.project(p,false,{liveCheckedAt:1000},2000),stale=LiveMonitor.project(p,false,{liveCheckedAt:1000},200000);
 assert.equal(fresh.live,false);assert.match(LiveMonitor.label(fresh),/HORS LIGNE/);
 assert.equal(stale.live,null);assert.doesNotMatch(LiveMonitor.label(stale),/HORS LIGNE/);
});
test('missing, non-finite and future timestamps cannot substantiate LIVE',()=>{
 for(const timestamp of [undefined,null,0,NaN,Infinity,10001])assert.equal(LiveMonitor.project(player('p'),true,{liveCheckedAt:timestamp},10000).live,null);
 assert.match(LiveMonitor.label(LiveMonitor.project(player('p'),null,{liveError:'Riot unavailable'},10000)),/INDISPONIBLE/);
 assert.match(LiveMonitor.label(LiveMonitor.project(player('p'),undefined,{},10000)),/NON VÉRIFIÉ/);
});
test('team priority includes every declared role in both selected team and UWU without inventing players',()=>{
 const selected={id:'op',name:'Opponent',players:['TOP','JUNGLE','MID','ADC','SUPPORT'].map(player)},home={id:'home',name:'UWU GANG',players:[player('home')]};
 assert.deepEqual(LiveMonitor.priority([],selected.id,[selected,home]),['TOP','JUNGLE','MID','ADC','SUPPORT','home']);
 assert.deepEqual(LiveMonitor.priority([player('MID')],selected.id,[selected,home]),['TOP','JUNGLE','MID','ADC','SUPPORT','home']);
 assert.deepEqual(LiveMonitor.priority([],'missing',[]),[]);
});
test('actual renderer excludes an expired LIVE observation but retains a matching rank',()=>{
 const p=player('p'),identity=PlayerIdentity.fingerprint(p),c=vm.createContext({LiveMonitor,PlayerIdentity,S:{ouatPlayers:[p]},rankMeta:{p:{identity}},rankState:{p:{tier:'GOLD'}},liveMeta:{p:{identity,liveCheckedAt:1,liveAccount:p.accounts[0]}},liveState:{p:true}});
 vm.runInContext(app.slice(app.indexOf('function applyLive('),app.indexOf('function rankPlaceholder(')),c);
 const result=c.allPlayers()[0];assert.equal(result.live,null);assert.equal(result.liveAccount,null);assert.equal(result.bestRank.tier,'GOLD');
 assert.match(app,/LiveMonitor.label\(p\).*vérifié à/);
});
test('actual main batch checks selected accounts and preserves the eight-player budget',async()=>{
 const main=fs.readFileSync('src/main.js','utf8'),ps=Array.from({length:20},(_,i)=>player(String(i))),calls=[];
 const c=vm.createContext({key:()=>true,store:{get:(_k,def)=>def,set:()=>{}},selectRoster:()=>({players:ps}),bundledOuat:{},applyOverrides:x=>x,liveQueue:createLiveQueue(),Riot:function(){},PlayerIdentity,checkLiveAccounts:async(_riot,accounts)=>{calls.push(accounts[0].gameName);return {live:true,account:accounts[0],checkedAt:123};}});
 vm.runInContext(main.slice(main.indexOf('async function liveBatchWork('),main.indexOf('function liveBatch(')),c);
 const result=await c.liveBatchWork(['19']);assert.ok(calls.includes('19'));assert.equal(calls.length,8);assert.equal(result.updates.length,8);assert.ok(result.updates.every(u=>u.checkedAt===123&&u.identity));
 assert.match(main,/ipcMain.handle\("riot:liveBatch",\(_e,ids\)=>liveBatch\(ids\)\)/);
 assert.match(fs.readFileSync('src/preload.js','utf8'),/liveBatch:ids=>ipcRenderer.invoke\("riot:liveBatch",ids\)/);
});
test('actual refresh renders expiration even on IPC failure or missing key',async()=>{
 for(const hasKey of [true,false]){
  let renders=0;const c=vm.createContext({rankCooldownAt:0,S:{hasKey},LiveMonitor,view:'OUAT',listForView:()=>[],window:{mw:{liveBatch:async()=>{throw new Error('IPC failure');}}},renderNav:()=>{},render:()=>renders++});
  c.renderBackground=c.render; // Reading-state behavior is covered separately.
  vm.runInContext(app.slice(app.indexOf('async function refreshLive('),app.indexOf('async function refresh(){')),c);await c.refreshLive();assert.equal(renders,1);
 }
});
