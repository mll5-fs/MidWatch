const {selectRoster}=require("./services/ouat-roles");
const TeamScouting=require("./renderer/teams");
const PlayerIdentity=require("./renderer/identity");
const liveQueue=require("./services/live-queue").createLiveQueue();
const spectateGuard=require("./services/spectate-guard").createSpectateGuard();
const {clipboard}=require("electron");
const{app,BrowserWindow,ipcMain,shell,dialog}=require("electron");const path=require("path");const store=require("./store"),bundledOuat=require("./data/ouat-current.json"),{Riot}=require("./services/riot"),{winrateInterval,sampleWindow,laneAt5,laneAt10,laneTransition,championTransitionBreakdown,opponentTransitionBreakdown,championLaneBreakdown,opponentLaneBreakdown,earlyHabits,participantForScouting,patchBreakdown,matchupBreakdown}=require("./services/scouting"),{buildCoverage}=require("./services/sample-coverage"),statsCache=require("./services/stats-cache"),spectate=require("./services/spectate"),ouat=require("./services/ouat"),{RiotScheduler}=require("./services/riot-scheduler"),{checkLiveAccounts}=require("./services/live-status");let mainWindow;const ranks=require("./services/ranks"),riotScheduler=new RiotScheduler();let rankInFlight=null,liveInFlight=null,rankRetryAt=0;
function applyOverrides(list){const o=store.get("accountOverrides",{});return(list||[]).map(p=>o[p.id]?{...p,accounts:[o[p.id]],accountOverride:true}:p)}function key(){return String(store.get("riotKey","")||"").trim()}
function create(){store.init();const found=spectate.detect(store.get("leaguePath",""));if(found&&found!==store.get("leaguePath",""))store.set("leaguePath",found);mainWindow=new BrowserWindow({width:1460,height:920,minWidth:1040,minHeight:700,show:false,backgroundColor:"#070a0f",title:"MidPulse",autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:false}});mainWindow.loadFile(path.join(__dirname,"renderer/index.html"));mainWindow.once("ready-to-show",()=>mainWindow.show())}

async function playerStats(a){
 if(!key())throw new Error("Ajoute ta clé Riot dans Settings.");
 const {participantForRole,normalizeRoleStats,normalizationSummary,evidenceRows}=require("./services/role-report");
 const cached=statsCache.read(store.get("statsCacheV4",{}),a);if(cached)return cached;
 const riot=new Riot(key()),acc=await riot.resolveAccount(a),ids=await riot.matchIds(acc.platform,acc.puuid,20,420),recent=(ids||[]).slice(0,20),rows=[],matches=[],samples=[],tracking={requested:recent.length,target:12,matchAttempts:0,matchesLoaded:0,midGames:0,timelineAttempts:0,timelinesLoaded:0,matchErrors:0,timelineErrors:0,stop:"complete"};
 let invalidGames=0;
 for(const id of recent){tracking.matchAttempts++;try{const m=await riot.match(acc.platform,id);tracking.matchesLoaded++;const raw=participantForRole(m,acc.puuid,"MID");if(raw){const x=normalizeRoleStats(raw);if(!x){invalidGames++;continue;}const measured={...m,scoutingMatchId:id,info:{...m.info,participants:m.info.participants.map(p=>p===raw?x:p)}};rows.push(x);matches.push(measured);tracking.midGames++;tracking.timelineAttempts++;try{samples.push({match:measured,timeline:await riot.timeline(acc.platform,id)});tracking.timelinesLoaded++}catch(e){tracking.timelineErrors++;if([401,403].includes(e.status)){tracking.stop="auth";break}if(e.status===429){tracking.stop="rate_limit";break}}if(rows.length>=12){tracking.stop="target";break}}}catch(e){tracking.matchErrors++;if([401,403].includes(e.status)){tracking.stop="auth";break}if(e.status===429){tracking.stop="rate_limit";break}}}
 const coverage=buildCoverage(tracking),sampledAt=Date.now();
 const normalization=normalizationSummary(rows),evidence=evidenceRows(matches.map((match,i)=>({match,p:rows[i]})),"MID",sampledAt);coverage.invalidGames=invalidGames;if(invalidGames)coverage.partial=true;
 if(!rows.length){const empty={games:0,champions:[],window:sampleWindow([],sampledAt),coverage,normalization,evidence,sampledAt,scope:"SoloQ classée · rôle mid"};store.set("statsCacheV4",statsCache.write(store.get("statsCacheV4",{}),a,empty,sampledAt));return empty}
 const games=rows.length,wins=rows.filter(x=>x.win).length,kills=rows.reduce((s,x)=>s+x.kills,0),deaths=rows.reduce((s,x)=>s+x.deaths,0),assists=rows.reduce((s,x)=>s+x.assists,0),cs=rows.reduce((s,x)=>s+(x.totalMinionsKilled||0)+(x.neutralMinionsKilled||0),0),mins=rows.reduce((s,x)=>s+(x.timePlayed||0)/60,0),dmg=rows.reduce((s,x)=>s+(x.totalDamageDealtToChampions||0),0),gold=rows.reduce((s,x)=>s+(x.goldEarned||0),0),vision=rows.reduce((s,x)=>s+(x.visionScore||0),0);
 const cm={};for(const x of rows){const n=x.championName||"?";cm[n]??={name:n,games:0,wins:0,k:0,d:0,a:0};const q=cm[n];q.games++;q.wins+=x.win?1:0;q.k+=x.kills;q.d+=x.deaths;q.a+=x.assists}
 const champions=Object.values(cm).sort((a,b)=>b.games-a.games).slice(0,6).map(x=>({...x,winrate:Math.round(100*x.wins/x.games),interval:winrateInterval(x.wins,x.games),kda:+((x.k+x.a)/Math.max(1,x.d)).toFixed(2)}));
 const avgCs=+(cs/mins).toFixed(1),avgDpm=Math.round(dmg/mins),avgVision=+(vision/games).toFixed(1),avgDeaths=+(deaths/games).toFixed(1),avgAssists=+(assists/games).toFixed(1),habits=[];
 if(avgCs>=7.5)habits.push("CS/min moyens ≥ 7,5 dans cet échantillon");if(avgDpm>=700)habits.push("Dégâts/min moyens ≥ 700 dans cet échantillon");if(avgVision>=20)habits.push("Score de vision moyen ≥ 20 dans cet échantillon");if(avgDeaths<=4.5)habits.push("Morts moyennes ≤ 4,5 dans cet échantillon");if(avgAssists>=8)habits.push("Assists moyennes ≥ 8 dans cet échantillon");if(champions[0]&&champions[0].games>=Math.ceil(games*.4))habits.push("Pool récent concentré autour de "+champions[0].name);
 const lane5=laneAt5(samples,acc.puuid),transition=laneTransition(samples,acc.puuid),early=earlyHabits(samples,acc.puuid);early.lane5=lane5;early.laneTransition=transition;
 const report={games,wins,winrate:Math.round(100*wins/games),interval:winrateInterval(wins,games),window:sampleWindow(matches,sampledAt),kda:+((kills+assists)/Math.max(1,deaths)).toFixed(2),kills:+(kills/games).toFixed(1),deaths:avgDeaths,assists:avgAssists,cspm:avgCs,dpm:avgDpm,gpm:Math.round(gold/mins),vision:avgVision,champions,patches:patchBreakdown(matches,acc.puuid),matchups:matchupBreakdown(matches,acc.puuid),championLanes:championLaneBreakdown(samples,acc.puuid),championTransitions:championTransitionBreakdown(samples,acc.puuid),opponentLanes:opponentLaneBreakdown(samples,acc.puuid),opponentTransitions:opponentTransitionBreakdown(samples,acc.puuid),habits,lane5,laneTransition:transition,lane10:laneAt10(samples,acc.puuid),early,coverage,normalization,evidence,sampledAt,scope:"SoloQ classée · rôle mid"};
 store.set("statsCacheV4",statsCache.write(store.get("statsCacheV4",{}),a,report,report.sampledAt));return report;
}

async function playerPatchStats(a){return playerRoleStats(a,"MID",true);}

async function playerRoleStats(a,role,patchOnly=false,refresh=false){
 if(!key())throw new Error("Configure une clé Riot valide dans Réglages.");
 role=require("./services/ouat-roles").normalizeRole(role);
 if(!role)throw new Error("Rôle de scouting inconnu.");
 const cacheName=patchOnly?"rolePatchStatsCacheV3":"roleStatsCacheV5",account={...a,scoutingRole:role};
 const cached=refresh===true?null:statsCache.read(store.get(cacheName,{}),account);if(cached)return cached;
 const report=await require("./services/role-report").collectRoleReport(new Riot(key()),a,role,{patchOnly});
 store.set(cacheName,statsCache.write(store.get(cacheName,{}),account,report,report.sampledAt));return report;
}

async function rankBatch(priorityIds=[]){
  if(!key())return{updates:[],checked:0};
  if(riotScheduler.shouldDeferBackground())return{updates:[],checked:0,deferred:"foreground_request"};
  if(Date.now()<rankRetryAt)return{updates:[],checked:0,retryAt:rankRetryAt};
  if(rankInFlight)return rankInFlight;
  rankInFlight=(async()=>{
    const saved=store.get("ouat",{}),o=selectRoster(saved,bundledOuat);
    const players=applyOverrides(o.players||[]);
    const result=await ranks.loadBatch(new Riot(key()),players,{cache:store.get("rankCache",{}),accountCache:store.get("riotAccountCache",{}),priorityIds:Array.isArray(priorityIds)?priorityIds.slice(0,100):[]});
    store.set("rankCache",result.cache);store.set("riotAccountCache",result.accountCache);
    rankRetryAt=result.retryAt;
    return{updates:result.updates,checked:result.checked,remaining:result.remaining,total:result.total,retryAt:result.retryAt,blockedStatus:result.blockedStatus};
  })();
  try{return await rankInFlight}finally{rankInFlight=null}
}
async function liveBatchWork(priorityIds=[]){
  if(!key())return{updates:[],checked:0};
  const saved=store.get("ouat",{}),o=selectRoster(saved,bundledOuat);
  const players=applyOverrides(o.players||[]);
  const withAccounts=players.filter(p=>p.accounts?.some(a=>a?.gameName&&a?.tagLine));
  if(!withAccounts.length)return{updates:[],checked:0};
  const cache=store.get("riotAccountCache",{}),riot=new Riot(key()),updates=[],batch=liveQueue.select(withAccounts,priorityIds);
  let retryAt=0,blockedStatus=0;
  for(const p of batch){
    try{
      const status=await checkLiveAccounts(riot,p.accounts,{accountCache:cache});
      updates.push({id:p.id,identity:PlayerIdentity.fingerprint(p),live:status.live,liveAccount:status.account,checkedAt:status.checkedAt,gameId:status.gameId});
    }catch(e){
      updates.push({id:p.id,identity:PlayerIdentity.fingerprint(p),live:null,checkedAt:Date.now(),error:String(e.message||e)});
      if([401,403,429].includes(e.status)){blockedStatus=e.status;if(e.status===429)retryAt=Number(e.retryAt)||Date.now()+(Number(e.retryAfterMs)>0?Number(e.retryAfterMs):120000);break;}
    }
  }
  store.set("riotAccountCache",cache);
  return{updates,checked:updates.length,total:withAccounts.length,retryAt,blockedStatus};
}
function liveBatch(priorityIds=[]){
  if(riotScheduler.shouldDeferBackground())return Promise.resolve({updates:[],checked:0,deferred:"foreground_request"});
  if(liveInFlight)return liveInFlight;
  liveInFlight=liveBatchWork(priorityIds);
  return liveInFlight.finally(()=>{liveInFlight=null});
}
const foregroundRiot=task=>riotScheduler.foreground(()=>[rankInFlight,liveInFlight],task);

function data(){const saved=store.get("ouat",{}),o=selectRoster(saved,bundledOuat);return{version:app.getVersion(),players:[],ouatPlayers:ranks.hydrate(applyOverrides(o.players||[]),store.get("rankCache",{})),ouat:{url:o.url||"",season:o.season||"",status:o.status||"",start:o.start||"",end:o.end||"",teams:o.teams||0,warning:o.warning||"",updatedAt:o.updatedAt||0,source:o.source||""},lineups:store.get("lineups",{}),favorites:store.get("favorites",[]),hasKey:!!key(),leaguePath:spectate.detect(store.get("leaguePath","")),proCacheAt:store.get("proCacheAt",0)}}
ipcMain.handle("app:data",()=>data());
ipcMain.handle("report:copy",async(_e,text)=>{if(typeof text!=="string"||!text.trim()||text.length>100000)throw new Error("Rapport invalide ou trop volumineux.");await clipboard.writeText(text);return true});
ipcMain.handle("team:lineup",(_e,teamId,role,playerId)=>{const choices=TeamScouting.updateLineup(store.get("lineups",{}),data().ouatPlayers,teamId,role,playerId);store.set("lineups",choices);return choices});
ipcMain.handle("favorite:toggle",(_e,id)=>{let f=store.get("favorites",[]);f=f.includes(id)?f.filter(x=>x!==id):[...f,id];store.set("favorites",f);return f});
ipcMain.handle("settings:key",async(_e,v)=>{const next=String(v||"").trim();if(!next){store.set("riotKey","");return false}await new Riot(next).validate();store.set("riotKey",next);rankRetryAt=0;store.set("rankCache",ranks.resetErrors(store.get("rankCache",{})));return true});ipcMain.handle("riot:keycheck",async()=>{if(!key())return false;try{await new Riot(key()).validate();return true}catch(_){return false}});
ipcMain.handle("account:override",(_e,id,a)=>{const all=store.get("accountOverrides",{}),gameName=String(a?.gameName||"").trim(),tagLine=String(a?.tagLine||"").trim(),platform=String(a?.platform||"EUW1").toUpperCase();if(!gameName||!tagLine)throw new Error("Riot ID incomplet.");all[id]={gameName,tagLine,platform,manual:true};store.set("accountOverrides",all);return all[id]});ipcMain.handle("account:overrideClear",(_e,id)=>{const all=store.get("accountOverrides",{});delete all[id];store.set("accountOverrides",all);return true});
ipcMain.handle("settings:pickLeague",async()=>{const r=await dialog.showOpenDialog(mainWindow,{title:"Choisis le dossier League of Legends",properties:["openDirectory"]});if(r.canceled||!r.filePaths[0])return store.get("leaguePath","");let root=r.filePaths[0];if(path.basename(root).toLowerCase()==="game")root=path.dirname(root);if(!spectate.detect(root))throw new Error("Ce dossier ne contient pas Game\\League of Legends.exe");store.set("leaguePath",root);return root});
ipcMain.handle("settings:diagnoseLeague",async()=>{const result=await spectate.diagnose(store.get("leaguePath",""));store.set("leaguePath",result.root);return result});
ipcMain.handle("spectate:status",()=>spectateGuard.snapshot());
ipcMain.handle("ouat:refresh",async(_e,url)=>{try{const r=await ouat.refresh(String(url||store.get("ouat",{}).url||""));if(r.players?.length)store.set("ouat",r);return r}catch(e){const saved=store.get("ouat",{});const fallback=selectRoster(saved,bundledOuat);if(fallback.players?.length)return{...fallback,warning:`LEA live indisponible : ${e.message}. Snapshot local conservé.`};throw e}});
ipcMain.handle("ouat:url",(_e,url)=>{const o=store.get("ouat",{});o.url=String(url||"").trim();store.set("ouat",o);return o.url});
ipcMain.handle("riot:roleStats",(_e,a,role,patchOnly,refresh)=>foregroundRiot(()=>playerRoleStats(a,role,patchOnly===true,refresh===true)));
ipcMain.handle("riot:stats",(_e,a)=>foregroundRiot(()=>playerStats(a)));
ipcMain.handle("riot:patchStats",(_e,a)=>foregroundRiot(()=>playerPatchStats(a)));
ipcMain.handle("riot:liveBatch",(_e,ids)=>liveBatch(ids));
ipcMain.handle("riot:rankBatch",(_e,ids)=>rankBatch(ids));
ipcMain.handle("riot:check",(_e,a)=>foregroundRiot(async()=>{if(!key())throw new Error("Ajoute ta clé Riot dans Settings.");const riot=new Riot(key()),acc=await riot.resolveAccount(a),ranked=await riot.ranked(acc.platform,acc.puuid);let active=null;try{active=await riot.active(acc.platform,acc.puuid)}catch(e){if(e.status!==404)throw e}return{account:acc,ranked,active}}));
ipcMain.handle("spectate:launch",(_e,a)=>spectateGuard.run(()=>foregroundRiot(async()=>{if(!key())throw new Error("Ajoute ta clé Riot dans Settings.");const riot=new Riot(key()),acc=await riot.resolveAccount(a);let game;try{game=await riot.active(acc.platform,acc.puuid)}catch(e){if(e.status===404)throw new Error("Ce joueur n’est plus en partie.");throw e}const launched=await spectate.launch(store.get("leaguePath",""),game,acc.puuid);store.set("leaguePath",launched.root);return{ok:true,accepted:launched.accepted,gameId:game.gameId,phase:launched.phase,endpoint:launched.endpoint,auth:launched.auth,status:launched.status}})));
ipcMain.handle("external:open",(_e,url)=>{if(/^https?:\/\//i.test(String(url)))return shell.openExternal(String(url));return false});
require("./services/app-instance").startSingleInstance(app,{create,getWindow:()=>mainWindow,getAllWindows:()=>BrowserWindow.getAllWindows()});
