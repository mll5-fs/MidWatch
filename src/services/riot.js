const{net}=require("electron");

function friendly(status,raw=""){
  const t=String(raw||"");
  if(status===401||status===403||/unknown apikey|api key/i.test(t))return new Error("Clé Riot invalide ou expirée. Génère une nouvelle clé sur le Riot Developer Portal puis remplace-la dans Settings.");
  if(status===429)return new Error("Limite Riot API atteinte. Réessaie dans quelques secondes.");
  return new Error(t||`Riot API ${status}`);
}
async function json(url,key){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),12000);
  try{
    const r=await net.fetch(url,{headers:{"X-Riot-Token":key,"User-Agent":"MidWatch/2.1"},signal:c.signal});
    let d={};try{d=await r.json()}catch(_){}
    if(!r.ok){const e=friendly(r.status,d?.status?.message);e.status=r.status;throw e}
    return d;
  }finally{clearTimeout(t)}
}
function routeForPlatform(p=""){p=p.toUpperCase();if(["EUW1","EUN1","TR1","RU"].includes(p))return"europe";if(["KR","JP1"].includes(p))return"asia";if(["NA1","BR1","LA1","LA2"].includes(p))return"americas";if(["SG2","TW2","VN2","PH2","TH2"].includes(p))return"sea";return"europe"}
class Riot{
  constructor(key){this.key=key}
  account(n,t,r){return json(`https://${r||"europe"}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(n)}/${encodeURIComponent(t)}`,this.key)}
  ranked(p,u){return json(`https://${p.toLowerCase()}.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(u)}`,this.key)}
  active(p,u){return json(`https://${p.toLowerCase()}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${encodeURIComponent(u)}`,this.key)}
  validate(){return json("https://euw1.api.riotgames.com/lol/status/v4/platform-data",this.key)}
  async resolveAccount(a){if(a.gameName&&a.tagLine){const x=await this.account(a.gameName,a.tagLine,routeForPlatform(a.platform));return{...a,puuid:x.puuid}}if(a.puuid)return{...a,puuid:a.puuid};throw new Error("Riot ID incomplet.")}
}
module.exports={Riot,routeForPlatform};
