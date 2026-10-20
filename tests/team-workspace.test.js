const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const T=require('../src/renderer/teams'),D=require('../src/renderer/duels'),R=require('../src/renderer/report'),L=require('../src/renderer/live-monitor');
const app=fs.readFileSync('src/renderer/app.js','utf8'),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const players=(id,name=id)=>T.roles.map(role=>({id:id+role,teamId:id,team:name,division:'Division 11',group:'Div 11D',name:id+' '+role,role,accounts:[{gameName:id+role,tagLine:'EUW'}]}));
function ui(ps=[...players('home','UWU GANG'),...players('op','Opponent')]){
 const nodes={},buttons=new Map(),$=id=>{if(['#copyGroupRanks','#groupRanksPreview'].includes(id)&&!nodes['#grid']?.innerHTML.includes('id="'+id.slice(1)+'"'))return null;return nodes[id]??={value:'',innerHTML:'',textContent:'',hidden:false};};let calls=0,opened;
 const c=vm.createContext({$,S:{ouat:{},lineups:{},hasKey:true,version:'5.23.0'},allPlayers:()=>ps,TeamScouting:T,DuelScouting:D,ReportBuilder:R,LiveMonitor:L,esc,queryMatch:()=>false,playerRankLabel:()=>'',rankDateHtml:()=>'',rankPlaceholder:()=> 'À charger',scoutingAccount:p=>p.accounts[0],document:{querySelectorAll:selector=>{
  if(selector!=='[data-team-player]')return [];
  return [...(nodes['#grid']?.innerHTML||'').matchAll(/data-team-player="([^"]+)"/g)].map(m=>{const b={dataset:{teamPlayer:m[1]}};buttons.set(m[1],b);return b;});
 }},render:()=>c.renderTeamSection(),refreshRanks:()=>{},openPlayer:id=>opened=id,window:{mw:{roleStats:()=>{calls++;throw Error('Unexpected Riot request');}}}});
 vm.runInContext(app.slice(app.indexOf('let teamDivision='),app.indexOf('\nfunction render(){')),c);c.renderTeamSection();
 return {c,nodes,ps,buttons,html:()=>nodes['#grid'].innerHTML,calls:()=>calls,opened:()=>opened,choose:id=>nodes['#teamSelect'].onchange({target:{value:id}})};
}
function links(html){return [...html.matchAll(/href="#(team-[^"]+)"/g)].map(m=>m[1]);}
function validTargets(html){const ids=[...html.matchAll(/id="(team-[^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'No duplicate section IDs');for(const id of links(html)){assert.equal(ids.filter(v=>v===id).length,1,id);assert.match(html,new RegExp('id="'+id+'"[^>]*tabindex="-1"'),id+' focusable target');}}
test('opponent workspace puts the five-role roster before reports and every shortcut has one actual target',()=>{
 const x=ui();x.choose('op');const html=x.html();validTargets(html);assert.equal(links(html).length,9);const order=['team-preparation-nav','team-roster','team-paired-ranks','team-rank-progress','team-group-ranks','team-draft-pools','team-preparation-report','team-overview','team-comparator'].map(id=>html.indexOf('id="'+id+'"'));assert.ok(order.every((n,i)=>n>=0&&(!i||n>order[i-1])));assert.equal((html.match(/data-team-player=/g)||[]).length,10);for(const role of T.roles)assert.match(html,new RegExp('op '+role));assert.match(html,/Ce n’est pas le MMR/);assert.equal(x.calls(),0);
});
test('UWU GANG alone has no dead comparison shortcuts and keeps all five roles',()=>{
 const x=ui(players('home','UWU GANG'));validTargets(x.html());assert.equal(links(x.html()).length,4);assert.doesNotMatch(x.html(),/href="#team-(draft-pools|overview|comparator)"/);assert.equal((x.html().match(/data-team-player=/g)||[]).length,5);assert.match(x.html(),/Sélectionne une autre équipe/);
});
test('missing UWU GANG does not fabricate comparison targets or players',()=>{
 const x=ui(players('op'));validTargets(x.html());assert.equal(links(x.html()).length,4);assert.match(x.html(),/UWU GANG introuvable/);assert.equal((x.html().match(/data-team-player=/g)||[]).length,5);
});
test('unknown group shortcut leads to its explicit unavailable explanation',()=>{
 const ps=players('op').map(p=>({...p,division:'',group:''})),x=ui(ps);validTargets(x.html());assert.match(x.html(),/href="#team-group-ranks"/);assert.match(x.html(),/Groupe LEA non publié/);assert.doesNotMatch(x.html(),/id="copyGroupRanks"/);
});
test('empty results have no stale workspace or dangling anchors',()=>{
 const x=ui();x.nodes['#qTop'].value='no matching team';x.c.renderTeamSection();assert.match(x.html(),/Aucune équipe/);assert.equal(links(x.html()).length,0);assert.doesNotMatch(x.html(),/id="team-preparation-nav"/);
});
test('changing team updates workspace identity and keeps player profile buttons functional',()=>{
 const x=ui([...players('home','UWU GANG'),...players('op','Opponent'),...players('next','Next')]);x.choose('op');x.buttons.get('opMID').onclick();assert.equal(x.opened(),'opMID');x.choose('next');validTargets(x.html());assert.match(x.html(),/PRÉPARATION · Next/);assert.doesNotMatch(x.html(),/PRÉPARATION · Opponent/);x.buttons.get('nextSUPPORT').onclick();assert.equal(x.opened(),'nextSUPPORT');assert.equal(x.calls(),0);
});
test('workspace labels are escaped and native links carry no fetch or click handler',()=>{
 const x=ui([...players('home','UWU GANG'),...players('op','<img src=x onerror=bad()>')]);x.choose('op');const nav=x.html().match(/<nav id="team-preparation-nav"[\s\S]*?<\/nav>/)[0];assert.match(nav,/&lt;img/);assert.doesNotMatch(nav,/<img|onclick=|data-open|http:/);for(const id of links(nav))assert.ok(id.startsWith('team-'));assert.match(nav,/aria-label="Sommaire de préparation d’équipe"/);assert.match(nav,/ne lancent aucune collecte Riot/);
});
test('navigation is responsive and keyboard focus/fragment offsets are explicit without smooth-motion forcing',()=>{
 const css=fs.readFileSync('src/renderer/style.css','utf8');assert.match(css,/team-workspace-links\{display:flex;flex-wrap:wrap/);assert.match(css,/team-workspace-links a:focus-visible/);assert.match(css,/team-section-anchor:focus-visible/);assert.match(css,/scroll-margin-top:150px/);assert.match(css,/@media\(max-width:790px\)\{\.team-section-anchor\{scroll-margin-top:16px/);assert.doesNotMatch(css.slice(0,css.indexOf(':root{')),/scroll-behavior:smooth/);
});
