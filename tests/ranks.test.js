const test = require("node:test");
const assert = require("node:assert/strict");
const { loadBatch, hydrate, resetErrors, accountKey } = require("../src/services/ranks");
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
  assert.equal(result.updates[0].rank.leaguePoints, 0);
});
test("fresh ranks survive restart and are not fetched again during the cache lifetime", async () => {
  const riot = mock(), p = player("cached");
  const first = await loadBatch(riot, [p], { now: 1000 });
  const second = await loadBatch(riot, [p], { cache: first.cache, now: 2000 });
  assert.equal(second.checked, 0);
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
test("invalid account IDs are retried later without keeping a stale PUUID", async () => {
  const p = player("renamed"), key = accountKey(p.accounts[0]), riot = mock();
  riot.ranked = async () => { throw Object.assign(new Error("Not found"), { status: 404 }); };
  const result = await loadBatch(riot, [p], { now: 1000, accountCache: { [key]: "old" } });
  assert.equal(result.accountCache[key], undefined);
  assert.equal(result.cache[key].status, "error");
});
test("shared Riot accounts are fetched once and update all linked players", async () => {
  const p = player("same"), duplicate = { ...p, id: "duplicate" }, riot = mock();
  const result = await loadBatch(riot, [p, duplicate], { now: 1000 });
  assert.equal(result.checked, 1);
  assert.equal(riot.calls.length, 1);
  assert.deepEqual(result.updates.map(u => u.id), ["same", "duplicate"]);
});
