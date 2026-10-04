const api="https://api.leamateur.pro";
const ts=await (await fetch(api+"/tournaments")).json();
console.log("TOURNAMENTS",JSON.stringify(ts,null,2));
const list=Array.isArray(ts)?ts:(ts.data||[]);
const ouat=list.filter(x=>String(x.name||"").toLowerCase().includes("ouatventure"));
for(const t of ouat.slice(-5)){
 console.log("OUAT",t.id,t.name);
 try{
  const c=await (await fetch(api+"/clasification/byTournament/"+t.id)).json();
  console.log("CLASS",t.id,JSON.stringify(c,null,2).slice(0,40000));
 }catch(e){console.log("CLASS_ERR",e.message)}
}
const html=await (await fetch("https://lol.leamateur.pro/")).text();
const src=html.match(/src="([^"]+\.js)"/)?.[1];
const js=await (await fetch("https://lol.leamateur.pro"+src)).text();
let p=0,n=0;
while((p=js.indexOf("/team/",p))>=0&&n<20){console.log("TEAMCODE",js.slice(Math.max(0,p-400),Math.min(js.length,p+900)));p+=6;n++;}