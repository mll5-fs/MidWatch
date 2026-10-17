const {normalizeRole}=require('./ouat-roles');
const {winrateInterval,sampleWindow,patchBreakdown}=require('./scouting');
const {buildCoverage}=require('./sample-coverage');
function participantForRole(match,puuid,role){
 if(match?.info?.queueId!==420||!normalizeRole(role))return null;
 const p=(match.info.participants||[]).find(p=>p.puuid===puuid);
 // Riot teamPosition takes precedence over the less reliable individualPosition.
 const actual=normalizeRole(p?.teamPosition)||normalizeRole(p?.individualPosition);
 return p&&actual===normalizeRole(role)?p:null;
}
// Riot documents omitted numeric values as zero. Only absent counting fields use
// that convention: explicit null/undefined/strings remain invalid, as do missing
// win, identity/role and positive duration. Never mutate the received payload.
const ZERO_OMITTABLE_STATS=['kills','deaths','assists','totalMinionsKilled','neutralMinionsKilled','totalDamageDealtToChampions','goldEarned','visionScore'];
function normalizeRoleStats(p){
 if(!p||typeof p.win!=='boolean'||!Number.isFinite(p.timePlayed)||p.timePlayed<=0)return null;
 const row={...p},riotOmittedStats=[];
 for(const field of ZERO_OMITTABLE_STATS){
  if(!Object.hasOwn(p,field)){row[field]=0;riotOmittedStats.push(field);}
  else if(!Number.isFinite(p[field])||p[field]<0)return null;
 }
 return {...row,riotOmittedStats};
}
function validRoleStats(p){return !!normalizeRoleStats(p);}
function normalizationSummary(rows){return {games:rows.filter(p=>p.riotOmittedStats.length).length,fields:rows.reduce((s,p)=>s+p.riotOmittedStats.length,0),policy:'riot-omitted-numeric-zero',source:'https://developer.riotgames.com/docs/portal#response-codes'};}
function summarizeRole(matches,puuid,role,sampledAt=Date.now(),includePatchReports=true,includeChampionReports=true){
 const accepted=(matches||[]).map(match=>({match,p:normalizeRoleStats(participantForRole(match,puuid,role))})).filter(({p})=>p);
 const rows=accepted.map(x=>x.p),games=rows.length,wins=rows.filter(p=>p.win).length;
 const report={role:normalizeRole(role),games,wins,normalization:normalizationSummary(rows),limited:games<3,scope:`SoloQ classée · rôle ${normalizeRole(role)}`,window:sampleWindow(accepted.map(x=>x.match),sampledAt),sampledAt};
 if(!games)return {...report,champions:[],patches:[]};
 const sum=k=>rows.reduce((s,p)=>s+p[k],0),minutes=sum('timePlayed')/60,round=n=>Math.round(n*10)/10;
 const champions=new Map();for(const p of rows){const name=p.championName||'Inconnu';if(!champions.has(name))champions.set(name,{name,games:0,wins:0});const c=champions.get(name);c.games++;c.wins+=p.win?1:0;}
 const result={...report,winrate:Math.round(100*wins/games),interval:winrateInterval(wins,games),kills:round(sum('kills')/games),deaths:round(sum('deaths')/games),assists:round(sum('assists')/games),kda:round((sum('kills')+sum('assists'))/Math.max(1,sum('deaths'))),cspm:round((sum('totalMinionsKilled')+sum('neutralMinionsKilled'))/minutes),dpm:Math.round(sum('totalDamageDealtToChampions')/minutes),gpm:Math.round(sum('goldEarned')/minutes),vision:round(sum('visionScore')/games),
 champions:[...champions.values()].sort((a,b)=>b.games-a.games||a.name.localeCompare(b.name)).map(c=>({...c,winrate:Math.round(100*c.wins/c.games),interval:winrateInterval(c.wins,c.games)})),
 patches:patchBreakdown(accepted.map(({match,p})=>({...match,info:{...match.info,participants:match.info.participants.map(raw=>raw.puuid===puuid?p:raw)}})),puuid,role).map(p=>({...p,role:normalizeRole(role)}))};
 if(includeChampionReports){
  const groups=new Map();for(const {match,p}of accepted){if(typeof p.championName!=='string'||!p.championName.trim())continue;const champion=p.championName.trim(),key=champion.toLowerCase();if(!groups.has(key))groups.set(key,{champion,matches:[]});groups.get(key).matches.push(match);}
  result.byChampion=[...groups.values()].sort((a,b)=>a.champion.localeCompare(b.champion)).map(g=>({champion:g.champion,report:summarizeRole(g.matches,puuid,role,sampledAt,false,false)}));
 }
 if(includePatchReports){
  const groups=new Map();for(const {match}of accepted){const v=String(match.info.gameVersion||'').match(/^(\d+)\.(\d+)/);if(!v)continue;const patch=`${Number(v[1])}.${Number(v[2])}`;if(!groups.has(patch))groups.set(patch,[]);groups.get(patch).push(match);}
  result.byPatch=[...groups].sort(([a],[b])=>b.localeCompare(a,undefined,{numeric:true})).map(([patch,ms])=>({patch,report:summarizeRole(ms,puuid,role,sampledAt,false)}));
 }
 return result;
}
async function collectRoleReport(riot,account,role,{patchOnly=false,now=Date.now}={}){
 role=normalizeRole(role);if(!role)throw new Error('Rôle de scouting inconnu.');
 const acc=await riot.resolveAccount(account),requested=patchOnly?60:20,target=patchOnly?30:12;
 const ids=(await riot.matchIds(acc.platform,acc.puuid,requested,420)||[]).slice(0,requested),matches=[];
 const tracking={requested:ids.length,target,matchAttempts:0,matchesLoaded:0,midGames:0,timelineAttempts:0,timelinesLoaded:0,matchErrors:0,timelineErrors:0,stop:'complete'};
 let invalidGames=0;
 for(const id of ids){tracking.matchAttempts++;try{
  const match=await riot.match(acc.platform,id);tracking.matchesLoaded++;
  if(participantForRole(match,acc.puuid,role)){
   if(!summarizeRole([match],acc.puuid,role,now()).games){invalidGames++;continue;}
   matches.push(match);tracking.midGames++;
   if(matches.length>=target){tracking.stop='target';break;}
  }
 }catch(e){tracking.matchErrors++;if([401,403].includes(e.status)){tracking.stop='auth';break;}if(e.status===429){tracking.stop='rate_limit';break;}}}
 const report=summarizeRole(matches,acc.puuid,role,now());
 report.coverage={...buildCoverage(tracking),role,roleGames:matches.length,invalidGames};
 if(invalidGames)report.coverage.partial=true;
 return report;
}
module.exports={participantForRole,normalizeRoleStats,normalizationSummary,validRoleStats,summarizeRole,collectRoleReport};
