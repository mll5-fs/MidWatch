const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const scouting=require('../src/services/scouting'),{buildCoverage}=require('../src/services/sample-coverage'),cache=require('../src/services/stats-cache'),role=require('../src/services/role-report');
const account={platform:'EUW1',gameName:'Fixture',tagLine:'EUW'};
const match=(overrides={})=>({info:{queueId:420,gameVersion:'16.20.1',gameStartTimestamp:Date.UTC(2026,9,15),participants:[{puuid:'p',participantId:1,teamId:100,teamPosition:'MIDDLE',individualPosition:'MIDDLE',championName:'Ahri',win:true,kills:6,deaths:3,assists:9,timePlayed:1800,totalMinionsKilled:240,neutralMinionsKilled:0,totalDamageDealtToChampions:24000,goldEarned:12000,visionScore:25,...overrides}]}});
function harness(matches,initial={}){
 const stored={...initial},calls={matches:0,timelines:0,ids:0},api={resolveAccount:async a=>({...a,puuid:'p'}),matchIds:async()=>{calls.ids++;return matches.map((_,i)=>String(i));},match:async(_p,id)=>{calls.matches++;if(matches[id]instanceof Error)throw matches[id];return matches[id];},timeline:async()=>{calls.timelines++;return {info:{frames:[]}};}};
 const c=vm.createContext({...scouting,buildCoverage,statsCache:cache,key:()=>true,require:p=>{assert.equal(p,'./services/role-report');return role;},Riot:function(){return api;},store:{get:(k,f)=>stored[k]??f,set:(k,v)=>{stored[k]=v;}}});
 const main=fs.readFileSync('src/main.js','utf8');vm.runInContext(main.slice(main.indexOf('async function playerStats('),main.indexOf('async function playerPatchStats(')),c);return {run:()=>c.playerStats(account),calls,stored,api};
}
test('each incomplete numeric MID payload is excluded before aggregation and timeline collection',async()=>{
 for(const field of ['kills','deaths','assists','timePlayed','totalMinionsKilled','neutralMinionsKilled','totalDamageDealtToChampions','goldEarned','visionScore']){
  const h=harness([match(),match({[field]:undefined})]),r=await h.run();assert.equal(r.games,1,field);assert.equal(r.coverage.invalidGames,1,field);assert.equal(r.coverage.partial,true);assert.equal(h.calls.timelines,1);assert.equal(r.cspm,8);assert.equal(r.vision,25);
 }
});
test('non-numeric, negative, non-finite, invalid win and zero-duration payloads never become zero-valued games',async()=>{
 for(const overrides of [{kills:null},{kills:'6'},{kills:-1},{kills:NaN},{kills:Infinity},{win:1},{win:null},{timePlayed:0}]){const r=await harness([match(overrides)]).run();assert.equal(r.games,0);assert.equal(r.coverage.invalidGames,1);assert.equal(r.coverage.partial,true);assert.equal(r.winrate,undefined);assert.equal(r.vision,undefined);}
});
test('measured zero fields stay valid and do not fabricate a nonzero winrate',async()=>{
 const r=await harness([match({win:false,kills:0,deaths:0,assists:0,totalMinionsKilled:0,neutralMinionsKilled:0,totalDamageDealtToChampions:0,goldEarned:0,visionScore:0})]).run();assert.equal(r.games,1);for(const field of ['wins','winrate','kills','deaths','assists','cspm','dpm','gpm','vision'])assert.equal(r[field],0,field);assert.equal(r.coverage.partial,false);
});
test('authoritative teamPosition excludes off-role games even if individualPosition says middle',async()=>{
 const off=match({teamPosition:'TOP',individualPosition:'MIDDLE'}),otherQueue=match();otherQueue.info.queueId=440;const h=harness([off,otherQueue]),r=await h.run();assert.equal(r.games,0);assert.equal(r.coverage.invalidGames,0);assert.equal(h.calls.timelines,0);assert.equal(r.coverage.partial,false);
});
test('valid MID fallback and weighted rates use actual positive time, including sub-minute fixtures',async()=>{
 const r=await harness([match({teamPosition:'',timePlayed:30,totalMinionsKilled:4,totalDamageDealtToChampions:400,goldEarned:200})]).run();assert.equal(r.games,1);assert.equal(r.cspm,8);assert.equal(r.dpm,800);assert.equal(r.gpm,400);
 const mixed=await harness([match(),match({timePlayed:3600,totalMinionsKilled:120,totalDamageDealtToChampions:12000,goldEarned:6000})]).run();assert.equal(mixed.cspm,4);assert.equal(mixed.dpm,400);assert.equal(mixed.gpm,200);
});
test('invalid games are excluded from dates, champions, patches and the twelve-game target',async()=>{
 const invalid=match({championName:'InvalidChampion',visionScore:null});invalid.info.gameVersion='16.19';invalid.info.gameStartTimestamp=Date.UTC(2026,8,1);
 const h=harness([invalid,...Array.from({length:13},()=>match())]),r=await h.run();assert.equal(r.games,12);assert.equal(r.coverage.matchAttempts,13);assert.equal(h.calls.timelines,12);assert.equal(r.coverage.targetReached,true);assert.equal(r.coverage.partial,true);assert.equal(r.coverage.invalidGames,1);assert.equal(r.champions.length,1);assert.equal(r.patches[0].patch,'16.20');assert.equal(r.window.oldestAt,Date.UTC(2026,9,15));
});
test('empty validated reports have coverage and are reused only from the new cache namespace',async()=>{
 const legacy=cache.write({},account,{games:99,habits:['OLD']});const h=harness([match({visionScore:null})],{statsCache:legacy}),first=await h.run();assert.equal(first.games,0);assert.equal(first.window.games,0);assert.ok(h.stored.statsCacheV2);assert.equal(h.stored.statsCache,legacy);const again=await h.run();assert.equal(again.games,0);assert.equal(h.calls.ids,1);
});
test('auth and quota stops remain partial without collecting subsequent matches',async()=>{
 for(const status of [403,429]){const h=harness([Object.assign(Error('blocked'),{status}),match()]),r=await h.run();assert.equal(r.games,0);assert.equal(r.coverage.partial,true);assert.equal(r.coverage.stop,status===403?'auth':'rate_limit');assert.equal(h.calls.matches,1);}
});
test('descriptive MID trends no longer infer discipline, resource priority or collective participation',async()=>{
 const r=await harness([match()]).run();assert.ok(r.habits.some(x=>x.includes('Morts moyennes')));assert.ok(r.habits.some(x=>x.includes('Assists moyennes')));assert.doesNotMatch(r.habits.join(' '),/disciplin|Priorité élevée|Investissement|Participation collective|Pression dégâts/);
});
test('shared validator preserves existing five-role behavior and rejects absent participants',()=>{
 assert.equal(role.validRoleStats(null),false);for(const name of ['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'])assert.equal(role.summarizeRole([match({teamPosition:name})],'p',name).games,1);
});
test('shared report cache rejects future and malformed timestamps and invalid clock values',()=>{
 const key=cache.accountKey(account);for(const at of [1001,'1000',NaN,Infinity,undefined,-1])assert.equal(cache.read({[key]:{at,value:{games:12}}},account,1000),null);
 for(const now of [NaN,Infinity,-1])assert.equal(cache.read(cache.write({},account,{games:12},1000),account,now),null);
 assert.equal(cache.read(cache.write({},account,{games:1},0),account,0).games,1);
});
test('actual report UI displays exclusions and partial coverage, without additional calls',async()=>{
 const r=await harness([match(),match({visionScore:undefined})]).run(),app=fs.readFileSync('src/renderer/app.js','utf8'),c=vm.createContext({esc:String});vm.runInContext(app.slice(app.indexOf('function coverageReport('),app.indexOf('function roleStatReport(')),c);const html=c.coverageReport(r.coverage);assert.match(html,/ÉCHANTILLON PARTIEL/);assert.match(html,/1 partie\(s\) incomplète\(s\) exclue\(s\)/);assert.match(html,/parties mid 1/);
});
