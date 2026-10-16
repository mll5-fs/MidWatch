const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../src/renderer/duels'),T=require('../src/renderer/teams');
const account=name=>({gameName:name,tagLine:'EUW',platform:'EUW1'});
const team=(id)=>({id,name:id,players:T.roles.map(role=>({id:id+role,role,accounts:[account(id+role)]}))});
const pair=(role='MID')=>D.pair(team('opp'),team('home'),role,{},true);
const report=(role='MID',stop='target')=>({role,games:3,coverage:{stop}});
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
 const ctx=vm.createContext({key:()=>true,require:p=>p.includes('ouat-roles')?{normalizeRole:r=>r}:{collectRoleReport:async()=>report()},Riot:function(){},statsCache:{read:()=>null,write:()=>({})},store:{get:k=>{cacheRead=k;return {};},set:k=>cacheWrite=k}});
 vm.runInContext(fn,ctx);await ctx.playerRoleStats(account('x'),'MID');assert.equal(cacheRead,'roleStatsCache');assert.equal(cacheWrite,'roleStatsCache');
});
test('team comparator UI launches selected role and renders both samples with limits',async()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8'),nodes={},$=id=>nodes[id]??={value:'MID',innerHTML:''},opp=team('opp'),home=team('home');let calls=0,html='';
 const ctx=vm.createContext({DuelScouting:D,TeamScouting:T,$,S:{hasKey:true},view:'TEAMS',esc:String,roleStatReport:r=>`SAMPLE ${r.role} ${r.games}`,patchReport:()=> 'PATCH',window:{mw:{roleStats:async(a,role)=>{calls++;return report(role);}}},render:()=>{html=ctx.duelPanel(opp,home);ctx.bindDuel(opp,home);}});
 vm.runInContext(app.slice(app.indexOf('let teamDivision='),app.indexOf('function groupBoardHtml(')),ctx);ctx.render();
 nodes['#duelRole'].onchange({target:{value:'SUPPORT'}});await nodes['#loadDuel'].onclick();assert.equal(calls,2);assert.match(html,/SAMPLE SUPPORT 3/);assert.match(html,/pas des confrontations directes/);assert.match(html,/20 dernières SoloQ/);
});
