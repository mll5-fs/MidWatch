const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const role=require('../src/services/role-report'),scouting=require('../src/services/scouting'),cache=require('../src/services/stats-cache'),{buildCoverage}=require('../src/services/sample-coverage'),D=require('../src/renderer/duels'),R=require('../src/renderer/report');
const fields=['kills','deaths','assists','totalMinionsKilled','neutralMinionsKilled','totalDamageDealtToChampions','goldEarned','visionScore'];
const account={gameName:'Fixture',tagLine:'EUW',platform:'EUW1'};
function match(position='MIDDLE',omit=[],patch='16.20.1',champion='Ahri'){
 const p={puuid:'p',participantId:1,teamId:100,teamPosition:position,championName:champion,win:false,timePlayed:1800,kills:4,deaths:2,assists:6,totalMinionsKilled:120,neutralMinionsKilled:0,totalDamageDealtToChampions:15000,goldEarned:9000,visionScore:12};for(const field of omit)delete p[field];
 return {info:{queueId:420,gameVersion:patch,gameStartTimestamp:Date.UTC(2026,9,16),participants:[p]}};
}
for(const [position,name]of [['TOP','TOP'],['JUNGLE','JUNGLE'],['MIDDLE','MID'],['BOTTOM','ADC'],['UTILITY','SUPPORT']])test(name+' accepts omitted counting stats according to Riot without mutating the raw match',()=>{
 const m=match(position,fields),original=JSON.stringify(m),r=role.summarizeRole([m],'p',name);assert.equal(r.games,1);assert.equal(r.winrate,0);
 for(const k of ['kills','deaths','assists','cspm','dpm','gpm','vision'])assert.equal(r[k],0,k);
 assert.equal(r.normalization.games,1);assert.equal(r.normalization.fields,8);assert.match(r.normalization.source,/developer.riotgames.com/);assert.equal(r.patches[0].games,1);assert.equal(r.patches[0].kda,0);assert.equal(JSON.stringify(m),original);
 for(const f of fields){const raw=match(position,[f]).info.participants[0],p=role.normalizeRoleStats(raw);assert.equal(p[f],0);assert.deepEqual(p.riotOmittedStats,[f]);assert.equal(Object.hasOwn(raw,f),false);}
});
test('explicit invalid numbers are not confused with omitted zero values',()=>{
 for(const f of fields)for(const value of [null,undefined,'0',NaN,Infinity,-1,false]){const m=match();m.info.participants[0][f]=value;assert.equal(role.summarizeRole([m],'p','MID').games,0,f+' '+String(value));}
 const p=match().info.participants[0];p.riotOmittedStats=['fake'];assert.equal(role.normalizeRoleStats(p).riotOmittedStats.length,0);
});
test('missing duration, victory, account, role or SoloQ identity never becomes a fabricated game',()=>{
 for(const f of ['timePlayed','win','puuid','teamPosition'])assert.equal(role.summarizeRole([match('MIDDLE',[f])],'p','MID').games,0,f);
 for(const duration of [0,-1,null,'1800',NaN]){const m=match();m.info.participants[0].timePlayed=duration;assert.equal(role.summarizeRole([m],'p','MID').games,0);}
 const m=match();m.info.queueId=440;assert.equal(role.summarizeRole([m],'p','MID').games,0);
});
test('patch and champion scopes recompute omission provenance on their exact own samples',()=>{
 const r=role.summarizeRole([match('MIDDLE',['kills','deaths']),match('MIDDLE',['visionScore'],'16.19.1','Jinx'),match()],'p','MID');
 assert.equal(r.normalization.games,2);assert.equal(r.normalization.fields,3);
 const current=D.scopeReport(r,'16.20','Ahri'),old=D.scopeReport(r,'16.19','Jinx');assert.equal(current.games,2);assert.equal(current.normalization.games,1);assert.equal(current.normalization.fields,2);assert.equal(old.normalization.fields,1);assert.equal(old.vision,0);
});
test('patch collector counts accepted omissions toward its real thirty-game target and rejects invalid values',async()=>{
 const api={resolveAccount:async()=>({...account,puuid:'p'}),matchIds:async(_p,_u,n)=>{assert.equal(n,60);return Array.from({length:40},(_,i)=>String(i));},match:async(_p,id)=>{const m=match('UTILITY',['neutralMinionsKilled']);if(id==='0')m.info.participants[0].visionScore=null;return m;},timeline:()=>assert.fail('No support timeline')};
 const r=await role.collectRoleReport(api,account,'SUPPORT',{patchOnly:true});assert.equal(r.games,30);assert.equal(r.coverage.matchAttempts,31);assert.equal(r.coverage.invalidGames,1);assert.equal(r.coverage.targetReached,true);assert.equal(r.coverage.partial,true);assert.equal(r.normalization.games,30);assert.equal(r.normalization.fields,30);
});
function mainHarness(matches){
 const data={},calls={ids:[],timeline:0},api={resolveAccount:async()=>({...account,puuid:'p'}),matchIds:async(_p,_u,n)=>{calls.ids.push(n);return matches.map((_,i)=>String(i));},match:async(_p,id)=>matches[id],timeline:async()=>{calls.timeline++;return {info:{frames:[]}};}};
 const c=vm.createContext({...scouting,buildCoverage,statsCache:cache,key:()=>true,Riot:function(){return api;},require:p=>p.endsWith('ouat-roles')?require('../src/services/ouat-roles'):role,store:{get:k=>data[k]||{},set:(k,v)=>data[k]=v}});
 const src=fs.readFileSync('src/main.js','utf8');vm.runInContext(src.slice(src.indexOf('async function playerStats('),src.indexOf('async function rankBatch(')),c);return {c,calls,data};
}
test('detailed MID uses normalized combat values consistently in totals, champions and patches',async()=>{
 const m=match('MIDDLE',['kills','deaths','neutralMinionsKilled']),before=JSON.stringify(m),h=mainHarness([m]),r=await h.c.playerStats(account);
 assert.equal(r.games,1);assert.equal(r.kills,0);assert.equal(r.deaths,0);assert.equal(r.kda,6);assert.equal(r.patches[0].games,1);assert.equal(r.patches[0].kda,6);assert.equal(r.champions[0].kda,6);assert.equal(r.normalization.fields,3);assert.equal(r.coverage.invalidGames,0);assert.equal(h.calls.timeline,1);assert.equal(JSON.stringify(m),before);assert.ok(h.data.statsCacheV4);
});
test('dedicated MID patch screen uses the same normalization without timeline calls or old report caches',async()=>{
 const h=mainHarness([match('MIDDLE',['kills'])]);h.data.patchStatsCache=cache.write({},account,{games:99});h.data.roleStatsCacheV3=cache.write({},{...account,scoutingRole:'MID'},{games:99});
 const r=await h.c.playerPatchStats(account);assert.equal(r.games,1);assert.equal(r.normalization.fields,1);assert.equal(r.patches[0].games,1);assert.deepEqual(h.calls.ids,[60]);assert.equal(h.calls.timeline,0);assert.ok(h.data.rolePatchStatsCacheV3);
 const comparison=await h.c.playerRoleStats(account,'MID');assert.equal(comparison.games,1);assert.ok(h.data.roleStatsCacheV5);assert.deepEqual(h.calls.ids,[60,20]);
});
test('actual coverage UI and scoped team export disclose the zero convention and its sample counts',()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8'),c=vm.createContext({esc:String});vm.runInContext(app.slice(app.indexOf('function coverageReport('),app.indexOf('function roleStatReport(')),c);
 const r=role.summarizeRole([match('MIDDLE',['kills','deaths'])],'p','MID');r.coverage={requested:1,matchesLoaded:1,roleGames:1,role:'MID'};
 const html=c.coverageReport(r.coverage,r.normalization);assert.match(html,/Convention Riot : 2 champ/);assert.match(html,/1 partie/);assert.match(html,/valeurs nulles ou invalides exclues/);assert.doesNotMatch(c.coverageReport(r.coverage),/Convention Riot/);
 const team=id=>({id,name:id,players:[]}),pair={role:'MID',sides:[{teamName:'Adversaire',player:{name:'Fixture'}},{teamName:'UWU GANG',player:{name:'Home'}}]};
 const text=R.build({team:team('opp'),home:team('home'),duels:[{pair,reports:[r,r],patch:'16.20',champion:'Ahri'}]});assert.match(text,/Convention Riot : 2 champ/);assert.match(text,/developer.riotgames.com/);
});
