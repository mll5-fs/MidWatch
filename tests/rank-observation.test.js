const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const T=require('../src/renderer/teams'),R=require('../src/renderer/report');
const now=Date.UTC(2026,9,19,11),ttl=900000,rank={tier:'GOLD',rank:'II',leaguePoints:50};
const player=(id='fixture')=>({id,name:id,teamId:'A',team:'Fixture A',division:'D11',group:'D',role:'MID',region:'OUAT',accounts:[{gameName:id,tagLine:'EUW',platform:'EUW1'}],bestRank:{...rank},rankStatus:'ranked',rankCheckedAt:now});
const team=id=>({id,name:id,division:'D11',group:'D',players:T.roles.map(role=>({...player(id+role),teamId:id,team:id,role}))});
const app=fs.readFileSync('src/renderer/app.js','utf8');
function ui(){
 const nodes={},$=id=>nodes[id]??={innerHTML:'',onclick:null},esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const c=vm.createContext({TeamScouting:{...T,rankObservation:p=>T.rankObservation(p,now)},S:{hasKey:true,favorites:[]},Date:class extends Date{static now(){return now;}},$,esc,stateOf:()=> 'unknown',scoutingAccount:p=>p.accounts[0],rankScore:()=>0,avatar:()=>'',LiveMonitor:{label:()=> 'LIVE inconnu'},accountHtml:()=>'',scoutingPanel:()=>'',champHtml:()=>'',document:{querySelectorAll:()=>[]},syncSpectateButtons:()=>{},closeDrawer:()=>{},settings:()=>{},window:{mw:{}}});
 vm.runInContext(app.slice(app.indexOf('function rankClass('),app.indexOf('function rankScore(')),c);
 vm.runInContext(app.slice(app.indexOf('function rankPlaceholder('),app.indexOf('function tracked(')),c);
 vm.runInContext(app.slice(app.indexOf('function card('),app.indexOf('function hero(')),c);
 vm.runInContext(app.slice(app.indexOf('function drawPlayer('),app.indexOf('async function reloadAccountIdentity(')),c);
 return {c,nodes};
}
test('a single observation uses a strict positive finite timestamp and the exact 15 minute boundary',()=>{
 const p=player();assert.equal(T.rankObservation(p,now).status,'ranked');
 assert.equal(T.rankObservation({...p,rankCheckedAt:now-ttl+1},now).status,'ranked');
 for(const at of [now-ttl,now-ttl-1,now+1,0,-1,NaN,Infinity,undefined,null,String(now)]){
  const q={...p,rankCheckedAt:at};assert.equal(T.rankObservation(q,now).status,'stale');assert.equal(T.summarize([q],now).covered,0);assert.equal(T.rankProgress([q],now).rows[0].status,'stale');
 }
 assert.equal(T.summarize([{...p,rankCheckedAt:0}],1).covered,0,'epoch zero cannot become a fresh rank near epoch');
});
test('expired rank stays visible as PÉRIMÉ and keeps its original date/value',()=>{
 const {c}=ui(),p={...player(),rankCheckedAt:now-ttl},before=JSON.stringify(p);assert.equal(c.playerRankLabel(p),'GOLD II · 50 LP · PÉRIMÉ');assert.match(c.rankDateHtml(p),/SOLOQ · vérifié le/);assert.equal(JSON.stringify(p),before);
});
test('unranked is only confirmed while fresh and never contributes a zero to means',()=>{
 const {c}=ui(),p={...player(),rankStatus:'unranked',bestRank:{}};assert.equal(c.rankPlaceholder(p),'NON CLASSÉ SOLOQ');assert.equal(T.summarize([p],now).score,null);
 p.rankCheckedAt=now-ttl;assert.equal(c.rankPlaceholder(p),'NON CLASSÉ · À REVÉRIFIER');assert.equal(T.rankProgress([p],now).counts.stale,1);assert.equal(T.summarize([p],now).score,null);
});
test('unknown/future dates are not displayed as a successful verification',()=>{
 const {c}=ui();for(const at of [0,-1,now+1,NaN,undefined,String(now)])assert.match(c.rankDateHtml({...player(),rankCheckedAt:at}),/date de vérification indisponible/);
});
test('error and partial labels remain explicit even when the cached date is old',()=>{
 const {c}=ui();for(const [status,suffix]of [['error','À REVÉRIFIER'],['partial','PARTIEL'],['pending','À VÉRIFIER']]){const p={...player(),rankStatus:status,rankCheckedAt:now-ttl};assert.match(c.playerRankLabel(p),new RegExp(suffix));assert.equal(T.summarize([p],now).covered,0);}
});
test('invalid rank is not rendered as a current badge with fabricated default LP',()=>{
 const {c}=ui(),p={...player(),bestRank:{tier:'GOLD'}};assert.equal(c.playerRankLabel(p),'');assert.equal(c.rankPlaceholder(p),'RANG INCOHÉRENT');assert.equal(T.rankProgress([p],now).counts.invalid,1);
});
test('missing/null/blank/boolean/string LP cannot be coerced into an observed numeric rank',()=>{
 const {c}=ui();for(const lp of [null,undefined,'','50',false,NaN,-1,101]){const p={...player(),bestRank:{...rank,leaguePoints:lp}};assert.equal(T.points(p.bestRank),null);assert.equal(T.rankObservation(p,now).status,'invalid');assert.equal(c.playerRankLabel(p),'');assert.equal(T.summarize([p],now).covered,0);}
 assert.equal(T.points({...rank,leaguePoints:0}),1400);assert.equal(T.points({tier:'MASTER',leaguePoints:1000}),3800);
});
test('a rank from a removed account is rejected in individual, paired and group averages',()=>{
 const a=team('A'),b=team('B'),p=a.players[0];p.bestRankAccount={gameName:'REMOVED',tagLine:'EUW'};
 const observation=T.rankObservation(p,now);assert.equal(observation.status,'account_changed');assert.equal(observation.account,null);assert.equal(observation.checkedAt,null);
 const s=T.summarize(a.players,now);assert.equal(s.covered,4);assert.equal(s.slots[0].status,'account_changed');const c=T.rankComparison(a,b,now);assert.equal(c.covered,4);assert.equal(c.rows[0].sides[0].status,'account_changed');assert.equal(c.rows[0].included,false);
 const board=T.groupBoard([a,b],'A',now);assert.equal(board.rows.find(r=>r.team.id==='A').position,null);assert.equal(T.rankProgress(a.players,now).counts.account_changed,1);
});
test('removed-account value/date cannot be relabelled onto the current Riot ID in either export',()=>{
 const a=team('A'),b=team('B');a.players[0].bestRankAccount={gameName:'REMOVED',tagLine:'EUW'};a.players[0].bestRank={tier:'CHALLENGER',leaguePoints:1234};
 for(const text of [R.build({team:a,home:b,now}),R.buildGroup({teams:[a,b],selectedId:'A',now})]){assert.match(text,/compte du rang absent de l’effectif actuel/);assert.doesNotMatch(text,/1234 LP|CHALLENGER/);assert.match(text,/4\/5/);assert.match(text,/date indisponible/);}
});
test('current secondary account and case/space normalization do not invalidate a valid rank',()=>{
 const p=player();p.accounts.push({gameName:'Secondary',tagLine:'EUW',platform:'EUW1'});p.bestRankAccount={gameName:' secondary ',tagLine:'euw',platform:'euw1'};assert.equal(T.rankObservation(p,now).status,'ranked');assert.equal(T.rankObservation(p,now).account,p.accounts[1]);assert.equal(T.summarize([p],now).covered,1);
 p.bestRankAccount.platform='NA1';assert.equal(T.rankObservation(p,now).status,'account_changed');
});
test('current account without preferred-account metadata remains supported; no linked account is invented',()=>{
 const p=player();assert.equal(T.rankObservation(p,now).account,p.accounts[0]);p.accounts=[];assert.equal(T.rankObservation(p,now).status,'account_missing');assert.equal(T.summarize([p],now).covered,0);const {c}=ui();assert.equal(c.playerRankLabel(p),'');assert.equal(c.rankPlaceholder(p),'COMPTE NON RELIÉ');
});
test('duplicate roles and partial/missing data remain excluded with local lineup choices',()=>{
 const a=team('A');a.players[1].accounts=a.players[0].accounts;assert.equal(T.summarize(a.players,now).covered,3);a.players[1].bestRankAccount={gameName:'Removed',tagLine:'EUW'};const s=T.summarize(a.players,now,{JUNGLE:a.players[1].id});assert.equal(s.slots[1].status,'account_changed');assert.equal(s.covered,4);
});
test('actual cards, OUAT list and player drawer contain dated stale observations',()=>{
 const {c,nodes}=ui(),p={...player(),rankCheckedAt:now-ttl};for(const html of [c.card(p),c.ouatBrowser([p])]){assert.match(html,/GOLD II · 50 LP · PÉRIMÉ/);assert.match(html,/class="rank-checked"/);assert.match(html,/SOLOQ · vérifié le/);}
 c.drawPlayer(p);assert.match(nodes['#drawer'].innerHTML,/RANG SOLOQ OBSERVÉ/);assert.match(nodes['#drawer'].innerHTML,/PÉRIMÉ/);assert.match(nodes['#drawer'].innerHTML,/pas un rang actuel confirmé/);
});
test('actual labels suppress a removed-account rank and show the actionable reload reason',()=>{
 const {c}=ui(),p={...player(),bestRankAccount:{gameName:'Removed',tagLine:'EUW'}};assert.equal(c.playerRankLabel(p),'');assert.equal(c.rankPlaceholder(p),'COMPTE MODIFIÉ · RANG À RECHARGER');assert.match(c.card(p),/COMPTE MODIFIÉ/);assert.doesNotMatch(c.card(p),/GOLD II/);assert.match(c.rankDateHtml(p),/indisponible/);
});
test('raw date HTML and observation labels do not inject public identity strings or issue requests',()=>{
 const {c}=ui(),p=player('<img src=x onerror=bad()>');assert.doesNotMatch(c.rankDateHtml(p),/<img/);assert.match(c.card(p),/&lt;img/);assert.doesNotMatch(c.card(p),/<img src=x/);assert.match(fs.readFileSync('src/renderer/style.css','utf8'),/\.rank-checked\{display:block/);assert.match(app,/\$\{rankDateHtml\(p\)\}<small>\$\{esc\(LiveMonitor.label\(p\)\)\}/);
});
