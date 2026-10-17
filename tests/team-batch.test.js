const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../src/renderer/duels'),T=require('../src/renderer/teams'),R=require('../src/renderer/report');
const team=id=>({id,name:id,players:T.roles.map(role=>({id:id+role,name:id+role,role,accounts:[{gameName:id+role,tagLine:'EUW'}]}))});
const op=()=>team('Opponent'),home=()=>team('UWU GANG');
const pairs=(a=op(),b=home(),hasKey=true)=>T.roles.map(role=>D.pair(a,b,role,{},hasKey));
const report=(role,extra={})=>({role,games:3,sampledAt:1000,window:{oldestAt:100,newestAt:900},coverage:{stop:'complete'},...extra});
test('one batch loads exactly ten reports sequentially and all roles are reusable and exportable',async()=>{
 const batch=D.createBatch(),target=D.create(),ps=pairs();let active=0,max=0,calls=0;
 await batch.load(ps,target,async(_a,role)=>{calls++;active++;max=Math.max(active,max);await Promise.resolve();active--;return report(role);});
 assert.equal(calls,10);assert.equal(max,1);assert.equal(batch.state.running,false);assert.ok(batch.state.rows.every(r=>r.status==='loaded'));
 for(const p of ps){target.sync(p.key);assert.equal(target.state.sides.length,2);assert.equal(target.state.sides[0].report.role,p.role);}
 const text=R.build({team:op(),home:home(),duels:ps.map(p=>({pair:p,reports:target.peek(p.key).sides.map(s=>s.report)}))});
 for(const role of T.roles)assert.match(text,new RegExp('ANALYSE SOLOQ CHARGÉE : '+role));
});
test('a second batch reuses complete samples without resetting original collection dates or memory age',async()=>{
 let time=0,calls=0;const target=D.create({now:()=>time}),b=D.createBatch(),ps=pairs(),fetch=async(_a,r)=>{calls++;return report(r);};
 await b.load(ps,target,fetch);time=1000;await b.load(ps,target,fetch);assert.equal(calls,10);assert.ok(b.state.rows.every(r=>r.status==='reused'));assert.equal(target.peek(ps[0].key).loadedAt,0);assert.equal(target.peek(ps[0].key).sides[0].report.sampledAt,1000);
 time=900000;await b.load(ps,target,fetch);assert.equal(calls,20);
});
test('ambiguous roles, absent accounts and missing teams are blocked without inventing a player',async()=>{
 const a=op();a.players.push({...a.players[0],id:'sub'});a.players[1].accounts=[];let calls=0;const b=D.createBatch();
 await b.load(pairs(a),D.create(),async(_a,r)=>{calls++;return report(r);});assert.equal(calls,6);assert.equal(b.state.rows[0].status,'blocked');assert.match(b.state.rows[0].reason,/un seul joueur/);assert.equal(b.state.rows[1].status,'blocked');
 await b.load(pairs(a,undefined,false),D.create(),async()=>{throw Error('unexpected');});assert.ok(b.state.rows.every(r=>r.status==='blocked'));
 await b.load(T.roles.map(()=>null),D.create(),async()=>{throw Error('unexpected');});assert.deepEqual(b.state.rows.map(r=>r.role),T.roles);
});
for(const stop of ['auth','rate_limit'])test('batch halts on Riot '+stop+' with partial evidence retained and no following role fetched',async()=>{
 let calls=0;const b=D.createBatch(),target=D.create(),ps=pairs();await b.load(ps,target,async(_a,r)=>{calls++;return report(r,{coverage:{stop,partial:true}});});
 assert.equal(calls,1);assert.equal(b.state.stop,stop);assert.equal(b.state.rows[0].status,'error');assert.ok(b.state.rows.slice(1).every(r=>r.status==='stopped'));assert.equal(target.peek(ps[0].key).sides[0].report.coverage.stop,stop);assert.equal(target.peek(ps[1].key),null);
});
test('thrown network errors and malformed reports halt the batch without false complete reports',async()=>{
 for(const fetch of [async()=>{throw Error('network');},async()=>report('MID')]){let calls=0;const b=D.createBatch(),target=D.create();await b.load(pairs(),target,async(...args)=>{calls++;return fetch(...args);});assert.equal(calls,1);assert.equal(b.state.stop,'error');assert.equal(b.state.rows[0].status,'error');}
});
test('partial reports are labelled and retried instead of silently reused as complete',async()=>{
 const b=D.createBatch(),target=D.create(),ps=pairs();let calls=0;await b.load(ps,target,async(_a,r)=>report(r,{coverage:{partial:true,stop:'complete'}}));assert.ok(b.state.rows.every(r=>r.status==='partial'));
 await b.load(ps,target,async(_a,r)=>{calls++;return report(r);});assert.equal(calls,10);
});
test('cancellation retains completed roles, discards pending results and prevents subsequent calls',async()=>{
 const b=D.createBatch(),target=D.create(),ps=pairs();let resolve,calls=0;
 const pending=b.load(ps,target,async(_a,r)=>{calls++;if(calls<=2)return report(r);return new Promise(res=>resolve=()=>res(report(r)));});
 while(!resolve)await Promise.resolve();b.cancel();resolve();await pending;
 assert.equal(calls,3);assert.equal(b.state.stop,'cancelled');assert.ok(target.peek(ps[0].key));assert.equal(target.peek(ps[1].key),null);assert.equal(b.state.running,false);
});
test('team or identity change cancels pending batch without assigning its result to a new context',async()=>{
 for(const change of ['team','account']){const b=D.createBatch(),target=D.create(),a=op(),ps=pairs(a);let resolve,calls=0;const pending=b.load(ps,target,(_a,r)=>{calls++;return new Promise(res=>resolve=()=>res(report(r)));});
 if(change==='team')a.id='different';else a.players[0].accounts=[{gameName:'Changed',tagLine:'EUW'}];b.sync(pairs(a));resolve();await pending;
 assert.equal(calls,1);assert.equal(target.peek(ps[0].key),null);assert.equal(b.state.rows.length,0);}
});
test('duplicate click or concurrent manual load cannot start another batch',async()=>{
 const b=D.createBatch(),target=D.create(),ps=pairs();let resolve,calls=0;const fetch=(_a,r)=>{calls++;return new Promise(res=>resolve=()=>res(report(r)));};const first=b.load(ps,target,fetch);await b.load(ps,target,fetch);assert.equal(calls,1);b.cancel();resolve();await first;
 const manual=target.load(ps[0],fetch);await b.load(ps,target,fetch);assert.equal(calls,2);target.cancel();resolve();await manual;
});
test('cancellation inside render notification prevents even the first Riot request',async()=>{
 const b=D.createBatch();let calls=0;await b.load(pairs(),D.create(),async()=>{calls++;},()=>{if(b.state.rows[0]?.status==='loading')b.cancel();});assert.equal(calls,0);
});
test('loading a batch updates the currently visible role without cancelling other roles',async()=>{
 const b=D.createBatch(),target=D.create(),ps=pairs();target.sync(ps[2].key);await b.load(ps,target,async(_a,r)=>report(r),()=>target.sync(ps[2].key));assert.equal(target.state.sides.length,2);assert.equal(target.state.sides[0].report.role,'MID');assert.ok(b.state.rows.every(r=>r.status==='loaded'));
});
test('actual UI button loads five roles, exposes progress and exports all roles without new calls',async()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8'),nodes={},$=id=>nodes[id]??={value:'',innerHTML:'',disabled:false};let calls=0,html='';
 const a=op(),h=home(),c=vm.createContext({view:'TEAMS',TeamScouting:T,DuelScouting:D,ReportBuilder:R,S:{hasKey:true,ouat:{}},$,esc:String,document:{querySelectorAll:()=>[]},roleStatReport:r=>'REPORT '+r.role,patchReport:()=>'',window:{mw:{roleStats:async(_a,r)=>{calls++;return report(r);}}},render:()=>{html=c.roleMemoryPanel(a,h);c.duelPanel(a,h);c.bindDuel(a,h);}});
 vm.runInContext(app.slice(app.indexOf('let teamDivision='),app.indexOf('function groupBoardHtml(')),c);vm.runInContext(app.slice(app.indexOf('function preparationPanel('),app.indexOf('function bindPreparation(')),c);c.render();assert.match(html,/Charger les 5 rôles/);await nodes['#loadTeamDuels'].onclick();assert.equal(calls,10);assert.match(html,/TOP : chargé/);assert.match(html,/SUPPORT : chargé/);
 await nodes['#loadTeamDuels'].onclick();assert.equal(calls,10);assert.match(html,/mémoire réutilisée/);const exported=c.preparationPanel(a,h);for(const role of T.roles)assert.match(exported,new RegExp('ANALYSE SOLOQ CHARGÉE : '+role));assert.equal(calls,10);
});
test('navigation and account correction cancel the batch and manual comparator is guarded',()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8');assert.match(app,/function setView\(next\)\{teamBatch.cancel\(\)/);assert.match(app,/async function reloadAccountIdentity[\s\S]*?teamBatch.cancel\(\)/);assert.match(app,/if\(teamBatch.state.running\)return;return teamDuel.load/);
});
