const { BrowserWindow, net } = require("electron");

const OFFICIAL_PAGE = "https://www.onceuponateam.be/?page_id=3104";
const wait = ms => new Promise(r => setTimeout(r, ms));
const txt = v => typeof v === "string" ? v.trim() : "";
const MID = /(^|[^A-Z])(MID|MIDDLE|MIDLANE|MIDLANER)([^A-Z]|$)/i;

function predictedSeason(date = new Date()) {
  if (date.getFullYear() < 2026) return 20;
  return 20 + (date.getFullYear() - 2026) * 4 + Math.floor(date.getMonth() / 3);
}
function tournamentUrl(s){return `https://lol.leamateur.pro/tournaments/OUATventure%20Saison%20${s}`}
function role(v){if(v&&typeof v==="object")v=v.value||v.name||v.label||v.role;return txt(v).toUpperCase()}
function isMid(v){return MID.test(role(v))}
function val(o,...ks){for(const k of ks){const v=o?.[k];if(typeof v==="string"&&v.trim())return v.trim();if(v&&typeof v==="object"){const s=txt(v.name||v.displayName||v.title||v.label||v.tag);if(s)return s}}return""}
function nameOf(o){return val(o,"displayName","playerName","summonerName","nickname","nick","gameName","username","pseudo","name")}
function teamOf(o){return val(o,"teamName","team","squad","organization","club")}
function divisionOf(o){const v=o?.division||o?.group||o?.pool||o?.league||o?.bracket;if(typeof v==="number")return`Division ${v}`;return val({v},"v")}
function accountOf(o){let raw=txt(o?.riotId||o?.riotID||o?.riot_id||o?.summoner||o?.account),gameName=txt(o?.gameName),tagLine=txt(o?.tagLine||o?.tag);if(raw.includes("#")){const i=raw.lastIndexOf("#");gameName=raw.slice(0,i).trim();tagLine=raw.slice(i+1).trim()}return gameName&&tagLine?{gameName,tagLine,platform:"EUW1"}:null}

function extract(payloads){
  const out=[],seen=new Set(),rosterKeys=new Set(["players","roster","members","lineup","participants","teamMembers","registrations"]),ordered=["TOP","JUNGLE","MID","ADC","SUPPORT"];
  function add(o,ctx,hint=""){
    if(!o||typeof o!=="object")return;
    if(!isMid(o.role||o.position||o.lane||o.playerRole||o.gameRole||hint))return;
    const name=nameOf(o),team=teamOf(o)||ctx.team,division=ctx.division||divisionOf(o);
    if(!name||!team||name.toLowerCase()===team.toLowerCase())return;
    const key=`${team}|${name}`.toLowerCase();if(seen.has(key))return;seen.add(key);
    const a=accountOf(o);
    out.push({id:`ouat-${key.replace(/[^a-z0-9]+/g,"-")}`,name,team,region:"OUAT",division,platform:"EUW1",role:"MID",source:"LEA",accounts:a?[a]:[]});
  }
  function walk(v,ctx={team:"",division:""},hint=""){
    if(!v)return;
    if(Array.isArray(v)){v.forEach((x,i)=>walk(x,ctx,hint));return}
    if(typeof v!=="object")return;
    const next={...ctx},d=divisionOf(v);if(d)next.division=d;
    const hasRoster=[...rosterKeys].some(k=>Array.isArray(v[k])||v[k]?.players);
    const t=teamOf(v)||(hasRoster?txt(v.name):"");if(t)next.team=t;
    add(v,next,hint);
    for(const[k,ch]of Object.entries(v)){
      if(!ch||typeof ch!=="object")continue;
      const rh=/^(mid|middle|midlane|midlaner)$/i.test(k)?"MID":"";
      if(rosterKeys.has(k)&&Array.isArray(ch)&&ch.length>=5){
        const explicit=ch.some(x=>x&&(x.role||x.position||x.lane||x.playerRole));
        ch.forEach((p,i)=>walk(p,next,explicit?"":ordered[i]||""));
      }else walk(ch,next,rh||hint);
    }
  }
  payloads.forEach(p=>walk(p));
  return out;
}

function extractRows(rows=[]){
  const out=[],seen=new Set(),bad=/^(TOP|JUNGLE|JGL|MID|MIDDLE|MIDLANE|ADC|BOT|SUPPORT|SUP)$/i;
  for(const r of rows){
    const lines=(r.lines||r.cells||[]).map(txt).filter(Boolean);
    const i=lines.findIndex(x=>MID.test(x));if(i<0)continue;
    let name=txt(r.name);
    const candidates=[lines[i-1],lines[i+1],lines[i-2],lines[i+2]].filter(Boolean).filter(x=>!bad.test(x)&&!MID.test(x)&&x.length<50);
    if(!name)name=candidates[0]||"";
    let team=txt(r.team)||txt(r.heading);
    if(!team){
      const h=(r.context||[]).map(txt).find(x=>x&&x!==name&&!bad.test(x)&&!MID.test(x)&&x.length<80);
      team=h||"";
    }
    if(!name||!team)continue;
    const key=`${team}|${name}`.toLowerCase();if(seen.has(key))continue;seen.add(key);
    const riot=lines.find(x=>x.includes("#")&&x.length<80);let accounts=[];
    if(riot){const j=riot.lastIndexOf("#");accounts=[{gameName:riot.slice(0,j).trim(),tagLine:riot.slice(j+1).trim(),platform:"EUW1"}]}
    out.push({id:`ouat-${key.replace(/[^a-z0-9]+/g,"-")}`,name,team,region:"OUAT",division:txt(r.division),platform:"EUW1",role:"MID",source:"LEA page",accounts});
  }
  return out;
}

async function discover(){
  const c=new AbortController(),to=setTimeout(()=>c.abort(),5000);
  try{
    const r=await net.fetch(OFFICIAL_PAGE,{headers:{"User-Agent":"Mozilla/5.0 MidWatch/2.0"},signal:c.signal});if(!r.ok)return"";
    const h=await r.text(),m=[...h.matchAll(/href=["']([^"']*lol\.leamateur\.pro\/tournaments\/OUATventure[^"']*)["']/ig)];
    return m.at(-1)?.[1]?.replace(/&amp;/g,"&").replace(/^http:/i,"https:").replace(/ /g,"%20")||"";
  }catch(_){return""}finally{clearTimeout(to)}
}

async function capture(url){
  const w=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  const payloads=[],targets=new Set();let attached=false;
  try{
    try{w.webContents.debugger.attach("1.3");attached=true;await w.webContents.debugger.sendCommand("Network.enable")}catch(_){}
    if(attached)w.webContents.debugger.on("message",async(_e,m,p)=>{
      if(m==="Network.responseReceived"){
        const u=String(p.response?.url||""),mime=String(p.response?.mimeType||"").toLowerCase();
        if(["XHR","Fetch"].includes(p.type)||mime.includes("json")||/api|tournament|team|roster|participant|player/i.test(u))targets.add(p.requestId);
      }
      if(m==="Network.loadingFinished"&&targets.has(p.requestId)){
        try{const b=await w.webContents.debugger.sendCommand("Network.getResponseBody",{requestId:p.requestId}),s=b.base64Encoded?Buffer.from(b.body,"base64").toString("utf8"):b.body;if(s&&/^[\s]*[\[{]/.test(s))payloads.push(JSON.parse(s))}catch(_){}
      }
    });
    const load=w.loadURL(url,{userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36"}).catch(()=>null);
    await Promise.race([load,wait(8000)]);await wait(2500);
    const page=await w.webContents.executeJavaScript(`(() => {
      const json=[],rows=[];
      const push=v=>{try{if(v&&typeof v==="object")json.push(JSON.stringify(v))}catch(e){}};
      push(window.__NEXT_DATA__);push(window.__NUXT__);push(window.__INITIAL_STATE__);push(window.__APOLLO_STATE__);
      for(const s of document.scripts){const t=(s.textContent||"").trim();if(t.length<6000000&&(t[0]==="{"||t[0]==="["))json.push(t)}
      const all=[...document.querySelectorAll("body *")];
      for(const el of all){
        const t=(el.innerText||"").trim();
        if(!t||t.length>900||!/(^|[^A-Z])(MID|MIDDLE|MIDLANE|MIDLANER)([^A-Z]|$)/i.test(t))continue;
        const childText=[...el.children].map(x=>(x.innerText||"").trim()).filter(Boolean).join("\n");
        if(childText===t&&el.children.length>8)continue;
        const lines=t.split(/\n+/).map(x=>x.trim()).filter(Boolean);
        if(lines.length>35)continue;
        let a=el,heading="",team="",division="";
        for(let n=0;n<5&&a;n++,a=a.parentElement){
          const h=a.querySelector?.("h1,h2,h3,h4,h5,[class*='title'],[class*='name']");
          if(h&&h!==el){heading=(h.innerText||"").trim();if(heading)break}
        }
        const tr=el.closest("tr"),cells=tr?[...tr.querySelectorAll("th,td")].map(x=>(x.innerText||"").trim()).filter(Boolean):lines;
        rows.push({lines,cells,heading,team,division,context:[heading]});
      }
      return{title:document.title||"",json,rows};
    })()`).catch(()=>({title:"",json:[],rows:[]}));
    for(const s of page.json||[])try{payloads.push(JSON.parse(s))}catch(_){}
    return{payloads,page};
  }finally{try{if(attached)w.webContents.debugger.detach()}catch(_){}try{w.destroy()}catch(_){}}
}

function seasonFrom(url,title=""){const m=(url+" "+title).match(/Saison(?:%20|\s)*(\d+)/i);return m?`S${m[1]}`:"OUATventure"}

async function refresh(configured=""){
  const s=predictedSeason(),official=await discover();
  const urls=[configured,tournamentUrl(s),official,tournamentUrl(s-1)].filter((v,i,a)=>v&&a.indexOf(v)===i);
  const errors=[];
  for(const url of urls){
    try{
      const c=await capture(url);
      let mids=extract(c.payloads);
      if(!mids.length)mids=extractRows(c.page.rows);
      if(mids.length){
        mids.sort((a,b)=>String(a.division).localeCompare(String(b.division),undefined,{numeric:true})||a.team.localeCompare(b.team)||a.name.localeCompare(b.name));
        return{url,season:seasonFrom(url,c.page.title),players:mids,updatedAt:Date.now(),warning:""};
      }
      errors.push(`${seasonFrom(url)}: 0 MID`);
    }catch(e){errors.push(`${seasonFrom(url)}: ${e.message}`)}
  }
  throw new Error(`OUATventure : aucun roster MID public détecté. ${errors.join(" · ")}`);
}

module.exports={refresh,extract,extractRows,discoverOfficialTournamentUrl:discover,predictedSeason,tournamentUrl};
