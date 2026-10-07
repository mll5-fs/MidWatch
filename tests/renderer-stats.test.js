const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const app = fs.readFileSync(path.join(__dirname, "../src/renderer/app.js"), "utf8");

test("scouting panel explains unavailable data and only loads with credentials", () => {
  const source = app.slice(app.indexOf("function scoutingPanel("), app.indexOf("function drawPlayer("));
  const context = vm.createContext({ S: { hasKey: false }, esc: value => String(value) });
  vm.runInContext(source, context);
  const linked = { accounts: [{ gameName: "Test", tagLine: "EUW" }] };
  const missingKey = context.scoutingPanel(linked);
  assert.match(missingKey, /Configure une clé Riot valide/);
  assert.match(missingKey, /Configurer Riot/);
  assert.doesNotMatch(missingKey, /Analyse des matchs/);
  assert.match(context.scoutingPanel({ accounts: [] }), /Aucun compte Riot public relié/);
  context.S.hasKey = true;
  assert.match(context.scoutingPanel(linked), /Analyse des matchs Riot récents/);
  assert.doesNotMatch(context.scoutingPanel(linked), /Configurer Riot/);
});

test("loads Riot scouting statistics for every linked player, not only OUAT", () => {
  assert.match(app, /if\(p\.accounts\?\.\[0\]&&S\.hasKey\)[\s\S]*?const stats=await window\.mw\.stats/);
  assert.doesNotMatch(app, /if\(p\.region==="OUAT"&&p\.accounts\?\.\[0\]&&S\.hasKey\)/);
  assert.match(app, /\$\{scoutingPanel\(p\)\}/);
});

test("ignores stale profile and statistics responses after drawer navigation", () => {
  assert.match(app, /const request=\+\+drawerRequest/);
  assert.match(app, /function closeDrawer\(\)\{drawerRequest\+\+/);
  assert.ok((app.match(/if\(request!==drawerRequest\)return/g) || []).length >= 3);
});

test("renders patch samples and their statistical limits", () => {
  assert.match(app, /function patchReport\(patches=\[\]\)/);
  assert.match(app, /patchReport\(stats\.patches\)/);
  assert.match(app, /ÉCHANTILLON FAIBLE/);
  assert.match(app, /Les écarts sont descriptifs et ne prouvent pas un effet du patch/);
});

test("renders opposing mid champion samples without causal claims", () => {
  assert.match(app, /function matchupReport\(matchups=\[\]\)/);
  assert.match(app, /matchupReport\(stats\.matchups\)/);
  assert.match(app, /MATCHUPS MID RÉCENTS/);
  assert.match(app, /Ils ne mesurent ni la qualité du micro-gameplay ni la cause du résultat/);
});
