const test = require("node:test");
const assert = require("node:assert/strict");
const { laneAt10, participantForScouting } = require("../src/services/scouting");

function sample({ mine = {}, theirs = {}, events = [], position = "MIDDLE" } = {}) {
  return { match: { info: { queueId: 420, participants: [
    { puuid: "player", participantId: 1, teamId: 100, teamPosition: position },
    { puuid: "enemy", participantId: 6, teamId: 200, teamPosition: "MIDDLE" }
  ] } }, timeline: { info: { frames: [
    { timestamp: 540000, participantFrames: {} },
    { timestamp: 600000, participantFrames: {
      1: { minionsKilled: 70, jungleMinionsKilled: 2, totalGold: 4100, xp: 4800, ...mine },
      6: { minionsKilled: 65, jungleMinionsKilled: 0, totalGold: 3900, xp: 4600, ...theirs }
    }, events },
    { timestamp: 660000, participantFrames: {} }
  ] } } };
}

test("calculates lane values and matchup deltas at 10 minutes", () => {
  assert.deepEqual(laneAt10([sample()], "player"), {
    games: 1, cs: 72, gold: 4100, xp: 4800, csDiff: 7, goldDiff: 200, xpDiff: 200, deathRate: 0
  });
});

test("reports the share of games with a death before or at 10 minutes", () => {
  const death = { type: "CHAMPION_KILL", victimId: 1, timestamp: 599999 };
  const late = { type: "CHAMPION_KILL", victimId: 1, timestamp: 600001 };
  assert.equal(laneAt10([sample({ events: [death] }), sample({ events: [late] })], "player").deathRate, 50);
});

test("excludes games that cannot be compared to an identified mid opponent", () => {
  assert.deepEqual(laneAt10([sample({ position: "TOP" })], "player"), { games: 0 });
});

test("selects only ranked SoloQ games where the player was assigned mid", () => {
  const rankedMid = sample().match;
  assert.equal(participantForScouting(rankedMid, "player").participantId, 1);
  assert.equal(participantForScouting(sample({ position: "TOP" }).match, "player"), null);
  assert.equal(participantForScouting({ info: { ...rankedMid.info, queueId: 450 } }, "player"), null);
});
