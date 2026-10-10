const test = require("node:test");
const assert = require("node:assert/strict");
const { accountKey, checkLiveAccount } = require("../src/services/live-status");

const account = { gameName: "Player", tagLine: "EUW", platform: "EUW1" };
const error = status => Object.assign(new Error(`HTTP ${status}`), { status });

test("a resolved account outside a game is confirmed offline", async () => {
  const cache = {};
  const riot = { resolveAccount: async () => ({ puuid: "p1" }), active: async () => { throw error(404); } };
  const result = await checkLiveAccount(riot, account, { accountCache: cache, now: 123 });
  assert.equal(result.live, false);
  assert.equal(result.checkedAt, 123);
  assert.equal(cache[accountKey(account)], "p1");
});

test("an unresolved Riot ID is not mislabeled as offline", async () => {
  const riot = { resolveAccount: async () => { throw error(404); }, active: async () => null };
  await assert.rejects(checkLiveAccount(riot, account), e => e.status === 404);
});

test("authentication, rate-limit and network failures are not mislabeled as offline", async () => {
  for (const failure of [error(401), error(429), new Error("Network failure")]) {
    const riot = { resolveAccount: async () => ({ puuid: "p1" }), active: async () => { throw failure; } };
    await assert.rejects(checkLiveAccount(riot, account), e => e === failure);
  }
});

test("an active game and cached PUUID are returned without resolving again", async () => {
  let resolutions = 0;
  const cache = { [accountKey(account)]: "cached" };
  const riot = { resolveAccount: async () => { resolutions++; return { puuid: "new" }; },
    active: async (_platform, puuid) => ({ gameId: puuid === "cached" ? 42 : 0 }) };
  const result = await checkLiveAccount(riot, account, { accountCache: cache, now: 456 });
  assert.equal(result.live, true);
  assert.equal(result.gameId, 42);
  assert.equal(resolutions, 0);
});
