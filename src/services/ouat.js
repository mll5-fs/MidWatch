const { BrowserWindow, net } = require("electron");

const OFFICIAL_PAGE = "https://www.onceuponateam.be/?page_id=3104";
const wait = ms => new Promise(r => setTimeout(r, ms));
const text = v => typeof v === "string" ? v.trim() : "";
const ROLE_RE = /(^|[^A-Z])(MID|MIDDLE|MIDLANE|MIDLANER)([^A-Z]|$)/i;

function predictedSeason(date = new Date()) {
  // OUATventure S20 was Jan-Mar 2026 and the competition runs four seasons/year.
  if (date.getFullYear() < 2026) return 20;
  return 20 + (date.getFullYear() - 2026) * 4 + Math.floor(date.getMonth() / 3);
}

function tournamentUrl(season) {
  return `https://lol.leamateur.pro/tournaments/OUATventure%20Saison%20${season}`;
}

function role(v) {
  if (v && typeof v === "object") v = v.value || v.name || v.label || v.role;
  return text(v).toUpperCase();
}
function isMid(v) { return ROLE_RE.test(role(v)); }
function nameOf(o) {
  return text(o?.displayName || o?.playerName || o?.summonerName || o?.nickname || o?.nick || o?.gameName || o?.username || o?.pseudo || o?.name);
}
function teamOf(v) {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object") return text(v.teamName || v.displayName || v.name || v.title || v.tag);
  return "";
}
function divisionOf(v) {
  if (typeof v === "number") return `Division ${v}`;
  const s = teamOf(v);
  if (!s) return "";
  if (/^\d+$/.test(s)) return `Division ${s}`;
  return s;
}
function accountFrom(o) {
  const raw = text(o?.riotId || o?.riotID || o?.riot_id || o?.summoner || o?.account);
  let gameName = text(o?.gameName), tagLine = text(o?.tagLine || o?.tag);
  if (raw.includes("#")) {
    const i = raw.lastIndexOf("#");
    gameName = raw.slice(0, i).trim();
    tagLine = raw.slice(i + 1).trim();
  }
  return gameName && tagLine ? { gameName, tagLine, platform: "EUW1" } : null;
}

function extract(payloads) {
  const out = [], seen = new Set();
  const rosterKeys = new Set(["players","roster","members","lineup","participants","teamMembers","registrations"]);
  const orderedRoles = ["TOP","JUNGLE","MID","ADC","SUPPORT"];

  function add(o, ctx, hint = "") {
    if (!o || typeof o !== "object") return;
    const detected = role(o.role || o.position || o.lane || o.playerRole || o.gameRole || hint);
    if (!isMid(detected)) return;
    const name = nameOf(o);
    const team = teamOf(o.team || o.teamName || o.squad || o.organization) || ctx.team;
    if (!name || !team || name.toLowerCase() === team.toLowerCase()) return;
    const div = ctx.division || divisionOf(o.division || o.group || o.pool || o.league);
    const key = `${team}|${name}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const acc = accountFrom(o);
    out.push({
      id: `ouat-${key.replace(/[^a-z0-9]+/g,"-")}`,
      name, team, region:"OUAT", division:div, platform:"EUW1", role:"MID",
      source:"LEA · OUATventure", accounts:acc ? [acc] : []
    });
  }

  function walk(v, ctx={team:"",division:""}, hint="") {
    if (!v) return;
    if (Array.isArray(v)) {
      v.forEach((x,i)=>walk(x,ctx,hint || ""));
      return;
    }
    if (typeof v !== "object") return;
    const next={...ctx};
    const d=divisionOf(v.division || v.group || v.pool || v.league || v.bracket);
    if (d) next.division=d;
    const hasRoster=[...rosterKeys].some(k=>Array.isArray(v[k]) || v[k]?.players);
    const possible=teamOf(v.teamName || v.team || v.squad || v.organization || (hasRoster ? v.name : ""));
    if (possible) next.team=possible;
    add(v,next,hint);

    for (const [k,child] of Object.entries(v)) {
      if (!child || typeof child !== "object") continue;
      let childHint=/^(mid|middle|midlane|midlaner)$/i.test(k) ? "MID" : "";
      if (rosterKeys.has(k) && Array.isArray(child) && child.length >= 5) {
        const explicit=child.some(x=>x && typeof x==="object" && (x.role||x.position||x.lane||x.playerRole));
        child.forEach((player,i)=>walk(player,next,explicit ? "" : orderedRoles[i] || ""));
      } else walk(child,next,childHint || hint);
    }
  }
  payloads.forEach(p=>walk(p));
  return out.sort((a,b)=>{
    const na=+(String(a.division).match(/\d+/)?.[0]||999), nb=+(String(b.division).match(/\d+/)?.[0]||999);
    return na-nb || String(a.division).localeCompare(String(b.division)) || a.team.localeCompare(b.team) || a.name.localeCompare(b.name);
  });
}

function extractDom(rows=[]) {
  const out=[],seen=new Set();
  for(const row of rows){
    const cells=(row.cells||[]).map(text).filter(Boolean);
    if(!cells.length || !cells.some(isMid)) continue;
    const midIndex=cells.findIndex(isMid);
    const name=text(row.name) || cells[midIndex-1] || cells[midIndex+1] || "";
    const team=text(row.team) || text(row.heading) || "";
    if(!name || !team || isMid(name)) continue;
    const key=`${team}|${name}`.toLowerCase();
    if(seen.has(key)) continue; seen.add(key);
    const riot=cells.find(x=>x.includes("#"));
    let accounts=[];
    if(riot){const i=riot.lastIndexOf("#");accounts=[{gameName:riot.slice(0,i).trim(),tagLine:riot.slice(i+1).trim(),platform:"EUW1"}]}
    out.push({id:`ouat-${key.replace(/[^a-z0-9]+/g,"-")}`,name,team,region:"OUAT",division:text(row.division),platform:"EUW1",role:"MID",source:"LEA · page",accounts});
  }
  return out;
}

async function discoverOfficialTournamentUrl(){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),8000);
  try{
    const r=await net.fetch(OFFICIAL_PAGE,{headers:{"User-Agent":"Mozilla/5.0 MidWatch/2.0"},signal:c.signal});
    if(!r.ok)return"";
    const html=await r.text();
    const all=[...html.matchAll(/href=["']([^"']*lol\.leamateur\.pro\/tournaments\/OUATventure[^"']*)["']/ig)].map(m=>m[1]);
    return all.at(-1)?.replace(/&amp;/g,"&").replace(/^http:/i,"https:").replace(/ /g,"%20")||"";
  }catch(_){return""}finally{clearTimeout(t)}
}

async function capture(url){
  const win=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  const payloads=[],targets=new Map();let attached=false;
  try{
    try{win.webContents.debugger.attach("1.3");attached=true;await win.webContents.debugger.sendCommand("Network.enable")}catch(_){}
    if(attached)win.webContents.debugger.on("message",async(_e,method,p)=>{
      if(method==="Network.responseReceived"){
        const mime=String(p.response?.mimeType||"").toLowerCase(),u=String(p.response?.url||"");
        if(["XHR","Fetch"].includes(p.type)||mime.includes("json")||/api|tournament|team|roster|participant|player/i.test(u))targets.set(p.requestId,u);
      }
      if(method==="Network.loadingFinished"&&targets.has(p.requestId)){
        try{
          const b=await win.webContents.debugger.sendCommand("Network.getResponseBody",{requestId:p.requestId});
          const s=b.base64Encoded?Buffer.from(b.body,"base64").toString("utf8"):b.body;
          if(s&&/^[\s]*[\[{]/.test(s))payloads.push(JSON.parse(s));
        }catch(_){}
      }
    });
    const load=win.loadURL(url,{userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36"}).catch(()=>null);
    await Promise.race([load,wait(18000)]);await wait(6000);
    const page=await win.webContents.executeJavaScript(`(() => {
      const json=[];
      const push=v=>{try{if(v&&typeof v==="object")json.push(JSON.stringify(v))}catch(e){}};
      push(window.__NEXT_DATA__); push(window.__NUXT__); push(window.__INITIAL_STATE__); push(window.__APOLLO_STATE__);
      for(const s of document.scripts){const t=(s.textContent||"").trim();if(t.length<8000000&&(t[0]==="{"||t[0]==="["))json.push(t)}
      for(const area of [localStorage,sessionStorage])for(let i=0;i<area.length;i++){const t=area.getItem(area.key(i));if(t&&t.length<8000000&&["{","["].includes(t.trim()[0]))json.push(t)}
      const rows=[];
      for(const tr of document.querySelectorAll("tr")){
        const cells=[...tr.querySelectorAll("th,td")].map(x=>(x.innerText||"").trim()).filter(Boolean);
        if(cells.some(x=>/(^|\\W)(MID|MIDDLE|MIDLANE|MIDLANER)(\\W|$)/i.test(x))){
          const table=tr.closest("table"), heading=table?.previousElementSibling?.innerText||"";
          rows.push({cells,heading});
        }
      }
      for(const el of document.querySelectorAll("[class*='player'],[class*='roster'],[class*='member'],[class*='team']")){
        const t=(el.innerText||"").trim(); if(!t||t.length>1200||!/(^|\\W)(MID|MIDDLE|MIDLANE|MIDLANER)(\\W|$)/i.test(t))continue;
        const lines=t.split(/\\n+/).map(x=>x.trim()).filter(Boolean);
        const i=lines.findIndex(x=>/(^|\\W)(MID|MIDDLE|MIDLANE|MIDLANER)(\\W|$)/i.test(x));
        rows.push({cells:lines,name:lines[i-1]||lines[i+1]||"",team:el.closest("[class*='team']")?.querySelector("h1,h2,h3,h4,[class*='name']")?.innerText||""});
      }
      return {title:document.title||"",text:(document.body?.innerText||"").slice(0,200000),json,rows};
    })()`).catch(()=>({title:"",text:"",json:[],rows:[]}));
    for(const s of page.json||[])try{payloads.push(JSON.parse(s))}catch(_){}
    return{payloads,page};
  }finally{
    try{if(attached)win.webContents.debugger.detach()}catch(_){}
    try{win.destroy()}catch(_){}
  }
}

function seasonFrom(url,title=""){const m=(url+" "+title).match(/Saison(?:%20|\s)*(\d+)/i);return m?`S${m[1]}`:"OUATventure"}

async function refresh(configured=""){
  const official=await discoverOfficialTournamentUrl();
  const p=predictedSeason();
  const candidates=[configured,tournamentUrl(p),tournamentUrl(p-1),tournamentUrl(p+1),official,tournamentUrl(20)]
    .filter((v,i,a)=>v&&a.indexOf(v)===i);
  const errors=[];
  for(const url of candidates){
    try{
      const c=await capture(url);
      let mids=extract(c.payloads);
      if(!mids.length)mids=extractDom(c.page.rows);
      if(mids.length)return{url,season:seasonFrom(url,c.page.title),players:mids,updatedAt:Date.now(),warning:mids.length<8?"Import public partiel : certains rosters LEA ne sont peut-être pas exposés.":""};
      errors.push(`${seasonFrom(url)}: aucun MID structuré`);
    }catch(e){errors.push(`${seasonFrom(url)}: ${e.message}`)}
  }
  throw new Error(`Import OUATventure impossible. ${errors.slice(-3).join(" · ")}`);
}

module.exports={refresh,extract,extractDom,discoverOfficialTournamentUrl,predictedSeason,tournamentUrl};
