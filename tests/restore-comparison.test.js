const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../src/renderer/duels'),T=require('../src/renderer/teams'),R=require('../src/renderer/report');
const team=id=>({id,name:id,players:T.roles.map(role=>({id:id+role,name:id+role,role,accounts:[{gameName:id+role,tagLine:'EUW'}]}))});
const pair=(role='MID',op=team('Opponent'))=>D.pair(op,team('UWU GANG'),role,{},true);
const report=(role='MID',games=3)=>({role,games,sampledAt:100,window:{oldestAt:1,newestAt:99},coverage:{partial:false,stop:'target'},champions:[{name:'Ahri',games,wins:1}],patches:[]});
for(const role of T.roles)test(role+' explicitly restores both prior samples after failure, without changing dates or TTL',async()=>{
 let time=0;const c=D.create({now:()=>time}),p=pair(role);await c.load(p,async()=>report(role));time=1000;await c.load(p,async()=>{throw Error('network');});assert.equal(c.canRestore(),true);assert.ok(c.state.sides[0].error);assert.equal(c.state.sides[0].report,undefined);assert.equal(c.restorePrevious(),true);assert.equal(c.state.sides.length,2);assert.equal(c.state.sides[0].report.sampledAt,100);assert.equal(c.peek(p.key).loadedAt,0);assert.equal(c.state.restoredAfterError,true);assert.equal(c.canRestore(),false);
 time=899999;assert.ok(c.peek(p.key));time=900000;c.sync(p.key);assert.equal(c.state.sides.length,0);assert.equal(c.state.restoredAfterError,false);
});
test('first collection failure cannot invent a preceding comparison',async()=>{
 const c=D.create();await c.load(pair(),async()=>{throw Error('failed');});assert.equal(c.canRestore(),false);assert.equal(c.restorePrevious(),false);assert.ok(c.state.sides[0].error);
});
test('second-account failure never automatically merges old and new reports; restoration is atomic',async()=>{
 const c=D.create(),p=pair();await c.load(p,async()=>report());let calls=0;await c.load(p,async()=>{if(++calls===2)throw Error('second failed');return report('MID',8);});assert.equal(c.state.sides[0].report.games,8);assert.equal(c.state.sides[1].report,undefined);assert.equal(c.canRestore(),true);c.restorePrevious();assert.deepEqual(c.state.sides.map(s=>s.report.games),[3,3]);
});
test('auth, quota and partial collections retain an explicit recovery option without more requests',async()=>{
 for(const stop of ['auth','rate_limit','complete']){const c=D.create(),p=pair();await c.load(p,async()=>report());let calls=0;await c.load(p,async()=>{calls++;return {...report(),coverage:{partial:true,stop}};});assert.equal(calls,stop==='complete'?2:1);assert.equal(c.canRestore(),true);c.restorePrevious();assert.equal(calls,stop==='complete'?2:1);assert.equal(c.state.sides[0].report.coverage.partial,false);}
});
test('successful refresh including valid empty reports clears recovery; pending refresh cannot be restored',async()=>{
 const c=D.create(),p=pair();await c.load(p,async()=>report());let resolve;const pending=c.load(p,()=>new Promise(r=>resolve=r));assert.equal(c.restorePrevious(),false);c.cancel();resolve(report());await pending;assert.equal(c.canRestore(),false);
 await c.load(p,async()=>report());await c.load(p,async()=>report('MID',0));assert.equal(c.canRestore(),false);assert.equal(c.state.sides[0].report.games,0);assert.equal(c.state.restoredAfterError,false);
});
test('clock reversal, expiration, account changes and navigation invalidate the recovery option',async()=>{
 for(const mode of ['clock','expiry','role','account','cancel']){let time=1000;const c=D.create({now:()=>time}),p=pair();await c.load(p,async()=>report());await c.load(p,async()=>{throw Error('bad');});if(mode==='clock')time=999;if(mode==='expiry')time=901000;if(mode==='role')c.sync(pair('TOP').key);if(mode==='account'){const op=team('Opponent');op.players[2].accounts[0].gameName='Changed';c.sync(pair('MID',op).key);}if(mode==='cancel')c.cancel();assert.equal(c.restorePrevious(),false,mode);}
});
test('repeated failures keep the same unexpired backup without renewing its age',async()=>{
 let time=0;const c=D.create({now:()=>time}),p=pair();await c.load(p,async()=>report());time=500;for(let i=0;i<3;i++)await c.load(p,async()=>{throw Error('still failing');});assert.equal(c.canRestore(),true);c.restorePrevious();assert.equal(c.peek(p.key).loadedAt,0);
});
test('restored flag follows role memory and is cleared by a genuine successful refresh',async()=>{
 const c=D.create(),p=pair();await c.load(p,async()=>report());await c.load(p,async()=>{throw Error('error');});c.restorePrevious();c.sync(pair('TOP').key);c.sync(p.key);assert.equal(c.state.restoredAfterError,true);await c.load(p,async()=>report('MID',6));assert.equal(c.state.restoredAfterError,false);assert.equal(c.peek(p.key).restoredAfterError,undefined);
});
test('explicit five-role batch recollects a restored pair instead of treating the failed refresh as complete',async()=>{
 const c=D.create(),p=pair();await c.load(p,async()=>report());await c.load(p,async()=>{throw Error('error');});c.restorePrevious();let calls=0;await D.createBatch().load([p],c,async()=>{calls++;return report('MID',5);});assert.equal(calls,2);assert.equal(c.peek(p.key).restoredAfterError,undefined);assert.equal(c.peek(p.key).sides[0].report.games,5);
});
test('actual recovery UI, overview, draft pools and export label restored data without a Riot request',async()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8'),nodes={},$=id=>nodes[id]??={value:'',disabled:false},op=team('Opponent'),home=team('UWU GANG');let fail=false,calls=0,html='';
 const c=vm.createContext({view:'TEAMS',DuelScouting:D,TeamScouting:T,ReportBuilder:R,S:{hasKey:true,ouat:{}},$,esc:String,document:{querySelectorAll:()=>[]},roleStatReport:r=>'SAMPLE '+r.games,patchReport:()=>'',window:{mw:{roleStats:async(_a,r)=>{calls++;if(fail)throw Error('Riot unavailable');return report(r);}}},render:()=>{html=c.duelPanel(op,home);c.bindDuel(op,home);}});
 vm.runInContext(app.slice(app.indexOf('let teamDivision='),app.indexOf('function groupBoardHtml(')),c);vm.runInContext(app.slice(app.indexOf('function preparationPanel('),app.indexOf('function bindPreparation(')),c);c.render();await nodes['#loadDuel'].onclick();fail=true;await nodes['#loadDuel'].onclick();assert.equal(calls,3);assert.match(html,/Revenir au rapport précédent \(daté\)/);assert.match(html,/Riot unavailable/);nodes['#restoreDuel'].onclick();assert.equal(calls,3);assert.match(html,/RAPPORT PRÉCÉDENT RESTAURÉ APRÈS ÉCHEC/);assert.match(html,/SAMPLE 3/);assert.match(c.teamOverviewPanel(op,home),/RAPPORT RESTAURÉ APRÈS ÉCHEC/);assert.match(c.draftPoolPanel(op,home),/RAPPORT RESTAURÉ APRÈS ÉCHEC/);assert.match(c.preparationPanel(op,home),/pas une actualisation réussie/);
});
