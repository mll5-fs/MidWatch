const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const T=require('../src/renderer/teams'),R=require('../src/services/ranks');
const rank={queueType:'RANKED_SOLO_5x5',tier:'EMERALD',rank:'II',leaguePoints:30};
const team=(id,name=id)=>({id,name,players:T.roles.map(role=>({id:id+role,name:id+role,role,teamId:id,team:name,division:'Division 11',group:'Div 11D',accounts:[{gameName:id+role,tagLine:'EUW'}]}))});
const riot=()=>{const calls=[];return {calls,resolveAccount:async a=>({puuid:a.gameName}),ranked:async(_p,id)=>{calls.push(id);return [rank];}};};
test('ordered rank priorities do not collapse to a set of equally important players',async()=>{
 const p=team('p').players.reverse(),api=riot(),priority=p.map(x=>x.id).reverse(),cache=Object.fromEntries(p.map((x,i)=>[R.accountKey(x.accounts[0]),{checkedAt:i+1,nextCheck:0}]));
 await R.loadBatch(api,p,{priorityIds:priority,cache,now:10000});assert.deepEqual(api.calls,priority);
});
test('selected team at end of a 1420-player roster precedes visible opponents, its group and background',async()=>{
 const selected=team('selected'),home=team('home','UWU GANG'),background=Array.from({length:282},(_,i)=>team('other'+i)).flatMap(t=>t.players),players=[...background,...home.players,...selected.players];
 assert.equal(players.length,1420);const ids=T.rankPriority(players,selected.id,[background[0].id],background.slice(0,20).map(p=>p.id)),api=riot();
 const first=await R.loadBatch(api,players,{priorityIds:ids,now:1000});assert.deepEqual(api.calls,selected.players.map(p=>p.id));assert.equal(first.checked,5);
 api.calls.length=0;await R.loadBatch(api,players,{priorityIds:ids,cache:first.cache,accountCache:first.accountCache,now:2000});assert.deepEqual(api.calls,home.players.map(p=>p.id));
});
test('local lineup candidates precede substitutes, with unknown and duplicate IDs excluded',()=>{
 const a=team('a'),h=team('h','UWU GANG'),sub={...a.players[2],id:'sub',accounts:[{gameName:'sub',tagLine:'EUW'}]};a.players.push(sub);const players=[...a.players,...h.players],ids=T.rankPriority(players,a.id,['unknown','sub','sub'],[],1000,{a:{MID:'sub'}});
 assert.deepEqual(ids.slice(0,5),['aTOP','aJUNGLE','sub','aADC','aSUPPORT']);assert.equal(ids[5],'aMID');assert.equal(ids.includes('unknown'),false);assert.equal(ids.filter(x=>x==='sub').length,1);
});
test('unpublished groups never combine unrelated teams and IPC priority output stays bounded',()=>{
 const a=team('a'),h=team('h','UWU GANG'),z=team('z');for(const p of a.players)p.group='';const players=[...a.players,...h.players,...z.players];const ids=T.rankPriority(players,a.id);assert.deepEqual(ids,[...a.players,...h.players].map(p=>p.id));
 const many=Array.from({length:130},(_,i)=>({...a.players[0],id:'big'+i}));assert.equal(T.rankPriority(many,a.id).length,100);
});
test('rank budget, fresh cache reuse, and Retry-After survive ordered priorities',async()=>{
 const a=team('a'),api=riot(),ids=a.players.map(p=>p.id),first=await R.loadBatch(api,a.players,{priorityIds:ids,now:1000});api.calls.length=0;
 await R.loadBatch(api,a.players,{priorityIds:ids,cache:first.cache,now:1001});assert.equal(api.calls.length,0);
 const limited={resolveAccount:async a=>({puuid:a.gameName}),ranked:async()=>{throw Object.assign(Error('limited'),{status:429,retryAfterMs:40000,retryAt:51000});}};
 const result=await R.loadBatch(limited,a.players,{priorityIds:ids,now:10000});assert.equal(result.checked,1);assert.equal(result.retryAt,51000);assert.equal(result.blockedStatus,429);assert.equal(result.updates[0].status,'error');
});
test('multiple accounts remain partial until every linked account has a conclusive response',async()=>{
 const p=team('a').players[0];p.accounts=Array.from({length:6},(_,i)=>({gameName:'account'+i,tagLine:'EUW'}));const api=riot(),first=await R.loadBatch(api,[p],{priorityIds:[p.id],now:1000});assert.equal(first.checked,5);assert.equal(first.updates[0].status,'partial');
 const second=await R.loadBatch(api,[p],{priorityIds:[p.id],cache:first.cache,accountCache:first.accountCache,now:2000});assert.equal(second.checked,1);assert.equal(second.updates[0].status,'ranked');
});
test('progress distinguishes all rank states instead of treating errors or unknowns as unranked',()=>{
 const base=team('a').players[0],now=1000000,valid={...base,rankStatus:'ranked',bestRank:rank,rankCheckedAt:now-1};
 const players=[valid,{...valid,rankStatus:'unranked',bestRank:{}},{...base},{...valid,rankStatus:'error'},{...valid,rankStatus:'partial'},{...valid,rankCheckedAt:now-900000},{...valid,accounts:[]},{...valid,bestRank:{tier:'EMERALD'}}];
 const result=T.rankProgress(players,now);assert.deepEqual(result.rows.map(r=>r.status),['ranked','unranked','pending','error','partial','stale','account_missing','invalid']);assert.equal(result.total,8);assert.equal(Object.values(result.counts).reduce((a,b)=>a+b,0),8);
});
test('missing, future and invalid timestamps cannot substantiate a verified rank',()=>{
 const p={...team('a').players[0],rankStatus:'ranked',bestRank:rank};for(const at of [undefined,0,NaN,Infinity,1001,'1000']){const row=T.rankProgress([{...p,rankCheckedAt:at}],1000).rows[0];assert.equal(row.status,'stale');assert.equal(row.checkedAt,null);}
});
test('progress counts declared players rather than promising five covered starters or a team MMR',()=>{
 const a=team('a');a.players.push({...a.players[0],id:'sub'});const s=T.rankProgress(a.players);assert.equal(s.total,6);assert.equal(s.counts.pending,6);assert.equal('mmr' in s,false);assert.equal('score' in s,false);
});
test('actual progress panel distinguishes teams, statuses and escapes public identity text without fetching',()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8'),a=team('a','<script>bad()</script>'),h=team('h','UWU GANG');a.players[0].rankStatus='error';
 const c=vm.createContext({TeamScouting:T,S:{hasKey:false},esc:s=>String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;')});vm.runInContext(app.slice(app.indexOf('function rankProgressPanel('),app.indexOf('function groupBoardHtml(')),c);
 const html=c.rankProgressPanel(a,h);assert.match(html,/SUIVI DES RANGS SOLOQ/);assert.match(html,/erreur Riot/);assert.match(html,/à charger/);assert.match(html,/5 joueurs déclarés/);assert.match(html,/Configure une clé Riot valide/);assert.match(html,/Une erreur n’est pas un non-classé/);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
 assert.equal((c.rankProgressPanel(h,h).match(/<h3>/g)||[]).length,1);
});
test('actual rank refresh submits selected team and UWU GANG before offscreen and group players',async()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8'),a=team('a'),h=team('h','UWU GANG'),other=team('other'),players=[...other.players,...h.players,...a.players];let submitted;
 const c=vm.createContext({TeamScouting:T,S:{hasKey:true,ouatPlayers:players,lineups:{}},view:'TEAMS',selectedTeam:a.id,rankBusy:false,rankCooldownAt:0,rankFollowup:null,rankReloadPending:false,rankMeta:{},rankState:{},document:{querySelectorAll:()=>[]},window:{mw:{rankBatch:async ids=>{submitted=ids;return {updates:[],remaining:0};}}},allPlayers:()=>players,listForView:()=>other.players,render:()=>{},clearTimeout:()=>{},setTimeout:()=>{throw Error('No pending followup expected');}});
 vm.runInContext(app.slice(app.indexOf('async function refreshRanks('),app.indexOf('async function refreshLive(')),c);await c.refreshRanks();assert.deepEqual([...submitted.slice(0,10)],[...a.players,...h.players].map(p=>p.id));assert.equal(c.rankBusy,false);
});
test('without explicit priorities rank refresh still favors oldest due checks',async()=>{
 const players=team('a').players,api=riot(),cache=Object.fromEntries(players.map((p,i)=>[R.accountKey(p.accounts[0]),{checkedAt:5-i,nextCheck:0}]));await R.loadBatch(api,players,{cache,now:10000});assert.deepEqual(api.calls,players.slice().reverse().map(p=>p.id));
});
