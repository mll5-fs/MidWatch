const base="https://lol.leamateur.pro";
const html=await (await fetch(base+"/tournaments/OUATventure%20Saison%2023")).text();
const src=html.match(/src="([^"]+\.js)"/)?.[1];
const js=await (await fetch(base+src)).text();
for(const pat of ["Q3=async","/team","byTournament","tournamentId","divisionId"]){
  const i=js.indexOf(pat);
  console.log("PATTERN",pat,"INDEX",i);
  if(i>=0) console.log(js.slice(Math.max(0,i-1200),Math.min(js.length,i+7000)));
}