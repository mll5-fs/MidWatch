const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {collectRoleReport}=require('../src/services/role-report'),D=require('../src/renderer/duels'),R=require('../src/renderer/report'),cache=require('../src/services/stats-cache');
const now=Date.UTC(2026,9,18),account={gameName:'Fixture',tagLine:'EUW',platform:'EUW1'},roles={TOP:'TOP',JUNGLE:'JUNGLE',MID:'MIDDLE',ADC:'BOTTOM',SUPPORT:'UTILITY'};
function match(id,role='MID',win=true){return {metadata:{matchId:id},info:{queueId:420,gameVersion:'16.20.1',gameStartTimestamp:now-1000,participants:[{puuid:'p',teamPosition:roles[role],championName:'Ahri',win,timePlayed:1800,kills:4,deaths:2,assists:8,totalMinionsKilled:180,neutralMinionsKilled:0,totalDamageDealtToChampions:18000,goldEarned:10000,visionScore:20}]}};}
function api(ids,role='MID',get=id=>match(id,role)){
 const calls=[];return {calls,resolveAccount:async()=>({...account,puuid:'p'}),matchIds:async()=>ids,match:async(_p,id)=>{calls.push(id);return get(id);},timeline:()=>assert.fail('No timeline request')};
}
for(const role of Object.keys(roles))test(role+' collects repeated IDs only once without inflating samples, pools or sources',async()=>{
 const ids=['EUW1_1','EUW1_1','EUW1_2','EUW1_2'],a=api(ids,role,id=>match(id,role,id==='EUW1_1')),before=JSON.stringify(ids),r=await collectRoleReport(a,account,role,{now:()=>now});
 assert.deepEqual(a.calls,['EUW1_1','EUW1_2']);assert.equal(r.games,2);assert.equal(r.winrate,50);assert.equal(r.champions[0].games,2);assert.equal(r.evidence.length,2);assert.equal(r.coverage.historyEntries,4);assert.equal(r.coverage.requested,2);assert.equal(r.coverage.matchAttempts,2);assert.equal(r.coverage.duplicateIds,2);assert.equal(r.coverage.partial,true);assert.equal(JSON.stringify(ids),before);
});
test('non-string, blank and padded history entries are counted but never requested',async()=>{
 const a=api([null,{},0,'','  ',' EUW1_1','EUW1_1']);const r=await collectRoleReport(a,account,'MID',{now:()=>now});assert.deepEqual(a.calls,['EUW1_1']);assert.equal(r.games,1);assert.equal(r.coverage.invalidIds,6);assert.equal(r.coverage.partial,true);
 const empty=await collectRoleReport(api([null,'']),account,'MID',{now:()=>now});assert.equal(empty.games,0);assert.equal(empty.coverage.requested,0);assert.equal(empty.coverage.historyEntries,2);assert.equal(empty.coverage.partial,true);
});
test('returned identity mismatches and malformed explicit IDs cannot enter averages or evidence',async()=>{
 for(const id of ['EUW1_999',null,undefined,42,'']){
  const a=api(['EUW1_1','EUW1_2'],'MID',request=>request==='EUW1_1'?match(id):match(request,'MID',false)),r=await collectRoleReport(a,account,'MID',{now:()=>now});assert.equal(r.games,1,String(id));assert.equal(r.winrate,0);assert.deepEqual(r.evidence.map(e=>e.matchId),['EUW1_2']);assert.equal(r.coverage.identityErrors,1);assert.equal(r.coverage.partial,true);
 }
});
test('omitted metadata identity still uses the real request ID without fabricating a match',async()=>{
 for(const metadata of [undefined,{},null]){const a=api(['EUW1_1'],'MID',id=>({...match(id),metadata})),r=await collectRoleReport(a,account,'MID',{now:()=>now});assert.equal(r.games,1);assert.equal(r.evidence[0].matchId,'EUW1_1');assert.equal(r.evidence[0].idSource,'request');assert.equal(r.coverage.identityErrors,0);assert.equal(r.coverage.partial,false);}
});
test('auth and quota stops retain accepted unique sources and do not request subsequent IDs',async()=>{
 for(const status of [403,429]){const a=api(['EUW1_1','EUW1_1','EUW1_2','EUW1_3'],'MID',id=>{if(id==='EUW1_2')throw Object.assign(Error('blocked'),{status});return match(id);}),r=await collectRoleReport(a,account,'MID',{now:()=>now});assert.deepEqual(a.calls,['EUW1_1','EUW1_2']);assert.equal(r.games,1);assert.equal(r.coverage.duplicateIds,1);assert.equal(r.coverage.stop,status===403?'auth':'rate_limit');}
});
test('malformed history fails explicitly while patch collection keeps its thirty-unique-game target',async()=>{
 for(const value of [null,{},'EUW1_1'])await assert.rejects(collectRoleReport(api(value),account,'MID'),/Historique Riot incohérent/);
 const ids=Array.from({length:40},(_,i)=>'EUW1_'+(i+1));ids.splice(1,0,ids[0]);const a=api(ids),r=await collectRoleReport(a,account,'MID',{patchOnly:true,now:()=>now});assert.equal(r.games,30);assert.equal(a.calls.length,30);assert.equal(r.coverage.target,30);assert.equal(r.coverage.targetReached,true);assert.equal(r.coverage.duplicateIds,1);assert.equal(r.coverage.partial,true);
});
test('coverage diagnostics survive patch/champion filtering, actual UI and both export scopes',async()=>{
 const a=api(['EUW1_1','EUW1_1',null,'EUW1_2'],'MID',id=>match(id==='EUW1_2'?'EUW1_999':id)),r=await collectRoleReport(a,account,'MID',{now:()=>now}),scoped=D.scopeReport(r,'16.20','Ahri');assert.equal(scoped.coverage.duplicateIds,1);assert.equal(scoped.coverage.identityErrors,1);assert.equal(scoped.games,1);
 const app=fs.readFileSync('src/renderer/app.js','utf8'),c=vm.createContext({esc:String});vm.runInContext(app.slice(app.indexOf('function coverageReport('),app.indexOf('function roleStatReport(')),c);const html=c.coverageReport(scoped.coverage);for(const text of ['INTÉGRITÉ DES PARTIES','1 identifiant(s) répété(s)','1 entrée(s) d’historique invalide(s)','1 réponse(s) avec identité incohérente'])assert.ok(html.includes(text),text);assert.match(c.coverageReport({historyEntries:2,requested:0,invalidIds:2,partial:true}),/INTÉGRITÉ DES PARTIES/);
 const team=id=>({id,name:id,players:[]}),pair={role:'MID',sides:[{teamName:'Opponent'},{teamName:'UWU GANG'}]},text=R.build({team:team('Opponent'),home:team('UWU GANG'),duels:[{pair,reports:[r,r],patch:'16.20',champion:'Ahri'}],draftPatch:'16.20'}),[detail,pools]=text.split('POOLS OBSERVÉS · PRÉPARATION DRAFT');assert.match(detail,/INTÉGRITÉ DES PARTIES/);assert.match(pools,/INTÉGRITÉ DES PARTIES/);assert.doesNotMatch(text,/EUW1_999/);
});
test('old report-cache namespace is ignored rather than reused as a validated sample',()=>{
 const a={...account,scoutingRole:'MID'},oldKey='ranked-role-v5|mid|euw1|Fixture#EUW'.toLowerCase();assert.equal(cache.read({[oldKey]:{at:now,value:{games:99}}},a,now+1),null);assert.match(cache.accountKey(a),/^ranked-role-v6/);assert.equal(cache.read(cache.write({},a,{games:1},now),a,now+1).games,1);
});
