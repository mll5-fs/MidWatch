const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../src/renderer/duels'),T=require('../src/renderer/teams'),R=require('../src/renderer/report'),{summarizeRole}=require('../src/services/role-report');
const at=Date.UTC(2026,9,18),positions={TOP:'TOP',JUNGLE:'JUNGLE',MID:'MIDDLE',ADC:'BOTTOM',SUPPORT:'UTILITY'};
const team=id=>({id,name:id,players:T.roles.map(role=>({id:id+role,name:id+role,role,accounts:[{gameName:id+role,tagLine:'EUW'}]}))});
function report(role='MID',champion='Ahri'){
 const matches=[[champion,true,'16.20.1'],[champion,false,'16.20.1'],['Orianna',true,'16.19.1']].map(([name,win,patch],i)=>({metadata:{matchId:'EUW1_'+(100+10*T.roles.indexOf(role)+i)},info:{queueId:420,gameVersion:patch,gameStartTimestamp:at-(i+1)*1000,participants:[{puuid:'p',teamPosition:positions[role],championName:name,win,timePlayed:1800,kills:4,deaths:2,assists:8,totalMinionsKilled:180,neutralMinionsKilled:0,totalDamageDealtToChampions:18000,goldEarned:9000,visionScore:20}]}}));
 return {...summarizeRole(matches,'p',role,at),coverage:{partial:true,target:12}};
}
const entry=(role='MID',r=report(role))=>({role,pair:D.pair(team('Opponent'),team('UWU GANG'),role,{},true),saved:{sides:[{report:r},{report:r}]}});
for(const role of T.roles)test(role+' pool trace links only that champion and selected patch with measured source metadata',()=>{
 const s=D.draftPools([entry(role)],'16.20').find(r=>r.role===role).sides[0],c=s.champions[0];assert.equal(c.name,'Ahri');assert.equal(c.trace.status,'complete');assert.equal(c.trace.rows.length,2);assert.deepEqual(c.trace.rows.map(m=>m.win),[true,false]);assert.ok(c.trace.rows.every(m=>m.role===role&&m.patch==='16.20'&&m.champion==='Ahri'));assert.equal(c.trace.rows[0].kills,4);assert.equal(c.trace.rows[0].seconds,1800);assert.equal(s.report.coverage.partial,true);
});
test('a pool patch absent from the other side never borrows its sources',()=>{
 const e=entry();e.saved.sides[1].report={...report(),byPatch:[]};const row=D.draftPools([e],'16.20').find(r=>r.role==='MID');assert.equal(row.sides[0].champions[0].trace.rows.length,2);assert.equal(row.sides[1].poolStatus,'unobserved');assert.equal(row.sides[1].champions.length,0);
});
test('legacy reports without evidence keep pool counts but explicitly have unavailable sources',()=>{
 const r=report();delete r.evidence;const c=D.draftPools([entry('MID',r)]).find(r=>r.role==='MID').sides[0].champions[0];assert.equal(c.games,2);assert.equal(c.share,66.7);assert.equal(c.trace.status,'unavailable');assert.deepEqual(c.trace.rows,[]);
});
test('missing, malformed and future metadata is partial and never replaced by invented IDs, dates or zero counts',()=>{
 const r=report(),m=r.evidence[0];m.matchId='bad-id';m.startedAt=at+1;m.seconds=null;m.kills=undefined;m.deaths=-1;m.assists='8';const trace=D.poolEvidence(r,{name:'Ahri',games:2,wins:1});assert.equal(trace.status,'partial');assert.equal(trace.rows.length,2);for(const k of ['matchId','startedAt','seconds','kills','deaths','assists'])assert.equal(trace.rows[0][k],null,k);
});
test('duplicate identifiers, excess sources or contradictory outcomes invalidate the link, not fabricate a reconciliation',()=>{
 for(const mode of ['duplicate','extra','wins','losses']){
  const r=report();let c={name:'Ahri',games:2,wins:1};if(mode==='duplicate')r.evidence[1].matchId=r.evidence[0].matchId;if(mode==='extra')r.evidence.push({...r.evidence[0],matchId:'EUW1_999'});if(mode==='wins')c.wins=0;if(mode==='losses')c.wins=2;
  assert.deepEqual(D.poolEvidence(r,c),{status:'inconsistent',rows:[]},mode);
 }
});
test('a partial source list reports its own coverage and never recomputes aggregate frequencies',()=>{
 const r=report();r.evidence=r.evidence.slice(0,1);const c=D.draftPools([entry('MID',r)]).find(r=>r.role==='MID').sides[0].champions[0];assert.equal(c.trace.status,'partial');assert.equal(c.trace.rows.length,1);assert.equal(c.games,2);assert.equal(c.share,66.7);assert.equal(c.wins,1);
 const wrong={...r,evidence:r.evidence.map(m=>({...m,role:'SUPPORT'}))};assert.equal(D.poolEvidence(wrong,c).status,'unavailable');assert.equal(D.poolEvidence(r,c,'16.19').rows.length,0);
});
test('trace projection does not mutate reports or serialize arbitrary private/raw properties',()=>{
 const r=report();r.evidence[0].secret='PRIVATE-FIELD';r.evidence[0].puuid='PRIVATE-PUUID';const before=JSON.stringify(r),trace=D.poolEvidence(r,{name:'Ahri',games:2,wins:1});assert.equal(JSON.stringify(r),before);assert.doesNotMatch(JSON.stringify(trace),/PRIVATE-FIELD|PRIVATE-PUUID|puuid|secret/);
});
function ui(){
 const app=fs.readFileSync('src/renderer/app.js','utf8'),op=team('Opponent'),home=team('UWU GANG'),nodes={};let html='',calls=0;
 const $=id=>nodes[id]??={value:'',disabled:false},esc=v=>String(v).replaceAll('<','&lt;').replaceAll('>','&gt;');
 const c=vm.createContext({view:'TEAMS',DuelScouting:D,TeamScouting:T,ReportBuilder:R,S:{hasKey:true,ouat:{}},$,esc,document:{querySelectorAll:()=>[]},roleStatReport:()=>'',patchReport:()=>'',window:{mw:{roleStats:async(_a,role)=>{calls++;return report(role);}}},render:()=>{html=c.draftPoolPanel(op,home);c.duelPanel(op,home);c.bindDuel(op,home);}});
 vm.runInContext(app.slice(app.indexOf('let teamDivision='),app.indexOf('function groupBoardHtml(')),c);vm.runInContext(app.slice(app.indexOf('function preparationPanel('),app.indexOf('function bindPreparation(')),c);c.render();return {c,nodes,op,home,html:()=>html,calls:()=>calls};
}
test('actual pool UI provides collapsed per-champion sources and patch handler changes them without more Riot calls',async()=>{
 const x=ui();await x.nodes['#loadTeamDuels'].onclick();assert.equal(x.calls(),10);assert.match(x.html(),/Voir les parties · Ahri · 2\/2/);assert.match(x.html(),/EUW1_122/);assert.match(x.html(),/4\/2\/8/);assert.doesNotMatch(x.html(),/<details[^>]* open/);x.nodes['#draftPatch'].onchange({target:{value:'16.20'}});assert.doesNotMatch(x.html(),/EUW1_122/);assert.match(x.html(),/EUW1_120/);assert.equal(x.calls(),10);
});
test('actual UI escapes source names and exposes incomplete or incoherent trace states while closed',()=>{
 const x=ui(),r=report('MID','<img src=x>');r.evidence[0].matchId=r.evidence[1].matchId;x.c.p=entry('MID',r).pair;x.c.r=r;vm.runInContext('teamDuel.save(p.key,[{report:r},{report:r}])',x.c);const html=x.c.draftPoolPanel(x.op,x.home);assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img/);assert.match(html,/INCOHÉRENT<\/summary>/);assert.match(html,/SOURCES INCOHÉRENTES/);
});
test('team export keeps pool sources within their own patch scope and omits arbitrary raw fields',()=>{
 const e=entry(),r=e.saved.sides[0].report;r.evidence[0].secret='PRIVATE';const text=R.build({team:team('Opponent'),home:team('UWU GANG'),duels:[{pair:e.pair,reports:[r,r],patch:'16.19',champion:'Orianna'}],draftPatch:'16.20'}),[detail,pools]=text.split('POOLS OBSERVÉS · PRÉPARATION DRAFT');assert.match(detail,/EUW1_122/);assert.doesNotMatch(pools,/EUW1_122/);assert.match(pools,/EUW1_120/);assert.match(pools,/PARTIES SOURCES DU POOL : 2\/2/);assert.doesNotMatch(text,/PRIVATE/);assert.match(pools,/COLLECTE PARTIELLE/);
});
