const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const app = fs.readFileSync(path.join(__dirname, "../src/renderer/app.js"), "utf8");

test("rank labels distinguish pending, missing credentials, error and confirmed unranked", () => {
  const source = app.slice(app.indexOf("function rankPlaceholder("), app.indexOf("function tracked("));
  const context = vm.createContext({ S: { hasKey: true }, scoutingAccount: p => p.accounts?.[0] });
  vm.runInContext(source, context);
  const linked = { accounts: [{ gameName: "Test", tagLine: "EUW" }] };
  assert.equal(context.rankPlaceholder(linked), "RANG À CHARGER");
  assert.equal(context.rankPlaceholder({ ...linked, rankStatus: "unranked" }), "NON CLASSÉ SOLOQ");
  assert.equal(context.rankPlaceholder({ ...linked, rankStatus: "error" }), "RANG INDISPONIBLE");
  context.S.hasKey = false;
  assert.equal(context.rankPlaceholder(linked), "CLÉ RIOT REQUISE");
  assert.equal(context.rankPlaceholder({ accounts: [] }), "COMPTE NON RELIÉ");
});

test("marks a known rank as partial while another linked account remains unresolved", () => {
  const source = app.slice(app.indexOf("function rankClass("), app.indexOf("function rankScore("));
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const player = { bestRank: { tier: "DIAMOND", rank: "II", leaguePoints: 50 }, rankStatus: "partial" };
  assert.equal(context.playerRankLabel(player), "DIAMOND II · 50 LP · PARTIEL");
  assert.match(app, /rank=playerRankLabel\(p\)/);
});

test("keeps a cached rank visible but marks it for verification after a refresh error", () => {
  const source = app.slice(app.indexOf("function rankClass("), app.indexOf("function rankScore("));
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const player = { bestRank: { tier: "MASTER", rank: "I", leaguePoints: 120 }, rankStatus: "error" };
  assert.equal(context.playerRankLabel(player), "MASTER · 120 LP · À REVÉRIFIER");
  assert.equal(context.playerRankLabel({ ...player, bestRank: {} }), "");
});

test("rank refresh prioritizes the current view and reacts to Riot cooldowns", () => {
  assert.match(app, /listForView\(\)\.slice\(0,20\)/);
  assert.match(app, /rankCooldownAt=Number\(r\.retryAt\)\|\|0/);
  assert.match(app, /\[401,403\]\.includes\(r\.blockedStatus\)/);
  assert.match(app, /Rechargement des rangs lancé/);
});

test("rank loading quickly drains remaining batches without bypassing Riot cooldowns", () => {
  assert.match(app, /rankFollowup=setTimeout\(refreshRanks,r\.deferred\?2000:4000\)/);
  assert.match(app, /!r\.retryAt&&\(r\.deferred\|\|r\.remaining>0\)/);
  assert.match(app, /clearTimeout\(rankFollowup\)/);
});

test("live status distinguishes confirmed offline from unavailable and clears stale live state", () => {
  const source = app.slice(app.indexOf("function tracked("), app.indexOf("function dpmUrl("));
  const context = vm.createContext({});
  vm.runInContext(source, context);
  assert.equal(context.stateOf({ live: true, accounts: [{}] }), "live");
  assert.equal(context.stateOf({ live: false, accounts: [{}] }), "offline");
  assert.equal(context.stateOf({ live: null, accounts: [{}] }), "unknown");
  assert.match(app, /hasOwnProperty\.call\(u,"live"\)/);
  assert.doesNotMatch(app, /if\(u\.live===true\|\|u\.live===false\)liveState/);
});

test("automatic live detection covers every linked account and identifies the active one", () => {
  const main = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");
  assert.match(main, /p\.accounts\?\.some\(a=>a\?\.gameName&&a\?\.tagLine\)/);
  assert.match(main, /checkLiveAccounts\(riot,p\.accounts/);
  assert.match(main, /liveAccount:status\.account/);
  assert.match(app, /liveMeta\[u\.id\]=\{liveAccount:u\.liveAccount\|\|null\}/);
  assert.match(app, /sameRiotAccount\(a,p\.liveAccount\)/);
});

test("manual account check never converts a Riot rank failure to unranked", () => {
  const main = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");
  const handler = main.slice(main.indexOf('ipcMain.handle("riot:check"'), main.indexOf('ipcMain.handle("spectate:launch"'));
  assert.match(handler, /ranked=await riot\.ranked/);
  assert.doesNotMatch(handler, /try\{ranked=await riot\.ranked/);
});

test("scouting reports expose collection coverage and weak lane samples", () => {
  assert.match(app, /function coverageReport\(c=\{\}\)/);
  assert.match(app, /ÉCHANTILLON PARTIEL/);
  assert.match(app, /historique chargé/);
  assert.match(app, /timelines/);
  assert.match(app, /l\.games<3\?" · échantillon faible"/);
  assert.match(app, /coverageReport\(s\?\.coverage\)/);
});

test("renders lane-at-ten median and gold-ahead frequency with a strict definition", () => {
  assert.match(app, /MÉDIANE Δ OR/);
  assert.match(app, /DEVANT EN OR/);
  assert.match(app, /strictement plus d’or que le mid adverse à 10:00/);
  assert.match(app, /l\.medianGoldDiff/);
  assert.match(app, /l\.goldAheadRate/);
  assert.match(app, /confidenceLabel\(l\.goldAheadInterval\)/);
  assert.match(app, /confidenceLabel\(l\.deathInterval\)/);
  assert.match(app, /IC95 de Wilson montrent l’incertitude des fréquences/);
});

test("renders a separate lane-at-five sample without causal gameplay claims", () => {
  assert.match(app, /LANE À 5 MINUTES/);
  assert.match(app, /CS@5/);
  assert.match(app, /Lane@5 indisponible/);
  assert.match(app, /MORT AVANT 5\$\{confidenceLabel\(l\.deathInterval\)\}/);
  assert.match(app, /les IC95 de Wilson montrent l’incertitude des fréquences/);
  assert.match(app, /Ces valeurs sont descriptives et n’expliquent pas la cause de l’écart/);
});

test("renders paired five-to-ten lane progression with its own sample limit", () => {
  assert.match(app, /ÉVOLUTION DE LANE 5 → 10/);
  assert.match(app, /partie\$\{t\.games>1\?"s":""\} appariée/);
  assert.match(app, /ÉCART D’OR AMÉLIORÉ/);
  assert.match(app, /ne prouve ni la cause ni la qualité du micro-gameplay/);
  assert.match(app, /laneTransitionReport\(e\.laneTransition\)/);
});

test("renders early timeline habits with their own sample and non-causal limit", () => {
  assert.match(app, /function earlyReport\(e=\{\}\)/);
  assert.match(app, /HABITUDES 0 → 5 \/ 5 → 10/);
  assert.match(app, /0→5 · PARTIES AVEC TAKEDOWN/);
  assert.match(app, /5→10 · PARTIES AVEC MORT/);
  assert.match(app, /1ER WARD/);
  assert.match(app, /sans double comptage/);
  assert.match(app, /confidenceLabel\(before\.takedownInterval\)/);
  assert.match(app, /confidenceLabel\(before\.deathInterval\)/);
  assert.match(app, /confidenceLabel\(after\.takedownInterval\)/);
  assert.match(app, /confidenceLabel\(after\.deathInterval\)/);
  assert.match(app, /IC95 de Wilson montrent l’incertitude de chaque fréquence/);
  assert.match(app, /ni la position, ni la cause, ni la qualité du micro-gameplay/);
  assert.match(app, /earlyReport\(s\.early\)/);
});

test("renders lane-at-ten comparisons per played champion with sample limits", () => {
  assert.match(app, /function championLaneReport\(rows=\[\]\)/);
  assert.match(app, /championLaneReport\(stats\.championLanes\)/);
  assert.match(app, /LANE À 10 PAR CHAMPION JOUÉ/);
  assert.match(app, /Chaque champion a son propre échantillon/);
  assert.match(app, /n’expliquent ni la cause ni la qualité du micro-gameplay/);
});

test("renders paired five-to-ten progression per played champion", () => {
  assert.match(app, /function championTransitionReport\(rows=\[\]\)/);
  assert.match(app, /championTransitionReport\(stats\.championTransitions\)/);
  assert.match(app, /PROGRESSION 5 → 10 PAR CHAMPION/);
  assert.match(app, /OR AMÉLIORÉ/);
  assert.match(app, /snapshots complets appariés à 5:00 et 10:00/);
  assert.match(app, /ne prouve ni un effet du champion ni la qualité du micro-gameplay/);
});

test("renders lane-at-ten comparisons per opposing champion with sample limits", () => {
  assert.match(app, /function opponentLaneReport\(rows=\[\]\)/);
  assert.match(app, /opponentLaneReport\(stats\.opponentLanes\)/);
  assert.match(app, /LANE À 10 PAR CHAMPION ADVERSE/);
  assert.match(app, /Chaque champion adverse a son propre échantillon/);
  assert.match(app, /ne prouvent ni la cause du matchup ni la qualité du micro-gameplay/);
});

test("renders paired five-to-ten progression per opposing champion", () => {
  assert.match(app, /function opponentTransitionReport\(rows=\[\]\)/);
  assert.match(app, /opponentTransitionReport\(stats\.opponentTransitions\)/);
  assert.match(app, /PROGRESSION 5 → 10 PAR CHAMPION ADVERSE/);
  assert.match(app, /Chaque champion adverse utilise uniquement les parties/);
  assert.match(app, /ne prouvent ni la cause du matchup ni la qualité du micro-gameplay/);
});

test("scouting panel explains unavailable data and only loads with credentials", () => {
  const source = app.slice(app.indexOf("function scoutingPanel("), app.indexOf("function drawPlayer("));
  const context = vm.createContext({ S: { hasKey: false }, scoutingAccount: p => p.accounts?.[0], esc: value => String(value) });
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
  assert.match(app, /if\(scoutingAccount\(p\)&&S\.hasKey\)[\s\S]*?const stats=await window\.mw\.stats\(scoutingAccount\(p\)\)/);
  assert.doesNotMatch(app, /if\(p\.region==="OUAT"&&p\.accounts\?\.\[0\]&&S\.hasKey\)/);
  assert.match(app, /\$\{scoutingPanel\(p\)\}/);
});

test("scouting uses the account associated with the best verified rank", () => {
  const source = app.slice(app.indexOf("function sameRiotAccount("), app.indexOf("function applyLive("));
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const first = { gameName: "First", tagLine: "EUW", platform: "EUW1" };
  const best = { gameName: "Best", tagLine: "MID", platform: "EUW1" };
  const player = { accounts: [first, best], bestRankAccount: { gameName: "best", tagLine: "mid" } };
  assert.equal(context.scoutingAccount(player).gameName, "Best");
  assert.equal(context.scoutingAccount({ ...player, bestRankAccount: { gameName: "missing", tagLine: "EUW" } }).gameName, "First");
  assert.match(app, /window\.mw\.patchStats\(scoutingAccount\(player\)\)/);
  assert.match(app, /function dpmUrl\(p\)\{const a=scoutingAccount\(p\)/);
  assert.match(app, /const a=scoutingAccount\(p\),state=stateOf\(p\)/);
});

test("ignores stale profile and statistics responses after drawer navigation", () => {
  assert.match(app, /const request=\+\+drawerRequest/);
  assert.match(app, /function closeDrawer\(\)\{drawerRequest\+\+/);
  assert.ok((app.match(/if\(request!==drawerRequest\)return/g) || []).length >= 3);
});

test("renders patch samples and their statistical limits", () => {
  assert.match(app, /function patchReport\(patches=\[\]\)/);
  assert.match(app, /patchReport\(stats\.patches\)/);
  assert.match(app, /K\/D\/A MOYEN/);
  assert.match(app, /p\.avgKills/);
  assert.match(app, /p\.avgDeaths/);
  assert.match(app, /p\.avgAssists/);
  assert.match(app, /CHAMPIONS ·/);
  assert.match(app, /VS PATCH OBSERVÉ/);
  assert.match(app, /Δ WR/);
  assert.match(app, /c\.currentGames/);
  assert.match(app, /n’est pas forcément la version Riot immédiatement précédente/);
  assert.match(app, /ÉCHANTILLON FAIBLE/);
  assert.match(app, /les écarts restent descriptifs et ne prouvent pas un effet du patch/);
});

test("coverage target label reflects the actual collection target", () => {
  assert.match(app, /objectif de \$\{esc\(c\.target\)\} parties mid atteint/);
  assert.doesNotMatch(app, /objectif de 12 parties mid atteint/);
});

test("renders opposing mid champion samples without causal claims", () => {
  assert.match(app, /function matchupReport\(matchups=\[\]\)/);
  assert.match(app, /matchupReport\(stats\.matchups\)/);
  assert.match(app, /MATCHUPS MID RÉCENTS/);
  assert.match(app, /Ils ne mesurent ni la qualité du micro-gameplay ni la cause du résultat/);
});

test("shows Wilson uncertainty and only promotes win-rate signals supported by it", () => {
  assert.match(app, /function confidenceLabel\(interval\)/);
  assert.match(app, /IC95/);
  assert.match(app, /s\.interval\?\.low>=50/);
  assert.match(app, /s\.interval\?\.high<50/);
  assert.match(app, /incertitude d’échantillonnage, pas une prédiction/);
  assert.match(app, /confidenceLabel\(p\.interval\)/);
  assert.match(app, /confidenceLabel\(m\.interval\)/);
  assert.match(app, /confidenceLabel\(x\.interval\)/);
});

test("shows the real match period, timestamp coverage and stale-data warning", () => {
  assert.match(app, /function sampleWindowReport\(w=\{\}\)/);
  assert.match(app, /sampleWindowReport\(s\.window\)/);
  assert.match(app, /PÉRIODE ANALYSÉE/);
  assert.match(app, /DONNÉES ANCIENNES/);
  assert.match(app, /parties datées/);
  assert.match(app, /datation partielle/);
  assert.match(app, /dernière partie il y a/);
});


test("rank sorting respects tier, division then LP including zero LP", () => {
  const source = app.slice(app.indexOf("function rankScore("), app.indexOf("function applyLive("));
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const score = rank => context.rankScore({ bestRank: rank });
  const ascending = [
    { tier: "GOLD", rank: "IV", leaguePoints: 90 },
    { tier: "GOLD", rank: "III", leaguePoints: 0, lp: 95 },
    { tier: "GOLD", rank: "II", leaguePoints: 99 },
    { tier: "GOLD", rank: "I", leaguePoints: 10 },
    { tier: "GOLD", rank: "I", leaguePoints: 90 },
    { tier: "PLATINUM", rank: "IV", leaguePoints: 0 },
    { tier: "DIAMOND", rank: "I", leaguePoints: 99 },
    { tier: "MASTER", rank: "I", leaguePoints: 0 },
    { tier: "MASTER", leaguePoints: 2000 },
    { tier: "GRANDMASTER", leaguePoints: 0 },
    { tier: "CHALLENGER", leaguePoints: 0 }
  ];
  for (let i = 1; i < ascending.length; i++) assert.ok(score(ascending[i]) > score(ascending[i - 1]));
  assert.equal(score({}), 0);
  assert.equal(score({ tier: "UNKNOWN", leaguePoints: 100 }), 0);
  assert.equal(score(ascending[1]), score({ tier: "GOLD", rank: "III", leaguePoints: 0 }));
  assert.equal(score({ tier: "MASTER", rank: "IV", leaguePoints: 20 }), score({ tier: "MASTER", rank: "I", leaguePoints: 20 }));
});

test("division I remains visible below the apex tiers", () => {
  const source = app.slice(app.indexOf("function rankClass("), app.indexOf("function rankScore("));
  const context = vm.createContext({});
  vm.runInContext(source, context);
  assert.equal(context.rankLabel({ tier: "GOLD", rank: "I", leaguePoints: 10 }), "GOLD I · 10 LP");
  assert.equal(context.rankLabel({ tier: "DIAMOND", rank: "I", leaguePoints: 0 }), "DIAMOND I · 0 LP");
  for (const tier of ["MASTER", "GRANDMASTER", "CHALLENGER"]) {
    assert.equal(context.rankLabel({ tier, rank: "I", leaguePoints: 120 }), `${tier} · 120 LP`);
  }
});
