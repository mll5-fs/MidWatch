const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../src/renderer/duels'),T=require('../src/renderer/teams'),R=require('../src/renderer/report');
const team=id=>({id,name:id,players:T.roles.map(role=>({id:id+role,name:id+role,role,accounts:[{gameName:id+role,tagLine:'EUW'}]}))});
const sample=(role,games=3,at=100)=>({role,games,sampledAt:at,coverage:{partial:false,stop:'target'},window:{oldestAt:1,newestAt:at-1},champions:[{name:'Ahri',games,wins:1}],patches:[]});
function fixture(){let time=1000;const a=team('Opponent'),b=team('UWU GANG'),ps=T.roles.map(r=>D.pair(a,b,r,{},true)),target=D.create({now:()=>time}),batch=D.createBatch({now:()=>time});for(const p of ps)target.save(p.key,[{report:sample(p.role)},{report:sample(p.role)}]);return {a,b,ps,target,batch,advance:n=>time+=n,setTime:n=>time=n};}
const force={force:true};
test('ordinary loading reuses all complete pairs; explicit refresh recollects ten reports serially',async()=>{
 const x=fixture();let calls=0,active=0,max=0;const fetch=async(_a,r)=>{calls++;active++;max=Math.max(max,active);await Promise.resolve();active--;return sample(r,8,2000);};await x.batch.load(x.ps,x.target,fetch);assert.equal(calls,0);x.advance(1000);await x.batch.load(x.ps,x.target,fetch,()=>{},force);assert.equal(calls,10);assert.equal(max,1);assert.equal(x.batch.state.force,true);assert.ok(x.batch.state.rows.every(r=>r.status==='loaded'));for(const p of x.ps){assert.equal(x.target.peek(p.key).loadedAt,2000);assert.equal(x.target.peek(p.key).sides[0].report.games,8);}
});
test('a failed first request retains the previous complete pair, date, original expiry and a visible failure marker',async()=>{
 const x=fixture();x.target.sync(x.ps[0].key);x.advance(2000);let calls=0;await x.batch.load(x.ps,x.target,async()=>{calls++;throw Error('network');},()=>{},force);const old=x.target.peek(x.ps[0].key);assert.equal(calls,1);assert.equal(old.loadedAt,1000);assert.equal(old.sides[0].report.sampledAt,100);assert.equal(old.restoredAfterError,true);assert.equal(x.target.state.restoredAfterError,true);assert.equal(x.batch.state.rows[0].status,'restored');assert.match(x.batch.state.rows[0].reason,/échouée/);assert.ok(x.batch.state.rows.slice(1).every(r=>r.status==='stopped'));x.setTime(901000);assert.equal(x.target.peek(x.ps[0].key),null);
});
test('second-account failure restores atomically, never a mixture of old and new samples',async()=>{
 const x=fixture();let calls=0;await x.batch.load(x.ps,x.target,async(_a,r)=>{if(++calls===2)throw Error('second failed');return sample(r,8,2000);},()=>{},force);assert.deepEqual(x.target.peek(x.ps[0].key).sides.map(s=>s.report.games),[3,3]);assert.equal(calls,2);
});
for(const stop of ['auth','rate_limit'])test('explicit refresh stops on '+stop+' and never treats restored reports as a successful refresh',async()=>{
 const x=fixture();let calls=0;await x.batch.load(x.ps,x.target,async(_a,r)=>{calls++;return {...sample(r),coverage:{partial:true,stop}};},()=>{},force);assert.equal(calls,1);assert.equal(x.batch.state.stop,stop);assert.equal(x.batch.state.rows[0].status,'restored');assert.ok(x.target.peek(x.ps[0].key).restoredAfterError);assert.ok(x.batch.state.rows.slice(1).every(r=>r.status==='stopped'));
});
test('non-global partial collections preserve old complete pairs but continue serially to later roles',async()=>{
 const x=fixture();let calls=0;await x.batch.load(x.ps,x.target,async(_a,r)=>{calls++;return {...sample(r,1),coverage:{partial:true,stop:'complete'}};},()=>{},force);assert.equal(calls,10);assert.ok(x.batch.state.rows.every(r=>r.status==='restored'));assert.equal(x.batch.state.stop,'');for(const p of x.ps)assert.equal(x.target.peek(p.key).loadedAt,1000);
});
test('absent, partial or expired prior pairs cannot be manufactured as a complete fallback',async()=>{
 for(const mode of ['absent','partial','expired']){const x=fixture();if(mode==='absent')x.target=D.create({now:()=>1000});if(mode==='partial')x.target.save(x.ps[0].key,[{report:{...sample('TOP'),coverage:{partial:true}}},{report:sample('TOP')}]);if(mode==='expired')x.advance(900000);await x.batch.load(x.ps,x.target,async()=>{throw Error('network');},()=>{},force);assert.equal(x.batch.state.rows[0].status,'error');assert.equal(x.target.peek(x.ps[0].key).restoredAfterError,undefined);}
});
test('a previous pair expiring during collection is not revived',async()=>{
 const x=fixture();await x.batch.load(x.ps,x.target,async()=>{x.advance(900000);throw Error('late failure');},()=>{},force);assert.equal(x.batch.state.rows[0].status,'error');assert.ok(x.target.peek(x.ps[0].key).sides[0].error);
});
test('successful valid zero-game reports replace old data rather than falsely restoring it',async()=>{
 const x=fixture();await x.batch.load(x.ps,x.target,async(_a,r)=>sample(r,0,2000),()=>{},force);assert.ok(x.batch.state.rows.every(r=>r.status==='loaded'));assert.equal(x.target.peek(x.ps[0].key).sides[0].report.games,0);assert.notEqual(x.target.peek(x.ps[0].key).restoredAfterError,true);
});
test('duplicate clicks and cancellation cannot queue another forced refresh or publish a late response',async()=>{
 const x=fixture();let resolve,calls=0;const fetch=(_a,r)=>{calls++;return new Promise(res=>resolve=()=>res(sample(r,8)));};const pending=x.batch.load(x.ps,x.target,fetch,()=>{},force);await x.batch.load(x.ps,x.target,fetch,()=>{},force);assert.equal(calls,1);x.batch.cancel();resolve();await pending;assert.equal(calls,1);assert.equal(x.target.peek(x.ps[0].key).sides[0].report.games,3);assert.equal(x.target.peek(x.ps[0].key).restoredAfterError,undefined);
});
test('context/account changes discard in-flight refresh results and cannot restore into a new pair',async()=>{
 const x=fixture();let resolve;const pending=x.batch.load(x.ps,x.target,(_a,r)=>new Promise(res=>resolve=()=>res(sample(r,8))),()=>{},force);x.a.players[0].accounts=[{gameName:'NEW',tagLine:'EUW'}];const ps=T.roles.map(r=>D.pair(x.a,x.b,r,{},true));x.batch.sync(ps);resolve();await pending;assert.equal(x.target.peek(ps[0].key),null);assert.equal(x.batch.state.rows.length,0);assert.equal(x.target.peek(x.ps[0].key).sides[0].report.games,3);
});
test('transferred samples reject wrong keys, malformed dates/roles, clock reversal and expired memory',()=>{
 const x=fixture(),p=x.ps[0],saved=x.target.peek(p.key),other=D.create({now:()=>1000});assert.equal(other.adopt('other',saved),false);for(const loadedAt of [NaN,Infinity,undefined,'1000',-1,1001])assert.equal(other.adopt(p.key,{...saved,loadedAt}),false);assert.equal(other.adopt(p.key,{...saved,sides:[null,null]}),false);assert.equal(other.adopt(p.key,{...saved,sides:[{report:sample('TOP')},{report:sample('MID')}]}),false);assert.equal(D.create({now:()=>901000}).adopt(p.key,saved),false);assert.equal(D.create({now:()=>NaN}).adopt(p.key,saved),false);assert.equal(other.adopt(p.key,saved),true);assert.equal(other.peek(p.key).loadedAt,1000);
});
test('repeated failed refreshes never renew fallback memory and ordinary loader retries restored entries',async()=>{
 const x=fixture();for(let i=0;i<2;i++){x.advance(1000);await x.batch.load(x.ps,x.target,async()=>{throw Error('failed');},()=>{},force);assert.equal(x.target.peek(x.ps[0].key).loadedAt,1000);}let calls=0;await x.batch.load(x.ps,x.target,async(_a,r)=>{calls++;return sample(r);});assert.equal(calls,2);assert.notEqual(x.target.peek(x.ps[0].key).restoredAfterError,true);
});
test('full report, brief, overview and pools retain the restored-after-error warning',async()=>{
 const x=fixture();await x.batch.load(x.ps,x.target,async()=>{throw Error('network');},()=>{},force);const p=x.ps[0],saved=x.target.peek(p.key),analysis={pair:p,reports:saved.sides.map(s=>s.report),restoredAfterError:saved.restoredAfterError},entries=[{pair:p,role:p.role,saved}];assert.match(R.build({team:x.a,home:x.b,duels:[analysis]}),/RESTAURÉ APRÈS ÉCHEC/);assert.match(R.buildBrief({team:x.a,home:x.b,duels:[analysis]}),/RESTAURÉ APRÈS ÉCHEC/);assert.equal(D.overview(entries)[0].restoredAfterError,true);assert.equal(D.draftPools(entries)[0].restoredAfterError,true);
});
test('actual refresh button bypasses session reuse and invokes the existing fresh IPC flag, then shows dated fallback',async()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8'),a=team('Opponent'),h=team('UWU GANG'),nodes={},$=id=>nodes[id]??={value:'',innerHTML:'',disabled:false};let calls=0,fail=false,html='';
 const c=vm.createContext({view:'TEAMS',TeamScouting:T,DuelScouting:D,ReportBuilder:R,S:{hasKey:true,ouat:{}},$,esc:String,document:{querySelectorAll:()=>[]},roleStatReport:r=>'REPORT '+r.role,patchReport:()=>'',window:{mw:{roleStats:async(_a,r,patchOnly,refresh)=>{calls++;assert.equal(patchOnly,false);assert.equal(refresh,true);if(fail)throw Error('network');return sample(r);}}},render:()=>{html=c.roleMemoryPanel(a,h);c.duelPanel(a,h);c.bindDuel(a,h);}});
 vm.runInContext(app.slice(app.indexOf('let teamDivision='),app.indexOf('function groupBoardHtml(')),c);c.render();assert.match(html,/Actualiser les 5 rôles depuis Riot/);await nodes['#loadTeamDuels'].onclick();assert.equal(calls,10);await nodes['#loadTeamDuels'].onclick();assert.equal(calls,10);await nodes['#refreshTeamDuels'].onclick();assert.equal(calls,20);fail=true;await nodes['#refreshTeamDuels'].onclick();assert.equal(calls,21);assert.match(html,/ancien rapport conservé \(daté\)/);assert.match(html,/Actualisation échouée/);vm.runInContext("duelRole='TOP'",c);assert.match(c.duelPanel(a,h),/RESTAURÉ APRÈS ÉCHEC/);assert.equal(nodes['#refreshTeamDuels'].disabled,false);
});
test('refresh control is disabled without key, during a batch or manual load, and no call occurs on render',()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8');assert.match(app,/id="refreshTeamDuels"[\s\S]*?!S.hasKey\|\|batch.running\|\|teamDuel.state.loading/);assert.match(app,/if\(\$\("#refreshTeamDuels"\)\)[^\n]*\{force:true\}/);assert.match(app,/pas une actualisation réussie/);
});
