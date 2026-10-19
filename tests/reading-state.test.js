const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('src/renderer/app.js','utf8');
function ui(){
 let specs=[{section:'team-draft-pools',html:'<summary>Ahri</summary><p>EUW1_1</p>',label:'Ahri'},
 {section:'team-rank-progress',html:'<summary>Équipe A</summary><p>En attente</p>',label:'Équipe A'},
 {section:'team-preparation-report',html:'<summary>Aperçu</summary><pre>Rapport daté</pre>',label:'Aperçu'}],nodes=[],renders=0,queries=0,calls={rank:0,live:0,roster:0},focusCalls=[];
 const document={activeElement:null,querySelectorAll:()=>[]},workspace={scrollTop:480},grid={querySelectorAll:()=>{queries++;return nodes;}};
 const c=vm.createContext({view:'TEAMS',selectedTeam:'A',teamDivision:'11',teamGroup:'D',document,
 $:s=>s==='#grid'?grid:s==='.workspace'?workspace:{innerHTML:'',textContent:''},
 render:()=>{renders++;nodes=specs.map(s=>{const summary={textContent:s.label,focus:options=>{focusCalls.push(options);document.activeElement=summary;}};return {innerHTML:s.html,open:false,closest:()=>({id:s.section}),querySelector:()=>summary};});workspace.scrollTop=0;},renderNav:()=>{},
 S:{hasKey:true,ouatPlayers:[],lineups:{},ouat:{}},rankBusy:false,rankCooldownAt:0,rankFollowup:null,rankReloadPending:false,rankMeta:{},rankState:{},liveMeta:{},liveState:{},busy:false,
 allPlayers:()=>[],listForView:()=>[],TeamScouting:{rankPriority:()=>[],group:()=>[]},LiveMonitor:{priority:()=>[]},PlayerIdentity:{matches:()=>true},notice:()=>{},
 window:{innerHeight:900,mw:{rankBatch:async()=>{calls.rank++;return {updates:[]};},liveBatch:async()=>{calls.live++;return {updates:[]};},refreshOuat:async()=>{calls.roster++;return {players:[],teams:0};}}},setTimeout:()=>{throw Error('Unexpected follow-up')},clearTimeout:()=>{}});
 vm.runInContext(app.slice(app.indexOf('function renderBackground(){'),app.indexOf('\n$("#overviewNav").onclick')),c);c.render();workspace.scrollTop=480;
 return {c,document,workspace,calls,focusCalls,nodes:()=>nodes,specs:v=>specs=v,initial:()=>specs.map(s=>({...s})),renders:()=>renders,queries:()=>queries};
}
test('plain redraw reproduces the disclosure reset; background redraw keeps open AND closed details',()=>{
 const x=ui();x.nodes()[0].open=true;x.c.render();assert.equal(x.nodes()[0].open,false);
 x.nodes()[0].open=true;x.c.renderBackground();assert.deepEqual(x.nodes().map(n=>n.open),[true,false,false]);assert.equal(x.workspace.scrollTop,0);
 x.nodes()[0].open=false;x.nodes()[2].open=true;x.workspace.scrollTop=720;x.c.renderBackground();assert.deepEqual(x.nodes().map(n=>n.open),[false,false,true]);assert.equal(x.workspace.scrollTop,720);assert.deepEqual(x.calls,{rank:0,live:0,roster:0});
});
test('changed or expired source/export content is not reopened as if it were the same report',()=>{
 const x=ui();x.nodes().forEach(n=>n.open=true);const s=x.initial();s[0].html+='new match';s[2].html+='new rank';x.specs(s);x.c.renderBackground();assert.deepEqual(x.nodes().map(n=>n.open),[false,true,false]);
 x.specs([]);x.c.renderBackground();x.specs(s);x.c.renderBackground();assert.ok(x.nodes().every(n=>!n.open),'no state survives a call or report expiry');
});
test('rank progress remains open while fresh statuses replace pending rows',()=>{
 const x=ui();x.nodes()[1].open=true;const s=x.initial();s[1].html='<summary>Équipe A</summary><p>Vérifié à 10:58</p>';x.specs(s);x.c.renderBackground();assert.equal(x.nodes()[1].open,true);assert.match(x.nodes()[1].innerHTML,/10:58/);
});
test('identical champion disclosures on two sides keep independent openness, not one shared flag',()=>{
 const x=ui(),s=x.initial();x.specs([s[0],{...s[0]}]);x.c.render();x.nodes()[1].open=true;x.c.renderBackground();assert.deepEqual(x.nodes().map(n=>n.open),[false,true]);
});
test('team context changes during render do not transfer openness or scroll',()=>{
 const x=ui();x.nodes()[0].open=true;const render=x.c.render;x.c.render=()=>{render();x.c.selectedTeam='B';};x.c.renderBackground();assert.ok(x.nodes().every(n=>!n.open));assert.equal(x.workspace.scrollTop,0);
});
test('non-team views use ordinary render without inspecting team details',()=>{
 const x=ui();x.c.view='PATCHES';const queries=x.queries();x.c.renderBackground();assert.equal(x.queries(),queries);assert.equal(x.renders(),2);
});
test('keyboard focus returns to the same summary without scrolling, never steals drawer focus',()=>{
 const x=ui();x.document.activeElement=x.nodes()[0].querySelector();x.c.renderBackground();assert.equal(x.document.activeElement,x.nodes()[0].querySelector());assert.equal(x.focusCalls.length,1);assert.equal(x.focusCalls[0].preventScroll,true);assert.equal(x.workspace.scrollTop,480);
 const drawer={};x.document.activeElement=drawer;x.c.renderBackground();assert.equal(x.document.activeElement,drawer);assert.equal(x.focusCalls.length,1);
});
test('actual rank refresh uses preservation and still applies current identity updates',async()=>{
 const x=ui();x.nodes()[0].open=true;x.c.S.ouatPlayers=[{id:'p'}];x.c.window.mw.rankBatch=async()=>{x.calls.rank++;return {updates:[{id:'p',identity:'current',status:'ranked',checkedAt:123,rank:{tier:'GOLD'}}]};};await x.c.refreshRanks();assert.equal(x.nodes()[0].open,true);assert.equal(x.c.rankMeta.p.rankStatus,'ranked');assert.equal(x.c.rankState.p.tier,'GOLD');assert.equal(x.c.rankBusy,false);assert.equal(x.calls.rank,1);
});
test('actual live refresh preserves on success, failure and keyless/cooldown branches without extra requests',async()=>{
 const x=ui();x.nodes()[0].open=true;await x.c.refreshLive();assert.equal(x.nodes()[0].open,true);assert.equal(x.calls.live,1);
 x.c.window.mw.liveBatch=async()=>{throw Error('Network')};await x.c.refreshLive();assert.equal(x.nodes()[0].open,true);
 x.c.S.hasKey=false;await x.c.refreshLive();assert.equal(x.nodes()[0].open,true);x.c.S.hasKey=true;x.c.rankCooldownAt=Date.now()+60000;await x.c.refreshLive();assert.equal(x.nodes()[0].open,true);assert.equal(x.calls.live,1);
});
test('actual roster refresh preserves unchanged reading state, including its error path',async()=>{
 const x=ui();x.nodes()[2].open=true;await x.c.refresh();assert.equal(x.nodes()[2].open,true);assert.equal(x.calls.roster,1);assert.equal(x.c.busy,false);
 x.c.window.mw.refreshOuat=async()=>{throw Error('LEA unavailable')};await x.c.refresh();assert.equal(x.nodes()[2].open,true);assert.equal(x.c.busy,false);
});
test('rank auth failure preserves reading while retaining the authentication stop',async()=>{
 const x=ui();x.nodes()[1].open=true;x.c.window.mw.rankBatch=async()=>({updates:[],blockedStatus:403});await x.c.refreshRanks();assert.equal(x.c.S.hasKey,false);assert.equal(x.nodes()[1].open,true);
});
test('explicit navigation and filter renders stay ordinary; no persisted preference or HTML restoration',()=>{
 const helper=app.slice(app.indexOf('function renderBackground(){'),app.indexOf('async function refreshRanks(){'));
 assert.doesNotMatch(helper,/localStorage|sessionStorage|\.innerHTML\s*=|\.textContent\s*=/);assert.match(app,/teamSelect"\)\.onchange=e=>\{selectedTeam=e.target.value;render\(\)/);assert.match(app,/duelPatch"\)\.onchange/);
});
