const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createRiotBackoff}=require('../src/services/riot-backoff');
const {checkLiveAccounts}=require('../src/services/live-status');
const PlayerIdentity=require('../src/renderer/identity'),LiveMonitor=require('../src/renderer/live-monitor');
const player=id=>({id,accounts:[{gameName:id,tagLine:'EUW'}]});
test('backoff retains the longest deadline, expires, and isolates keys',()=>{
 let time=1000;const gate=createRiotBackoff({now:()=>time});gate.block('A',30000);gate.block('A',1000);
 assert.throws(()=>gate.assertAllowed('A'),e=>e.status===429&&e.retryAt===31000&&e.retryAfterMs===30000);
 assert.doesNotThrow(()=>gate.assertAllowed('B'));time=31000;assert.doesNotThrow(()=>gate.assertAllowed('A'));
});
function transport(header='30'){
 let time=1000,calls=0;const c=vm.createContext({AbortController,setTimeout,clearTimeout,module:{exports:{}},require:name=>{
  if(name==='electron')return {net:{fetch:async()=>{calls++;const status=calls===1?429:200;return {ok:status===200,status,headers:{get:()=>header},json:async()=>status===200?[]:{status:{message:'limited'}}};}}};
  if(name==='./riot-backoff')return {createRiotBackoff:()=>createRiotBackoff({now:()=>time})};
  return require('../src/services/'+name.slice(2));
 }});vm.runInContext(fs.readFileSync('src/services/riot.js','utf8'),c);
 return {Riot:c.module.exports.Riot,calls:()=>calls,advance:value=>time=value};
}
test('actual HTTP transport shares 429 pause across instances/routes, without retrying the refused request',async()=>{
 const h=transport(),a=new h.Riot('A'),b=new h.Riot('A');
 await assert.rejects(a.active('EUW1','p'),e=>e.status===429&&e.retryAt===31000);
 for(const request of [()=>b.ranked('EUW1','p'),()=>b.match('EUW1','m'),()=>b.validate()])await assert.rejects(request(),e=>e.status===429&&e.retryAt===31000);
 assert.equal(h.calls(),1);await new h.Riot('B').ranked('EUW1','p');assert.equal(h.calls(),2);
 h.advance(31000);await a.active('EUW1','p');assert.equal(h.calls(),3);
});
test('HTTP 429 headers install the pause before a slow response body is read',async()=>{
 let releaseBody,bodyStarted,calls=0;const started=new Promise(resolve=>bodyStarted=resolve);
 const c=vm.createContext({AbortController,setTimeout,clearTimeout,module:{exports:{}},require:name=>{
  if(name==='electron')return {net:{fetch:async()=>{calls++;return {ok:false,status:429,headers:{get:()=> '30'},json:()=>{bodyStarted();return new Promise(resolve=>releaseBody=resolve);}};}}};
  if(name==='./riot-backoff')return {createRiotBackoff:()=>createRiotBackoff({now:()=>1000})};
  return require('../src/services/'+name.slice(2));
 }});vm.runInContext(fs.readFileSync('src/services/riot.js','utf8'),c);const riot=new c.module.exports.Riot('A'),first=riot.active('EUW1','p');
 await started;await assert.rejects(riot.ranked('EUW1','p'),e=>e.status===429);assert.equal(calls,1);releaseBody({});await assert.rejects(first,e=>e.status===429&&e.retryAt===31000);
});
for(const header of [null,'invalid'])test(`missing/invalid Retry-After uses conservative fallback (${header})`,async()=>{
 const h=transport(header),a=new h.Riot('A');await assert.rejects(a.active('EUW1','p'),e=>e.retryAfterMs===120000&&e.retryAt===121000);
 await assert.rejects(a.ranked('EUW1','p'),e=>e.status===429);assert.equal(h.calls(),1);
});
test('valid Retry-After longer than ten minutes is not cut short',async()=>{
 const h=transport('900'),a=new h.Riot('A');await assert.rejects(a.active('EUW1','p'),e=>e.retryAfterMs===900000);
 h.advance(601000);await assert.rejects(a.ranked('EUW1','p'),e=>e.retryAfterMs===300000);assert.equal(h.calls(),1);
});
for(const status of [401,403,429])test(`multi-account LIVE stops on HTTP ${status} before querying secondary accounts`,async()=>{
 let calls=0;const error=Object.assign(new Error('blocked'),{status,retryAfterMs:30000}),accounts=[player('a').accounts[0],player('b').accounts[0]];
 await assert.rejects(checkLiveAccounts({resolveAccount:async()=>{calls++;throw error;}},accounts),e=>e===error);assert.equal(calls,1);
});
test('actual main LIVE batch reports one attempted player and stops on global errors',async()=>{
 const main=fs.readFileSync('src/main.js','utf8'),ps=[player('a'),player('b')];
 for(const status of [401,403,429]){
  let calls=0;const c=vm.createContext({key:()=>true,store:{get:(_k,def)=>def,set:()=>{}},selectRoster:()=>({players:ps}),bundledOuat:{},applyOverrides:x=>x,liveQueue:{select:()=>ps},Riot:function(){},PlayerIdentity,checkLiveAccounts:async()=>{calls++;throw Object.assign(new Error('blocked'),{status,retryAt:99999,retryAfterMs:30000});}});
  vm.runInContext(main.slice(main.indexOf('async function liveBatchWork('),main.indexOf('function liveBatch(')),c);
  const result=await c.liveBatchWork();assert.equal(result.checked,1);assert.equal(calls,1);assert.equal(result.blockedStatus,status);assert.equal(result.updates[0].live,null);assert.equal(result.retryAt,status===429?99999:0);
 }
});
test('rank cooldown uses the absolute transport deadline rather than a stale batch-start timestamp',async()=>{
 const {loadBatch}=require('../src/services/ranks'),p=player('a');
 const r=await loadBatch({resolveAccount:async()=>{throw Object.assign(new Error('limited'),{status:429,retryAfterMs:17000,retryAt:25000});}},[p],{now:1000});
 assert.equal(r.retryAt,25000);assert.equal(Object.values(r.cache)[0].nextCheck,25000);
});
test('LIVE propagates a shared cooldown to the renderer and makes no IPC call while paused',async()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8');let calls=0;const deadline=Date.now()+60000;
 const c=vm.createContext({S:{hasKey:true,ouatPlayers:[]},rankCooldownAt:0,LiveMonitor,view:'OUAT',listForView:()=>[],window:{mw:{liveBatch:async()=>{calls++;return {updates:[],retryAt:deadline,blockedStatus:429};}}},renderNav:()=>{},render:()=>{}});
 vm.runInContext(app.slice(app.indexOf('async function refreshLive('),app.indexOf('async function refresh(){')),c);await c.refreshLive();assert.equal(c.rankCooldownAt,deadline);await c.refreshLive();assert.equal(calls,1);
});
test('authentication errors from LIVE disable automatic collection without calling players offline',async()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8');let calls=0;
 const c=vm.createContext({S:{hasKey:true,ouatPlayers:[]},rankCooldownAt:0,LiveMonitor,view:'OUAT',listForView:()=>[],window:{mw:{liveBatch:async()=>{calls++;return {updates:[],blockedStatus:403};}}},renderNav:()=>{},render:()=>{}});
 vm.runInContext(app.slice(app.indexOf('async function refreshLive('),app.indexOf('async function refresh(){')),c);await c.refreshLive();await c.refreshLive();assert.equal(c.S.hasKey,false);assert.equal(calls,1);
});
test('a rank batch already in flight cannot clear a later LIVE cooldown',async()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8');let resolve;const deadline=Date.now()+60000;
 const c=vm.createContext({S:{hasKey:true,ouatPlayers:[]},view:'OUAT',rankBusy:false,rankReloadPending:false,rankCooldownAt:0,rankFollowup:null,document:{querySelectorAll:()=>[]},listForView:()=>[],window:{mw:{rankBatch:()=>new Promise(r=>resolve=r)}},render:()=>{}});
 vm.runInContext(app.slice(app.indexOf('async function refreshRanks('),app.indexOf('async function refreshLive(')),c);
 const pending=c.refreshRanks();c.rankCooldownAt=deadline;resolve({updates:[],remaining:0});await pending;assert.equal(c.rankCooldownAt,deadline);
});
test('API indicator shows remaining pause, then connected or configuration-required',()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8'),nodes={},c=vm.createContext({S:{hasKey:true},rankCooldownAt:Date.now()+60000,$:id=>nodes[id]??={textContent:'',classList:{toggle:()=>{}}}});
 vm.runInContext(app.slice(app.indexOf('function status(){'),app.indexOf('function notice(')),c);c.status();assert.match(nodes['#apiText'].textContent,/reprise dans \d+ s/);
 c.rankCooldownAt=0;c.status();assert.match(nodes['#apiText'].textContent,/connectée/);c.S.hasKey=false;c.status();assert.match(nodes['#apiText'].textContent,/à configurer/);
});
