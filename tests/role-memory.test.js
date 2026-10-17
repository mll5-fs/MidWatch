const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../src/renderer/duels'),T=require('../src/renderer/teams'),R=require('../src/renderer/report');
const team=id=>({id,name:id,division:'Division 11',group:'Div 11D',players:T.roles.map(role=>({id:id+role,name:id+role,role,accounts:[{gameName:id+role,tagLine:'EUW'}]}))});
const pair=(role='MID',op=team('Opponent'),home=team('UWU GANG'),choices={})=>D.pair(op,home,role,choices,true);
const report=(role='MID',games=3)=>({role,games,winrate:67,sampledAt:1000,window:{oldestAt:100,newestAt:900},coverage:{stop:'target'},champions:[{name:'Fixture',games}],patches:[{patch:'16.20',games}]});
test('all five loaded roles are restored without extra fetches when switching roles',async()=>{
 const c=D.create();let calls=0;
 for(const role of T.roles)await c.load(pair(role),async()=>{calls++;return report(role);});
 for(const role of T.roles){c.sync(pair(role).key);assert.equal(c.state.reused,true);assert.equal(c.state.sides[0].report.role,role);assert.equal(c.state.sides[1].report.role,role);}
 assert.equal(calls,10);
});
test('cancel stops pending updates but retains completed role samples for navigation back',async()=>{
 const c=D.create();await c.load(pair('TOP'),async()=>report('TOP'));let resolve;
 const pending=c.load(pair('MID'),()=>new Promise(r=>resolve=r));c.cancel();resolve(report('MID'));await pending;
 assert.equal(c.peek(pair('MID').key),null);c.sync(pair('TOP').key);assert.equal(c.state.sides[0].report.role,'TOP');assert.equal(c.state.reused,true);
});
test('memory expires at 15 minutes, including an active role loaded at clock zero',async()=>{
 let time=0;const c=D.create({now:()=>time}),p=pair();await c.load(p,async()=>report());
 time=899999;assert.ok(c.peek(p.key));time=900000;assert.equal(c.peek(p.key),null);c.sync(p.key);assert.equal(c.state.sides.length,0);assert.equal(c.state.reused,false);
});
test('clock reversal does not substantiate a reusable memory',async()=>{
 let time=1000;const c=D.create({now:()=>time}),p=pair();await c.load(p,async()=>report());time=999;c.sync(p.key);assert.equal(c.state.sides.length,0);
});
test('explicit refresh fetches again while duplicate in-flight clicks remain ignored',async()=>{
 const c=D.create(),p=pair();let calls=0;const fetch=async()=>{calls++;return report();};await c.load(p,fetch);c.sync(pair('TOP').key);c.sync(p.key);assert.equal(calls,2);await c.load(p,fetch);assert.equal(calls,4);assert.equal(c.state.reused,false);
});
test('partial/error and zero-game reports are retained without inventing a complete comparison',async()=>{
 const c=D.create(),p=pair();await c.load(p,async()=>({...report(),coverage:{partial:true,stop:'rate_limit'}}));c.sync(pair('TOP').key);c.sync(p.key);
 assert.equal(c.state.sides[0].report.coverage.partial,true);assert.ok(c.state.sides[1].error);assert.equal(D.compare(c.state.sides[0].report,c.state.sides[1].report),null);
 await c.load(pair('TOP'),async()=>report('TOP',0));assert.equal(c.peek(pair('TOP').key).sides[0].report.games,0);
});
test('account and local lineup changes cannot restore another player/account report',async()=>{
 const c=D.create(),op=team('Opponent'),home=team('UWU GANG'),old=pair('MID',op,home);await c.load(old,async()=>report());
 op.players[2].accounts=[{gameName:'NewAccount',tagLine:'NEW'}];const changed=pair('MID',op,home);assert.notEqual(old.key,changed.key);c.sync(changed.key);assert.equal(c.state.sides.length,0);
 const sub={...op.players[2],id:'sub',accounts:[{gameName:'Sub',tagLine:'EUW'}]};op.players.push(sub);const manual=pair('MID',op,home,{Opponent:{MID:'sub'}});c.sync(manual.key);assert.equal(c.state.sides.length,0);
});
test('memory is bounded to thirty comparisons and evicted entries cannot be restored',async()=>{
 const c=D.create();let first,last;for(let i=0;i<31;i++){const p=pair('MID',team('Opponent'+i));first??=p;last=p;await c.load(p,async()=>report());}assert.equal(c.peek(first.key),null);assert.ok(c.peek(last.key));
});
test('multi-role preparation includes every loaded role and marks the others absent',()=>{
 const op=team('Opponent'),home=team('UWU GANG'),duels=['MID','SUPPORT'].map(role=>({pair:pair(role,op,home),reports:[report(role),report(role)],patch:'ALL'}));
 const text=R.build({team:op,home,duels,now:2000,riotKey:'SECRET'});assert.match(text,/ANALYSE SOLOQ CHARGÉE : MID/);assert.match(text,/ANALYSE SOLOQ CHARGÉE : SUPPORT/);assert.match(text,/Rôles sans analyse mémorisée : TOP, JUNGLE, ADC/);assert.doesNotMatch(text,/SECRET|autres rôles ne disposent/);
});
test('multi-role export retains each role scope and data limitations',()=>{
 const op=team('Opponent'),home=team('UWU GANG'),scoped={...report('MID',1),window:{stale:true},winrate:100},mid={...report(),coverage:{partial:true},byPatch:[{patch:'16.20',report:scoped}]};
 const text=R.build({team:op,home,duels:[{pair:pair('MID',op,home),reports:[mid,mid],patch:'16.20'},{pair:pair('TOP',op,home),reports:[report('TOP'),report('TOP')],patch:'ALL'}]});
 assert.match(text,/MID · patch 16.20/);assert.match(text,/1 parties au rôle MID/);assert.match(text,/TOP · toutes les parties retenues/);assert.match(text,/COLLECTE PARTIELLE/);assert.match(text,/DONNÉES ANCIENNES/);
});
test('duplicate role entries cannot duplicate report sections',()=>{
 const op=team('Opponent'),home=team('UWU GANG'),entry={pair:pair('MID',op,home),reports:[report(),report()]},text=R.build({team:op,home,duels:[entry,entry]});assert.equal((text.match(/ANALYSE SOLOQ CHARGÉE : MID/g)||[]).length,1);
});
test('a failed request with no measured report is not exported as a loaded analysis',()=>{
 const op=team('Opponent'),home=team('UWU GANG'),text=R.build({team:op,home,duels:[{pair:pair('MID',op,home),reports:[undefined,undefined]}]});
 assert.match(text,/Aucune comparaison SoloQ chargée/);assert.doesNotMatch(text,/ANALYSE SOLOQ CHARGÉE/);
});
test('actual role shortcuts restore reports with no additional API call and copy includes both loaded roles',async()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8'),op=team('Opponent'),home=team('UWU GANG'),nodes={},buttons=T.roles.map(role=>({dataset:{savedRole:role}}));let calls=0;
 const $=id=>nodes[id]??={innerHTML:'',textContent:'',value:''};
 const c=vm.createContext({view:'TEAMS',TeamScouting:T,DuelScouting:D,ReportBuilder:R,S:{hasKey:true,ouat:{}},$,esc:String,document:{querySelectorAll:selector=>selector==='[data-saved-role]'?buttons:[]},roleStatReport:s=>'REPORT '+s.role,patchReport:()=>'',window:{mw:{roleStats:async(_a,role)=>{calls++;return report(role);}}},render:()=>{c.duelPanel(op,home);c.bindDuel(op,home);}});
 vm.runInContext(app.slice(app.indexOf('let teamDivision='),app.indexOf('function groupBoardHtml(')),c);c.render();await nodes['#loadDuel'].onclick();buttons.find(b=>b.dataset.savedRole==='TOP').onclick();await nodes['#loadDuel'].onclick();buttons.find(b=>b.dataset.savedRole==='MID').onclick();
 assert.equal(calls,4);assert.equal(vm.runInContext('teamDuel.state.reused',c),true);assert.match(c.roleMemoryPanel(op,home),/MID · 2\/2 rapports/);assert.match(c.roleMemoryPanel(op,home),/TOP · 2\/2 rapports/);
 vm.runInContext(app.slice(app.indexOf('function preparationPanel('),app.indexOf('function bindPreparation(')),c);const html=c.preparationPanel(op,home);assert.match(html,/ANALYSE SOLOQ CHARGÉE : TOP/);assert.match(html,/ANALYSE SOLOQ CHARGÉE : MID/);assert.equal(calls,4);
});
