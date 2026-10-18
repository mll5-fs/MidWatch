const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../src/renderer/duels'),T=require('../src/renderer/teams'),R=require('../src/renderer/report'),{summarizeRole}=require('../src/services/role-report');
const at=Date.UTC(2026,9,18),positions={TOP:'TOP',JUNGLE:'JUNGLE',MID:'MIDDLE',ADC:'BOTTOM',SUPPORT:'UTILITY'};
const team=id=>({id,name:id,players:T.roles.map(role=>({id:id+role,name:id+role,role,accounts:[{gameName:id+role,tagLine:'EUW'}]}))});
function report(role='MID',home=false){
 const matches=(home?[['Yone','16.20.1',true],['Yone','16.19.1',false],['Zed','16.19.1',true]]:[['Ahri','16.20.1',true],['Ahri','16.20.1',false],['Lux','16.19.1',false]]).map(([champion,patch,win],i)=>({metadata:{matchId:'EUW1_'+((home?200:100)+i)},info:{queueId:420,gameVersion:patch,gameStartTimestamp:at-30*86400000-(i+1)*1000,participants:[{puuid:'p',teamPosition:positions[role],championName:champion,win,timePlayed:600,kills:2,deaths:1,assists:3,totalMinionsKilled:100,neutralMinionsKilled:0,totalDamageDealtToChampions:6000,goldEarned:4000,visionScore:10}]}}));
 return {...summarizeRole(matches,'p',role,at),coverage:{partial:true,target:12},window:{oldestAt:at-3000,newestAt:at-1000,stale:true}};
}
for(const role of T.roles)test(role+' independent choices and samples retain their own champion, patch, evidence and coverage',()=>{
 const a=report(role),b=report(role,true);assert.deepEqual(D.commonChampions([a,b]),[]);assert.deepEqual(D.championChoices(a),['Ahri','Lux']);assert.deepEqual(D.championChoices(b),['Yone','Zed']);
 const x=D.scopeReport(a,'16.20','Ahri'),y=D.scopeReport(b,'16.20','Yone'),c=D.compare(x,y);
 assert.deepEqual(c.games,[2,1]);assert.equal(x.winrate,50);assert.equal(y.winrate,100);assert.equal(x.evidence.length,2);assert.equal(y.evidence[0].champion,'Yone');assert.equal(x.sampledAt,at);assert.equal(x.coverage.partial,true);assert.deepEqual(c.limitations.partial,[true,true]);assert.equal(x.selectedChampion,'Ahri');assert.equal(y.selectedChampion,'Yone');
});
test('each choice list follows its own patch, including a champion absent from the other player',()=>{
 assert.deepEqual(D.championChoices(report(),'16.20'),['Ahri']);assert.deepEqual(D.championChoices(report('MID',true),'16.20'),['Yone']);
 assert.deepEqual(D.championChoices(report(),'16.19'),['Lux']);assert.deepEqual(D.championChoices(report(),'16.18'),[]);
});
test('legacy, malformed and wrong-role champion groups cannot create offered samples',()=>{
 const bad={role:'MID',games:3,byChampion:[{champion:'Wrong',report:{role:'TOP',games:1}},{champion:'Empty',report:{role:'MID',games:0}},{champion:'Bad',report:{role:'MID',games:-1}},{champion:'',report:{role:'MID',games:2}},{champion:'ALL',report:{role:'MID',games:1}}]};
 assert.deepEqual(D.championChoices(bad),[]);assert.deepEqual(D.championChoices({role:'MID',games:3}),[]);assert.deepEqual(D.championChoices(null),[]);assert.deepEqual(D.championChoices({role:'PRO',byChampion:report().byChampion}),[]);
 assert.equal(D.scopeReport(report(),'16.20','Lux'),null);
});
test('independent selection never mutates original reports or creates a direct matchup estimate',()=>{
 const a=report(),b=report('MID',true),before=JSON.stringify([a,b]);const c=D.compare(D.scopeReport(a,'ALL','Ahri'),D.scopeReport(b,'ALL','Yone'));
 assert.equal(JSON.stringify([a,b]),before);assert.equal(c.winner,undefined);assert.equal(c.score,undefined);assert.equal(c.matchupWinrate,undefined);
});
function exportText(choices=['Ahri','Yone'],patch='16.20'){
 const op=team('Opponent'),home=team('UWU GANG');return R.build({team:op,home,duels:[{pair:D.pair(op,home,'MID',{},true),reports:[report(),report('MID',true)],patch,champions:choices,restoredAfterError:true}],now:at}).split('POOLS OBSERVÉS')[0];
}
test('export labels both chosen champions and exports only their own patch intersections and sources',()=>{
 const text=exportText();assert.match(text,/CHAMPIONS SÉLECTIONNÉS SÉPARÉMENT/);assert.match(text,/Champion sélectionné : Ahri/);assert.match(text,/Champion sélectionné : Yone/);assert.match(text,/2 parties au rôle MID/);assert.match(text,/1 parties au rôle MID/);assert.match(text,/EUW1_100/);assert.match(text,/EUW1_200/);assert.doesNotMatch(text,/EUW1_102|EUW1_201|EUW1_202|3 parties au rôle MID/);assert.match(text,/COLLECTE PARTIELLE/);assert.match(text,/DONNÉES ANCIENNES/);assert.match(text,/RAPPORT PRÉCÉDENT RESTAURÉ/);assert.match(text,/pas des confrontations directes/);
});
test('export missing selected champion remains unavailable, never falls back to all-champion totals',()=>{
 const text=exportText(['NotObserved','Yone']);assert.match(text,/Champion sélectionné : NotObserved\n  Rapport non chargé ou aucune partie exploitable/);assert.doesNotMatch(text,/2 parties au rôle MID|3 parties au rôle MID/);assert.match(text,/1 parties au rôle MID/);
 const mixed=exportText(['ALL','Yone']);assert.match(mixed,/Champion sélectionné : tous ceux retenus/);assert.match(mixed,/2 parties au rôle MID/);
});
function ui(){
 const app=fs.readFileSync('src/renderer/app.js','utf8'),op=team('Opponent'),home=team('UWU GANG'),nodes={};let calls=0,html='';
 const $=id=>nodes[id]??={value:'',disabled:false,textContent:''};
 const c=vm.createContext({view:'TEAMS',DuelScouting:D,TeamScouting:T,ReportBuilder:R,S:{hasKey:true,ouat:{}},$,esc:String,document:{querySelectorAll:()=>[]},roleStatReport:r=>'SAMPLE '+(r.selectedChampion||'ALL')+' '+r.games+' '+(r.evidence||[]).map(e=>e.matchId).join(','),patchReport:()=>'',window:{mw:{roleStats:async(a,r)=>{calls++;return report(r,a.gameName.startsWith('UWU GANG'));}}},render:()=>{html=c.duelPanel(op,home);c.bindDuel(op,home);}});
 vm.runInContext(app.slice(app.indexOf('let teamDivision='),app.indexOf('function groupBoardHtml(')),c);vm.runInContext(app.slice(app.indexOf('function preparationPanel('),app.indexOf('function bindPreparation(')),c);c.render();
 return {c,nodes,op,home,html:()=>html,calls:()=>calls,select:(id,value)=>nodes[id].onchange({target:{value}})};
}
test('actual UI selects different champions and updates reports, synthesis and export without new Riot calls',async()=>{
 const x=ui();await x.nodes['#loadDuel'].onclick();x.select('#duelChampionMode','SIDES');x.select('#duelSideChampion0','Ahri');x.select('#duelSideChampion1','Yone');x.select('#duelPatch','16.20');
 assert.equal(x.calls(),2);assert.match(x.html(),/SAMPLE Ahri 2 EUW1_100,EUW1_101/);assert.match(x.html(),/SAMPLE Yone 1 EUW1_200/);assert.match(x.html(),/Opponent.*2 parties.*UWU GANG.*1 parties/);assert.match(x.html(),/pas des parties jouées l’un contre l’autre/);assert.match(x.c.preparationPanel(x.op,x.home),/Champion sélectionné : Ahri/);assert.match(x.c.preparationPanel(x.op,x.home),/Champion sélectionné : Yone/);
});
test('actual patch change resets only an incompatible side, with displayed all-champion scope',async()=>{
 const x=ui();await x.nodes['#loadDuel'].onclick();x.select('#duelChampionMode','SIDES');x.select('#duelSideChampion0','Ahri');x.select('#duelSideChampion1','Yone');x.select('#duelPatch','16.19');
 assert.equal(vm.runInContext('duelChampionFor(0)',x.c),'ALL');assert.equal(vm.runInContext('duelChampionFor(1)',x.c),'Yone');assert.match(x.html(),/Opponent — tous ceux retenus \/ UWU GANG — Yone/);assert.match(x.html(),/SAMPLE ALL 1 EUW1_102/);assert.match(x.html(),/SAMPLE Yone 1 EUW1_201/);assert.equal(x.calls(),2);
});
test('mode, role, team and account changes clear hidden independent selections',async()=>{
 const x=ui();await x.nodes['#loadDuel'].onclick();const pick=()=>{x.select('#duelChampionMode','SIDES');x.select('#duelSideChampion0','Ahri');x.select('#duelSideChampion1','Yone');};
 pick();x.select('#duelChampionMode','COMMON');assert.equal(vm.runInContext('duelChampion',x.c),'ALL');assert.equal(vm.runInContext('duelChampionFor(0)',x.c),'ALL');
 pick();x.select('#duelRole','TOP');assert.equal(vm.runInContext('duelChampionMode',x.c),'COMMON');x.select('#duelRole','MID');pick();x.c.duelPanel(team('Other'),x.home);assert.equal(vm.runInContext('duelChampionMode',x.c),'COMMON');
 x.c.render();pick();x.op.players.find(p=>p.role==='MID').accounts[0].gameName='changed';x.c.render();assert.equal(vm.runInContext('duelChampionMode',x.c),'COMMON');assert.equal(x.calls(),2);
});
test('independent detail filters leave the five-role overview and draft pools untouched',async()=>{
 const x=ui();await x.nodes['#loadDuel'].onclick();const overview=x.c.teamOverviewPanel(x.op,x.home),pools=x.c.draftPoolPanel(x.op,x.home);x.select('#duelChampionMode','SIDES');x.select('#duelSideChampion0','Ahri');x.select('#duelSideChampion1','Yone');assert.equal(x.c.teamOverviewPanel(x.op,x.home),overview);assert.equal(x.c.draftPoolPanel(x.op,x.home),pools);assert.equal(x.calls(),2);
});
