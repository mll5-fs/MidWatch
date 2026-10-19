const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const T=require('../src/renderer/teams'),R=require('../src/renderer/report'),at=Date.UTC(2026,9,19);
const team=id=>({id,name:id,division:'Division 11',group:'Div 11D',players:T.roles.map((role,i)=>({id:id+i,name:id+' '+role,role,accounts:[{gameName:id+role,tagLine:'EUW'}],bestRank:{tier:'GOLD',rank:'II',leaguePoints:10+i*10},rankStatus:'ranked',rankCheckedAt:at}))});
const compare=(a,b,choices={},now=at)=>T.rankComparison(a,b,now,choices);
test('complete paired means use the same five roles in fixed order and existing official-rank conversion',()=>{
 const a=team('A'),b=team('UWU GANG');b.players.forEach(p=>p.bestRank.tier='PLATINUM');const c=compare(a,b);assert.deepEqual(c.roles,T.roles);assert.equal(c.covered,5);assert.equal(c.complete,true);assert.equal(c.means[0].score,1430);assert.equal(c.means[1].score,1830);assert.equal(c.means[0].label,'GOLD II · 30 LP');assert.ok(c.rows.every(r=>r.included));assert.equal('winner' in c,false);
});
test('unequal individual coverage becomes one exact common subset for both means',()=>{
 const a=team('A'),b=team('B');a.players[0].rankCheckedAt=at-900000;b.players[4].rankStatus='partial';const c=compare(a,b);assert.equal(T.summarize(a.players,at).covered,4);assert.equal(T.summarize(b.players,at).covered,4);assert.deepEqual(c.roles,['JUNGLE','MID','ADC']);assert.equal(c.covered,3);assert.equal(c.means[0].score,1430);assert.equal(c.means[1].score,1430);assert.equal(c.rows[0].sides[1].status,'covered');assert.equal(c.rows[0].included,false);assert.equal(c.rows[4].included,false);
});
test('disjoint or empty coverage produces unavailable means rather than zero or extrapolated five-player averages',()=>{
 const a=team('A'),b=team('B');a.players=a.players.slice(0,2);b.players=b.players.slice(2);const c=compare(a,b);assert.equal(c.covered,0);assert.ok(c.means.every(m=>m.score===null&&m.label==='Indisponible'));assert.equal(c.complete,false);
});
test('future/stale, errors, partial, absent accounts and unranked slots exclude both sides',()=>{
 for(const modify of [p=>p.rankCheckedAt=at+1,p=>p.rankCheckedAt=at-900000,p=>p.rankStatus='error',p=>p.rankStatus='partial',p=>p.accounts=[],p=>{p.rankStatus='unranked';p.bestRank={};}]){
  const a=team('A'),b=team('B');modify(a.players[2]);const c=compare(a,b);assert.equal(c.covered,4);assert.equal(c.rows[2].included,false);assert.equal(c.rows[2].sides[1].status,'covered');
 }
});
test('ambiguous and removed choices remain excluded, valid local lineup explicitly restores one role',()=>{
 const a=team('A'),b=team('B');a.players.push({...a.players[0],id:'sub',name:'Sub',accounts:[{gameName:'Sub',tagLine:'EUW'}]});assert.equal(compare(a,b).covered,4);const selected=compare(a,b,{A:{TOP:'sub'}});assert.equal(selected.covered,5);assert.equal(selected.rows[0].sides[0].manual,true);assert.equal(selected.rows[0].sides[0].player.name,'Sub');assert.equal(compare(a,b,{A:{TOP:'removed'}}).rows[0].sides[0].status,'selection_missing');
});
test('an account shared within one roster excludes its affected roles from both means',()=>{
 const a=team('A'),b=team('B');a.players[1].accounts=a.players[0].accounts;const c=compare(a,b);assert.equal(c.covered,3);assert.equal(c.rows[0].sides[0].status,'duplicate');assert.equal(c.rows[1].included,false);
});
test('an account present across the two teams, even on different roles or with case differences, cannot compare against itself',()=>{
 const a=team('A'),b=team('B');b.players[2].accounts=[{gameName:'  aTOP  ',tagLine:'euw',platform:'euw1'}];const c=compare(a,b);assert.equal(c.covered,3);assert.equal(c.rows[0].sides[0].status,'shared');assert.equal(c.rows[2].sides[1].status,'shared');assert.deepEqual(c.roles,['JUNGLE','ADC','SUPPORT']);
});
test('rank evidence tied to an account removed from the current roster is not used',()=>{
 const a=team('A'),b=team('B');a.players[0].bestRankAccount={gameName:'Previous',tagLine:'EUW'};const c=compare(a,b);assert.equal(c.covered,4);assert.equal(c.rows[0].sides[0].status,'account_changed');
});
test('same/absent teams cannot create comparisons and inputs are not mutated',()=>{
 const a=team('A'),b=team('B'),before=JSON.stringify([a,b]);assert.equal(compare(a,a),null);assert.equal(compare(a,null),null);assert.equal(compare(null,b),null);compare(a,b);assert.equal(JSON.stringify([a,b]),before);
});
test('freshness is reevaluated, Master+ uses existing conversion, and no old date is refreshed',()=>{
 const a=team('A'),b=team('B');a.players.forEach(p=>p.bestRank={tier:'CHALLENGER',leaguePoints:500});assert.equal(compare(a,b).means[0].label,'MASTER+ · 500 LP moyens');assert.equal(compare(a,b,{},at+900000).covered,0);assert.equal(a.players[0].rankCheckedAt,at);
});
function ui(){const c=vm.createContext({TeamScouting:T,S:{lineups:{}},Date:class extends Date{static now(){return at;}},esc:v=>String(v??'').replaceAll('<','&lt;').replaceAll('>','&gt;'),playerRankLabel:p=>p.bestRank?.tier||'',rankPlaceholder:()=> 'Indisponible'}),app=fs.readFileSync('src/renderer/app.js','utf8');vm.runInContext(app.slice(app.indexOf('function rankComparisonPanel('),app.indexOf('function teamWorkspaceNav(')),c);return c;}
test('actual paired-rank panel shows identities, dates and exclusions with escaped fields, no fabricated winner',()=>{
 const a=team('<img src=x>'),b=team('UWU GANG');a.players[0].rankStatus='error';const c=ui(),html=c.rankComparisonPanel(a,b);assert.match(html,/4\/5 rôles communs exploitables · PARTIEL/);assert.match(html,/EXCLU DES DEUX MOYENNES/);assert.match(html,/erreur Riot/);assert.match(html,/Vérifié :/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);assert.match(html,/Pas le MMR, pas un pronostic/);assert.equal(c.rankComparisonPanel(a,null),'');assert.equal(c.rankComparisonPanel(a,a),'');
});
test('team export uses the same common subset with limits and never serializes raw private fields',()=>{
 const a=team('A'),b=team('UWU GANG');a.players[0].rankCheckedAt=at-900000;a.players[0].secret='PRIVATE_SECRET';const text=R.build({team:a,home:b,now:at,lineups:{},version:'5.24.0'}),paired=text.split('RANGS COMPARÉS · MÊMES RÔLES')[1];assert.match(paired,/4\/5 rôles communs exploitables/);assert.match(paired,/JUNGLE, MID, ADC, SUPPORT/);assert.match(paired,/TOP · EXCLU DES DEUX MOYENNES/);assert.match(paired,/rang périmé/);assert.match(paired,/100 points\/division/);assert.doesNotMatch(text,/PRIVATE_SECRET/);assert.equal((text.match(/^TOP :/gm)||[]).length,2);assert.doesNotMatch(R.build({team:a,now:at}),/RANGS COMPARÉS/);
});
