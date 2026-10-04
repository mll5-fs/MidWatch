const base="https://lol.leamateur.pro";
const html=await (await fetch(base+"/tournaments/OUATventure%20Saison%2023")).text();
const m=html.match(/<script[^>]+src="([^"]+index-[^"]+\.js)"/);
console.log("ASSET",m?.[1]);
if(m){
  const js=await (await fetch(new URL(m[1],base))).text();
  console.log("JS_LEN",js.length);
  const urls=[...js.matchAll(/https?:\\?\/\\?\/[^"'\\s)]+/g)].map(x=>x[0]).filter((x,i,a)=>a.indexOf(x)===i);
  console.log("URLS",urls.slice(0,200));
  for(const word of ["api","tournament","teams","participants","roster","players"]){
    console.log("\n==",word,"==");
    let pos=0,n=0;
    while((pos=js.toLowerCase().indexOf(word,pos))>=0&&n<35){console.log(js.slice(Math.max(0,pos-240),Math.min(js.length,pos+420)).replace(/\s+/g," "));pos+=word.length;n++;}
  }
}