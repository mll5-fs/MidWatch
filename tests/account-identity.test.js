const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const PlayerIdentity=require('../src/renderer/identity');
const app=fs.readFileSync('src/renderer/app.js','utf8');
const player=name=>({id:'same-player',accounts:[{gameName:name,tagLine:'EUW',platform:'EUW1'}]});
test('account identity is order/duplicate/case insensitive but changes for name, tag or platform',()=>{
 const p=player('Old');
 assert.equal(PlayerIdentity.fingerprint(p),PlayerIdentity.fingerprint({accounts:[{gameName:' OLD ',tagLine:'euw'},...p.accounts]}));
 const other=player('Other');
 assert.equal(PlayerIdentity.fingerprint({accounts:[...p.accounts,...other.accounts]}),PlayerIdentity.fingerprint({accounts:[...other.accounts,...p.accounts]}));
 for(const change of [{gameName:'New'},{tagLine:'New'},{platform:'NA1'}])assert.notEqual(PlayerIdentity.fingerprint(p),PlayerIdentity.fingerprint({accounts:[{...p.accounts[0],...change}]}));
 assert.equal(PlayerIdentity.matches(p,{}),false);
});
test('old rank and LIVE metadata cannot follow the player ID onto a replacement account',()=>{
 const old=player('Old'),current=player('New'),identity=PlayerIdentity.fingerprint(old);
 const c=vm.createContext({LiveMonitor:require("../src/renderer/live-monitor"),PlayerIdentity,S:{ouatPlayers:[current]},rankMeta:{[old.id]:{identity,rankStatus:'ranked'}},rankState:{[old.id]:{tier:'DIAMOND'}},liveMeta:{[old.id]:{identity,liveCheckedAt:Date.now(),liveAccount:old.accounts[0]}},liveState:{[old.id]:true}});
 vm.runInContext(app.slice(app.indexOf('function applyLive('),app.indexOf('function rankPlaceholder(')),c);
 const result=c.allPlayers()[0];assert.equal(result.bestRank,undefined);assert.equal(result.live,null);assert.equal(result.rankStatus,undefined);
 c.S.ouatPlayers=[old];assert.equal(c.allPlayers()[0].bestRank.tier,'DIAMOND');assert.equal(c.allPlayers()[0].live,true);
});
function harness(){
 const current=player('New'),ranks=[],lives=[];
 const c=vm.createContext({LiveMonitor:require("../src/renderer/live-monitor"),PlayerIdentity,S:{hasKey:true,ouatPlayers:[current]},rankBusy:false,rankReloadPending:false,rankCooldownAt:0,rankFollowup:null,rankState:{},rankMeta:{},liveState:{},liveMeta:{},view:'OUAT',
 document:{querySelectorAll:()=>[]},listForView:()=>[current],render:()=>{},renderNav:()=>{},setTimeout:()=>1,clearTimeout:()=>{},
 window:{mw:{rankBatch:()=>new Promise(resolve=>ranks.push(resolve)),liveBatch:()=>new Promise(resolve=>lives.push(resolve))}}});
 vm.runInContext(app.slice(app.indexOf('async function refreshRanks('),app.indexOf('async function refresh(){')),c);
 return {c,current,ranks,lives};
}
test('a late old-account rank response cannot overwrite current-account metadata',async()=>{
 const {c,current,ranks}=harness(),identity=PlayerIdentity.fingerprint(current);
 const request=c.refreshRanks();c.rankState[current.id]={tier:'GOLD'};c.rankMeta[current.id]={identity};
 ranks[0]({updates:[{id:current.id,identity:PlayerIdentity.fingerprint(player('Old')),rank:{tier:'DIAMOND'},status:'ranked'}]});await request;
 assert.equal(c.rankState[current.id].tier,'GOLD');assert.equal(c.rankMeta[current.id].identity,identity);
});
test('a late old-account LIVE response is ignored and a matching response is accepted',async()=>{
 const {c,current,lives}=harness();const old=c.refreshLive();
 lives[0]({updates:[{id:current.id,identity:PlayerIdentity.fingerprint(player('Old')),live:true}]});await old;
 assert.equal(c.liveState[current.id],undefined);
 const fresh=c.refreshLive();lives[1]({updates:[{id:current.id,identity:PlayerIdentity.fingerprint(current),live:false}]});await fresh;
 assert.equal(c.liveState[current.id],false);
});
test('a roster account change followed by a failed rank check cannot relabel the old rank as current',async()=>{
 const {c,current,ranks}=harness();c.rankState[current.id]={tier:'DIAMOND'};c.rankMeta[current.id]={identity:PlayerIdentity.fingerprint(player('Old'))};
 const request=c.refreshRanks();ranks[0]({updates:[{id:current.id,identity:PlayerIdentity.fingerprint(current),status:'error'}]});await request;
 assert.equal(c.rankState[current.id],undefined);assert.equal(c.rankMeta[current.id].rankStatus,'error');
});
for(const busy of [false,true])test(`account reload clears old observations and ${busy?'queues':'starts'} rank loading`,async()=>{
 const current=player('New'),calls=[];
 const c=vm.createContext({S:{ouatPlayers:[player('Old')]},rankState:{'same-player':{}},rankMeta:{'same-player':{}},liveState:{'same-player':true},liveMeta:{'same-player':{}},rankBusy:busy,rankReloadPending:false,
 teamDuel:{cancel:()=>calls.push('cancel')},window:{mw:{data:async()=>({ouatPlayers:[current]})}},notice:()=>{},openPlayer:id=>calls.push(id),renderNav:()=>{},render:()=>{},refreshRanks:()=>calls.push('ranks')});
 vm.runInContext(app.slice(app.indexOf('async function reloadAccountIdentity('),app.indexOf('async function checkAccount(')),c);
 await c.reloadAccountIdentity(current.id);
 for(const key of ['rankState','rankMeta','liveState','liveMeta'])assert.equal(Object.keys(c[key]).length,0);
 assert.equal(c.S.ouatPlayers[0].accounts[0].gameName,'New');assert.ok(calls.includes('cancel'));
 assert.equal(calls.includes('ranks'),!busy);assert.equal(c.rankReloadPending,busy);
 assert.match(app,/#clearFix[\s\S]*?clearOverride\(p.id\);await reloadAccountIdentity\(p.id\)/);
});
test('account correction during the last rank batch restarts loading without relying on remaining',async()=>{
 const {c,ranks}=harness(),first=c.refreshRanks();c.rankReloadPending=true;
 ranks[0]({updates:[],remaining:0});await first;assert.equal(ranks.length,2);assert.equal(c.rankReloadPending,false);
 ranks[1]({updates:[],remaining:0});await new Promise(resolve=>setImmediate(resolve));assert.equal(c.rankBusy,false);
});
test('rank and live backend updates carry the queried identity on success and failure',async()=>{
 const p=player('Old'),{loadBatch}=require('../src/services/ranks');
 for(const failure of [false,true]){
  const r=await loadBatch({resolveAccount:async()=>({puuid:'fixture'}),ranked:async()=>{if(failure)throw new Error('offline');return []; }},[p],{now:1000});
  assert.equal(r.updates[0].identity,PlayerIdentity.fingerprint(p));
 }
 const main=fs.readFileSync('src/main.js','utf8');
 assert.equal((main.match(/identity:PlayerIdentity.fingerprint\(p\)/g)||[]).length,2);
});
