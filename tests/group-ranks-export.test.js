const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const R=require('../src/renderer/report'),T=require('../src/renderer/teams');
const now=Date.UTC(2026,9,18),make=(id,lp=10)=>({id,name:id,division:'Division 11',group:'Div 11D',players:T.roles.map((role,i)=>({id:id+i,name:id+' '+role,role,accounts:[{gameName:id+role,tagLine:'EUW'}],bestRank:{tier:'GOLD',rank:'II',leaguePoints:lp},rankStatus:'ranked',rankCheckedAt:now}))});
const build=(teams,extra={})=>R.buildGroup({teams,selectedId:teams[0]?.id,now,version:'5.22.0',ouat:{season:'OUAT',updatedAt:now},...extra});
test('export contains every team in the exact division/group and all five roles, regardless of player search',()=>{
 const a=make('Opponent'),b=make('UWU GANG'),other={...make('Other division'),division:'Division 10'},otherGroup={...make('Other group'),group:'Div 11C'};
 const text=build([a,b,other,otherGroup],{search:'Opponent'});assert.match(text,/2 équipes du groupe · 2 avec 5\/5/);assert.match(text,/UWU GANG \(repère\)/);assert.doesNotMatch(text,/ÉQUIPE : Other/);for(const role of T.roles)assert.equal(text.split('\n').filter(l=>l.startsWith(role+' :')).length,2);assert.match(text,/toutes les équipes du groupe LEA/);
});
test('complete means are ordered with ties while incomplete teams receive no position',()=>{
 const a=make('A low',10),b=make('B high',50),c=make('C tied',50),d=make('D partial',90);d.players[0].rankStatus='partial';
 const text=build([a,b,c,d]);assert.ok(text.indexOf('ÉQUIPE : B high')<text.indexOf('ÉQUIPE : C tied'));assert.ok(text.indexOf('ÉQUIPE : C tied')<text.indexOf('ÉQUIPE : A low'));assert.ok(text.indexOf('ÉQUIPE : A low')<text.indexOf('ÉQUIPE : D partial'));assert.equal((text.match(/Ordre SoloQ : 1 /g)||[]).length,2);assert.match(text,/Ordre SoloQ : 3 /);assert.match(text,/Ordre SoloQ : non attribué.*4\/5.*PARTIEL/);
});
test('stale, future, missing and ambiguous ranks are excluded with concrete reasons',()=>{
 const a=make('A');a.players[0].rankCheckedAt=now-900000;a.players[1].rankCheckedAt=now+1;a.players=a.players.filter(p=>p.role!=='SUPPORT');a.players.push({...a.players[2],id:'sub',name:'Sub'});const text=build([a]);assert.match(text,/1\/5 rôles couverts/);assert.match(text,/TOP :.*rang périmé/);assert.match(text,/JUNGLE :.*date invalide/);assert.match(text,/MID : non sélectionné.*plusieurs joueurs/);assert.match(text,/SUPPORT : non sélectionné.*joueur absent/);assert.match(text,/Dernier rang connu, exclu/);
});
test('local lineups and disappeared selections retain their provenance',()=>{
 const a=make('A');a.players.push({...a.players[0],id:'sub',name:'Sub'});assert.match(build([a],{lineups:{A:{TOP:'sub'}}}),/TOP : Sub · composition locale non confirmée par LEA/);assert.match(build([a],{lineups:{A:{TOP:'removed'}}}),/choix local absent de l’effectif/);
});
test('shared account and Riot error/partial statuses cannot silently count towards the mean',()=>{
 const a=make('A');a.players[1].accounts=a.players[0].accounts;a.players[2].rankStatus='error';a.players[3].rankStatus='partial';const text=build([a]);assert.match(text,/1\/5 rôles couverts/);assert.match(text,/compte partagé entre rôles/);assert.match(text,/erreur Riot/);assert.match(text,/rang partiel/);
});
test('Master+ conversion and limitations are explicit without an invented MMR or tournament rank',()=>{
 const a=make('A');for(const p of a.players)p.bestRank={tier:'CHALLENGER',leaguePoints:700};const text=build([a]);assert.match(text,/MASTER\+ · 700 LP moyens/);assert.match(text,/100 points\/division, 400\/palier/);assert.match(text,/Master\/Grandmaster\/Challenger = base Master \+ LP/);assert.match(text,/pas le MMR réel/);assert.match(text,/Pas un classement du tournoi/);
});
test('UWU GANG outside the group is not imported and unavailable groups cannot be exported',()=>{
 const a=make('A'),home={...make('UWU GANG'),group:'elsewhere'};assert.doesNotMatch(build([a,home]),/ÉQUIPE : UWU GANG/);for(const t of [{...a,group:'Groupe non publié'},{...a,division:'Sans division'}])assert.throws(()=>build([t]),/non publié/);assert.throws(()=>build([]),/non publié/);
});
test('export projects public fields only, sanitizes injected control characters and leaves source intact',()=>{
 const a=make('A');a.name='A\nINJECTED';a.players[0].secret='PRIVATE_KEY';a.players[0].puuid='PRIVATE_PUUID';a.players[0].name='Name\nFake role';const before=JSON.stringify(a),text=build([a],{riotKey:'PRIVATE_KEY',ouat:{warning:'PRIVATE_WARNING',season:'OUAT'}});assert.equal(JSON.stringify(a),before);assert.doesNotMatch(text,/PRIVATE_|\nINJECTED|\nFake role/);assert.match(text,/ATTENTION : avertissement de collecte/);assert.match(text,/actualisé date indisponible/);
});
function ui(){
 let time=now,players=[...make('A').players.map(p=>({...p,teamId:'A',team:'A',division:'Division 11',group:'Div 11D'}))],copied=[],fail=false;
 const nodes={'#copyGroupRanks':{},'#groupRanksPreview':{}},messages=[],app=fs.readFileSync('src/renderer/app.js','utf8');
 const c=vm.createContext({$:id=>nodes[id],allPlayers:()=>players,TeamScouting:T,ReportBuilder:{buildGroup:args=>R.buildGroup({...args,now:time})},S:{version:'5.22.0',ouat:{},lineups:{}},notice:s=>messages.push(s),window:{mw:{copyReport:async text=>{if(fail)throw Error('clipboard');copied.push(text);}}}});
 vm.runInContext(app.slice(app.indexOf('function bindGroupRanks('),app.indexOf('function renderTeamSection(')),c);c.bindGroupRanks({id:'A'});
 return {c,nodes,copied,messages,advance:()=>time+=900000,fail:()=>fail=true,remove:()=>players=[]};
}
test('actual clipboard handler refreshes stale coverage at click time and uses the existing plain-text IPC',async()=>{
 const x=ui();assert.match(x.nodes['#groupRanksPreview'].textContent,/5\/5 rôles couverts/);x.advance();await x.nodes['#copyGroupRanks'].onclick();assert.match(x.copied[0],/0\/5 rôles couverts/);assert.equal(x.copied[0],x.nodes['#groupRanksPreview'].textContent);assert.equal(x.nodes['#copyGroupRanks'].disabled,false);assert.match(x.messages[0],/copiés/);
});
test('clipboard failure keeps the dated preview available and restores the button',async()=>{
 const x=ui();x.fail();await x.nodes['#copyGroupRanks'].onclick();assert.equal(x.copied.length,0);assert.match(x.messages[0],/Copie impossible/);assert.match(x.nodes['#groupRanksPreview'].textContent,/RANGS SOLOQ DU GROUPE/);assert.equal(x.nodes['#copyGroupRanks'].disabled,false);
});
test('a group disappearing before copy never exports the obsolete preview',async()=>{
 const x=ui();x.remove();await x.nodes['#copyGroupRanks'].onclick();assert.equal(x.copied.length,0);assert.match(x.messages[0],/groupe LEA/);assert.equal(x.nodes['#copyGroupRanks'].disabled,false);
});
test('actual group table exposes a copy button and a safe text preview only for a known group',()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8'),c=vm.createContext({TeamScouting:T,esc:String});vm.runInContext(app.slice(app.indexOf('function groupBoardHtml('),app.indexOf('function preparationPanel(')),c);const html=c.groupBoardHtml(T.groupBoard([make('A')],'A',now));assert.match(html,/id="copyGroupRanks"/);assert.match(html,/id="groupRanksPreview"/);assert.match(html,/Copier les rangs du groupe/);assert.doesNotMatch(c.groupBoardHtml({known:false}),/copyGroupRanks/);assert.match(app,/bindPreparation\(\);bindGroupRanks\(team\)/);
});
