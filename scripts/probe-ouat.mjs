const API="https://api.leamateur.pro";
const j=async p=>{const r=await fetch(API+p);if(!r.ok)throw new Error(p+" "+r.status);return r.json()};
const tournaments=await j("/tournaments");
const ouat=tournaments.filter(x=>/ouatventure/i.test(x.name));
ouat.sort((a,b)=>(String(b.status).toUpperCase()==="OPEN")-(String(a.status).toUpperCase()==="OPEN")||Date.parse(b.start)-Date.parse(a.start));
const t=ouat[0];
const details=await j("/tournaments/"+encodeURIComponent(t.name));
const entries=details.tournamentTeams||[];
let cursor=0,players=[],errors=0;
const split=s=>{s=String(s||"");const i=s.lastIndexOf("#");return i>0?[s.slice(0,i),s.slice(i+1)]:null};
async function worker(){while(cursor<entries.length){const e=entries[cursor++];try{const r=await j("/team/"+e.teamId);for(const p of r.players||[]){if(!/^mid$/i.test(String(p.user?.position||"").trim()))continue;const a=split(p.user?.summonerName);players.push({name:p.user?.nickname||a?.[0]||p.user?.summonerName,team:r.data?.name,riot:a? a.join("#"):""});}}catch{errors++}}}
await Promise.all(Array.from({length:Math.min(10,entries.length)},worker));
console.log(JSON.stringify({season:t.name,status:t.status,teams:entries.length,mids:players.length,errors,sample:players.slice(0,25)},null,2));
if(!players.length)process.exit(2);