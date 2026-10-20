const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {launchThroughClient,diagnoseClient}=require('../src/services/spectate-flow'),{createSpectateGuard}=require('../src/services/spectate-guard');
for(const phase of ['Matchmaking','ReadyCheck','ChampSelect','GameStart','InProgress','Reconnect','WaitingForStats','PreEndOfGame','EndOfGame'])test('occupied '+phase+' sends only a read-only phase GET, never launch or cancellation',async()=>{
 const calls=[];await assert.rejects(launchThroughClient(async(...args)=>{calls.push(args);return {data:phase};},'fixture-root',{}),e=>{assert.match(e.message,/Spectate non envoyé/);assert.ok(e.message.includes(phase));assert.match(e.message,/Aucune recherche annulée/);assert.match(e.message,/aucune demande de lancement envoyée/);assert.equal(e.launchUncertain,undefined);assert.equal(e.spectateBusy,undefined);return true;});assert.deepEqual(calls.map(c=>[c[1],c[2]]),[['GET','/lol-gameflow/v1/gameflow-phase']]);
});
test('idle and unknown phases preserve compatibility without asserting a launched game',async()=>{
 for(const phase of ['None','Lobby','NewClientPhase',null]){const calls=[];const result=await launchThroughClient(async(_r,method,endpoint)=>{calls.push([method,endpoint]);return method==='GET'?{data:phase}:{status:204};},'root',{});assert.equal(result.accepted,true);assert.equal(result.verified,undefined);assert.equal(calls.length,2);assert.equal(calls[1][0],'POST');}
});
test('optional phase endpoint 404/405 does not invent an occupied phase',async()=>{
 for(const status of [404,405]){const calls=[];const result=await launchThroughClient(async(_r,method,endpoint)=>{calls.push([method,endpoint]);if(method==='GET')throw Object.assign(Error('route absent'),{status});return {status:204};},'root',{});assert.equal(result.accepted,true);assert.equal(result.phase,'inconnue');assert.equal(calls.length,2);}
});
test('failed phase probe still aborts before POST and is not uncertain launch',async()=>{
 const calls=[];await assert.rejects(launchThroughClient(async(_r,method)=>{calls.push(method);throw Error('read-only probe failed');},'root',{}),e=>e.message==='read-only probe failed'&&!e.launchUncertain);assert.deepEqual(calls,['GET']);
});
test('occupied rejection releases guard without artificial cooldown; a later idle attempt rereads phase',async()=>{
 const guard=createSpectateGuard({now:()=>1000}),calls=[];let phase='ChampSelect';const task=()=>launchThroughClient(async(_r,method)=>{calls.push(method);return method==='GET'?{data:phase}:{status:204};},'root',{});await assert.rejects(guard.run(task),/Spectate non envoyé/);assert.deepEqual(guard.snapshot(),{retryAt:0,pauseReason:''});phase='Lobby';const result=await guard.run(task);assert.equal(result.accepted,true);assert.deepEqual(calls,['GET','GET','POST']);assert.equal(result.pauseReason,'accepted');
});
test('diagnostic remains read-only and can report occupied phases without requesting launch',async()=>{
 const calls=[];const result=await diagnoseClient(async(_r,method,endpoint)=>{calls.push([method,endpoint]);return {data:'InProgress',status:200,auth:'process'};},'root');assert.equal(result.phase,'InProgress');assert.equal(result.connected,true);assert.deepEqual(calls,[['GET','/lol-gameflow/v1/gameflow-phase']]);
});
test('actual renderer displays occupied refusal and releases buttons without scheduling pause',async()=>{
 const source=fs.readFileSync('src/renderer/app.js','utf8'),box={},buttons=[{}];let timers=0;const c=vm.createContext({$:()=>box,document:{querySelectorAll:()=>buttons},Date,setTimeout:()=>{timers++;return 1;},clearTimeout:()=>{},window:{mw:{spectate:()=>launchThroughClient(async()=>({data:'InProgress'}),'root',{})}}});vm.runInContext(source.slice(source.indexOf('let spectatePending='),source.indexOf('function settings(')),c);await c.spectateAccount({accounts:[{}]},0);assert.match(box.textContent,/Spectate non envoyé/);assert.match(box.textContent,/InProgress/);assert.equal(buttons[0].disabled,false);assert.equal(timers,0);
});
