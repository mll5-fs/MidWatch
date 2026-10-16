const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {participantForRole,summarizeRole,collectRoleReport}=require('../src/services/role-report');
const cache=require('../src/services/stats-cache');
function match(role='UTILITY',overrides={}){return {info:{queueId:420,gameVersion:'16.20.1',gameStartTimestamp:Date.UTC(2026,9,15),participants:[{puuid:'p',teamPosition:role,championName:'Braum',win:true,kills:2,deaths:3,assists:13,timePlayed:1800,totalMinionsKilled:20,neutralMinionsKilled:0,totalDamageDealtToChampions:9000,goldEarned:9000,visionScore:60,...overrides}]}};}
const account={gameName:'Test',tagLine:'EUW',platform:'EUW1'};
test('five-role report accepts the actual Riot role and excludes off-role or non-SoloQ games',()=>{
 for(const [riot,role] of [['TOP','TOP'],['JUNGLE','JUNGLE'],['MIDDLE','MID'],['BOTTOM','ADC'],['UTILITY','SUPPORT']])assert.ok(participantForRole(match(riot),'p',role));
 assert.equal(participantForRole(match('TOP'),'p','SUPPORT'),null);
 assert.equal(participantForRole({info:{...match().info,queueId:440}},'p','SUPPORT'),null);
 assert.equal(participantForRole(match(),'p','unknown'),null);
 assert.equal(participantForRole(match('TOP',{individualPosition:'UTILITY'}),'p','SUPPORT'),null);
 assert.ok(participantForRole(match('NONE',{individualPosition:'UTILITY'}),'p','SUPPORT'));
});
test('support report keeps role-specific samples, combat means and patch groups',()=>{
 const r=summarizeRole([match(),match('UTILITY',{win:false}),match('TOP')],'p','SUPPORT',Date.UTC(2026,9,16));
 assert.equal(r.games,2);assert.equal(r.winrate,50);assert.equal(r.kda,5);assert.equal(r.vision,60);assert.equal(r.cspm,0.7);assert.equal(r.dpm,300);assert.equal(r.champions[0].games,2);
 assert.equal(r.patches[0].role,'SUPPORT');assert.equal(r.patches[0].games,2);assert.equal(r.limited,true);
 assert.equal(summarizeRole([match('UTILITY',{visionScore:undefined})],'p','SUPPORT').games,0);
});
test('role collection stops on Riot limits, exposes excluded payloads and never requests timelines',async()=>{
 const riot={resolveAccount:async()=>({platform:'EUW1',puuid:'p'}),matchIds:async()=>['offrole','invalid','valid','limited','unreached'],match:async(_platform,id)=>{
  if(id==='offrole')return match('TOP');if(id==='invalid')return match('UTILITY',{timePlayed:0});if(id==='valid')return match();
  throw Object.assign(new Error('Riot limited'),{status:429});
 },timeline:()=>assert.fail('Non-mid reports must not load timelines')};
 const r=await collectRoleReport(riot,account,'SUPPORT');assert.equal(r.games,1);assert.equal(r.coverage.partial,true);assert.equal(r.coverage.stop,'rate_limit');assert.equal(r.coverage.matchAttempts,4);assert.equal(r.coverage.invalidGames,1);assert.equal(r.coverage.timelineAttempts,0);
});
test('patch collection uses its own role target and excludes games with incomplete data',async()=>{
 let count;const riot={resolveAccount:async()=>({platform:'EUW1',puuid:'p'}),matchIds:async(_platform,_puuid,n)=>{count=n;return Array.from({length:n},(_,i)=>String(i));},match:async()=>match('BOTTOM')};
 const r=await collectRoleReport(riot,account,'ADC',{patchOnly:true});assert.equal(count,60);assert.equal(r.games,30);assert.equal(r.coverage.targetReached,true);assert.equal(r.coverage.partial,false);assert.equal(r.patches[0].role,'ADC');
});
test('one account cannot reuse another role report from the cache',()=>{
 const support={...account,scoutingRole:'SUPPORT'},adc={...account,scoutingRole:'ADC'};
 const stored=cache.write({},support,{role:'SUPPORT',games:5},1000);
 assert.equal(cache.read(stored,adc,1001),null);assert.equal(cache.read(stored,account,1001),null);assert.equal(cache.read(stored,support,1001).role,'SUPPORT');
});
test('authentication failure remains partial even without a retained role game',async()=>{
 const riot={resolveAccount:async()=>({platform:'EUW1',puuid:'p'}),matchIds:async()=>['one','two'],match:async()=>{throw Object.assign(new Error('Key refused'),{status:403});}};
 const r=await collectRoleReport(riot,account,'JUNGLE');assert.equal(r.games,0);assert.equal(r.coverage.stop,'auth');assert.equal(r.coverage.partial,true);assert.equal(r.coverage.matchAttempts,1);
});
test('non-mid renderer shows measured data without interpreting support farm as weakness',()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8');const source=app.slice(app.indexOf('function roleStatReport('),app.indexOf('function sampleWindowReport('));
 const ctx=vm.createContext({esc:String,coverageReport:()=>'',sampleWindowReport:()=>'',confidenceLabel:()=>''});vm.runInContext(source,ctx);
 const html=ctx.roleStatReport(summarizeRole([match()],'p','SUPPORT'));
 assert.match(html,/SCOUTING SOLOQ · SUPPORT/);assert.match(html,/CHAMPIONS JOUÉS · SUPPORT/);assert.match(html,/Braum/);assert.doesNotMatch(html,/Farm récent limité|LANE À 10 MINUTES/);
 assert.match(ctx.roleStatReport({role:'JUNGLE',games:0}),/Aucune partie SoloQ exploitable au rôle JUNGLE/);
 assert.match(app,/roleStats\(scoutingAccount\(p\),p.role\);if\(request!==drawerRequest\)return/);
});
test('patch screen loads the selected non-mid role with its dedicated larger sample',async()=>{
 const app=fs.readFileSync('src/renderer/app.js','utf8'),nodes={},$=id=>nodes[id]??={value:'',innerHTML:'',textContent:'',hidden:false};
 const player={id:'support',role:'SUPPORT',name:'Support',team:'OUAT',accounts:[account]};let calls=0;
 const ctx=vm.createContext({$,S:{hasKey:true},allPlayers:()=>[player],scoutingAccount:p=>p.accounts[0],esc:String,queryMatch:()=>true,
 window:{mw:{roleStats:async(a,role,patchOnly)=>{calls++;assert.equal(a,account);assert.equal(role,'SUPPORT');assert.equal(patchOnly,true);return {patches:[{patch:'16.20',role:'SUPPORT'}]};},patchStats:()=>assert.fail('Must not request a mid report'),open:()=>{}}},coverageReport:()=>'',sampleWindowReport:()=>'',patchReport:rows=>rows[0].role,render:()=>ctx.renderPatchSection()});
 vm.runInContext('let patchRequest=0,patchPlayerId="",patchStats=null,patchError="",patchLoading=false,view="PATCHES";'+app.slice(app.indexOf('function renderPatchSection('),app.indexOf('let teamDivision=')),ctx);
 ctx.renderPatchSection();await nodes['#analyzePatch'].onclick();assert.equal(calls,1);assert.match(nodes['#patchResults']?.innerHTML||nodes['#grid'].innerHTML,/SUPPORT/);
});
