const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../src/renderer/duels'),T=require('../src/renderer/teams'),R=require('../src/renderer/report'),{summarizeRole}=require('../src/services/role-report');
const at=Date.UTC(2026,9,18),positions={TOP:'TOP',JUNGLE:'JUNGLE',MID:'MIDDLE',ADC:'BOTTOM',SUPPORT:'UTILITY'};
const team=id=>({id,name:id,players:T.roles.map(role=>({id:id+role,name:id+role,role,accounts:[{gameName:id+role,tagLine:'EUW'}]}))});
function report(role='MID'){
 const matches=[['Ahri',true,'16.20.1'],['Ahri',false,'16.20.1'],['Orianna',true,'16.19.1']].map(([champion,win,patch])=>({info:{queueId:420,gameVersion:patch,gameStartTimestamp:at-1000,participants:[{puuid:'p',teamPosition:positions[role],championName:champion,win,timePlayed:1800,kills:4,deaths:2,assists:8,totalMinionsKilled:180,neutralMinionsKilled:0,totalDamageDealtToChampions:18000,goldEarned:9000,visionScore:20}]}}));
 const r=summarizeRole(matches,'p',role,at);r.coverage={partial:false};return r;
}
const entry=(role='MID',left=report(role),right=report(role))=>({role,pair:D.pair(team('Opponent'),team('UWU GANG'),role,{},true),saved:{sides:[{report:left},{report:right}]}});
for(const role of T.roles)test(role+' draft pool shows all observed champions with measured frequency and exact win counts',()=>{
 const rows=D.draftPools([entry(role)]),side=rows.find(r=>r.role===role).sides[0];assert.equal(rows.length,5);assert.equal(side.poolStatus,'loaded');assert.equal(side.identifiedGames,3);assert.deepEqual(side.champions.map(c=>c.name),['Ahri','Orianna']);assert.equal(side.champions[0].share,66.7);assert.equal(side.champions[0].wins,1);assert.equal(side.champions[0].winrate,50);assert.equal(side.champions[1].limited,true);
});
test('global pool patch choices are a numeric union, not a false shared sample intersection',()=>{
 const e=entry(),other={...report(),byPatch:[{patch:'16.9',report:report()},{patch:'bad',report:report()},{patch:'16.30',report:{role:'ADC',games:5}}]};e.saved.sides[1].report=other;assert.deepEqual(D.draftPatches([e]),['16.20','16.19','16.9']);assert.deepEqual(D.draftPatches([entry('MID',{...report(),byPatch:{}},null)]),[]);
});
test('patch selection recomputes frequencies and separately marks unobserved side without zero mastery claims',()=>{
 const e=entry();e.saved.sides[1].report={...report(),byPatch:[]};const row=D.draftPools([e],'16.20').find(r=>r.role==='MID');assert.equal(row.sides[0].report.games,2);assert.equal(row.sides[0].champions.length,1);assert.equal(row.sides[0].champions[0].share,100);assert.equal(row.sides[1].poolStatus,'unobserved');assert.equal(row.sides[1].report,null);assert.deepEqual(row.sides[1].champions,[]);
});
test('missing, wrong-role, zero-game and absent champion data stay distinct',()=>{
 assert.equal(D.draftPools([])[0].sides[0].poolStatus,'missing');assert.equal(D.draftPools([entry('MID',report('ADC'))])[2].sides[0].poolStatus,'missing');assert.equal(D.draftPools([entry('MID',{role:'MID',games:0})])[2].sides[0].poolStatus,'empty');
 const r={...report(),champions:[{name:'Inconnu',games:2,wins:1},{name:'Ahri',games:1,wins:0}]},s=D.draftPools([entry('MID',r)])[2].sides[0];assert.equal(s.identifiedGames,1);assert.equal(s.champions[0].share,33.3);assert.equal(s.champions.length,1);
});
test('inconsistent counts and duplicate champions never yield an inflated pool frequency',()=>{
 for(const champions of [[{name:'A',games:4}],[{name:'A',games:'2'}],[{name:'A',games:2},{name:'a',games:1}],[{name:'A',games:2},{name:'B',games:2}]]){const s=D.draftPools([entry('MID',{...report(),champions})])[2].sides[0];assert.equal(s.poolStatus,'invalid');assert.deepEqual(s.champions,[]);}
});
test('unavailable champion victory counts are not inferred from rounded percentages',()=>{
 for(const wins of [undefined,null,'1',-1,3,NaN]){const r={...report(),champions:[{name:'Ahri',games:2,wins,winrate:100}]},c=D.draftPools([entry('MID',r)])[2].sides[0].champions[0];assert.equal(c.wins,null);assert.equal(c.winrate,null);assert.equal(c.share,66.7);}
});
test('partial and stale sample provenance remains attached after filtering without mutating reports',()=>{
 const r=report();r.coverage={partial:true,stop:'rate_limit'};r.byPatch[0].report.window.stale=true;const before=JSON.stringify(r),s=D.draftPools([entry('MID',r)],'16.20')[2].sides[0];assert.equal(s.report.coverage.partial,true);assert.equal(s.report.window.stale,true);assert.equal(JSON.stringify(r),before);
});
test('draft export uses its own stated patch scope without silently adopting detailed champion filters',()=>{
 const e=entry(),text=R.build({team:team('Opponent'),home:team('UWU GANG'),draftPatch:'16.20',duels:[{pair:e.pair,reports:e.saved.sides.map(s=>s.report),patch:'16.19',champion:'Orianna'}]}),pool=text.split('POOLS OBSERVÉS · PRÉPARATION DRAFT')[1];assert.match(pool,/patch 16.20/);assert.match(pool,/Ahri : 2\/2 \(100%\)/);assert.doesNotMatch(pool,/Orianna :/);assert.match(pool,/Pas le répertoire complet/);assert.match(pool,/JUNGLE.*\n  Rapport non chargé/);assert.match(text,/MID · patch 16.19 · champion Orianna/);
});
function ui(){
 const app=fs.readFileSync('src/renderer/app.js','utf8'),nodes={},$=id=>nodes[id]??={value:'',disabled:false};let op=team('Opponent'),home=team('UWU GANG'),html='',calls=0;
 const esc=v=>String(v).replaceAll('<','&lt;').replaceAll('>','&gt;'),c=vm.createContext({view:'TEAMS',DuelScouting:D,TeamScouting:T,ReportBuilder:R,S:{hasKey:true,ouat:{}},$,esc,document:{querySelectorAll:()=>[]},roleStatReport:()=>'',patchReport:()=>'',window:{mw:{roleStats:async(_a,r)=>{calls++;return report(r);}}},render:()=>{html=c.draftPoolPanel(op,home);c.duelPanel(op,home);c.bindDuel(op,home);}});
 vm.runInContext(app.slice(app.indexOf('let teamDivision='),app.indexOf('function groupBoardHtml(')),c);vm.runInContext(app.slice(app.indexOf('function preparationPanel('),app.indexOf('function bindPreparation(')),c);c.render();return {c,nodes,html:()=>html,calls:()=>calls,op:()=>op,home,change:()=>{op=team('Different');c.render();}};
}
test('actual pool patch handler updates all five roles and export without extra Riot calls',async()=>{
 const u=ui();await u.nodes['#loadTeamDuels'].onclick();assert.equal(u.calls(),10);assert.match(u.html(),/66.7%/);u.nodes['#draftPatch'].onchange({target:{value:'16.20'}});assert.equal(u.calls(),10);assert.match(u.html(),/2\/2 \(100%\)/);assert.doesNotMatch(u.html(),/<b>Orianna<\/b>/);assert.equal((u.html().split('CHAMPIONS OBSERVÉS SUR PLUSIEURS RÔLES')[0].match(/2\/2 \(100%\)/g)||[]).length,10);assert.equal((u.html().split('CHAMPIONS OBSERVÉS SUR PLUSIEURS RÔLES')[1].match(/2\/2 \(100%\)/g)||[]).length,10);assert.match(u.c.preparationPanel(u.op(),u.home),/PRÉPARATION DRAFT · patch 16.20/);assert.match(u.html(),/aucun appel Riot supplémentaire/);
});
test('switching team or invalid patch resets pool scope and never borrows another team memory',async()=>{
 const u=ui();await u.nodes['#loadTeamDuels'].onclick();u.nodes['#draftPatch'].onchange({target:{value:'16.20'}});u.change();assert.equal(vm.runInContext('draftPatch',u.c),'ALL');assert.doesNotMatch(u.html(),/66.7%|2\/2 \(100%\)/);assert.equal(u.calls(),10);u.nodes['#draftPatch'].onchange({target:{value:'unavailable'}});assert.equal(vm.runInContext('draftPatch',u.c),'ALL');assert.equal(u.calls(),10);
});
test('actual UI escapes names and retains all pool entries, not only the prior top three',async()=>{
 const u=ui(),e=entry(),r={...report(),games:5,champions:Array.from({length:5},(_,i)=>({name:i===0?'<img src=x>':'Champion'+i,games:1,wins:0}))};
 vm.runInContext('globalThis.saveDraftFixture=(p,r)=>teamDuel.save(p.key,[{report:r},{report:r}])',u.c);u.c.saveDraftFixture(e.pair,r);const html=u.c.draftPoolPanel(team('Opponent'),team('UWU GANG'));assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img/);assert.match(html,/Champion4/);
});
