const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const role=require('../src/services/role-report'),scouting=require('../src/services/scouting'),cache=require('../src/services/stats-cache'),{buildCoverage}=require('../src/services/sample-coverage'),D=require('../src/renderer/duels'),T=require('../src/renderer/teams'),R=require('../src/renderer/report');
const at=Date.UTC(2026,9,18),account={gameName:'Fixture',tagLine:'EUW',platform:'EUW1'};
function match(position='MIDDLE',id='EUW1_100',champion='Ahri',patch='16.20.1'){
 return {metadata:{matchId:id,participants:['PRIVATE-PUUID']},info:{queueId:420,gameStartTimestamp:at-86400000,gameVersion:patch,participants:[{puuid:'p',teamPosition:position,championName:champion,win:true,timePlayed:1800,kills:6,deaths:2,assists:8,totalMinionsKilled:180,neutralMinionsKilled:0,totalDamageDealtToChampions:15000,goldEarned:10000,visionScore:20,secret:'DO-NOT-EXPORT'}]}};
}
for(const [position,name]of [['TOP','TOP'],['JUNGLE','JUNGLE'],['MIDDLE','MID'],['BOTTOM','ADC'],['UTILITY','SUPPORT']])test(name+' keeps one auditable evidence row per accepted game without exposing raw participant data',()=>{
 const m=match(position),before=JSON.stringify(m),r=role.summarizeRole([m],'p',name,at),e=r.evidence[0];assert.equal(r.evidence.length,r.games);assert.equal(e.matchId,'EUW1_100');assert.equal(e.idSource,'metadata');assert.equal(e.startedAt,at-86400000);assert.equal(e.role,name);assert.equal(e.champion,'Ahri');assert.equal(e.patch,'16.20');assert.equal(e.win,true);assert.equal(e.seconds,1800);assert.equal(e.kills,6);assert.deepEqual(e.omittedStats,[]);assert.equal(JSON.stringify(m),before);assert.doesNotMatch(JSON.stringify(r.evidence),/PRIVATE-PUUID|DO-NOT-EXPORT|puuid|participants|secret/);
});
test('off-role, non-SoloQ and invalid games never leak into the evidence sample',()=>{
 const bad=match('MIDDLE','EUW1_200');bad.info.participants[0].visionScore=null;const custom=match('MIDDLE','EUW1_300');custom.info.queueId=0;
 const r=role.summarizeRole([match(),match('TOP','EUW1_400'),bad,custom],'p','MID',at);assert.equal(r.games,1);assert.equal(r.evidence.length,1);assert.equal(r.evidence[0].matchId,'EUW1_100');
});
test('missing identifiers, champions, patches and invalid dates stay explicitly absent, not fabricated',()=>{
 const m=match('MIDDLE',undefined,'','unknown');delete m.metadata.matchId;m.info.gameStartTimestamp=Date.UTC(2100,0,1);const r=role.summarizeRole([m],'p','MID',at),e=r.evidence[0];for(const key of ['matchId','idSource','startedAt','champion','patch'])assert.equal(e[key],null,key);
 m.info.gameCreation=at-1000;assert.equal(role.summarizeRole([m],'p','MID',at).evidence[0].startedAt,at-1000);
 m.metadata.matchId='javascript:bad';assert.equal(role.summarizeRole([m],'p','MID',at).evidence[0].matchId,null);
});
test('omitted numeric zero convention is attributable to specific games and fields',()=>{
 const m=match();delete m.info.participants[0].kills;delete m.info.participants[0].neutralMinionsKilled;m.info.participants[0].win=false;
 const e=role.summarizeRole([m],'p','MID',at).evidence[0];assert.equal(e.kills,0);assert.equal(e.win,false);assert.deepEqual(e.omittedStats,['kills','neutralMinionsKilled']);
});
test('patch and champion intersections carry only their own source rows in original sample order',()=>{
 const r=role.summarizeRole([match('MIDDLE','EUW1_1'),match('MIDDLE','EUW1_2','Syndra'),match('MIDDLE','EUW1_3','Ahri','16.19.1')],'p','MID',at);
 assert.deepEqual(D.scopeReport(r,'16.20','Ahri').evidence.map(e=>e.matchId),['EUW1_1']);assert.deepEqual(D.scopeReport(r,'ALL','Ahri').evidence.map(e=>e.matchId),['EUW1_1','EUW1_3']);assert.deepEqual(D.scopeReport(r,'16.20').evidence.map(e=>e.matchId),['EUW1_1','EUW1_2']);assert.equal(D.scopeReport(r,'16.18'),null);
});
test('collector records a real requested Match-v5 ID when metadata omits it, without extra API calls',async()=>{
 let calls=0;const m=match();delete m.metadata.matchId;const original=JSON.stringify(m),api={resolveAccount:async()=>({...account,puuid:'p'}),matchIds:async()=>['EUW1_987'],match:async()=>{calls++;return m;},timeline:()=>assert.fail('No timeline')};
 const r=await role.collectRoleReport(api,account,'MID',{now:()=>at});assert.equal(calls,1);assert.equal(r.evidence[0].matchId,'EUW1_987');assert.equal(r.evidence[0].idSource,'request');assert.equal(JSON.stringify(m),original);
});
test('auth and quota partial reports preserve only the sources already collected',async()=>{
 for(const status of [403,429]){const api={resolveAccount:async()=>({...account,puuid:'p'}),matchIds:async()=>['EUW1_1','EUW1_2','EUW1_3'],match:async(_p,id)=>{if(id==='EUW1_1')return match();throw Object.assign(Error('blocked'),{status});}};const r=await role.collectRoleReport(api,account,'MID',{now:()=>at});assert.equal(r.games,1);assert.equal(r.evidence.length,1);assert.equal(r.coverage.partial,true);assert.equal(r.coverage.matchAttempts,2);}
});
function evidenceUI(){
 const app=fs.readFileSync('src/renderer/app.js','utf8'),esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),c=vm.createContext({esc});vm.runInContext(app.slice(app.indexOf('function matchEvidenceReport('),app.indexOf('function sampleWindowReport(')),c);return c;
}
test('actual evidence UI is expandable, escaped, dated and transparent about legacy or absent fields',()=>{
 const c=evidenceUI(),r=role.summarizeRole([match('MIDDLE','EUW1_1','<img src=x>')],'p','MID',at),html=c.matchEvidenceReport(r);assert.match(html,/<details class="match-evidence">/);assert.match(html,/Parties sources · 1\/1 · MID/);assert.match(html,/EUW1_1/);assert.match(html,/Victoire/);assert.match(html,/30:00/);assert.match(html,/6\/2\/8/);assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img/);
 assert.match(c.matchEvidenceReport({games:3}),/rapport ancien/);assert.equal(c.matchEvidenceReport({games:0}),'');const e=r.evidence[0];e.matchId=null;e.startedAt=null;e.patch=null;assert.match(c.matchEvidenceReport(r),/Identifiant indisponible/);assert.match(c.matchEvidenceReport(r),/Date indisponible/);
});
test('team export uses scoped evidence IDs and excludes arbitrary raw fields and other patch samples',()=>{
 const r=role.summarizeRole([match('MIDDLE','EUW1_1'),match('MIDDLE','EUW1_2','Syndra','16.19.1')],'p','MID',at),team=id=>({id,name:id,players:[]}),pair={role:'MID',sides:[{teamName:'Opponent',player:{name:'Fixture'}},{teamName:'UWU GANG',player:{name:'Home'}}]};r.evidence[0].secret='SHOULD-NOT-SHOW';
 const text=R.build({team:team('op'),home:team('home'),duels:[{pair,reports:[r,r],patch:'16.20',champion:'Ahri'}]});assert.match(text,/PARTIES SOURCES/);assert.match(text,/EUW1_1/);assert.doesNotMatch(text,/EUW1_2|SHOULD-NOT-SHOW|PRIVATE-PUUID/);
});
test('detailed MID report keeps the same evidence and request identity as its validated aggregates',async()=>{
 const m=match(),store={},api={resolveAccount:async()=>({...account,puuid:'p'}),matchIds:async()=>['EUW1_42'],match:async()=>m,timeline:async()=>({info:{frames:[]}})};delete m.metadata.matchId;
 const c=vm.createContext({...scouting,buildCoverage,statsCache:cache,key:()=>true,Riot:function(){return api;},require:()=>role,store:{get:k=>store[k]||{},set:(k,v)=>store[k]=v}}),main=fs.readFileSync('src/main.js','utf8');vm.runInContext(main.slice(main.indexOf('async function playerStats('),main.indexOf('async function playerPatchStats(')),c);
 const r=await c.playerStats(account);assert.equal(r.games,1);assert.equal(r.evidence.length,1);assert.equal(r.evidence[0].matchId,'EUW1_42');assert.equal(r.evidence[0].role,'MID');assert.ok(store.statsCacheV4);
});
test('actual role/filter handlers render exact source rows without another Riot request',async()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8'),nodes={},$=id=>nodes[id]??={value:'',disabled:false},team=id=>({id,name:id,players:T.roles.map(role=>({id:id+role,name:id+role,role,accounts:[{...account,gameName:id+role}]}))}),op=team('Opp'),home=team('UWU GANG'),report=role.summarizeRole([match('MIDDLE','EUW1_1'),match('MIDDLE','EUW1_2','Syndra','16.19.1')],'p','MID',at);let calls=0,html='';
 const c=evidenceUI();Object.assign(c,{$,S:{hasKey:true},view:'TEAMS',document:{querySelectorAll:()=>[]},DuelScouting:D,TeamScouting:T,roleStatReport:r=>c.matchEvidenceReport(r),patchReport:()=>'',window:{mw:{roleStats:async()=>{calls++;return report;}}},render:()=>{html=c.duelPanel(op,home);c.bindDuel(op,home);}});
 vm.runInContext(app.slice(app.indexOf('let teamDivision='),app.indexOf('function groupBoardHtml(')),c);c.render();await nodes['#loadDuel'].onclick();assert.equal(calls,2);assert.match(html,/EUW1_2/);nodes['#duelPatch'].onchange({target:{value:'16.20'}});assert.match(html,/EUW1_1/);assert.doesNotMatch(html,/EUW1_2/);assert.equal(calls,2);nodes['#duelChampion'].onchange({target:{value:'Ahri'}});assert.equal(calls,2);
});
