const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const {createSpectateGuard}=require('../src/services/spectate-guard'),{requestLocal}=require('../src/services/lcu-http'),{launchThroughClient}=require('../src/services/spectate-flow');
function http(status,header,body='{"password":"secret"}'){
 return (_options,callback)=>{const req=new EventEmitter();req.write=()=>{};req.destroy=()=>{};req.end=()=>{const res=new EventEmitter();res.statusCode=status;res.headers={'retry-after':header};callback(res);res.emit('data',body);res.emit('end');};return req;};
}
test('local 429 extracts a sanitized numeric Retry-After and never forwards credentials or body',async()=>{
 await assert.rejects(requestLocal({port:1234,password:'secret'},'POST','/launch',{}, {request:http(429,'30')}),e=>{assert.equal(e.retryAfterMs,30000);assert.equal(e.status,429);assert.equal(JSON.stringify(e).includes('secret'),false);return true;});
 await assert.rejects(requestLocal({port:1234,password:'secret'},'POST','/launch',{}, {request:http(401,'30')}),e=>e.retryAfterMs===undefined);
});
test('local 429 accepts HTTP-date Retry-After; invalid or past values add no invented server delay',async()=>{
 const future=new Date(Date.now()+120000).toUTCString();
 await assert.rejects(requestLocal({port:1234,password:'secret'},'POST','/launch',{}, {request:http(429,future)}),e=>e.retryAfterMs>118000&&e.retryAfterMs<=120000);
 for(const header of [undefined,'garbage','-3','Infinity','Thu, 01 Jan 1970 00:00:00 GMT'])await assert.rejects(requestLocal({port:1234,password:'secret'},'POST','/launch',{}, {request:http(429,header)}),e=>e.retryAfterMs===0);
});
test('429 travels through HTTP, launch and guard into a read-only pause without a fallback POST',async()=>{
 let time=1000,posts=0,gets=0;const guard=createSpectateGuard({now:()=>time});
 const launch=()=>guard.run(()=>launchThroughClient(async(_root,method)=>{if(method==='GET'){gets++;return {data:'Lobby'};}posts++;return requestLocal({port:1234,password:'secret'},method,'/launch',{}, {request:http(429,'45')});},'root',{}));
 await assert.rejects(launch(),/HTTP 429/);assert.equal(posts,1);assert.equal(gets,1);assert.deepEqual(guard.snapshot(),{retryAt:46000,pauseReason:'busy'});
 time=45000;await assert.rejects(launch(),/Attends encore/);assert.equal(posts,1);assert.equal(gets,1);assert.equal(guard.snapshot().retryAt,46000);
 time=46000;assert.deepEqual(guard.snapshot(),{retryAt:0,pauseReason:''});assert.equal(posts,1);
});
test('429 during the read-only client probe pauses safely without submitting any POST',async()=>{
 const guard=createSpectateGuard({now:()=>1000});let posts=0;
 await assert.rejects(guard.run(()=>launchThroughClient(async(_r,m)=>{if(m==='POST')posts++;throw Object.assign(Error('busy'),{status:429,retryAfterMs:60000});},'root',{})),/occupé/);
 assert.equal(posts,0);assert.deepEqual(guard.snapshot(),{retryAt:61000,pauseReason:'busy'});
});
test('busy fallback is at least fifteen seconds and ignores unsafe or malformed delay values',async()=>{
 for(const value of [undefined,NaN,Infinity,-1,0,1,Number.MAX_VALUE,Number.MAX_SAFE_INTEGER,'45000']){
  const guard=createSpectateGuard({now:()=>1000});await assert.rejects(guard.run(async()=>{throw Object.assign(Error('busy'),{spectateBusy:true,retryAfterMs:value});}));
  assert.equal(guard.snapshot().retryAt,16000);assert.equal(guard.snapshot().pauseReason,'busy');
 }
});
test('uncertain, accepted and ordinary failures have distinct pause states; snapshots never prolong them',async()=>{
 let time=1000;const guard=createSpectateGuard({now:()=>time});await assert.rejects(guard.run(async()=>{throw Error('preflight');}));assert.equal(guard.snapshot().retryAt,0);
 await assert.rejects(guard.run(async()=>{throw Object.assign(Error('timeout'),{launchUncertain:true});}));assert.deepEqual(guard.snapshot(),{retryAt:16000,pauseReason:'uncertain'});
 const copy=guard.snapshot();copy.retryAt=999999;time=15000;assert.equal(guard.snapshot().retryAt,16000);time=16000;const r=await guard.run(async()=>({accepted:true}));assert.equal(r.pauseReason,'accepted');assert.equal(r.retryAt,31000);
});
test('main status IPC is key-free, read-only, returns only guard data and preserves expiry',async()=>{
 let time=1000;const guard=createSpectateGuard({now:()=>time}),handlers={};await assert.rejects(guard.run(async()=>{throw Object.assign(Error('timeout'),{launchUncertain:true});}));
 const source=fs.readFileSync('src/main.js','utf8'),ctx=vm.createContext({ipcMain:{handle:(id,fn)=>handlers[id]=fn},spectateGuard:guard});
 vm.runInContext(source.split('\n').find(l=>l.startsWith('ipcMain.handle("spectate:status"')),ctx);
 assert.deepEqual(handlers['spectate:status'](),{retryAt:16000,pauseReason:'uncertain'});time=16000;assert.equal(handlers['spectate:status']().retryAt,0);
});
test('preload exposes only the read-only status IPC without any launch parameters',async()=>{
 let exposed;const calls=[],ctx=vm.createContext({require:()=>({contextBridge:{exposeInMainWorld:(_name,api)=>exposed=api},ipcRenderer:{invoke:(...args)=>{calls.push(args);return Promise.resolve({retryAt:1});}}})});
 vm.runInContext(fs.readFileSync('src/preload.js','utf8'),ctx);await exposed.spectateStatus();assert.deepEqual(calls,[['spectate:status']]);
});
function ui({busy=false,statusFails=false,accepted=false}={}){
 let time=1000,launches=0,statusReads=0,timer;const guard=createSpectateGuard({now:()=>time}),box={},buttons=[{},{}];
 const ctx=vm.createContext({$:()=>box,document:{querySelectorAll:()=>buttons},Date:{now:()=>time},setTimeout:(fn,delay)=>{timer={fn,delay};return 1;},clearTimeout:()=>{},window:{mw:{
  spectate:async()=>{try{return await guard.run(async()=>{launches++;if(accepted)return {accepted:true};throw Object.assign(Error('Error invoking remote method spectate: Error: local failure'),busy?{spectateBusy:true,retryAfterMs:45000}:{launchUncertain:true});});}catch(e){throw Error(e.message);}},
  spectateStatus:async()=>{statusReads++;if(statusFails)throw Error('status unavailable');return guard.snapshot();}
 }}});
 const source=fs.readFileSync('src/renderer/app.js','utf8');vm.runInContext(source.slice(source.indexOf('let spectatePending='),source.indexOf('function settings(')),ctx);
 return {ctx,box,buttons,p:{accounts:[{}]},launches:()=>launches,statusReads:()=>statusReads,tick:t=>{time=t;timer?.fn();},timer:()=>timer};
}
for(const busy of [false,true])test('actual renderer preserves '+(busy?'busy':'uncertain')+' pause after serialized IPC error and never retries on its timer',async()=>{
 const x=ui({busy});await x.ctx.spectateAccount(x.p,0);assert.equal(x.launches(),1);assert.equal(x.statusReads(),1);assert.equal(x.buttons.every(b=>b.disabled),true);assert.match(x.buttons[0].textContent,busy?/45 s/:/15 s/);assert.match(x.buttons[0].title,busy?/occupé/:/non confirmé/);assert.doesNotMatch(x.buttons[0].title,/Demande acceptée/);assert.match(x.box.textContent,/local failure/);assert.match(x.box.textContent,/aucune relance automatique/);assert.doesNotMatch(x.box.textContent,/Error invoking/);assert.equal(x.box.className,'result');
 await x.ctx.spectateAccount(x.p,0);assert.equal(x.launches(),1);x.buttons.push({});x.ctx.syncSpectateButtons();assert.equal(x.buttons[2].disabled,true);assert.equal(x.timer().delay,1000);
 x.tick(busy?45000:15000);assert.match(x.buttons[0].textContent,/1 s/);assert.equal(x.launches(),1);assert.equal(x.statusReads(),1);
 x.tick(busy?46000:16000);assert.equal(x.buttons.every(b=>!b.disabled),true);assert.equal(x.buttons[0].textContent,'▶ SPECTATE');assert.equal(x.launches(),1);assert.equal(x.statusReads(),1);
});
test('accepted renderer pause remains distinct from confirmed game launch and needs no status IPC',async()=>{
 const x=ui({accepted:true});await x.ctx.spectateAccount(x.p,0);assert.match(x.buttons[0].title,/Demande acceptée/);assert.match(x.box.textContent,/Vérifie le lancement/);assert.equal(x.statusReads(),0);x.tick(16000);assert.equal(x.launches(),1);
});
test('status IPC failure does not mask the launch error or invent a successful launch',async()=>{
 const x=ui({statusFails:true});await x.ctx.spectateAccount(x.p,0);assert.match(x.box.textContent,/local failure/);assert.doesNotMatch(x.box.textContent,/status unavailable|✓|Demande acceptée/);assert.equal(x.buttons[0].disabled,false);
});
