const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../src/renderer/duels'),T=require('../src/renderer/teams'),R=require('../src/renderer/report'),{summarizeRole}=require('../src/services/role-report');
const at=Date.UTC(2026,9,18),positions={TOP:'TOP',JUNGLE:'JUNGLE',MID:'MIDDLE',ADC:'BOTTOM',SUPPORT:'UTILITY'},names={TOP:['Gnar','Jax','Camille'],JUNGLE:['Vi','LeeSin','Poppy'],MID:['Ahri','Yone','Lux'],ADC:['Jinx','Caitlyn','Ashe'],SUPPORT:['Leona','Braum','Lulu']};
const team=id=>({id,name:id,players:T.roles.map(role=>({id:id+role,name:id+role,role,accounts:[{gameName:id+role,tagLine:'EUW'}]}))});
function report(role='MID',home=false){
 const matches=[[names[role][home?1:0],'16.20.1',true],[names[role][home?1:0],'16.19.1',false],[names[role][2],'16.20.1',false]].map(([champion,patch,win],i)=>({metadata:{matchId:'EUW1_'+(1000+100*T.roles.indexOf(role)+(home?20:0)+i)},info:{queueId:420,gameVersion:patch,gameStartTimestamp:at-(i+1)*1000,participants:[{puuid:'p',teamPosition:positions[role],championName:champion,win,timePlayed:600,kills:2,deaths:1,assists:3,totalMinionsKilled:100,neutralMinionsKilled:0,totalDamageDealtToChampions:6000,goldEarned:4000,visionScore:10}]}}));
 return {...summarizeRole(matches,'p',role,at),coverage:{partial:false,target:12}};
}
const saved=(role='MID',loadedAt=0)=>({loadedAt,sides:[{report:report(role)},{report:report(role,true)}]});
const filters=role=>({patch:'16.20',mode:'SIDES',champion:'ALL',champions:names[role].slice(0,2)});
for(const role of T.roles)test(role+' stores an independent validated scope without changing reports or sharing mutable arrays',()=>{
 const m=D.createFilterMemory(),s=saved(role),f=filters(role),before=JSON.stringify(s);m.remember(role,s,f);f.champions[0]='NotObserved';const read=m.read(role,s);assert.deepEqual(read,filters(role));read.champions[0]='Changed';assert.deepEqual(m.read(role,s),filters(role));assert.equal(JSON.stringify(s),before);
});
test('invalid patches, modes and champions normalize to actual observations without inventing samples',()=>{
 const reports=saved().sides.map(s=>s.report);assert.deepEqual(D.normalizeFilters(reports,{patch:'unknown',mode:'bad',champion:'Missing',champions:['Missing','Yone']}),{patch:'ALL',mode:'COMMON',champion:'ALL',champions:['ALL','Yone']});
 assert.deepEqual(D.normalizeFilters(reports,{patch:'16.19',mode:'SIDES',champion:'Lux',champions:['Lux','Yone']}),{patch:'16.19',mode:'SIDES',champion:'ALL',champions:['ALL','Yone']});
});
test('replaced reports invalidate scopes even with the same collection millisecond; zero timestamps remain valid',()=>{
 const m=D.createFilterMemory(),s=saved();m.remember('mid',s,filters('MID'));assert.equal(m.read('mid',s).patch,'16.20');
 assert.equal(m.read('mid',saved()).patch,'ALL');m.remember('mid',s,filters('MID'));assert.equal(m.read('mid',{...s,loadedAt:1}).patch,'ALL');
});
test('scope memory cannot renew expired or future report memory',()=>{
 for(const time of [900000,-1]){let now=0;const c=D.create({now:()=>now}),m=D.createFilterMemory();c.save('mid',saved().sides);const s=c.peek('mid');m.remember('mid',s,filters('MID'));now=time;assert.equal(m.read('mid',c.peek('mid')).patch,'ALL');assert.equal(c.peek('mid'),null);}
});
test('memory is bounded and reset only removes the requested comparison keys',()=>{
 const m=D.createFilterMemory(),s=saved();for(let i=0;i<31;i++)m.remember('key'+i,s,filters('MID'));assert.equal(m.read('key0',s).patch,'ALL');assert.equal(m.read('key30',s).patch,'16.20');m.forget(['key30']);assert.equal(m.read('key30',s).patch,'ALL');assert.equal(m.read('key29',s).patch,'16.20');
});
function ui(){
 const app=fs.readFileSync('src/renderer/app.js','utf8'),op=team('Opponent'),home=team('UWU GANG'),nodes={},buttons=T.roles.map(role=>({dataset:{savedRole:role}}));let time=0,calls=0,html='';
 const $=id=>nodes[id]??={value:'',textContent:'',disabled:false};
 const c=vm.createContext({view:'TEAMS',DuelScouting:{...D,create:()=>D.create({now:()=>time})},TeamScouting:T,ReportBuilder:R,S:{hasKey:true,ouat:{}},$,esc:String,document:{querySelectorAll:s=>s==='[data-saved-role]'?buttons:[]},roleStatReport:r=>'SAMPLE '+r.role+' '+(r.selectedChampion||'ALL')+' '+r.games,patchReport:()=>'',window:{mw:{roleStats:async(a,r)=>{calls++;return report(r,a.gameName.startsWith('UWU GANG'));}}},render:()=>{html=c.duelPanel(op,home);c.preparationPanel(op,home);c.bindDuel(op,home);}});
 vm.runInContext(app.slice(app.indexOf('let teamDivision='),app.indexOf('function groupBoardHtml(')),c);vm.runInContext(app.slice(app.indexOf('function preparationPanel('),app.indexOf('function bindPreparation(')),c);c.render();
 return {c,nodes,buttons,op,home,calls:()=>calls,html:()=>html,advance:t=>time=t,select:(id,value)=>nodes[id].onchange({target:{value}}),pick:role=>{nodes['#duelRole'].onchange({target:{value:role}});nodes['#duelChampionMode'].onchange({target:{value:'SIDES'}});nodes['#duelPatch'].onchange({target:{value:'16.20'}});nodes['#duelSideChampion0'].onchange({target:{value:names[role][0]}});nodes['#duelSideChampion1'].onchange({target:{value:names[role][1]}});}};
}
test('actual five-role preparation retains every champion/patch choice in one export without extra Riot calls',async()=>{
 const x=ui();await x.nodes['#loadTeamDuels'].onclick();assert.equal(x.calls(),10);for(const role of T.roles)x.pick(role);
 const text=x.c.preparationPanel(x.op,x.home),analyses=text.split('ANALYSE SOLOQ CHARGÉE : ').slice(1).map(s=>s.split('POOLS OBSERVÉS')[0]);
 assert.match(text,/5\/5 rôles avec filtres actifs/);for(const role of T.roles){const block=analyses.find(s=>s.startsWith(role+' ·'));assert.ok(block,role);assert.match(block,/patch 16.20/);for(const champion of names[role].slice(0,2))assert.ok(block.includes('Champion sélectionné : '+champion));assert.match(block,/1 parties au rôle/);assert.doesNotMatch(block,/3 parties au rôle/);}
 x.select('#duelRole','MID');assert.equal(vm.runInContext('duelChampionFor(0)',x.c),'Ahri');assert.equal(vm.runInContext('duelChampionFor(1)',x.c),'Yone');assert.equal(vm.runInContext('duelPatch',x.c),'16.20');assert.match(x.html(),/SAMPLE MID Ahri 1/);assert.equal(x.calls(),10);
});
test('common champion and independent champion modes survive role shortcuts separately',async()=>{
 const x=ui();await x.nodes['#loadTeamDuels'].onclick();x.select('#duelChampion','Lux');x.pick('TOP');x.buttons.find(b=>b.dataset.savedRole==='MID').onclick();assert.equal(vm.runInContext('duelChampionMode',x.c),'COMMON');assert.equal(vm.runInContext('duelChampion',x.c),'Lux');x.buttons.find(b=>b.dataset.savedRole==='TOP').onclick();assert.equal(vm.runInContext('duelChampionMode',x.c),'SIDES');assert.equal(vm.runInContext('duelChampionFor(0)',x.c),'Gnar');assert.equal(x.calls(),10);
});
test('reset five scopes keeps reports, original memory age and pools without additional requests',async()=>{
 const x=ui();await x.nodes['#loadTeamDuels'].onclick();for(const role of T.roles)x.pick(role);const before=vm.runInContext('JSON.stringify(teamDuel.peek(teamDuel.state.key))',x.c),pools=x.c.draftPoolPanel(x.op,x.home);
 x.nodes['#resetTeamFilters'].onclick();assert.match(x.c.preparationPanel(x.op,x.home),/0\/5 rôles avec filtres actifs/);for(const role of T.roles){x.select('#duelRole',role);assert.equal(vm.runInContext('duelPatch',x.c),'ALL');assert.equal(vm.runInContext('duelChampionMode',x.c),'COMMON');}assert.equal(vm.runInContext('JSON.stringify(teamDuel.peek(teamDuel.state.key))',x.c),before);assert.equal(x.c.draftPoolPanel(x.op,x.home),pools);assert.equal(x.calls(),10);
});
test('other teams, account changes and expired memory cannot inherit a previous pair filter',async()=>{
 const x=ui();await x.nodes['#loadTeamDuels'].onclick();x.pick('MID');x.c.duelPanel(team('Other'),x.home);assert.equal(vm.runInContext('duelChampionMode',x.c),'COMMON');x.c.render();assert.equal(vm.runInContext('duelChampionFor(0)',x.c),'Ahri');
 x.op.players.find(p=>p.role==='MID').accounts[0].gameName='changed';x.c.render();assert.equal(vm.runInContext('duelChampionMode',x.c),'COMMON');assert.equal(x.calls(),10);
 const y=ui();await y.nodes['#loadTeamDuels'].onclick();y.pick('MID');y.advance(900000);y.c.render();assert.equal(vm.runInContext('duelChampionMode',y.c),'COMMON');assert.match(y.c.preparationPanel(y.op,y.home),/0\/5 rôles avec filtres actifs/);assert.equal(y.calls(),10);
});
test('refreshing another role invalidates its old scope when the stored report is replaced',async()=>{
 const x=ui();await x.nodes['#loadTeamDuels'].onclick();x.pick('MID');x.select('#duelRole','TOP');x.c.testOp=x.op;x.c.testHome=x.home;x.c.newReport=report();x.c.newHomeReport=report('MID',true);
 vm.runInContext('teamDuel.save(DuelScouting.pair(testOp,testHome,"MID",{},true).key,[{report:newReport},{report:newHomeReport}])',x.c);
 x.select('#duelRole','MID');assert.equal(vm.runInContext('duelChampionMode',x.c),'COMMON');assert.equal(vm.runInContext('duelPatch',x.c),'ALL');assert.match(x.html(),/SAMPLE MID ALL 3/);assert.equal(x.calls(),10);
});
