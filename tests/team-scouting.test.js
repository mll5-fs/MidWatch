const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../src/renderer/teams'),{normalizeRole,selectRoster}=require('../src/services/ouat-roles');
const now=10000000;
function roster(){return T.roles.map((role,i)=>({id:String(i),role,team:'UWU GANG',teamId:1,division:'D1',group:'A',accounts:[{gameName:'P'+i,tagLine:'EUW'}],bestRank:{tier:'GOLD',rank:'II',leaguePoints:50},rankStatus:'ranked',rankCheckedAt:now}));}
test('normalizes all five LEA roles and excludes coaches/unknowns',()=>{
 assert.deepEqual(['top','jgl','Middle','bot','sup'].map(normalizeRole),T.roles);
 assert.equal(normalizeRole('coach'),null);assert.equal(normalizeRole(''),null);
});
test('migrates legacy mid-only cache while preserving a current full roster',()=>{
 const bundle={schemaVersion:2,players:roster()},legacy={players:[{role:'MID'}]};
 assert.equal(selectRoster(legacy,bundle),bundle);assert.equal(selectRoster(bundle,legacy),bundle);
});
test('mean official rank covers all five distinct roles with a transparent conversion',()=>{
 const s=T.summarize(roster(),now);assert.equal(s.covered,5);assert.equal(s.score,1450);assert.equal(s.label,'GOLD II · 50 LP');assert.equal(s.complete,true);
 assert.equal(T.points({tier:'GRANDMASTER',leaguePoints:500}),3300);
});
test('never treats unknown, stale, partial or duplicate-role ranks as complete',()=>{
 for(const change of [p=>p.rankStatus='partial',p=>p.rankCheckedAt=now-900000,p=>p.bestRank={},p=>p.rankCheckedAt=now+1]){
  const ps=roster();change(ps[0]);const s=T.summarize(ps,now);assert.equal(s.covered,4);assert.equal(s.complete,false);
 }
 const ps=roster();ps.push({...ps[0],id:'sub'});assert.equal(T.summarize(ps,now).covered,4);
 const shared=roster();shared[1].accounts=shared[0].accounts;assert.equal(T.summarize(shared,now).covered,4);
 assert.equal(T.summarize([],now).score,null);
});
test('teams preserve actual divisions/groups without fabricating placements',()=>{
 const ps=roster();ps.push({id:'unknown',teamId:2,team:'Opponent',role:'MID'});
 const ts=T.group(ps);assert.equal(ts.length,2);assert.equal(ts.find(t=>t.id==='1').group,'A');assert.equal(ts.find(t=>t.id==='2').group,'Groupe non publié');
});
test('team screen renders five roles, opponent comparison, filters and selectable player profiles',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),app=fs.readFileSync('src/renderer/app.js','utf8');
 const ps=roster();ps.push(...roster().map(p=>({...p,id:'op-'+p.id,team:'Opponent',teamId:2})));
 const nodes={},$=id=>nodes[id]??={value:'',innerHTML:'',textContent:'',hidden:false};let opened;
 const ctx=vm.createContext({TeamScouting:T,allPlayers:()=>ps,$,S:{ouat:{}},esc:String,queryMatch:()=>true,playerRankLabel:()=> 'GOLD II',rankPlaceholder:()=>'',scoutingAccount:p=>p.accounts[0],document:{querySelectorAll:()=>[]},render:()=>ctx.renderTeamSection(),refreshRanks:()=>{},openPlayer:id=>opened=id});
 vm.runInContext(app.slice(app.indexOf('let teamDivision='),app.indexOf('\nfunction render(){')),ctx);
 ctx.renderTeamSection();assert.match(nodes['#grid'].innerHTML,/UWU GANG/);assert.match(nodes['#hero'].innerHTML,/teamGroup/);
 nodes['#teamSelect'].onchange({target:{value:'2'}});const html=nodes['#grid'].innerHTML;
 assert.equal((html.match(/data-team-player=/g)||[]).length,10);for(const role of T.roles)assert.ok(html.includes(role));
 assert.match(html,/COMPARAISON · UWU GANG/);assert.match(html,/Ce n’est pas le MMR/);
});
