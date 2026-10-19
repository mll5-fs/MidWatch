const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const T=require('../src/renderer/teams'),D=require('../src/renderer/duels'),R=require('../src/renderer/report');
const now=Date.UTC(2026,9,19,13),app=fs.readFileSync('src/renderer/app.js','utf8');
const team=id=>({id,name:id,division:'D11',group:'D',players:T.roles.map(role=>({id:id+role,name:id+' '+role,teamId:id,team:id,division:'D11',group:'D',role,accounts:[{gameName:id+role,tagLine:'EUW'}],rankStatus:'ranked',rankCheckedAt:now,bestRank:{tier:'GOLD',rank:'II',leaguePoints:50}}))});
const sample=(role='MID',champion='Ahri',games=2)=>({role,games,winrate:50,cspm:7,kda:3,sampledAt:now,window:{oldestAt:now-100000,newestAt:now-1000},coverage:{partial:false},champions:[{name:champion,games}],evidence:Array.from({length:games},(_,i)=>({matchId:'EUW1_'+(100+i),role,champion,win:!!(i%2),startedAt:now-10000,patch:'16.20'}))});
function fixture(){const a=team('Opponent'),b=team('UWU GANG'),pair=D.pair(a,b,'MID',{},true);return {a,b,analysis:{pair,reports:[sample(),sample('MID','Yone')],patch:'ALL',champion:'ALL'}};}
const build=(f,extra={})=>R.buildBrief({team:f.a,home:f.b,duels:[f.analysis],version:'5.26.0',now,...extra});
test('brief covers five roles, means, coverage, limits and public provenance without private fields',()=>{
 const f=fixture(),text=build(f,{riotKey:'SECRET',settings:{password:'PRIVATE'},leaguePath:'PRIVATE_PATH'});for(const role of T.roles)assert.equal((text.match(new RegExp('^'+role+' ·','gm'))||[]).length,1);assert.match(text,/FICHE EXPRESS/);assert.match(text,/5\/5 rôles/);assert.match(text,/Mêmes rôles : 5\/5/);assert.match(text,/100 points\/division/);assert.match(text,/Pas le MMR réel/);assert.match(text,/12 parties au rôle parmi les 20/);assert.match(text,/pas des confrontations directes/);assert.doesNotMatch(text,/SECRET|PRIVATE/);
});
test('missing home or selecting UWU itself does not invent an opponent roster or stats',()=>{
 const f=fixture();assert.match(build(f,{home:null}),/UWU GANG introuvable/);assert.doesNotMatch(build(f,{home:null}),/Moyenne UWU GANG|WR \(%\) 50/);assert.equal((build(f,{home:f.a}).match(/^Opponent :/gm)||[]).length,5);assert.throws(()=>R.buildBrief({}),/Aucune équipe/);
});
test('stale ranks and removed account are excluded at generation time without rewriting values',()=>{
 const f=fixture();f.a.players[0].rankCheckedAt=now-900000;f.a.players[1].bestRankAccount={gameName:'REMOVED',tagLine:'EUW'};f.a.players[1].bestRank={tier:'CHALLENGER',leaguePoints:1234};const before=JSON.stringify(f),text=build(f);assert.match(text,/3\/5 rôles · PARTIEL/);assert.match(text,/rang périmé/);assert.match(text,/compte du rang absent/);assert.doesNotMatch(text,/1234 LP/);assert.equal(JSON.stringify(f),before);
});
test('each side follows the stored patch and independent champion, not the unfiltered pool',()=>{
 const f=fixture();f.analysis.patch='16.20';f.analysis.champions=['Ahri','Yone'];f.analysis.reports=f.analysis.reports.map((s,i)=>({...s,games:8,champions:[{name:'UNFILTERED',games:8}],byPatch:[{patch:'16.20',report:{...s,byChampion:[{champion:i?'Yone':'Ahri',report:s}]}}]}));const text=build(f);assert.match(text,/MID · patch 16.20/);assert.match(text,/2 parties · champion Ahri/);assert.match(text,/2 parties · champion Yone/);assert.doesNotMatch(text,/UNFILTERED|8 parties/);assert.match(text,/pas le filtre indépendant des pools draft/);
});
test('common champion and absent patch never fall back to unfiltered data',()=>{
 const f=fixture();f.analysis.champion='Ahri';f.analysis.reports=f.analysis.reports.map(s=>({...s,byChampion:[{champion:'Ahri',report:sample()}]}));assert.match(build(f),/champion Ahri/);f.analysis.patch='99.99';assert.doesNotMatch(build(f),/WR \(%\) 50/);assert.match(build(f),/rapport non chargé ou indisponible/);
});
test('zero games is a scoped absence, not a missing report or a zero-valued winrate',()=>{
 const f=fixture();f.analysis.reports[0]={...sample(),games:0,champions:[],evidence:[]};const text=build(f);assert.match(text,/0 parties/);assert.match(text,/pas une absence de maîtrise/);assert.equal((text.match(/WR \(%\) 50/g)||[]).length,1);
});
test('wrong role, other team, changed player or changed account cannot leak a stored report',()=>{
 for(const change of [f=>f.analysis.pair.sides[0].teamId='Other',f=>f.analysis.pair.sides[0].player={...f.analysis.pair.sides[0].player,id:'other'},f=>f.analysis.pair.sides[0].account={gameName:'other',tagLine:'EUW'},f=>f.analysis.pair.role='TOP']){const f=fixture();change(f);assert.doesNotMatch(build(f),/WR \(%\) 50/);}
 const f=fixture();f.analysis.reports=[{...sample(),role:'SUPPORT'},null];assert.doesNotMatch(build(f),/WR \(%\) 50/);
});
test('partial, old, loading, restored and small samples remain explicit',()=>{
 const f=fixture();f.analysis.loading=true;f.analysis.restoredAfterError=true;f.analysis.reports[0].coverage={partial:true,duplicateIds:2};f.analysis.reports[0].window.stale=true;const text=build(f);for(const word of ['ÉCHANTILLON FAIBLE','COLLECTE PARTIELLE','DONNÉES ANCIENNES','COLLECTE EN COURS','RESTAURÉ APRÈS ÉCHEC','INTÉGRITÉ'])assert.ok(text.includes(word));assert.match(text,/collecte 2026-10-19/);
});
test('only three observed champions are listed by frequency and input order is preserved',()=>{
 const f=fixture(),s=f.analysis.reports[0];s.games=10;s.champions=[{name:'Fourth',games:1},{name:'Third',games:2},{name:'Second',games:3},{name:'First',games:4}];const before=JSON.stringify(s),text=build(f);assert.match(text,/First 4\/10G, Second 3\/10G, Third 2\/10G/);assert.doesNotMatch(text,/Fourth/);assert.match(text,/autres dans le rapport détaillé/);assert.equal(JSON.stringify(s),before);
});
test('source identifiers are unique, validated, role-scoped and capped to three listed',()=>{
 const f=fixture(),s=f.analysis.reports[0];s.games=5;s.evidence=[...sample('MID','Ahri',5).evidence,{role:'SUPPORT',win:true,matchId:'EUW1_999'},s.evidence[0],{role:'MID',win:true,matchId:'<bad>'}];const text=build(f);assert.match(text,/EUW1_100, EUW1_101, EUW1_102 · 2 autres/);assert.doesNotMatch(text,/EUW1_999|<bad>/);
});
test('old reports and malformed champion collections do not fabricate missing traceability',()=>{
 const f=fixture();f.analysis.reports.forEach(s=>{delete s.evidence;s.champions={bad:true};});assert.match(build(f),/Sources Match-v5.*indisponibles, recollecter/);f.analysis.reports[0].champions=[null,{name:'Bad',games:999}];assert.doesNotMatch(build(f),/Bad 999/);
});
test('duplicate or over-total champion pools are refused using the shared pool validation',()=>{
 for(const champions of [[{name:'Ahri',games:2},{name:'ahri',games:1}],[{name:'Ahri',games:2},{name:'Yone',games:2}]]){const f=fixture();f.analysis.reports[0].champions=champions;const text=build(f);assert.match(text,/POOL INCOHÉRENT/);assert.doesNotMatch(text,/Ahri 2\/2G/);}
});
test('ambiguous and departed local selections remain explicit instead of choosing an invented starter',()=>{
 const f=fixture();f.a.players.push({...f.a.players[0],id:'sub',name:'Sub'});let text=build(f);assert.match(text,/plusieurs joueurs, aucun choix local/);text=build(f,{lineups:{Opponent:{TOP:'sub'}}});assert.match(text,/Sub.*choix local, non confirmé LEA/);text=build(f,{lineups:{Opponent:{TOP:'gone'}}});assert.match(text,/choix local absent/);
});
function ui(){
 const f=fixture(),nodes={'#copyPreparation':{},'#preparationPreview':{textContent:'detailed unchanged'},'#copyTeamBrief':{},'#teamBriefPreview':{textContent:'old preview'}},messages=[],copies=[];let time=now,ps=[...f.a.players,...f.b.players],fail=false,calls=0;
 const cache=D.create({now:()=>time});cache.save(f.analysis.pair.key,f.analysis.reports.map(report=>({report})));
 const c=vm.createContext({TeamScouting:T,ReportBuilder:{...R,build:args=>R.build({...args,now:time}),buildBrief:args=>R.buildBrief({...args,now:time})},S:{lineups:{},version:'5.26.0',ouat:{}},roleMemories:(a,b)=>T.roles.map(role=>{const pair=D.pair(a,b,role,{},true);return {role,pair,saved:pair?cache.peek(pair.key):null};}),roleFilters:{read:()=>({patch:'ALL',champion:'ALL',mode:'COMMON'})},duelRole:'MID',teamDuel:{state:{loading:false}},draftPatch:'ALL',allPlayers:()=>ps,$:id=>nodes[id],notice:s=>messages.push(s),window:{mw:{copyReport:async text=>{if(fail)throw Error('clipboard');copies.push(text);},roleStats:()=>{calls++;throw Error('Unexpected Riot request');}}},esc:v=>String(v??'').replaceAll('<','&lt;').replaceAll('>','&gt;')});
 vm.runInContext(app.slice(app.indexOf('function preparationPanel('),app.indexOf('function bindGroupRanks(')),c);c.bindPreparation(f.a,f.b);
 return {f,c,nodes,messages,copies,calls:()=>calls,advance:n=>time+=n,replace:v=>ps=v,fail:()=>fail=true};
}
test('actual preview and controls expose an escaped brief without removing the detailed export',()=>{
 const x=ui();x.f.a.name='<img src=x>';const html=x.c.preparationPanel(x.f.a,x.f.b);assert.match(html,/Copier la fiche express/);assert.match(html,/id="teamBriefPreview"/);assert.match(html,/id="copyPreparation"/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x>/);assert.equal(x.calls(),0);
});
test('actual brief copy regenerates current ranks and expired report memory at the click, without render or Riot',async()=>{
 const x=ui();await x.nodes['#copyTeamBrief'].onclick();assert.match(x.copies[0],/5\/5 rôles/);assert.match(x.copies[0],/Ahri/);x.advance(900000);await x.nodes['#copyTeamBrief'].onclick();assert.match(x.copies[1],/0\/5 rôles/);assert.doesNotMatch(x.copies[1],/Ahri/);assert.match(x.copies[1],/rapport non chargé/);assert.equal(x.nodes['#teamBriefPreview'].textContent,x.copies[1]);assert.equal(x.calls(),0);assert.equal(x.nodes['#copyTeamBrief'].disabled,false);
});
test('clipboard failure or removed current team restores the button and never claims a copy',async()=>{
 const x=ui();x.fail();await x.nodes['#copyTeamBrief'].onclick();assert.equal(x.copies.length,0);assert.match(x.messages[0],/non copiée/);assert.equal(x.nodes['#copyTeamBrief'].disabled,false);const y=ui();y.replace(y.f.b.players);await y.nodes['#copyTeamBrief'].onclick();assert.equal(y.copies.length,0);assert.match(y.messages[0],/non copiée/);assert.equal(y.calls(),0);
});
test('detailed copy regenerates ranks and expires reports at click without render or Riot',async()=>{
 const x=ui();await x.nodes['#copyPreparation'].onclick();assert.match(x.copies[0],/5\/5 rôles/);assert.match(x.copies[0],/Ahri/);x.advance(900000);await x.nodes['#copyPreparation'].onclick();assert.match(x.copies[1],/0\/5 rôles/);assert.doesNotMatch(x.copies[1],/Ahri/);assert.equal(x.nodes['#preparationPreview'].textContent,x.copies[1]);assert.equal(x.calls(),0);assert.equal(x.nodes['#copyPreparation'].disabled,false);
});
test('detailed copy uses replacement roster objects, not captured team players',async()=>{
 const x=ui();const ps=[...x.f.a.players.map(p=>({...p,name:'CURRENT '+p.role})),...x.f.b.players];x.replace(ps);await x.nodes['#copyPreparation'].onclick();assert.match(x.copies[0],/CURRENT TOP/);assert.doesNotMatch(x.copies[0],/Opponent TOP/);assert.equal(x.calls(),0);
});
test('detailed copy refuses a removed selected team instead of copying old preview',async()=>{
 const x=ui();x.replace(x.f.b.players);await x.nodes['#copyPreparation'].onclick();assert.equal(x.copies.length,0);assert.match(x.messages[0],/Copie impossible/);assert.equal(x.nodes['#copyPreparation'].disabled,false);assert.equal(x.calls(),0);
});
test('detailed clipboard failure keeps a fresh selectable preview and restores control',async()=>{
 const x=ui();x.fail();await x.nodes['#copyPreparation'].onclick();assert.equal(x.copies.length,0);assert.notEqual(x.nodes['#preparationPreview'].textContent,'detailed unchanged');assert.match(x.nodes['#preparationPreview'].textContent,/Ahri/);assert.match(x.messages[0],/Copie impossible/);assert.equal(x.nodes['#copyPreparation'].disabled,false);
});
test('detailed copy masks a removed rank account at click without mutating source',async()=>{
 const x=ui();x.f.a.players[0].bestRankAccount={gameName:'REMOVED',tagLine:'EUW'};x.f.a.players[0].bestRank={tier:'CHALLENGER',leaguePoints:1234};const before=JSON.stringify(x.f.a);await x.nodes['#copyPreparation'].onclick();assert.doesNotMatch(x.copies[0],/1234 LP/);assert.equal(JSON.stringify(x.f.a),before);assert.equal(x.calls(),0);
});
test('detailed copy uses current composition and drops reports from a replaced account',async()=>{
 const x=ui();const sub={...x.f.a.players[2],id:'sub',name:'Selected substitute',accounts:[{gameName:'NEW',tagLine:'EUW'}]};x.f.a.players.push(sub);x.replace([...x.f.a.players,...x.f.b.players]);x.c.S.lineups={Opponent:{MID:'sub'}};await x.nodes['#copyPreparation'].onclick();assert.match(x.copies[0],/Selected substitute/);assert.doesNotMatch(x.copies[0],/Ahri/);assert.equal(x.calls(),0);
});
test('detailed copy forwards current independent draft patch and stored comparison filters',async()=>{
 const x=ui();let args;x.c.ReportBuilder.build=value=>{args=value;return 'Current filtered report';};x.c.draftPatch='16.20';x.c.roleFilters.read=()=>({patch:'16.19',champion:'Ahri',mode:'COMMON'});await x.nodes['#copyPreparation'].onclick();assert.equal(args.draftPatch,'16.20');assert.equal(args.duels[0].patch,'16.19');assert.equal(args.duels[0].champion,'Ahri');assert.equal(x.copies[0],'Current filtered report');assert.equal(x.calls(),0);
});
test('detailed copy with missing UWU cannot export the captured former opponent',async()=>{
 const x=ui();x.replace(x.f.a.players);await x.nodes['#copyPreparation'].onclick();assert.match(x.copies[0],/UWU GANG introuvable/);assert.doesNotMatch(x.copies[0],/Yone/);assert.equal(x.calls(),0);
});
