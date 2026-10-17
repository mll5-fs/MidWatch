const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {summarizeRole}=require('../src/services/role-report'),D=require('../src/renderer/duels'),T=require('../src/renderer/teams'),R=require('../src/renderer/report');
const date=Date.UTC(2026,9,17);
function match(champion='Ahri',patch='16.20.1',changes={}){return {info:{queueId:420,gameVersion:patch,gameStartTimestamp:date-86400000,participants:[{puuid:'p',teamPosition:'MIDDLE',championName:champion,win:true,kills:2,deaths:1,assists:3,timePlayed:600,totalMinionsKilled:100,neutralMinionsKilled:0,totalDamageDealtToChampions:6000,goldEarned:4000,visionScore:10,...changes}]}};}
const sample=()=>({...summarizeRole([match('Ahri'),match('Ahri','16.19.2',{win:false,kills:0,deaths:3,timePlayed:1200,totalMinionsKilled:200}),match('Orianna')],'p','MID',date),coverage:{partial:true,target:12}});
const team=id=>({id,name:id,players:T.roles.map(role=>({id:id+role,name:id+role,role,accounts:[{gameName:id+role,tagLine:'EUW'}]}))});
test('champion groups recompute means and time-weighted rates from actual retained matches',()=>{
 const r=sample(),s=D.scopeReport(r,'ALL','Ahri');assert.equal(r.games,3);assert.equal(s.games,2);assert.equal(s.winrate,50);assert.equal(s.kills,1);assert.equal(s.kda,2);assert.equal(s.cspm,10);assert.equal(s.champions.length,1);assert.equal(s.coverage.partial,true);assert.equal(s.selectedChampion,'Ahri');
 assert.equal(s.sampledAt,date);assert.equal(s.byChampion,undefined);assert.equal(s.byPatch,undefined);
});
test('patch and champion intersection uses only the matching games, not two independent aggregates',()=>{
 const r=sample(),s=D.scopeReport(r,'16.20','Ahri');assert.equal(s.games,1);assert.equal(s.winrate,100);assert.equal(s.kills,2);assert.equal(s.selectedPatch,'16.20');assert.match(s.scope,/champion Ahri/);
 assert.equal(D.scopeReport(r,'16.18','Ahri'),null);assert.equal(D.scopeReport(r,'16.19','Orianna'),null);
});
test('common champion options are scoped to selected patch and actual common reports',()=>{
 const a=sample(),b={...summarizeRole([match('Ahri'),match('Orianna','16.19.1')],'p','MID',date)};
 assert.deepEqual(D.commonChampions([a,b]),['Ahri','Orianna']);assert.deepEqual(D.commonChampions([a,b],'16.20'),['Ahri']);assert.deepEqual(D.commonChampions([a,b],'16.19'),[]);
 assert.deepEqual(D.commonChampions([a]),[]);assert.deepEqual(D.commonChampions([a,{...b,role:'SUPPORT'}]),[]);
});
test('missing champion or patch metadata never creates a fabricated filtered sample',()=>{
 const r=summarizeRole([match(undefined),match('Ahri','unknown'),match('Orianna','16.20.1',{championName:undefined})],'p','MID',date);
 assert.equal(r.games,3);assert.equal(D.scopeReport(r,'16.20','Inconnu'),null);assert.equal(D.scopeReport(r,'16.20','Ahri').games,1);assert.equal(D.scopeReport(r,'ALL','Ahri').games,2);
 const missing=summarizeRole([match('Orianna','16.20.1',{championName:undefined})],'p','MID',date);assert.deepEqual(missing.byChampion,[]);
});
test('champion grouping remains restricted to SoloQ and actual role for all five roles',()=>{
 for(const [riot,role]of [['TOP','TOP'],['JUNGLE','JUNGLE'],['MIDDLE','MID'],['BOTTOM','ADC'],['UTILITY','SUPPORT']]){
  const valid=match('Ahri','16.20.1',{teamPosition:riot}),other=match('Ahri','16.20.1',{teamPosition:role==='MID'?'TOP':'MIDDLE'}),flex=match('Ahri','16.20.1',{teamPosition:riot});flex.info.queueId=440;
  const r=summarizeRole([valid,other,flex],'p',role,date);assert.equal(D.scopeReport(r,'16.20','Ahri').games,1);
 }
});
test('invalid champion groups are not offered or substituted by an aggregate fallback',()=>{
 const base=sample(),bad={...base,byChampion:[{champion:'Fake',report:{role:'SUPPORT',games:3}},{champion:'Missing',report:{role:'MID',games:-1}}]};
 assert.deepEqual(D.commonChampions([bad,bad]),[]);assert.equal(D.scopeReport(bad,'ALL','Fake'),null);assert.equal(D.scopeReport(base,'ALL','NotObserved'),null);assert.equal(D.scopeReport(base,'ALL','ALL'),base);
});
test('nested grouping is finite and patch reports retain champion subgroups',()=>{
 const r=sample();assert.ok(r.byPatch[0].report.byChampion.length);for(const c of r.byPatch[0].report.byChampion){assert.equal(c.report.byChampion,undefined);assert.equal(c.report.byPatch,undefined);}assert.ok(JSON.stringify(r).length<50000);
});
test('team export identifies champion and patch and excludes all-champion totals',()=>{
 const op=team('Opponent'),home=team('UWU GANG'),raw=sample(),text=R.build({team:op,home,duels:[{pair:D.pair(op,home,'MID',{},true),reports:[raw,raw],patch:'16.20',champion:'Ahri'}],now:date});
 assert.match(text,/MID · patch 16.20 · champion Ahri/);assert.match(text,/1 parties au rôle MID/);assert.doesNotMatch(text,/3 parties au rôle MID|Orianna \(/);assert.match(text,/COLLECTE PARTIELLE/);
});
test('actual UI champion selection updates both reports without further Riot calls and resets on incompatible patch',async()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8'),op=team('Opponent'),home=team('UWU GANG'),nodes={};let calls=0;
 const $=id=>nodes[id]??={value:'',textContent:'',innerHTML:''};let html='';
 const c=vm.createContext({view:'TEAMS',TeamScouting:T,DuelScouting:D,ReportBuilder:R,S:{hasKey:true,ouat:{}},$,esc:String,document:{querySelectorAll:()=>[]},roleStatReport:s=>`REPORT ${s.games} ${s.selectedChampion||'ALL'}`,patchReport:()=>'',window:{mw:{roleStats:async()=>{calls++;return sample();}}},render:()=>{html=c.duelPanel(op,home);c.bindDuel(op,home);}});
 vm.runInContext(app.slice(app.indexOf('let teamDivision='),app.indexOf('function groupBoardHtml(')),c);c.render();await nodes['#loadDuel'].onclick();await nodes['#duelChampion'].onchange({target:{value:'Orianna'}});assert.equal(calls,2);assert.match(html,/REPORT 1 Orianna/);
 nodes['#duelPatch'].onchange({target:{value:'16.19'}});assert.equal(vm.runInContext('duelChampion',c),'ALL');assert.equal(calls,2);assert.match(html,/REPORT 1 ALL/);
});
