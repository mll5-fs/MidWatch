const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../src/renderer/duels'),T=require('../src/renderer/teams');
const team=id=>({id,name:id,players:T.roles.map(role=>({id:id+role,name:id+role,role,accounts:[{gameName:id+role,tagLine:'EUW'}]}))});
const op=()=>team('Opponent'),home=()=>team('UWU GANG');
const report=(role,extra={})=>({role,games:4,winrate:50,kda:2.5,cspm:6,dpm:400,vision:20,sampledAt:1720000000000,window:{oldestAt:1719900000000,newestAt:1719990000000},coverage:{partial:false},champions:[{name:'Ahri',games:3},{name:'Orianna',games:1}],patches:[{patch:'16.20',games:4}],...extra});
const entries=(a=op(),h=home())=>T.roles.map(role=>({role,pair:D.pair(a,h,role,{},true),saved:{sides:[{report:report(role)},{report:report(role)}]}}));
function harness(a=op(),h=home()){
 const app=fs.readFileSync('src/renderer/app.js','utf8'),nodes={},buttons=T.roles.map(role=>({dataset:{savedRole:role}}));let calls=0;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const c=vm.createContext({TeamScouting:T,DuelScouting:D,S:{hasKey:true,lineups:{}},esc,view:'TEAMS',$:id=>nodes[id]??={value:'',innerHTML:''},document:{querySelectorAll:()=>buttons},roleStatReport:r=>'DETAIL '+r.role,patchReport:()=>'',window:{mw:{roleStats:async()=>{calls++;throw Error('Unexpected call');}}},render:()=>{c.duelPanel(a,h);c.bindDuel(a,h);}});
 vm.runInContext(app.slice(app.indexOf('let teamDivision='),app.indexOf('function groupBoardHtml(')),c);
 const save=(role,r1=report(role),r2=report(role))=>{const p=D.pair(a,h,role,{},true);c.p=p;c.sides=[r1?{report:r1}:undefined,r2?{report:r2}:undefined];vm.runInContext('teamDuel.save(p.key,sides)',c);};
 return {c,a,h,nodes,buttons,save,calls:()=>calls};
}
test('overview always preserves five peer roles in official order, without a score or winner',()=>{
 const input=entries().reverse(),before=JSON.stringify(input),rows=D.overview(input);assert.deepEqual(rows.map(r=>r.role),T.roles);assert.equal(rows.length,5);assert.ok(rows.every(r=>r.comparison));assert.equal(JSON.stringify(input),before);
 for(const row of rows){assert.equal('score' in row,false);assert.equal('winner' in row,false);assert.equal(row.sides[0].report.role,row.role);}
});
test('absent entries and blocked compositions remain unavailable, never fabricated zero reports',()=>{
 const empty=D.overview();assert.ok(empty.every(r=>r.sides.every(s=>s.report===null)&&r.comparison===null));
 const e=entries();e[0].pair.sides[0].reason='Choisis un seul joueur';const rows=D.overview(e);assert.equal(rows[0].sides[0].report,null);assert.equal(rows[0].sides[0].reason,'Choisis un seul joueur');assert.equal(rows[0].comparison,null);assert.ok(rows[1].comparison);
});
test('wrong-role, malformed and error reports cannot become valid comparisons',()=>{
 for(const raw of [report('MID'),report('TOP',{games:-1}),report('TOP',{games:'4'}),report('TOP',{games:1.5})]){const e=entries();e[0].saved.sides[0].report=raw;const row=D.overview(e)[0];assert.equal(row.sides[0].report,null);assert.match(row.sides[0].reason,/incohérent/);assert.equal(row.comparison,null);}
 const e=entries();e[0].saved.sides[0].error='Riot unavailable';assert.equal(D.overview(e)[0].sides[0].reason,'Riot unavailable');
});
test('zero-game reports and loading slots remain distinguishable from missing data',()=>{
 const e=entries();e[0].saved.sides[0].report=report('TOP',{games:0});e[1].saved=null;e[1].loading=true;
 const rows=D.overview(e);assert.equal(rows[0].sides[0].report.games,0);assert.equal(rows[0].comparison,null);assert.equal(rows[1].sides[0].status,'loading');assert.equal(rows[1].comparison,null);
});
test('actual five-role panel shows identities, samples, observed pools and comparison limitations',()=>{
 const x=harness();for(const role of T.roles)x.save(role);const html=x.c.teamOverviewPanel(x.a,x.h);
 assert.match(html,/5\/5 rôles avec deux échantillons non vides/);for(const role of T.roles){assert.match(html,new RegExp('Voir '+role));assert.match(html,new RegExp('Opponent'+role));assert.match(html,new RegExp('UWU GANG'+role));}
 for(const text of ['4 parties','WIN 50%','KDA 2.5','CS/min 6','Dégâts/min 400','Vision/partie 20','Ahri (3G)','Période :','Collecte :','16.20 (4G / 4G)','tous patchs et champions','pas des confrontations directes','ne garantissent pas une intersection champion/patch'])assert.ok(html.includes(text),text);
 assert.equal(x.calls(),0);
});
test('small, partial, stale and undated samples have explicit per-player warnings',()=>{
 const x=harness();x.save('MID',report('MID',{games:1,coverage:{partial:true},window:{stale:true}}));const html=x.c.teamOverviewPanel(x.a,x.h);
 for(const warning of ['ÉCHANTILLON FAIBLE','COLLECTE PARTIELLE','DONNÉES ANCIENNES','date indisponible'])assert.ok(html.includes(warning));assert.match(html,/1\/5 rôles/);
 x.save('TOP',report('TOP',{coverage:null}));assert.match(x.c.teamOverviewPanel(x.a,x.h),/COUVERTURE INDISPONIBLE/);
});
test('missing or invalid metrics never become zero, whereas measured zero remains visible',()=>{
 const x=harness();x.save('MID',report('MID',{winrate:null,kda:NaN,cspm:'7',dpm:undefined,vision:0}),null);const html=x.c.teamOverviewPanel(x.a,x.h);
 assert.match(html,/Vision\/partie 0/);for(const text of ['WIN 0','KDA 0','CS/min 0','CS/min 7','Dégâts/min 0'])assert.ok(!html.includes(text));assert.match(html,/0\/5 rôles/);
});
test('overview uses all retained samples independently of selected detail patch and champion',()=>{
 const x=harness();x.save('MID');const before=x.c.teamOverviewPanel(x.a,x.h);vm.runInContext('duelPatch="16.20";duelChampion="Ahri"',x.c);assert.equal(x.c.teamOverviewPanel(x.a,x.h),before);assert.equal(x.calls(),0);
});
test('overview row shortcuts open actual role memory without fetching reports',()=>{
 const x=harness();for(const role of T.roles)x.save(role);x.c.render();x.buttons.find(b=>b.dataset.savedRole==='SUPPORT').onclick();
 assert.equal(vm.runInContext('duelRole',x.c),'SUPPORT');assert.equal(vm.runInContext('teamDuel.state.sides[0].report.role',x.c),'SUPPORT');assert.equal(x.calls(),0);
});
test('expired memories and replaced accounts cannot leak old samples into overview',()=>{
 const x=harness();x.save('MID');assert.match(x.c.teamOverviewPanel(x.a,x.h),/1\/5 rôles/);x.a.players[2].accounts=[{gameName:'Replacement',tagLine:'NEW'}];assert.match(x.c.teamOverviewPanel(x.a,x.h),/0\/5 rôles/);assert.doesNotMatch(x.c.teamOverviewPanel(x.a,x.h),/4 parties/);
 let time=0;const target=D.create({now:()=>time}),ps=entries();for(const e of ps)target.save(e.pair.key,e.saved.sides);time=900000;const rows=D.overview(ps.map(e=>({...e,saved:target.peek(e.pair.key)})));assert.ok(rows.every(r=>!r.comparison));
});
test('HTML-sensitive identities, champions and error messages are escaped and large pools labelled truncated',()=>{
 const x=harness();x.a.players[2].name='<script>bad()</script>';x.save('MID',report('MID',{champions:[{name:'<img onerror=bad()>',games:1},{name:'B',games:1},{name:'C',games:1},{name:'D',games:1}]}));const html=x.c.teamOverviewPanel(x.a,x.h);
 assert.doesNotMatch(html,/<script>|<img onerror/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img onerror/);assert.match(html,/\+1 autres \(voir le détail\)/);
 x.c.sides=[{error:'<svg onload=bad()>'},{report:report('MID')}];vm.runInContext('teamDuel.save(p.key,sides)',x.c);const errors=x.c.teamOverviewPanel(x.a,x.h);assert.doesNotMatch(errors,/<svg onload/);assert.match(errors,/&lt;svg onload/);
});
test('same-team or absent-team selections do not produce a fake opponent overview',()=>{
 const x=harness();assert.equal(x.c.teamOverviewPanel(x.h,x.h),'');assert.equal(x.c.teamOverviewPanel(x.a,null),'');const app=fs.readFileSync('src/renderer/app.js','utf8');assert.match(app,/roleMemoryPanel\(team,home\)\+teamOverviewPanel\(team,home\)\+duelHtml/);
});
