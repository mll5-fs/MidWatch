const{app,BrowserWindow,ipcMain,shell,dialog}=require("electron");const path=require("path");const store=require("./store"),bootstrap=require("./data/players"),bundledOuat=require("./data/ouat-current.json"),{Riot}=require("./services/riot"),pros=require("./services/pros"),spectate=require("./services/spectate"),ouat=require("./services/ouat");let mainWindow;
let liveCursor=0;function applyOverrides(list){const o=store.get("accountOverrides",{});return(list||[]).map(p=>o[p.id]?{...p,accounts:[o[p.id]],accountOverride:true}:p)}function currentPros(){const c=store.get("proCache",[]);return applyOverrides(Array.isArray(c)&&c.length?c:bootstrap)}function key(){return String(store.get("riotKey","")||"").trim()}
function create(){store.init();const found=spectate.detect(store.get("leaguePath",""));if(found&&found!==store.get("leaguePath",""))store.set("leaguePath",found);mainWindow=new BrowserWindow({width:1460,height:920,minWidth:1040,minHeight:700,show:false,backgroundColor:"#070a0f",title:"MidPulse",autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:false}});mainWindow.loadFile(path.join(__dirname,"renderer/index.html"));mainWindow.once("ready-to-show",()=>mainWindow.show())}

async function liveBatch(){
  if(!key())return{updates:[],checked:0};
  const saved=store.get("ouat",{}),o=(Array.isArray(saved.players)&&saved.players.length)?saved:bundledOuat;
  const fav=new Set(store.get("favorites",[]));
  const players=[...currentPros(),...applyOverrides(o.players||[])];
  const withAccounts=players.filter(p=>p.accounts?.[0]?.gameName&&p.accounts?.[0]?.tagLine);
  withAccounts.sort((a,b)=>(fav.has(b.id)-fav.has(a.id))||((a.region==="OUAT")-(b.region==="OUAT")));
  if(!withAccounts.length)return{updates:[],checked:0};
  const cache=store.get("riotAccountCache",{}),riot=new Riot(key()),updates=[],batch=[];
  for(let i=0;i<8&&i<withAccounts.length;i++)batch.push(withAccounts[(liveCursor+i)%withAccounts.length]);
  liveCursor=(liveCursor+batch.length)%withAccounts.length;
  for(const p of batch){
    const a=p.accounts[0],ck=`${String(a.platform||"EUW1").toUpperCase()}|${a.gameName}#${a.tagLine}`.toLowerCase();
    let puuid=cache[ck];
    try{
      if(!puuid){const resolved=await riot.resolveAccount(a);puuid=resolved.puuid;cache[ck]=puuid}
      let game=null;try{game=await riot.active(a.platform||"EUW1",puuid)}catch(e){if(e.status!==404)throw e}
      updates.push({id:p.id,live:!!game,checkedAt:Date.now(),gameId:game?.gameId||null});
    }catch(e){
      if(e.status===404)updates.push({id:p.id,live:false,checkedAt:Date.now()});
      else updates.push({id:p.id,live:null,checkedAt:Date.now(),error:String(e.message||e)});
    }
  }
  store.set("riotAccountCache",cache);
  return{updates,checked:batch.length,total:withAccounts.length};
}

function data(){const saved=store.get("ouat",{}),o=(Array.isArray(saved.players)&&saved.players.length)?saved:bundledOuat;return{players:currentPros(),ouatPlayers:applyOverrides(o.players||[]),ouat:{url:o.url||"",season:o.season||"",status:o.status||"",start:o.start||"",end:o.end||"",teams:o.teams||0,warning:o.warning||"",updatedAt:o.updatedAt||0,source:o.source||""},favorites:store.get("favorites",[]),hasKey:!!key(),leaguePath:spectate.detect(store.get("leaguePath","")),proCacheAt:store.get("proCacheAt",0)}}
ipcMain.handle("app:data",()=>data());
ipcMain.handle("favorite:toggle",(_e,id)=>{let f=store.get("favorites",[]);f=f.includes(id)?f.filter(x=>x!==id):[...f,id];store.set("favorites",f);return f});
ipcMain.handle("settings:key",async(_e,v)=>{const next=String(v||"").trim();if(!next){store.set("riotKey","");return false}await new Riot(next).validate();store.set("riotKey",next);return true});ipcMain.handle("riot:keycheck",async()=>{if(!key())return false;try{await new Riot(key()).validate();return true}catch(_){return false}});
ipcMain.handle("account:override",(_e,id,a)=>{const all=store.get("accountOverrides",{}),gameName=String(a?.gameName||"").trim(),tagLine=String(a?.tagLine||"").trim(),platform=String(a?.platform||"EUW1").toUpperCase();if(!gameName||!tagLine)throw new Error("Riot ID incomplet.");all[id]={gameName,tagLine,platform,manual:true};store.set("accountOverrides",all);return all[id]});ipcMain.handle("account:overrideClear",(_e,id)=>{const all=store.get("accountOverrides",{});delete all[id];store.set("accountOverrides",all);return true});
ipcMain.handle("settings:pickLeague",async()=>{const r=await dialog.showOpenDialog(mainWindow,{title:"Choisis le dossier League of Legends",properties:["openDirectory"]});if(r.canceled||!r.filePaths[0])return store.get("leaguePath","");let root=r.filePaths[0];if(path.basename(root).toLowerCase()==="game")root=path.dirname(root);if(!spectate.detect(root))throw new Error("Ce dossier ne contient pas Game\\League of Legends.exe");store.set("leaguePath",root);return root});
ipcMain.handle("pros:refresh",async()=>{const r=await pros.refreshPros();if(r.players.length){store.set("proCache",r.players);store.set("proCacheAt",Date.now())}return{...r,at:Date.now()}});
ipcMain.handle("pros:profile",(_e,name,league)=>pros.profile(name,league));
ipcMain.handle("ouat:refresh",async(_e,url)=>{try{const r=await ouat.refresh(String(url||store.get("ouat",{}).url||""));if(r.players?.length)store.set("ouat",r);return r}catch(e){const saved=store.get("ouat",{});const fallback=(saved.players?.length?saved:bundledOuat);if(fallback.players?.length)return{...fallback,warning:`LEA live indisponible : ${e.message}. Snapshot local conservé.`};throw e}});
ipcMain.handle("ouat:url",(_e,url)=>{const o=store.get("ouat",{});o.url=String(url||"").trim();store.set("ouat",o);return o.url});
ipcMain.handle("riot:liveBatch",()=>liveBatch());
ipcMain.handle("riot:check",async(_e,a)=>{if(!key())throw new Error("Ajoute ta clé Riot dans Settings.");const riot=new Riot(key()),acc=await riot.resolveAccount(a);let ranked=[];try{ranked=await riot.ranked(acc.platform,acc.puuid)}catch(_){}let active=null;try{active=await riot.active(acc.platform,acc.puuid)}catch(e){if(e.status!==404)throw e}return{account:acc,ranked,active}});
ipcMain.handle("spectate:launch",async(_e,a)=>{if(!key())throw new Error("Ajoute ta clé Riot dans Settings.");const riot=new Riot(key()),acc=await riot.resolveAccount(a);let game;try{game=await riot.active(acc.platform,acc.puuid)}catch(e){if(e.status===404)throw new Error("Ce joueur n’est plus en partie.");throw e}const root=spectate.launch(store.get("leaguePath",""),game);store.set("leaguePath",root);return{ok:true,gameId:game.gameId}});
ipcMain.handle("external:open",(_e,url)=>{if(/^https?:\/\//i.test(String(url)))return shell.openExternal(String(url));return false});
app.whenReady().then(create);app.on("activate",()=>BrowserWindow.getAllWindows().length===0&&create());app.on("window-all-closed",()=>process.platform!=="darwin"&&app.quit());
