import fs from "node:fs";
const API="https://api.leamateur.pro";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(path,attempts=6){
  let last;
  for(let a=0;a<attempts;a++){
    const r=await fetch(API+path,{headers:{"Accept":"application/json","User-Agent":"MidWatch-CI/2.1"}});
    if(r.ok)return r.json();
    last=new Error(path+" "+r.status);
    if(r.status===429||r.status>=500){
      const h=Number(r.headers.get("retry-after")||0);
      await sleep(h?h*1000:Math.min(10000,800*2**a));
      continue;
    }
    throw last;
  }
  throw last;
}
const tournaments=await get("/tournaments");
const list=(Array.isArray(tournaments)?tournaments:tournaments?.data||[]).filter(x=>/ouatventure/i.test(String(x.name||"")));
if(!list.length)throw new Error("No OUATventure tournament found");
const now=Date.now();
list.sort((a,b)=>{
  const score=t=>{
    const start=Date.parse(t.start||0),end=Date.parse(t.end||0),open=String(t.status||"").toUpperCase()==="OPEN";
    if(open)return 1e15-Math.abs(start-now);
    if(start<=now&&end>=now)return 9e14-Math.abs(start-now);
    return -Math.abs(start-now);
  };
  return score(b)-score(a);
});
const t=list[0];
const details=await get("/tournaments/"+encodeURIComponent(t.name));
let classification={};try{classification=await get("/clasification/byTournament/"+t.id)}catch{}
const place=new Map();
for(const d of classification?.division||[])for(const g of d?.group||[])for(const e of g?.tournamentTeams||[])place.set(Number(e.teamId),{division:String(d.name||d.division||"").trim(),group:String(g.name||"").trim()});
const entries=Array.isArray(details?.tournamentTeams)?details.tournamentTeams:[];
let cursor=0;const players=[],errors=[];
const split=s=>{s=String(s||"").trim();const i=s.lastIndexOf("#");return i>0&&i<s.length-1?{gameName:s.slice(0,i).trim(),tagLine:s.slice(i+1).trim(),platform:"EUW1"}:null};
async function worker(){
  while(true){
    const i=cursor++;if(i>=entries.length)return;const e=entries[i],teamId=Number(e.teamId||e?.team?.id);if(!teamId)continue;
    try{
      const r=await get("/team/"+teamId),team=r?.data||e?.team||{},pl=place.get(teamId)||{};
      for(const m of r?.players||[]){
        const u=m?.user||{};
        if(!/^mid$/i.test(String(u.position||m.position||"").trim()))continue;
        const acc=split(u.summonerName||"");
        players.push({
          id:"ouat-"+teamId+"-"+String(m.userId||u.id||u.nickname||"mid").toLowerCase().replace(/[^a-z0-9]+/g,"-"),
          name:String(u.nickname||acc?.gameName||u.summonerName||("Player "+(m.userId||""))).trim(),
          team:String(team.name||e?.team?.name||("Team "+teamId)).trim(),
          teamId,
          teamLogo:String(team.logo||e?.team?.logo||"").trim(),
          avatar:String(u.avatar||"").trim(),
          region:"OUAT",
          division:String(pl.division||"").trim(),
          group:String(pl.group||"").trim(),
          platform:"EUW1",
          role:"MID",
          source:"LEA API snapshot",
          accounts:acc?[acc]:[],
          live:null
        });
      }
    }catch(err){errors.push({teamId,error:err.message})}
  }
}
await Promise.all(Array.from({length:Math.min(3,entries.length)},worker));
const seen=new Set();
const unique=players.filter(p=>{const k=(p.teamId+"|"+p.name).toLowerCase();if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>String(a.division).localeCompare(String(b.division),undefined,{numeric:true})||a.team.localeCompare(b.team)||a.name.localeCompare(b.name));
const out={season:String(t.abbreviation||t.name||"").trim(),status:String(t.status||"").trim(),start:t.start||"",end:t.end||"",teams:entries.length,players:unique,updatedAt:Date.now(),source:"LEA API snapshot",warning:errors.length?errors.length+" roster(s) unavailable during build":""};
if(!unique.length)throw new Error("OUAT snapshot generation returned 0 mids");
fs.writeFileSync("src/data/ouat-current.json",JSON.stringify(out,null,2));
console.log(JSON.stringify({season:out.season,teams:out.teams,mids:out.players.length,errors:errors.length},null,2));
