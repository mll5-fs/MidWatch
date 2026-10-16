const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createSpectateGuard}=require('../src/services/spectate-guard'),{launchThroughClient}=require('../src/services/spectate-flow');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise};};
test('guard reserves the operation before queued Riot work and blocks concurrent requests',async()=>{
 const guard=createSpectateGuard(),wait=deferred();let calls=0;const first=guard.run(async()=>{calls++;await wait.promise;return {accepted:true};});
 await assert.rejects(guard.run(async()=>{calls++;}),/déjà en cours/);assert.equal(calls,1);wait.resolve();await first;
});
test('accepted launch has a bounded cooldown and never returns another account old success',async()=>{
 let now=1000,calls=0;const guard=createSpectateGuard({now:()=>now});const task=async()=>{calls++;return {accepted:true,gameId:calls};};
 assert.equal((await guard.run(task)).retryAt,16000);await assert.rejects(guard.run(task),/15 s/);assert.equal(calls,1);now=16000;assert.equal((await guard.run(task)).gameId,2);
});
test('uncertain POST outcome has a pause but preflight failures can retry immediately',async()=>{
 let now=1000;const guard=createSpectateGuard({now:()=>now});await assert.rejects(guard.run(async()=>{throw Error('Riot preflight');}),/preflight/);
 await assert.rejects(guard.run(async()=>{throw Object.assign(Error('timeout'),{launchUncertain:true});}),/timeout/);
 await assert.rejects(guard.run(async()=>assert.fail('must not retry ambiguous launch')),/Attends encore/);now+=15000;assert.equal((await guard.run(async()=>({accepted:true}))).accepted,true);
});
test('only POST transport/server errors mark the launch uncertain, not preflight or route absence',async()=>{
 for(const status of [undefined,500,503])await assert.rejects(launchThroughClient(async(_r,method)=>{if(method==='GET')return {data:'Lobby'};throw Object.assign(Error('failure'),status?{status}:{});},'root',{}),e=>e.launchUncertain===true);
 await assert.rejects(launchThroughClient(async()=>{throw Error('preflight');},'root',{}),e=>!e.launchUncertain);
 await assert.rejects(launchThroughClient(async(_r,method)=>{if(method==='GET')return {data:'Lobby'};throw Object.assign(Error('refused'),{status:400});},'root',{}),e=>!e.launchUncertain);
});
test('renderer rapid clicks make one IPC and disable all visible spectate buttons',async()=>{
 const source=fs.readFileSync('src/renderer/app.js','utf8'),buttons=[{},{}],box={},wait=deferred();let calls=0;
 const ctx=vm.createContext({$:()=>box,document:{querySelectorAll:()=>buttons},Date,setTimeout:()=>1,clearTimeout:()=>{},window:{mw:{spectate:async()=>{calls++;return wait.promise;}}}});
 vm.runInContext(source.slice(source.indexOf('let spectatePending='),source.indexOf('function settings(')),ctx);const p={accounts:[{}]};const first=ctx.spectateAccount(p,0);await ctx.spectateAccount(p,0);assert.equal(calls,1);assert.equal(buttons.every(b=>b.disabled),true);
 wait.resolve({accepted:true,retryAt:Date.now()+15000});await first;assert.match(box.textContent,/Vérifie le lancement/);assert.equal(buttons.every(b=>b.disabled),true);await ctx.spectateAccount(p,0);assert.equal(calls,1);
});
test('renderer unlocks after failure and buttons added in another profile respect pending state',async()=>{
 const source=fs.readFileSync('src/renderer/app.js','utf8'),box={},buttons=[],wait=deferred();
 const ctx=vm.createContext({$:()=>box,document:{querySelectorAll:()=>buttons},Date,setTimeout:()=>1,clearTimeout:()=>{},window:{mw:{spectate:async()=>{await wait.promise;throw Error('Riot unavailable');}}}});
 vm.runInContext(source.slice(source.indexOf('let spectatePending='),source.indexOf('function settings(')),ctx);const first=ctx.spectateAccount({accounts:[{}]},0);buttons.push({});ctx.syncSpectateButtons();assert.equal(buttons[0].disabled,true);wait.resolve();await first;assert.equal(buttons[0].disabled,false);assert.match(box.textContent,/Riot unavailable/);
});
test('main IPC guard prevents a second Riot lookup and local launch, not just duplicate DOM clicks',async()=>{
 const source=fs.readFileSync('src/main.js','utf8'),handlers={},wait=deferred();let lookups=0,posts=0;
 const ctx=vm.createContext({ipcMain:{handle:(name,fn)=>handlers[name]=fn},spectateGuard:createSpectateGuard(),foregroundRiot:task=>Promise.resolve().then(task),key:()=>true,Riot:function(){return {resolveAccount:async()=>{lookups++;return {platform:'EUW1',puuid:'fixture'};},active:async()=>({gameId:1})};},spectate:{launch:async()=>{posts++;await wait.promise;return {accepted:true,root:'fixture-root'};}},store:{get:()=>'',set:()=>{}}});
 vm.runInContext(source.split('\n').find(l=>l.startsWith('ipcMain.handle("spectate:launch"')),ctx);const first=handlers['spectate:launch']({},{});await assert.rejects(handlers['spectate:launch']({},{}),/déjà en cours/);await new Promise(r=>setImmediate(r));assert.equal(lookups,1);assert.equal(posts,1);wait.resolve();const result=await first;assert.equal(result.accepted,true);assert.ok(result.retryAt>Date.now());
});
