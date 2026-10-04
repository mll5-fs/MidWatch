const fs=require("fs"),path=require("path"),{spawn,execFile}=require("child_process");
const HOSTS={BR1:"spectator.br1.lol.riotgames.com:80",EUN1:"spectator.eun1.lol.riotgames.com:80",EUW1:"spectator.euw1.lol.riotgames.com:80",JP1:"spectator.jp1.lol.riotgames.com:80",KR:"spectator.kr.lol.riotgames.com:80",LA1:"spectator.la1.lol.riotgames.com:80",LA2:"spectator.la2.lol.riotgames.com:80",NA1:"spectator.na1.lol.riotgames.com:80",OC1:"spectator.oc1.lol.riotgames.com:80",TR1:"spectator.tr1.lol.riotgames.com:80",RU:"spectator.ru.lol.riotgames.com:80",SG2:"spectator.sg2.lol.pvp.net:8080",TW2:"spectator.tw2.lol.pvp.net:8080",VN2:"spectator.vn2.lol.pvp.net:8080",PH2:"spectator.ph2.lol.pvp.net:8080",TH2:"spectator.th2.lol.pvp.net:8080"};
const valid=r=>r&&fs.existsSync(path.join(r,"Game","League of Legends.exe"));
function detect(saved=""){const drives=["C","D","E","F","G"],c=[saved,...drives.flatMap(d=>[`${d}:\\Riot Games\\League of Legends`,`${d}:\\Games\\Riot Games\\League of Legends`]),"C:\\Program Files\\Riot Games\\League of Legends"];return c.find(valid)||""}
function spec(root,game,locale){const p=String(game?.platformId||"").toUpperCase(),k=String(game?.observers?.encryptionKey||""),id=String(game?.gameId||"");if(!p||!k||!id)throw new Error("Données spectateur Riot incomplètes.");const host=HOSTS[p]||`spectator.${p.toLowerCase()}.lol.pvp.net:8080`;return{p,args:["8394","LoLLauncher.exe","",`spectator ${host} ${k} ${id} ${p}`]}}
function running(){return new Promise(resolve=>execFile("tasklist",["/FI","IMAGENAME eq League of Legends.exe","/FO","CSV","/NH"],{windowsHide:true},(e,out)=>resolve(!e&&/League of Legends\.exe/i.test(out))))}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function launch(root,game,locale="fr_FR"){root=detect(root);if(!root)throw new Error("Installation de League of Legends introuvable. Choisis son dossier dans Réglages.");const exe=path.join(root,"Game","League of Legends.exe"),x=spec(root,game,locale),before=await running();
  let launchError=null;
  try{const child=spawn(exe,x.args,{cwd:path.dirname(exe),detached:true,stdio:"ignore",windowsHide:false,shell:false});child.once("error",e=>{launchError=e});child.unref()}catch(e){launchError=e}
  for(let i=0;i<12;i++){await sleep(500);if(await running())return{root,verified:true,alreadyRunning:before}}
  if(launchError&&launchError.code==="EPERM")throw new Error("Windows a refusé de lancer League (EPERM). Ferme Riot/League puis relance MidPulse en administrateur.");
  throw new Error("League ne s’est pas lancé. Vérifie le dossier League dans Réglages et ferme tout processus League bloqué avant de réessayer.");
}
module.exports={detect,launch};