const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../src/renderer/teams'),{normalizeRole,selectRoster}=require('../src/services/ouat-roles');
const now=10000000;
function roster(){return T.roles.map((role,i)=>({id:String(i),role,team:'UWU GANG',teamId:1,division:'D1',group:'A',accounts:[{gameName:'P'+i,tagLine:'EUW'}],bestRank:{tier:'GOLD',rank:'II',leaguePoints:50},rankStatus:'ranked',rankCheckedAt:now}));}
test('local lineup resolves a declared substitute without dropping the full roster',()=>{
 const ps=roster();ps.push({...ps[0],id:'sub',accounts:[{gameName:'Sub',tagLine:'EUW'}],bestRank:{tier:'PLATINUM',rank:'II',leaguePoints:50}});
 assert.equal(T.summarize(ps,now).covered,4);
 const choices=T.updateLineup({},ps,'1','TOP','sub'),s=T.summarize(ps,now,T.lineup(choices,'1'));
 assert.equal(s.covered,5);assert.equal(s.score,1530);assert.equal(s.slots[0].manual,true);assert.equal(s.slots[0].declared.length,2);assert.equal(ps.length,6);
 assert.equal(T.groupBoard(T.group(ps),'1',now,choices).rows[0].summary.score,s.score);
 const reset=T.updateLineup(choices,ps,'1','TOP','');assert.equal(T.summarize(ps,now,T.lineup(reset,'1')).covered,4);assert.equal(choices['1'].TOP,'sub');
});
test('local choices cannot invent players, roles or teams and never change roster data',()=>{
 const ps=roster();
 for(const args of [['1','TOP','foreign'],['1','TOP','1'],['unknown','TOP','0'],['1','COACH','0'],['1','TOP',{}]])assert.throws(()=>T.updateLineup({},ps,...args),/invalide/);
 const choices=T.updateLineup({},ps,'1','TOP','0');assert.deepEqual(JSON.parse(JSON.stringify(choices)),{'1':{TOP:'0'}});assert.equal(T.lineup({},'constructor').TOP,undefined);
});
test('departed or role-changed local selection stays excluded until explicitly reset',()=>{
 const ps=roster(),selection={TOP:'departed'};let s=T.summarize(ps,now,selection);
 assert.equal(s.covered,4);assert.equal(s.slots[0].status,'selection_missing');
 s=T.summarize(ps,now,{TOP:'1'});assert.equal(s.slots[0].status,'selection_missing');
});
test('local choice never bypasses freshness or shared-account exclusions',()=>{
 const ps=roster();ps.push({...ps[0],id:'sub',accounts:ps[1].accounts});
 let s=T.summarize(ps,now,{TOP:'sub'});assert.equal(s.covered,3);assert.equal(s.slots[0].status,'duplicate');
 ps[5].accounts=[{gameName:'Sub',tagLine:'EUW'}];ps[5].rankCheckedAt=now-900000;
 s=T.summarize(ps,now,{TOP:'sub'});assert.equal(s.covered,4);assert.equal(s.slots[0].status,'stale');
});
test('lineup IPC persists validated choices and data returns them after reload',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync('src/main.js','utf8'),state={},handlers={};
 const store={get:(k,d)=>state[k]??d,set:(k,v)=>state[k]=v};
 const ctx=vm.createContext({TeamScouting:T,DuelScouting:require("../src/renderer/duels"),store,data:()=>({ouatPlayers:roster()}),ipcMain:{handle:(name,fn)=>handlers[name]=fn}});
 vm.runInContext(source.split('\n').find(l=>l.startsWith('ipcMain.handle("team:lineup"')),ctx);
 handlers['team:lineup']({},'1','TOP','0');assert.equal(state.lineups['1'].TOP,'0');
 assert.throws(()=>handlers['team:lineup']({},'1','TOP','made-up'));assert.equal(state.lineups['1'].TOP,'0');
 const dataLine=source.split('\n').find(l=>l.startsWith('function data()'));
 const reload=vm.createContext({store,app:{getVersion:()=> 'test'},selectRoster:()=>({players:[]}),bundledOuat:{},ranks:{hydrate:x=>x},applyOverrides:x=>x,key:()=>'',spectate:{detect:()=>''}});
 vm.runInContext(dataLine,reload);assert.equal(reload.data().lineups['1'].TOP,'0');
 handlers['team:lineup']({},'1','TOP','');assert.equal(state.lineups['1'].TOP,undefined);
});
test('lineup selector saves through IPC and preserves earlier choices on write failure',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),app=fs.readFileSync('src/renderer/app.js','utf8'),nodes={},ps=roster();
 ps.push({...ps[0],id:'sub'});const $=id=>nodes[id]??={value:'',innerHTML:'',textContent:'',hidden:false};let selects=[],fail=false,notice='';
 const S={ouat:{},lineups:{}},ctx=vm.createContext({TeamScouting:T,DuelScouting:require("../src/renderer/duels"),allPlayers:()=>ps,$,S,esc:String,queryMatch:()=>true,playerRankLabel:()=>'',rankPlaceholder:()=>'',scoutingAccount:p=>p.accounts[0],notice:s=>notice=s,window:{mw:{setLineup:async(t,r,p)=>{if(fail)throw Error('disk full');return T.updateLineup(S.lineups,ps,t,r,p)}}},document:{querySelectorAll:selector=>{
  if(selector!=='[data-lineup-team]')return [];
  selects=[...nodes['#grid'].innerHTML.matchAll(/data-lineup-team="([^"]+)" data-lineup-role="([^"]+)"/g)].map(m=>({dataset:{lineupTeam:m[1],lineupRole:m[2]},value:''}));return selects;
 }},render:()=>ctx.renderTeamSection(),refreshRanks:()=>{}});
 vm.runInContext(app.slice(app.indexOf('let teamDivision='),app.indexOf('\nfunction render(){')),ctx);ctx.renderTeamSection();
 let top=selects.find(s=>s.dataset.lineupRole==='TOP');top.value='sub';await top.onchange();assert.equal(S.lineups['1'].TOP,'sub');assert.match(nodes['#grid'].innerHTML,/COMPOSITION LOCALE/);
 fail=true;top=selects.find(s=>s.dataset.lineupRole==='TOP');top.value='0';await top.onchange();assert.equal(S.lineups['1'].TOP,'sub');assert.match(notice,/non enregistrée/);
});
test('normalizes all five LEA roles and excludes coaches/unknowns',()=>{
 assert.deepEqual(['top','jgl','Middle','bot','sup'].map(normalizeRole),T.roles);
 assert.equal(normalizeRole('Jungla'),'JUNGLE');assert.equal(normalizeRole('coach'),null);assert.equal(normalizeRole(''),null);
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
 const shared=roster();shared[1].accounts=shared[0].accounts;assert.equal(T.summarize(shared,now).covered,3);
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
 const ctx=vm.createContext({TeamScouting:T,DuelScouting:require("../src/renderer/duels"),allPlayers:()=>ps,$,S:{ouat:{}},esc:String,queryMatch:()=>true,playerRankLabel:()=> 'GOLD II',rankPlaceholder:()=>'',scoutingAccount:p=>p.accounts[0],document:{querySelectorAll:()=>[]},render:()=>ctx.renderTeamSection(),refreshRanks:()=>{},openPlayer:id=>opened=id});
 vm.runInContext(app.slice(app.indexOf('let teamDivision='),app.indexOf('\nfunction render(){')),ctx);
 ctx.renderTeamSection();assert.match(nodes['#grid'].innerHTML,/UWU GANG/);assert.match(nodes['#hero'].innerHTML,/teamGroup/);
 nodes['#teamSelect'].onchange({target:{value:'2'}});const html=nodes['#grid'].innerHTML;
 assert.equal((html.match(/data-team-player=/g)||[]).length,10);for(const role of T.roles)assert.ok(html.includes(role));
 assert.match(html,/COMPARAISON · UWU GANG/);assert.match(html,/Ce n’est pas le MMR/);
});

test('rank mean label rounds consistently at the Master boundary',()=>{
 assert.equal(T.label(2799.8),'MASTER+ · 0 LP moyens');
 assert.equal(T.label(2799.4),'DIAMOND I · 99 LP');
});
test('group board orders only complete teams, keeps ties and excludes other groups',()=>{
 const team=(id,name,tier='GOLD',group='A')=>({id,name,division:'D1',group,players:roster().map(p=>({...p,id:id+'-'+p.id,bestRank:{...p.bestRank,tier}}))});
 const a=team('a','Alpha'),b=team('b','Bravo','PLATINUM'),tie=team('tie','Equal'),partial=team('p','Incomplete','MASTER'),outside=team('out','Other group','DIAMOND','B');
 partial.players.pop();const board=T.groupBoard([a,partial,outside,tie,b],'a',now);
 assert.deepEqual(board.rows.map(r=>r.team.id),['b','a','tie','p']);assert.deepEqual(board.rows.map(r=>r.position),[1,2,2,null]);
 assert.equal(board.rows[3].summary.covered,4);assert.equal(board.rows[3].summary.slots.find(s=>s.role==='SUPPORT').status,'missing');
});
test('unpublished placements cannot form an invented comparison group',()=>{
 assert.equal(T.groupBoard([{id:'x',division:'D1',group:'Groupe non publié',players:[]}],'x',now).known,false);
 assert.equal(T.groupBoard([{id:'x',division:'Sans division',group:'A',players:[]}],'x',now).known,false);
});
test('shared accounts invalidate both affected roles rather than selecting an arbitrary role',()=>{
 const ps=roster();ps[1].accounts=ps[0].accounts;const summary=T.summarize(ps,now);
 assert.equal(summary.covered,3);assert.deepEqual(summary.slots.slice(0,2).map(s=>s.status),['duplicate','duplicate']);
});
test('refreshing another account does not make an old best rank fresh for a group average',()=>{
 const {accountKey,hydrate}=require('../src/services/ranks'),ps=roster();
 ps[0].accounts.push({gameName:'Secondary',tagLine:'EUW'});
 const cache={...Object.fromEntries(ps.map(p=>[accountKey(p.accounts[0]),{rank:p.bestRank,status:'ranked',checkedAt:now}])),
  [accountKey(ps[0].accounts[0])]:{rank:ps[0].bestRank,status:'ranked',checkedAt:now-900000},
  [accountKey(ps[0].accounts[1])]:{rank:{tier:'SILVER',rank:'IV',leaguePoints:0},status:'ranked',checkedAt:now}
 };
 const hydrated=hydrate(ps,cache),s=T.summarize(hydrated,now);
 assert.equal(hydrated[0].rankCheckedAt,now-900000);assert.equal(s.covered,4);assert.equal(s.slots[0].status,'stale');
});
test('group shortcut and comparison-table buttons switch to the actual team group',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),app=fs.readFileSync('src/renderer/app.js','utf8'),nodes={};
 const $=id=>nodes[id]??={value:'',innerHTML:'',textContent:'',hidden:false};
 const ps=roster();ps.push(...roster().map(p=>({...p,id:'op-'+p.id,team:'Opponent',teamId:2})));
 let buttons=[];
 const ctx=vm.createContext({TeamScouting:T,DuelScouting:require("../src/renderer/duels"),allPlayers:()=>ps,$,S:{ouat:{}},esc:String,queryMatch:()=>true,playerRankLabel:()=> 'GOLD II',rankPlaceholder:()=>'',scoutingAccount:p=>p.accounts[0],document:{querySelectorAll:selector=>{
  if(selector!=='[data-group-team]')return [];
  buttons=[...nodes['#grid'].innerHTML.matchAll(/data-group-team="([^"]+)"/g)].map(m=>({dataset:{groupTeam:m[1]}}));return buttons;
 }},render:()=>ctx.renderTeamSection(),refreshRanks:()=>{},openPlayer:()=>{}});
 vm.runInContext(app.slice(app.indexOf('let teamDivision='),app.indexOf('\nfunction render(){')),ctx);
 ctx.renderTeamSection();nodes['#uwuGroup'].onclick();
 assert.equal(vm.runInContext('teamDivision',ctx),'D1');assert.equal(vm.runInContext('teamGroup',ctx),'A');
 buttons.find(b=>b.dataset.groupTeam==='2').onclick();assert.equal(vm.runInContext('selectedTeam',ctx),'2');
 assert.match(nodes['#sectionTitle'].textContent,/Opponent/);assert.match(nodes['#grid'].innerHTML,/RANGS MOYENS DU GROUPE/);
});
