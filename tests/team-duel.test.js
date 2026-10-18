const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../src/renderer/duels'),T=require('../src/renderer/teams');
const account=name=>({gameName:name,tagLine:'EUW',platform:'EUW1'});
const team=(id)=>({id,name:id,players:T.roles.map(role=>({id:id+role,role,accounts:[account(id+role)]}))});
const pair=(role='MID')=>D.pair(team('opp'),team('home'),role,{},true);
const report=(role='MID',stop='target')=>({role,games:3,coverage:{stop}});
const rich=(role='MID',overrides={})=>({role,games:6,wins:3,winrate:50,interval:{low:19,high:81},kda:3,kills:4,deaths:4,assists:8,cspm:7,dpm:500,gpm:400,vision:20,coverage:{partial:false,stop:'target'},window:{stale:false},champions:[{name:'Ahri',games:3},{name:'Orianna',games:2}],patches:[{patch:'16.20',games:4},{patch:'16.19',games:2}],...overrides});
test('duel supports all five roles and respects manual selection without requiring a rank',()=>{
 for(const role of T.roles){const p=pair(role);assert.equal(p.ready,true);assert.equal(p.sides[0].player.role,role);}
 const t=team('opp');t.players.push({...t.players[0],id:'sub',accounts:[account('Sub')]});
 assert.equal(D.pair(t,team('home'),'TOP',{},true).ready,false);
 const p=D.pair(t,team('home'),'TOP',{opp:{TOP:'sub'}},true);assert.equal(p.ready,true);assert.equal(p.sides[0].player.id,'sub');assert.equal(p.sides[0].manual,true);
 assert.equal(D.pair(t,team('home'),'TOP',{opp:{TOP:'departed'}},true).ready,false);
});
test('duel rejects missing keys/accounts and same-account comparisons, not fabricated opponents',()=>{
 assert.equal(D.pair(team('a'),team('a'),'MID',{},true),null);assert.equal(D.pair(team('a'),null,'MID',{},true),null);
 assert.equal(D.pair(team('a'),team('b'),'MID',{},false).ready,false);
 const a=team('a'),b=team('b');a.players[2].accounts=[];assert.equal(D.pair(a,b,'MID',{},true).ready,false);
 a.players[2].accounts=b.players[2].accounts;assert.match(D.pair(a,b,'MID',{},true).sides[0].reason,/Même compte/);
});
test('account preference is limited to an actually linked account and changes invalidate identity',()=>{
 const t=team('a'),home=team('b'),first=D.pair(t,home,'MID',{},true);
 t.players[2].bestRankAccount=account('not-linked');assert.equal(D.pair(t,home,'MID',{},true).key,first.key);
 const preferred=account('Preferred');t.players[2].accounts.push(preferred);t.players[2].bestRankAccount={...preferred,gameName:'preferred'};
 const next=D.pair(t,home,'MID',{},true);assert.equal(next.sides[0].account,preferred);assert.notEqual(next.key,first.key);
});
test('loads two role reports sequentially, retaining measured zero-game results',async()=>{
 const c=D.create(),p=pair('SUPPORT'),calls=[];
 await c.load(p,async(a,r)=>{calls.push(a.gameName);assert.equal(r,'SUPPORT');return {role:r,games:0,coverage:{stop:'complete'}};});
 assert.deepEqual(calls,['oppSUPPORT','homeSUPPORT']);assert.equal(c.state.sides.length,2);assert.equal(c.state.loading,false);assert.equal(c.state.sides[1].report.games,0);
});
test('duplicate click and ordinary refresh do not create more Riot requests',async()=>{
 const c=D.create(),p=pair();let resolve,calls=0;
 const pending=c.load(p,async()=>{calls++;if(calls===1)return new Promise(r=>resolve=r);return report();});
 c.sync(p.key);await c.load(p,async()=>assert.fail('duplicate request'));assert.equal(c.state.loading,true);
 resolve(report());await pending;assert.equal(calls,2);
});
for(const stop of ['auth','rate_limit'])test('stops after first partial report on '+stop,async()=>{
 const c=D.create();let calls=0;await c.load(pair(),async()=>{calls++;return report('MID',stop);});
 assert.equal(calls,1);assert.equal(c.state.sides[0].report.coverage.stop,stop);assert.match(c.state.sides[1].error,/interrompue/);assert.equal(c.state.loading,false);
});
test('first-account error or mismatched role does not fan out extra requests',async()=>{
 for(const fetch of [async()=>{throw Error('403');},async()=>report('SUPPORT')]){
  let calls=0;const c=D.create();await c.load(pair(),async()=>{calls++;return fetch();});assert.equal(calls,1);assert.ok(c.state.sides[0].error);assert.ok(c.state.sides[1].error);
 }
});
test('navigation, account or role change discards late success and late failure',async()=>{
 for(const failure of [false,true]){
  const c=D.create();let resolve,reject,calls=0;const old=c.load(pair(),()=>{calls++;return new Promise((r,j)=>{resolve=r;reject=j;});});
  c.sync(pair('TOP').key);await c.load(pair('TOP'),async()=>report('TOP'));
  if(failure)reject(Error('obsolete'));else resolve(report());await old;
  assert.equal(c.state.sides[0].report.role,'TOP');assert.equal(calls,1);assert.equal(c.state.loading,false);
 }
 const c=D.create();let resolve;const old=c.load(pair(),()=>new Promise(r=>resolve=r));c.cancel();resolve(report());await old;assert.equal(c.state.sides.length,0);
});
test('standard mid comparison cache cannot shadow detailed timeline reports',async()=>{
 const source=fs.readFileSync('src/main.js','utf8'),fn=source.slice(source.indexOf('async function playerRoleStats('),source.indexOf('async function rankBatch('));let cacheRead,cacheWrite;
 const ctx=vm.createContext({document:{querySelectorAll:()=>[]},key:()=>true,require:p=>p.includes('ouat-roles')?{normalizeRole:r=>r}:{collectRoleReport:async()=>report()},Riot:function(){},statsCache:{read:()=>null,write:()=>({})},store:{get:k=>{cacheRead=k;return {};},set:k=>cacheWrite=k}});
 vm.runInContext(fn,ctx);await ctx.playerRoleStats(account('x'),'MID');assert.equal(cacheRead,'roleStatsCacheV5');assert.equal(cacheWrite,'roleStatsCacheV5');
});
test('team comparator UI launches selected role and renders both samples with limits',async()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8'),nodes={},$=id=>nodes[id]??={value:'MID',innerHTML:''},opp=team('opp'),home=team('home');let calls=0,html='';
 const ctx=vm.createContext({document:{querySelectorAll:()=>[]},DuelScouting:D,TeamScouting:T,$,S:{hasKey:true},view:'TEAMS',esc:String,roleStatReport:r=>`SAMPLE ${r.role} ${r.games}`,patchReport:()=> 'PATCH',window:{mw:{roleStats:async(a,role)=>{calls++;return report(role);}}},render:()=>{html=ctx.duelPanel(opp,home);ctx.bindDuel(opp,home);}});
 vm.runInContext(app.slice(app.indexOf('let teamDivision='),app.indexOf('function groupBoardHtml(')),ctx);ctx.render();
 nodes['#duelRole'].onchange({target:{value:'SUPPORT'}});await nodes['#loadDuel'].onclick();assert.equal(calls,2);assert.match(html,/SAMPLE SUPPORT 3/);assert.match(html,/pas des confrontations directes/);assert.match(html,/20 dernières SoloQ/);
});
test('descriptive synthesis exposes deltas, confidence intervals and sample sizes without a winner score',()=>{
 const c=D.compare(rich(),rich('MID',{games:4,winrate:25,interval:{low:7,high:59},kda:2,cspm:6,dpm:450,gpm:380,vision:18,champions:[{name:'ahri',games:2},{name:'Syndra',games:2}],patches:[{patch:'16.20',games:3}]}));
 assert.equal(c.games[0],6);assert.equal(c.games[1],4);assert.equal(c.metrics.find(m=>m.key==='winrate').delta,25);assert.equal(c.metrics.find(m=>m.key==='kda').delta,1);
 assert.deepEqual(c.intervals,[{low:19,high:81},{low:7,high:59}]);assert.deepEqual(c.champions.common,[{name:'Ahri',left:3,right:2}]);
 assert.deepEqual(c.champions.leftOnly,[{name:'Orianna',games:2}]);assert.deepEqual(c.champions.rightOnly,[{name:'Syndra',games:2}]);assert.deepEqual(c.patches,[{patch:'16.20',left:4,right:3}]);
 assert.equal('score' in c,false);assert.equal('winner' in c,false);
});
test('synthesis rejects zero-game or mismatched-role comparisons and marks collection limits',()=>{
 assert.equal(D.compare(rich(),{...rich(),games:0}),null);assert.equal(D.compare(rich('MID'),rich('TOP')),null);
 const c=D.compare(rich('SUPPORT',{coverage:{partial:true},window:{stale:true}}),rich('SUPPORT'));
 assert.deepEqual(c.limitations.partial,[true,false]);assert.deepEqual(c.limitations.stale,[true,false]);
});
test('malformed optional champion, patch and metric fields are excluded rather than fabricated',()=>{
 const c=D.compare(rich('ADC',{kda:NaN,champions:[{name:'',games:4},{name:'Jinx',games:0}],patches:[{patch:'',games:3}]}),rich('ADC'));
 assert.equal(c.metrics.some(m=>m.key==='kda'),false);assert.deepEqual(c.champions.leftOnly,[]);assert.deepEqual(c.champions.common,[]);assert.deepEqual(c.patches,[]);
});
test('rendered synthesis labels direction, common evidence and comparison limits',()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8'),ctx=vm.createContext({document:{querySelectorAll:()=>[]},DuelScouting:D,esc:String});
 vm.runInContext('let duelPatch="ALL",duelChampion="ALL";'+app.slice(app.indexOf('function duelSynthesis('),app.indexOf('function duelPanel(')),ctx);
 const p=pair(),state={sides:[{report:rich()},{report:rich('MID',{games:4,winrate:25,champions:[{name:'Ahri',games:2}],patches:[{patch:'16.20',games:3}]})}]},html=ctx.duelSynthesis(p,state);
 assert.match(html,/SYNTHÈSE DES ÉCHANTILLONS/);assert.match(html,/6 parties/);assert.match(html,/Écart descriptif/);assert.match(html,/\+25/);assert.match(html,/Ahri \(3G \/ 2G\)/);assert.match(html,/16\.20 \(4G \/ 3G\)/);assert.match(html,/ne mesurent pas le micro-gameplay/);
});
test('common patch selection sorts versions numerically and preserves collection warnings',()=>{
 const a=rich('MID',{byPatch:[{patch:'16.9',report:rich('MID',{games:2})},{patch:'16.20',report:rich('MID',{games:3,winrate:100})}],coverage:{partial:true,target:12}}),b=rich('MID',{byPatch:[{patch:'16.9',report:rich('MID',{games:1})},{patch:'16.20',report:rich('MID',{games:2,winrate:50})}]});
 assert.deepEqual(D.commonPatches([a,b]),['16.20','16.9']);const scoped=D.scopeReport(a,'16.20');assert.equal(scoped.games,3);assert.equal(scoped.winrate,100);assert.equal(scoped.coverage.partial,true);assert.equal(scoped.coverage.roleGames,3);assert.equal(scoped.coverage.targetReached,false);
 assert.equal(D.compare(scoped,D.scopeReport(b,'16.20')).metrics.find(m=>m.key==='winrate').delta,50);
 assert.equal(D.scopeReport(a,'ALL'),a);assert.equal(D.scopeReport(a,'unknown'),null);
});
test('missing legacy patch samples never invent a common scope or zero-valued metrics',()=>{
 assert.deepEqual(D.commonPatches([rich(),rich()]),[]);assert.deepEqual(D.commonPatches([rich()]),[]);
 const c=D.compare(rich('MID',{kda:null,cspm:'7',vision:''}),rich());for(const k of ['kda','cspm','vision'])assert.equal(c.metrics.some(m=>m.key===k),false);
 for(const games of [-1,'3',1.5])assert.equal(D.compare(rich('MID',{games}),rich()),null);
});
test('patch filter handler changes the rendered samples without further Riot calls',async()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8'),nodes={},$=id=>nodes[id]??={value:'',innerHTML:''},opp=team('opp'),home=team('home');let calls=0,html='';
 const r=rich('MID',{byPatch:[{patch:'16.20',report:rich('MID',{games:2})}]});
 const ctx=vm.createContext({document:{querySelectorAll:()=>[]},DuelScouting:D,TeamScouting:T,$,S:{hasKey:true},view:'TEAMS',esc:String,roleStatReport:r=>`SAMPLE ${r.games}`,patchReport:()=>'',window:{mw:{roleStats:async()=>{calls++;return r;}}},render:()=>{html=ctx.duelPanel(opp,home);ctx.bindDuel(opp,home);}});
 vm.runInContext(app.slice(app.indexOf('let teamDivision='),app.indexOf('function groupBoardHtml(')),ctx);ctx.render();await nodes['#loadDuel'].onclick();assert.equal(calls,2);assert.match(html,/SAMPLE 6/);
 nodes['#duelPatch'].onchange({target:{value:'16.20'}});assert.match(html,/SAMPLE 2/);assert.match(html,/patch commun 16.20 uniquement/);assert.equal(calls,2);
 nodes['#duelRole'].onchange({target:{value:'SUPPORT'}});assert.equal(vm.runInContext('duelPatch',ctx),'ALL');assert.doesNotMatch(html,/SAMPLE 2/);
});
