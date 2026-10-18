/* Independent SoloQ samples, never a prediction or direct head-to-head record. */
const DuelScouting=(()=>{
 const teams=typeof module!=='undefined'?require('./teams'):TeamScouting;
 const accountKey=a=>a?.gameName&&a?.tagLine?`${a.platform||'EUW1'}|${a.gameName.trim()}#${a.tagLine.trim()}`.toLowerCase():'';
 function pair(team,home,role,choices={},hasKey=false){
  if(!team||!home||team.id===home.id)return null;
  const sides=[team,home].map(t=>{
   const slot=teams.summarize(t.players,Date.now(),teams.lineup(choices,t.id)).slots.find(s=>s.role===role);
   const player=slot?.players.length===1?slot.players[0]:null;
   const account=player?.accounts?.find(a=>accountKey(a)&&accountKey(a)===accountKey(player.bestRankAccount))||player?.accounts?.[0];
   const reason=!player?(slot?.manual?'Choix local absent de l’effectif.':'Choisis un seul joueur déclaré pour ce rôle.'):
    !account?.gameName||!account?.tagLine?'Compte Riot non relié.':'';
   return {teamId:t.id,teamName:t.name,player,account,manual:!!slot?.manual,reason};
  });
  if(sides.every(s=>!s.reason)&&accountKey(sides[0].account)===accountKey(sides[1].account))for(const side of sides)side.reason='Même compte relié aux deux joueurs : comparaison exclue.';
  const key=JSON.stringify([role,hasKey,...sides.map(s=>[s.teamId,s.player?.id,s.account?.platform||'EUW1',s.account?.gameName,s.account?.tagLine,s.reason])]);
  return {key,role,sides,ready:hasKey&&sides.every(s=>!s.reason)};
 }
 function create({now=Date.now}={}){
  const cache=new Map(),maxAge=15*60*1000;
  const state={key:'',request:0,loading:false,sides:[],loadedAt:null,reused:false,backup:null,restoredAfterError:false};
  function peek(key){const value=cache.get(key),age=value?now()-value.loadedAt:Infinity;if(age<0||age>=maxAge){cache.delete(key);return null;}return value?{...value,sides:value.sides.slice()}:null;}
  function save(key,sides,activate=true){const loadedAt=now();cache.delete(key);cache.set(key,{key,sides:sides.slice(),loadedAt});while(cache.size>30)cache.delete(cache.keys().next().value);if(activate&&state.key===key&&!state.loading){state.sides=sides.slice();state.loadedAt=loadedAt;state.reused=true;state.restoredAfterError=false;state.backup=null;}return loadedAt;}
  function remember(){state.loadedAt=save(state.key,state.sides,false);}
  function sync(key){if(key!==state.key||(!state.loading&&state.loadedAt!==null&&!peek(key))){const saved=peek(key);state.key=key;state.request++;state.loading=false;state.sides=saved?.sides||[];state.loadedAt=saved?.loadedAt??null;state.reused=!!saved;state.restoredAfterError=!!saved?.restoredAfterError;state.backup=null;}return state;}
  function cancel(){state.request++;state.loading=false;state.key='';state.sides=[];state.loadedAt=null;state.reused=false;state.backup=null;state.restoredAfterError=false;}
  function canRestore(){const b=state.backup,age=b?now()-b.loadedAt:Infinity;return !state.loading&&!!b&&b.key===state.key&&age>=0&&age<maxAge;}
  function restorePrevious(){
   if(!canRestore())return false;
   const saved={...state.backup,sides:state.backup.sides.slice(),restoredAfterError:true};
   cache.delete(saved.key);cache.set(saved.key,saved);state.request++;state.sides=saved.sides.slice();state.loadedAt=saved.loadedAt;state.reused=true;state.restoredAfterError=true;state.backup=null;return true;
  }
  async function load(pair,fetchReport,onUpdate=()=>{}){
   if(!pair?.ready)return;
   sync(pair.key);if(state.loading)return;
   const fallback=canRestore()?state.backup:null,previous=peek(pair.key);state.backup=previous?.sides.length===2&&previous.sides.every(s=>!s?.error&&s?.report?.role===pair.role&&Number.isInteger(s.report.games)&&s.report.games>=0)?previous:fallback;
   const request=++state.request;state.loading=true;state.sides=[];state.loadedAt=null;state.reused=false;state.restoredAfterError=false;cache.delete(pair.key);onUpdate();
   const current=()=>request===state.request&&state.key===pair.key;
   try{
    for(const [i,side]of pair.sides.entries()){
     if(!current())return;
     try{
      const report=await fetchReport(side.account,pair.role);
      if(!current())return;
      if(report?.role!==pair.role||!Number.isInteger(report.games)||report.games<0)throw new Error('Rapport incohérent pour le rôle demandé.');
      state.sides[i]={report};remember();onUpdate();
      if(['auth','rate_limit'].includes(report.coverage?.stop)){
       if(i===0)state.sides[1]={error:'Non chargé : collecte interrompue par Riot. Relance après vérification de la clé ou du quota.'};break;
      }
     }catch(e){
      if(!current())return;
      state.sides[i]={error:String(e.message||e)};
      if(i===0)state.sides[1]={error:'Non chargé après l’erreur du premier compte. Relance pour réessayer.'};break;
     }
    }
   }finally{if(current()){state.loading=false;remember();if(state.sides.length===2&&state.sides.every(s=>s?.report&&!s.error&&!s.report.coverage?.partial&&!['auth','rate_limit'].includes(s.report.coverage?.stop)))state.backup=null;onUpdate();}}
  }
  return {state,sync,cancel,load,peek,save,canRestore,restorePrevious};
 }
 function createBatch(){
  const state={context:'',running:false,rows:[],stop:''};let request=0,worker=null;
  const context=pairs=>JSON.stringify(pairs.map(p=>p?.key||''));
  function cancel(){request++;worker?.cancel();worker=null;state.running=false;state.stop='cancelled';for(const row of state.rows)if(['waiting','loading'].includes(row.status))row.status='cancelled';}
  function sync(pairs){const key=context(pairs);if(state.context!==key){cancel();state.context=key;state.rows=[];state.stop='';}return state;}
  async function load(pairs,target,fetchReport,onUpdate=()=>{}){
   sync(pairs);if(state.running||target.state.loading)return;
   const token=++request;state.running=true;state.stop='';state.rows=pairs.map((p,i)=>({role:p?.role||teams.roles[i],status:'waiting',reason:''}));onUpdate();
   try{
    for(const [i,p]of pairs.entries()){
     if(token!==request)return;const row=state.rows[i];
     if(!p?.ready){row.status='blocked';row.reason=p?.sides.map(s=>s.reason).filter(Boolean).join(' · ')||'Clé Riot ou équipe indisponible.';onUpdate();continue;}
     const saved=target.peek(p.key);
     if(saved?.sides.length===2&&!saved.restoredAfterError&&saved.sides.every(s=>s?.report?.role===p.role&&!s.error&&!s.report.coverage?.partial&&!['auth','rate_limit'].includes(s.report.coverage?.stop))){row.status='reused';onUpdate();continue;}
     row.status='loading';onUpdate();if(token!==request)return;worker=create();await worker.load(p,fetchReport);
     if(token!==request)return;
     const sides=worker.state.sides;worker=null;target.save(p.key,sides);
     const stop=sides.map(s=>s?.report?.coverage?.stop).find(s=>['auth','rate_limit'].includes(s));
     if(stop||sides.some(s=>s?.error)){
      row.status='error';row.reason=stop==='auth'?'Clé refusée par Riot.':stop==='rate_limit'?'Quota Riot atteint.':sides.find(s=>s?.error)?.error||'Collecte interrompue.';
      state.stop=stop||'error';for(const next of state.rows.slice(i+1)){next.status='stopped';next.reason='Non lancé après interruption du lot.';}onUpdate();break;
     }
     row.status=sides.some(s=>s?.report?.coverage?.partial)?'partial':'loaded';onUpdate();
    }
   }finally{if(token===request){state.running=false;worker=null;onUpdate();}}
  }
  return {state,sync,cancel,load};
 }
 function compare(left,right){
  if(!Number.isInteger(left?.games)||left.games<=0||!Number.isInteger(right?.games)||right.games<=0||left.role!==right.role)return null;
  const metric=(key,label,digits=1)=>{
   const a=left[key],b=right[key];if(!Number.isFinite(a)||!Number.isFinite(b))return null;
   const round=n=>Number(n.toFixed(digits));return {key,label,left:round(a),right:round(b),delta:round(a-b)};
  };
  const metrics=[metric('winrate','WIN RATE',0),metric('kda','KDA'),metric('kills','KILLS'),metric('deaths','DEATHS'),metric('assists','ASSISTS'),metric('cspm','CS/MIN'),metric('dpm','DÉGÂTS/MIN',0),metric('gpm','OR/MIN',0),metric('vision','VISION/PARTIE')].filter(Boolean);
  const pool=report=>new Map((report.champions||[]).filter(c=>c?.name&&Number.isFinite(c.games)&&c.games>0).map(c=>[String(c.name).toLowerCase(),{name:String(c.name),games:c.games}]));
  const a=pool(left),b=pool(right),common=[...a.keys()].filter(k=>b.has(k)).map(k=>({name:a.get(k).name,left:a.get(k).games,right:b.get(k).games}));
  const exclusive=(source,other)=>[...source.entries()].filter(([k])=>!other.has(k)).map(([,c])=>c);
  const patchGames=report=>new Map((report.patches||[]).filter(p=>p?.patch&&Number.isFinite(p.games)&&p.games>0).map(p=>[String(p.patch),p.games]));
  const pa=patchGames(left),pb=patchGames(right),patches=[...pa.keys()].filter(k=>pb.has(k)).sort().reverse().map(patch=>({patch,left:pa.get(patch),right:pb.get(patch)}));
  const interval=report=>Number.isFinite(report.interval?.low)&&Number.isFinite(report.interval?.high)?{low:report.interval.low,high:report.interval.high}:null;
  return {role:left.role,games:[left.games,right.games],metrics,intervals:[interval(left),interval(right)],champions:{common,leftOnly:exclusive(a,b),rightOnly:exclusive(b,a)},patches,
   limitations:{partial:[!!left.coverage?.partial,!!right.coverage?.partial],stale:[!!left.window?.stale,!!right.window?.stale]}};
 }
 function overview(entries=[]){
  return teams.roles.map(role=>{
   const entry=entries.find(e=>e?.role===role&&e.pair?.role===role),pair=entry?.pair;
   const sides=[0,1].map(i=>{
    const side=pair?.sides[i],stored=entry?.saved?.sides[i],raw=stored?.report;
    const invalid=raw&&(raw.role!==role||!Number.isInteger(raw.games)||raw.games<0);
    const reason=side?.reason||(!side?'Équipe ou joueur indisponible.':'')||stored?.error||(invalid?'Rapport incohérent pour ce rôle.':'');
    return {player:side?.player,account:side?.account,manual:!!side?.manual,report:reason?null:raw||null,reason,status:reason?'unavailable':raw?'loaded':entry?.loading?'loading':'missing'};
   });
   return {role,sides,loading:!!entry?.loading,restoredAfterError:!!entry?.saved?.restoredAfterError,comparison:compare(sides[0].report,sides[1].report)};
  });
 }
 function commonPatches(reports){
  if(reports.length!==2||!reports.every(Boolean))return [];
  const valid=(row,role)=>/^\d+\.\d+$/.test(row?.patch||'')&&row.report?.role===role&&Number.isInteger(row.report.games)&&row.report.games>0;
  const right=new Set((reports[1].byPatch||[]).filter(p=>valid(p,reports[1].role)).map(p=>p.patch));
  return [...new Set((reports[0].byPatch||[]).filter(p=>valid(p,reports[0].role)&&right.has(p.patch)).map(p=>p.patch))].sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
 }
 function commonChampions(reports,patch='ALL'){
  if(reports.length!==2||!reports.every(Boolean)||reports[0].role!==reports[1].role)return [];
  const valid=(r,role)=>typeof r?.champion==='string'&&r.champion.trim()&&r.report?.role===role&&Number.isInteger(r.report.games)&&r.report.games>0;
  const rows=reports.map(r=>(scopeReport(r,patch)?.byChampion||[]).filter(c=>valid(c,r.role)));
  const right=new Set(rows[1].map(c=>c.champion.toLowerCase()));
  return [...new Set(rows[0].filter(c=>right.has(c.champion.toLowerCase())).map(c=>c.champion))].sort((a,b)=>a.localeCompare(b));
 }
 function championChoices(report,patch='ALL'){
  if(!report||!teams.roles.includes(report.role))return [];
  const scoped=scopeReport(report,patch);
  return [...new Set((Array.isArray(scoped?.byChampion)?scoped.byChampion:[]).filter(c=>typeof c?.champion==='string'&&c.champion.trim()&&c.champion!=='ALL'&&c.report?.role===report.role&&Number.isInteger(c.report.games)&&c.report.games>0).map(c=>c.champion))].sort((a,b)=>a.localeCompare(b));
 }
 function scopeReport(report,patch,champion='ALL'){
  if(!report||(patch==='ALL'&&champion==='ALL'))return report;
  const base=patch==='ALL'?report:report.byPatch?.find(p=>p.patch===patch)?.report;if(!base)return null;
  const scoped=champion==='ALL'?base:base.byChampion?.find(c=>c.champion?.toLowerCase()===String(champion).toLowerCase())?.report;
  if(!scoped||scoped.role!==report.role||!Number.isInteger(scoped.games)||scoped.games<0)return null;
  return {...scoped,scope:`SoloQ classée · rôle ${scoped.role}${patch!=='ALL'?` · patch ${patch}`:''}${champion!=='ALL'?` · champion ${champion}`:''}`,coverage:{...report.coverage,roleGames:scoped.games,targetReached:scoped.games>=(report.coverage?.target||12)},...(patch!=='ALL'?{selectedPatch:patch}:{}),...(champion!=='ALL'?{selectedChampion:champion}:{})};
 }
 function draftPatches(entries=[]){
  return [...new Set(overview(entries).flatMap(row=>row.sides.flatMap(side=>(Array.isArray(side.report?.byPatch)?side.report.byPatch:[]).filter(p=>/^\d+\.\d+$/.test(p?.patch||'')&&p.report?.role===row.role&&Number.isInteger(p.report.games)&&p.report.games>0).map(p=>p.patch))))].sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
 }
 function draftPools(entries=[],patch='ALL'){
  return overview(entries).map(row=>({...row,sides:row.sides.map(side=>{
   const original=side.report,scoped=original&&(patch==='ALL'||Array.isArray(original.byPatch))?scopeReport(original,patch):null;
   if(!original)return {...side,poolStatus:'missing',champions:[]};
   if(!scoped)return {...side,poolStatus:'unobserved',champions:[],report:null};
   if(!scoped.games)return {...side,poolStatus:'empty',champions:[],report:scoped};
   const seen=new Set(),champions=[];let identifiedGames=0,invalid=false;
   for(const c of Array.isArray(scoped.champions)?scoped.champions:[]){
    if(typeof c?.name!=='string'||!c.name.trim()||['inconnu','?'].includes(c.name.trim().toLowerCase()))continue;
    if(!Number.isInteger(c.games)||c.games<=0||c.games>scoped.games){invalid=true;continue;}
    const name=c.name.trim(),key=name.toLowerCase();if(seen.has(key)){invalid=true;continue;}seen.add(key);identifiedGames+=c.games;
    const wins=Number.isInteger(c.wins)&&c.wins>=0&&c.wins<=c.games?c.wins:null;
    champions.push({name,games:c.games,share:Math.round(1000*c.games/scoped.games)/10,wins,winrate:wins===null?null:Math.round(100*wins/c.games),limited:c.games<3});
   }
   if(invalid||identifiedGames>scoped.games)return {...side,poolStatus:'invalid',champions:[],report:scoped,identifiedGames:0};
   return {...side,poolStatus:'loaded',report:scoped,identifiedGames,champions:champions.sort((a,b)=>b.games-a.games||a.name.localeCompare(b.name))};
  })}));
 }
 function normalizeFilters(reports=[],filters={}){
  const patch=filters.patch!=='ALL'&&commonPatches(reports).includes(filters.patch)?filters.patch:'ALL',mode=filters.mode==='SIDES'?'SIDES':'COMMON';
  const champion=commonChampions(reports,patch).includes(filters.champion)?filters.champion:'ALL';
  const champions=[0,1].map(i=>championChoices(reports[i],patch).includes(filters.champions?.[i])?filters.champions[i]:'ALL');
  return {patch,mode,champion,champions};
 }
 function createFilterMemory(){
  const memory=new Map(),defaults=()=>({patch:'ALL',mode:'COMMON',champion:'ALL',champions:['ALL','ALL']});
  function read(key,saved){
   const old=memory.get(key),reports=saved?.sides?.map(s=>s?.report);
   if(!old||!saved||old.loadedAt!==saved.loadedAt||!reports||reports.length!==old.reports.length||reports.some((r,i)=>r!==old.reports[i])){memory.delete(key);return defaults();}
   return normalizeFilters(reports,old.filters);
  }
  function remember(key,saved,filters){
   if(!key||!Number.isFinite(saved?.loadedAt)||!Array.isArray(saved.sides)||!saved.sides.some(s=>s?.report)){memory.delete(key);return;}
   const reports=saved.sides.map(s=>s?.report);memory.delete(key);memory.set(key,{loadedAt:saved.loadedAt,reports,filters:normalizeFilters(reports,filters)});
   while(memory.size>30)memory.delete(memory.keys().next().value);
  }
  function forget(keys){for(const key of keys)memory.delete(key);}
  return {read,remember,forget};
 }
 return {pair,create,createBatch,compare,overview,commonPatches,commonChampions,championChoices,scopeReport,draftPatches,draftPools,normalizeFilters,createFilterMemory};
})();
if(typeof module!=='undefined')module.exports=DuelScouting;
