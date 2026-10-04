const API="https://api.leamateur.pro";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function j(path){
  let last;
  for(let a=0;a<5;a++){
    const r=await fetch(API+path);
    if(r.ok)return r.json();
    last=new Error(path+" "+r.status);
    if(r.status===429||r.status>=500){
      const h=Number(r.headers.get("retry-after")||0);
      await sleep(h? h*1000 : Math.min(8000,700*2**a));
      continue;
    }
    throw last;
  }
  throw last;
}
const tournaments=await j("/tournaments");
const ouat=tournaments.filter(x=>/ouatventure/i.test(x.name)).sort((a,b)=>(String(b.status).toUpperCase()==="OPEN")-(String(a.status).toUpperCase()==="OPEN")||Date.parse(b.start)-Date.parse(a.start));
const t=ouat[0],details=await j("/tournaments/"+encodeURIComponent(t.name)),entries=details.tournamentTeams||[];
let cursor=0,players=[],errors=[];
const split=s=>{s=String(s||"");const i=s.lastIndexOf("#");return i>0?[s.slice(0,i),s.slice(i+1)]:null};
async function worker(){while(cursor<entries.length){const e=entries[cursor++];try{const r=await j("/team/"+e.teamId);for(const p of r.players||[]){if(!/^mid$/i.test(String(p.user?.position||"").trim()))continue;const a=split(p.user?.summonerName);players.push({name:p.user?.nickname||a?.[0]||p.user?.summonerName,team:r.data?.name,riot:a?a.join("#"):""});}}catch(err){errors.push({team:e.teamId,error:err.message})}}}
await Promise.all(Array.from({length:Math.min(3,entries.length)},worker));
console.log(JSON.stringify({season:t.name,status:t.status,teams:entries.length,mids:players.length,errors:errors.length,errorSample:errors.slice(0,10),sample:players.slice(0,15)},null,2));
if(!players.length)process.exit(2);