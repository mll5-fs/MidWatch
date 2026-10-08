const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync('src/renderer/app.js','utf8');
const main = fs.readFileSync('src/main.js','utf8');
test('cached professional players cannot enter OUAT views or background batches',()=>{
 const source=app.slice(app.indexOf('function applyLive('),app.indexOf('function rankPlaceholder('));
 const context=vm.createContext({S:{players:[{id:'pro'}],ouatPlayers:[{id:'ouat'}]},rankMeta:{},rankState:{},liveState:{}});
 vm.runInContext(source,context);
 assert.deepEqual(Array.from(context.allPlayers(),p=>p.id),['ouat']);
 assert.doesNotMatch(main,/currentPros|pros:refresh|services\/pros|data\/players/);
 assert.doesNotMatch(app,/refreshPros|window\.mw\.profile|PRO CIRCUIT/);
});
test('patch section loads selected OUAT account and renders measured patch groups',async()=>{
 const nodes={};const $=id=>nodes[id]??={hidden:false,value:'',innerHTML:'',textContent:''};
 const p={id:'ouat',name:'Mid',team:'Team',accounts:[{gameName:'Riot',tagLine:'EUW'}]};let calls=0;
 const context=vm.createContext({$,S:{hasKey:true},allPlayers:()=>[p],queryMatch:()=>true,esc:String,
 window:{mw:{stats:async account=>{calls++;assert.equal(account.gameName,'Riot');return {patches:[{patch:'26.20',games:3}]};},open:()=>{}}},
 coverageReport:()=>'',sampleWindowReport:()=>'',patchReport:rows=>'PATCH '+rows[0].patch,render:()=>context.renderPatchSection()});
 vm.runInContext('let patchRequest=0,patchPlayerId="",patchStats=null,patchError="",patchLoading=false,view="PATCHES";'+app.slice(app.indexOf('function renderPatchSection('),app.indexOf('\nfunction render(){')),context);
 context.renderPatchSection();
 await nodes['#analyzePatch'].onclick();
 assert.equal(calls,1);assert.match(nodes['#grid'].innerHTML,/PATCH 26\.20/);
 assert.equal(nodes['#sort'].hidden,true);
});

function patchHarness(){
 const nodes={};const $=id=>nodes[id]??={hidden:false,value:'',innerHTML:'',textContent:''};
 const players=['first','second'].map(id=>({id,name:id,team:'OUAT',accounts:[{gameName:id,tagLine:'EUW'}]}));
 const pending=[];
 const context=vm.createContext({$,S:{hasKey:true},allPlayers:()=>players,
 queryMatch:(p,q)=>p.name.includes(q),esc:String,
 window:{mw:{stats:account=>new Promise((resolve,reject)=>pending.push({account,resolve,reject})),open:()=>{}}},
 coverageReport:()=>'',sampleWindowReport:()=>'',patchReport:rows=>'PATCH '+rows[0].patch,
 render:()=>context.renderPatchSection()});
 vm.runInContext('let patchRequest=0,patchPlayerId="",patchStats=null,patchError="",patchLoading=false,view="PATCHES";'+app.slice(app.indexOf('function renderPatchSection('),app.indexOf('\nfunction render(){')),context);
 context.renderPatchSection();
 return {nodes,pending,context,state:expression=>vm.runInContext(expression,context),filter:q=>{nodes['#qTop'].value=q;context.renderPatchSection();}};
}
for(const failure of [false,true])test(`filtering invalidates pending patch ${failure?'error':'results'} for previous player`,async()=>{
 const h=patchHarness();const old=h.nodes['#analyzePatch'].onclick();
 h.filter('second');
 assert.equal(h.state('patchPlayerId'),'second');assert.equal(h.state('patchLoading'),false);
 const current=h.nodes['#analyzePatch'].onclick();
 h.pending[1].resolve({patches:[{patch:'current'}]});await current;
 if(failure)h.pending[0].reject(new Error('obsolete error'));else h.pending[0].resolve({patches:[{patch:'obsolete'}]});
 await old;
 assert.match(h.nodes['#grid'].innerHTML,/PATCH current/);
 assert.doesNotMatch(h.nodes['#grid'].innerHTML,/obsolete/);
 assert.equal(h.state('patchLoading'),false);
});
test('empty search cancels pending analysis and offers a fresh selection on clearing',async()=>{
 const h=patchHarness();const old=h.nodes['#analyzePatch'].onclick();h.filter('no match');
 assert.match(h.nodes['#grid'].innerHTML,/Aucun joueur OUAT/);
 assert.equal(h.state('patchPlayerId'),'');assert.equal(h.state('patchLoading'),false);
 h.pending[0].resolve({patches:[{patch:'obsolete'}]});await old;
 h.filter('');assert.equal(h.state('patchPlayerId'),'first');assert.equal(h.state('patchStats'),null);
 assert.doesNotMatch(h.nodes['#grid'].innerHTML,/obsolete/);
});
test('ordinary rerender retains pending analysis and duplicate launch makes no extra request',async()=>{
 const h=patchHarness();const result=h.nodes['#analyzePatch'].onclick();
 h.context.renderPatchSection();await h.nodes['#analyzePatch'].onclick();
 assert.equal(h.pending.length,1);assert.equal(h.state('patchLoading'),true);
 h.pending[0].resolve({patches:[{patch:'retained'}]});await result;
 assert.match(h.nodes['#grid'].innerHTML,/PATCH retained/);
});
