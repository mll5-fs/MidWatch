const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const R=require('../src/renderer/report'),T=require('../src/renderer/teams'),D=require('../src/renderer/duels');
const now=Date.UTC(2026,9,16),team=id=>({id,name:id,division:'Division 11',group:'Div 11D',players:T.roles.map((role,i)=>({id:id+i,name:id+' '+role,role,accounts:[{gameName:id+role,tagLine:'EUW'}],bestRank:{tier:'GOLD',rank:'II',leaguePoints:50},rankStatus:'ranked',rankCheckedAt:now}))});
test('team report contains five roles, rank coverage, sources and no private configuration',()=>{
 const text=R.build({team:team('Opponent'),home:team('UWU GANG'),version:'5.10.0',now,ouat:{season:'OUAT',updatedAt:now},riotKey:'SECRET_KEY',leaguePath:'PRIVATE_PATH',settings:{password:'SECRET_PASSWORD'}});
 for(const role of T.roles)assert.equal((text.match(new RegExp('^'+role+' :','gm'))||[]).length,2);
 assert.match(text,/5\/5 rôles couverts/);assert.match(text,/100 points\/division/);assert.match(text,/pas le MMR réel/);assert.match(text,/Aucune comparaison SoloQ chargée/);assert.match(text,/api.leamateur.pro/);assert.doesNotMatch(text,/SECRET_KEY|PRIVATE_PATH|SECRET_PASSWORD/);
});
test('stale, missing and ambiguous roles remain explicitly excluded without invented players',()=>{
 const t=team('Opponent');t.players[0].rankCheckedAt=now-900000;t.players=t.players.filter(p=>p.role!=='SUPPORT');t.players.push({...t.players[1],id:'sub',name:'Sub'});
 const text=R.build({team:t,now});assert.match(text,/2\/5 rôles couverts · PARTIEL/);assert.match(text,/TOP :.*rang périmé/);assert.match(text,/JUNGLE : non sélectionné.*plusieurs joueurs/);assert.match(text,/SUPPORT : non sélectionné.*joueur absent/);assert.match(text,/Dernier rang connu, exclu/);
});
test('manual selections and removed selections have accurate provenance',()=>{
 const t=team('Opponent');t.players.push({...t.players[0],id:'sub',name:'Sub'});
 let text=R.build({team:t,lineups:{Opponent:{TOP:'sub'}},now});assert.match(text,/TOP : Sub · composition locale non confirmée par LEA/);assert.match(text,/5\/5/);
 text=R.build({team:t,lineups:{Opponent:{TOP:'departed'}},now});assert.match(text,/choix local absent/);assert.match(text,/4\/5/);
});
test('loaded report uses only the selected role and patch, retaining sample and collection limits',()=>{
 const p=D.pair(team('Opponent'),team('UWU GANG'),'MID',{},true),sample={role:'MID',games:2,winrate:50,kda:3,coverage:{partial:true},window:{oldestAt:now-86400000,newestAt:now,stale:true},sampledAt:now,champions:[{name:'Ahri',games:2}],patches:[{patch:'16.20',games:2}]},raw={...sample,games:8,winrate:75,byPatch:[{patch:'16.20',report:sample}]};
 const text=R.build({team:team('Opponent'),home:team('UWU GANG'),now,duel:{pair:p,reports:[raw,raw],patch:'16.20',loading:true}});
 assert.match(text,/patch 16.20/);assert.match(text,/2 parties au rôle MID/);assert.doesNotMatch(text,/8 parties au rôle/);assert.match(text,/COLLECTE PARTIELLE/);assert.match(text,/DONNÉES ANCIENNES/);assert.match(text,/Ahri \(2G\)/);assert.match(text,/autres rôles ne disposent pas/);assert.match(text,/Collecte encore en cours/);
});
test('wrong role and absent stats never leak into a preparation report',()=>{
 const p=D.pair(team('Opponent'),team('UWU GANG'),'MID',{},true),text=R.build({team:team('Opponent'),now,duel:{pair:p,reports:[{role:'SUPPORT',games:6,winrate:100},{role:'MID',games:0}],patch:'ALL'}});
 assert.equal((text.match(/Rapport non chargé ou aucune partie exploitable/g)||[]).length,2);assert.doesNotMatch(text,/Winrate \(%\) : 100/);
});
test('clipboard IPC validates payloads and performs exactly one plain-text write',async()=>{
 const source=fs.readFileSync('src/main.js','utf8'),handlers={},writes=[];
 vm.runInNewContext(source.split('\n').find(l=>l.startsWith('ipcMain.handle("report:copy"')),{ipcMain:{handle:(name,fn)=>handlers[name]=fn},clipboard:{writeText:text=>writes.push(text)}});
 for(const text of [null,{},'', '   ','x'.repeat(100001)])await assert.rejects(handlers['report:copy']({},text));
 assert.equal(await handlers['report:copy']({},'A real preparation report'),true);assert.deepEqual(writes,['A real preparation report']);
});
test('copy button copies preview text and reports a recoverable clipboard failure',async()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8'),nodes={'#copyPreparation':{},'#preparationPreview':{textContent:'Prepared snapshot'}},messages=[];let fail=false,copied;
 const ctx=vm.createContext({$:id=>nodes[id],notice:s=>messages.push(s),window:{mw:{copyReport:async text=>{if(fail)throw Error('unavailable');copied=text;}}}});
 vm.runInContext(app.slice(app.indexOf('function bindPreparation('),app.indexOf('function renderTeamSection(')),ctx);ctx.bindPreparation();await nodes['#copyPreparation'].onclick();assert.equal(copied,'Prepared snapshot');assert.match(messages[0],/Rapport copié/);assert.equal(nodes['#copyPreparation'].disabled,false);
 fail=true;await nodes['#copyPreparation'].onclick();assert.match(messages[1],/Copie impossible/);assert.equal(nodes['#copyPreparation'].disabled,false);
});
