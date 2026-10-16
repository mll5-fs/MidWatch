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
function summarizeRole(matches,puuid,role,sampledAt=Date.now()){
 const accepted=(matches||[]).map(match=>({match,p:participantForRole(match,puuid,role)})).filter(({p})=>p&&typeof p.win==='boolean'&&['kills','deaths','assists','timePlayed','totalMinionsKilled','neutralMinionsKilled','totalDamageDealtToChampions','goldEarned','visionScore'].every(k=>Number.isFinite(p[k])&&p[k]>=0)&&p.timePlayed>0);
 const rows=accepted.map(x=>x.p),games=rows.length,wins=rows.filter(p=>p.win).length;
 const report={role:normalizeRole(role),games,wins,limited:games<3,scope:`SoloQ classée · rôle ${normalizeRole(role)}`,window:sampleWindow(accepted.map(x=>x.match),sampledAt),sampledAt};
 if(!games)return {...report,champions:[],patches:[]};
 const sum=k=>rows.reduce((s,p)=>s+p[k],0),minutes=sum('timePlayed')/60,round=n=>Math.round(n*10)/10;
 const champions=new Map();for(const p of rows){const name=p.championName||'Inconnu';if(!champions.has(name))champions.set(name,{name,games:0,wins:0});const c=champions.get(name);c.games++;c.wins+=p.win?1:0;}
 return {...report,winrate:Math.round(100*wins/games),interval:winrateInterval(wins,games),kills:round(sum('kills')/games),deaths:round(sum('deaths')/games),assists:round(sum('assists')/games),kda:round((sum('kills')+sum('assists'))/Math.max(1,sum('deaths'))),cspm:round((sum('totalMinionsKilled')+sum('neutralMinionsKilled'))/minutes),dpm:Math.round(sum('totalDamageDealtToChampions')/minutes),gpm:Math.round(sum('goldEarned')/minutes),vision:round(sum('visionScore')/games),
 champions:[...champions.values()].sort((a,b)=>b.games-a.games||a.name.localeCompare(b.name)).slice(0,6).map(c=>({...c,winrate:Math.round(100*c.wins/c.games),interval:winrateInterval(c.wins,c.games)})),
 patches:patchBreakdown(accepted.map(x=>x.match),puuid,role).map(p=>({...p,role:normalizeRole(role)}))};
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
module.exports={participantForRole,summarizeRole,collectRoleReport};
