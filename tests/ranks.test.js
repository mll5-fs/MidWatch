const test = require("node:test");
const assert = require("node:assert/strict");
const { loadBatch, hydrate, resetErrors, accountKey, playerRankState } = require("../src/services/ranks");
const player = (id, region = "OUAT") => ({ id, region, accounts: [{ gameName: id, tagLine: "EUW", platform: "EUW1" }] });
const solo = { queueType: "RANKED_SOLO_5x5", tier: "DIAMOND", rank: "II", leaguePoints: 0 };
function mock(entries = [solo]) {
  const calls = [];
  return { calls, resolveAccount: async a => ({ puuid: a.gameName }),
    ranked: async (_p, id) => { calls.push(id); return entries; } };
}

test("visible OUAT players are checked before background pros with a five-account budget", async () => {
  const riot = mock(), players = Array.from({ length: 8 }, (_, i) => player("pro"+i, "LCK")).concat(player("visible"));
  const result = await loadBatch(riot, players, { priorityIds: ["visible"], now: 1000 });
  assert.equal(riot.calls[0], "visible");
  assert.equal(result.checked, 5);
  assert.equal(result.remaining, 4);
  assert.equal(result.updates[0].rank.leaguePoints, 0);
});
test("fresh ranks survive restart and are not fetched again during the cache lifetime", async () => {
  const riot = mock(), p = player("cached");
  const first = await loadBatch(riot, [p], { now: 1000 });
  const second = await loadBatch(riot, [p], { cache: first.cache, now: 2000 });
  assert.equal(second.checked, 0);
  assert.equal(second.remaining, 0);
  assert.equal(hydrate([p], first.cache)[0].bestRank.tier, "DIAMOND");
  assert.equal(hydrate([p], first.cache)[0].rankStatus, "ranked");
});
test("only a successful empty SoloQ response marks a player unranked", async () => {
  const p = player("unranked"), riot = mock([]);
  const result = await loadBatch(riot, [p], { now: 1000 });
  assert.equal(result.updates[0].status, "unranked");
  assert.equal(result.updates[0].rank, null);
  riot.ranked = async () => { throw new Error("Network failure"); };
  const error = await loadBatch(riot, [p], { now: 1000 });
  assert.equal(error.updates[0].status, "error");
  assert.equal(error.updates[0].rank, undefined);
});
test("rate limits stop the batch and retain the last known rank", async () => {
  const p = player("limited"), key = accountKey(p.accounts[0]);
  const riot = mock();
  riot.ranked = async () => { throw Object.assign(new Error("Rate limited"), { status: 429 }); };
  const result = await loadBatch(riot, [p, player("other")], { now: 1000,
    cache: { [key]: { rank: solo, nextCheck: 0, checkedAt: 1 } }, priorityIds: [p.id] });
  assert.equal(result.checked, 1);
  assert.equal(result.remaining, 1);
  assert.equal(result.retryAt, 121000);
  assert.equal(result.updates[0].rank.tier, "DIAMOND");
});
test("rate limits honor Riot Retry-After instead of a fixed cooldown", async () => {
  const p = player("limited"), riot = mock();
  riot.ranked = async () => { throw Object.assign(new Error("Rate limited"), { status: 429, retryAfterMs: 17000 }); };
  const result = await loadBatch(riot, [p, player("other")], { now: 1000 });
  assert.equal(result.retryAt, 18000);
  assert.equal(result.blockedStatus, 429);
  assert.equal(result.cache[accountKey(p.accounts[0])].nextCheck, 18000);
  assert.equal(result.checked, 1);
});
test("a validated replacement key makes failed ranks immediately eligible again", () => {
  const ranked = { rank: solo, status: "error", error: "expired", nextCheck: 999999 };
  const unknown = { status: "error", error: "expired", nextCheck: 999999 };
  const healthy = { rank: solo, status: "ranked", nextCheck: 999999 };
  const cache = resetErrors({ ranked, unknown, healthy });
  assert.equal(cache.ranked.status, "ranked");
  assert.equal(cache.unknown.status, "pending");
  assert.equal(cache.ranked.nextCheck, 0);
  assert.equal(cache.unknown.nextCheck, 0);
  assert.equal(cache.healthy.nextCheck, 999999);
  assert.equal(cache.ranked.error, undefined);
});
test("a stale cached PUUID is resolved again and ranked in the same batch", async () => {
  const p = player("renamed"), key = accountKey(p.accounts[0]), riot = mock();
  riot.resolveAccount = async () => ({ puuid: "current" });
  riot.ranked = async (_platform, puuid) => {
    if (puuid === "old") throw Object.assign(new Error("Not found"), { status: 404 });
    return [solo];
  };
  const result = await loadBatch(riot, [p], { now: 1000, accountCache: { [key]: "old" } });
  assert.equal(result.accountCache[key], "current");
  assert.equal(result.cache[key].status, "ranked");
  assert.equal(result.updates[0].rank.tier, "DIAMOND");
});

test("a 404 after a fresh account resolution remains unavailable without a loop", async () => {
  const p = player("missing"), key = accountKey(p.accounts[0]), riot = mock();
  let resolveCalls = 0, rankCalls = 0;
  riot.resolveAccount = async () => { resolveCalls++; return { puuid: "missing" }; };
  riot.ranked = async () => { rankCalls++; throw Object.assign(new Error("Not found"), { status: 404 }); };
  const result = await loadBatch(riot, [p], { now: 1000 });
  assert.equal(result.accountCache[key], undefined);
  assert.equal(result.cache[key].status, "error");
  assert.equal(resolveCalls, 1);
  assert.equal(rankCalls, 1);
});
test("shared Riot accounts are fetched once and update all linked players", async () => {
  const p = player("same"), duplicate = { ...p, id: "duplicate" }, riot = mock();
  const result = await loadBatch(riot, [p, duplicate], { now: 1000 });
  assert.equal(result.checked, 1);
  assert.equal(riot.calls.length, 1);
  assert.deepEqual(result.updates.map(u => u.id), ["same", "duplicate"]);
});

test("checks every linked account and keeps the highest verified SoloQ rank", async () => {
  const p = { ...player("multi"), accounts: [
    { gameName: "inactive", tagLine: "EUW", platform: "EUW1" },
    { gameName: "active", tagLine: "EUW", platform: "EUW1" }
  ] };
  const riot = mock();
  riot.ranked = async (_platform, puuid) => puuid === "inactive" ? [] : [solo];
  const result = await loadBatch(riot, [p], { now: 1000 });
  assert.equal(result.checked, 2);
  assert.deepEqual(result.updates, [{ id: "multi", rank: { tier: "DIAMOND", rank: "II", leaguePoints: 0 },
    status: "ranked", checkedAt: 1000, error: undefined }]);
  assert.equal(hydrate([p], result.cache)[0].bestRank.tier, "DIAMOND");
});

test("does not call a multi-account player unranked while another account is pending", () => {
  const p = { ...player("multi"), accounts: [
    { gameName: "first", tagLine: "EUW", platform: "EUW1" },
    { gameName: "second", tagLine: "EUW", platform: "EUW1" }
  ] };
  const cache = { [accountKey(p.accounts[0])]: { rank: null, status: "unranked", checkedAt: 1000 } };
  assert.deepEqual(playerRankState(p, cache), { status: "pending", checkedAt: 1000 });
  assert.equal(hydrate([p], cache)[0].rankStatus, "pending");
});

test("shows a known multi-account rank as partial until every account is checked", () => {
  const p = { ...player("multi"), accounts: [
    { gameName: "known", tagLine: "EUW", platform: "EUW1" },
    { gameName: "pending", tagLine: "EUW", platform: "EUW1" }
  ] };
  const cache = { [accountKey(p.accounts[0])]: { rank: solo, status: "ranked", checkedAt: 1000 } };
  assert.deepEqual(playerRankState(p, cache), { rank: solo, status: "partial", checkedAt: 1000, error: undefined });
  const hydrated = hydrate([p], cache)[0];
  assert.equal(hydrated.bestRank.tier, "DIAMOND");
  assert.equal(hydrated.rankStatus, "partial");
});

test("keeps a verified rank visible but partial when another linked account failed", () => {
  const p = { ...player("multi"), accounts: [
    { gameName: "known", tagLine: "EUW", platform: "EUW1" },
    { gameName: "failed", tagLine: "EUW", platform: "EUW1" }
  ] };
  const cache = {
    [accountKey(p.accounts[0])]: { rank: solo, status: "ranked", checkedAt: 1000 },
    [accountKey(p.accounts[1])]: { status: "error", checkedAt: 2000, error: "Riot indisponible" }
  };
  assert.deepEqual(playerRankState(p, cache), { rank: solo, status: "partial", checkedAt: 2000,
    error: "Riot indisponible" });
});

test("selects the strongest rank across cached accounts regardless of account order", () => {
  const p = { ...player("multi"), accounts: [
    { gameName: "diamond", tagLine: "EUW", platform: "EUW1" },
    { gameName: "master", tagLine: "EUW", platform: "EUW1" }
  ] };
  const cache = {
    [accountKey(p.accounts[0])]: { rank: solo, status: "ranked", checkedAt: 1000 },
    [accountKey(p.accounts[1])]: { rank: { ...solo, tier: "MASTER", rank: "I", leaguePoints: 25 }, status: "ranked", checkedAt: 2000 }
  };
  const state = playerRankState(p, cache);
  assert.equal(state.rank.tier, "MASTER");
  assert.equal(state.checkedAt, 2000);
});


test("best linked account respects divisions before LP and keeps the selected account status", () => {
  const p = { id: "multi", accounts: [
    { gameName: "low", tagLine: "EUW" }, { gameName: "high", tagLine: "EUW" }
  ] };
  const cache = {
    [accountKey(p.accounts[0])]: { rank: { tier: "GOLD", rank: "IV", leaguePoints: 90 }, status: "ranked" },
    [accountKey(p.accounts[1])]: { rank: { tier: "GOLD", rank: "I", leaguePoints: 10 }, status: "error", error: "Network failure" }
  };
  const state = playerRankState(p, cache);
  assert.equal(state.rank.rank, "I");
  assert.equal(state.status, "error");
  assert.equal(hydrate([p], cache)[0].bestRank.rank, "I");
  cache[accountKey(p.accounts[1])].status = "ranked";
  assert.equal(playerRankState(p, cache).status, "ranked");
});

test("account selection and displayed sort use the same official rank order", () => {
  const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
  const app = fs.readFileSync(path.join(__dirname, "../src/renderer/app.js"), "utf8");
  const context = vm.createContext({});
  vm.runInContext(app.slice(app.indexOf("function rankScore("), app.indexOf("function applyLive(")), context);
  const samples = [ {}, { tier: "UNKNOWN", leaguePoints: 300 },
    ...["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND"].flatMap(tier =>
      ["IV", "III", "II", "I"].flatMap(rank => [0, 99].map(leaguePoints => ({ tier, rank, leaguePoints })))),
    ...["MASTER", "GRANDMASTER", "CHALLENGER"].flatMap(tier => [0, 2000].map(leaguePoints => ({ tier, rank: "I", leaguePoints }))) ];
  const p = { id: "pair", accounts: [{ gameName: "a", tagLine: "EUW" }, { gameName: "b", tagLine: "EUW" }] };
  for (let i = 1; i < samples.length; i++) {
    const ranks = [samples[i - 1], samples[i]];
    const cache = Object.fromEntries(p.accounts.map((account, index) => [accountKey(account), { rank: ranks[index], status: "ranked" }]));
    const expected = [...ranks].filter(rank => rank.tier).sort((a, b) => context.rankScore({ bestRank: b }) - context.rankScore({ bestRank: a }))[0];
    assert.deepEqual(playerRankState(p, cache).rank, expected);
  }
});
