const test = require("node:test");
const assert = require("node:assert/strict");
const { laneAt10, championLaneBreakdown, earlyHabits, participantForScouting, patchBreakdown, matchupBreakdown } = require("../src/services/scouting");

function sample({ mine = {}, theirs = {}, events = [], position = "MIDDLE", champion = "Ahri" } = {}) {
  return { match: { info: { queueId: 420, participants: [
    { puuid: "player", participantId: 1, teamId: 100, teamPosition: position, championName: champion },
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

test("does not substitute short games or missing ten-minute snapshots", () => {
  for (const timestamp of [300000, 540000, 660000, undefined, "600000", NaN]) {
    const s = sample();
    s.timeline.info.frames = [{ ...s.timeline.info.frames[1], timestamp }];
    assert.deepEqual(laneAt10([s], "player"), { games: 0 });
  }
});

test("accepts small timestamp drift but excludes snapshots outside one second", () => {
  for (const [timestamp, games] of [[599000, 1], [600750, 1], [601000, 1], [601001, 0]]) {
    const s = sample();
    s.timeline.info.frames[1].timestamp = timestamp;
    assert.equal(laneAt10([s], "player").games, games);
  }
});

test("excludes incomplete or invalid measurements without diluting valid samples", () => {
  for (const side of ["mine", "theirs"]) {
    for (const key of ["minionsKilled", "jungleMinionsKilled", "totalGold", "xp"]) {
      for (const value of [undefined, null, "0", NaN, Infinity, -1]) {
        const invalid = sample({ [side]: { [key]: value } });
        assert.deepEqual(laneAt10([invalid, sample()], "player"), laneAt10([sample()], "player"));
      }
    }
  }
  assert.equal(laneAt10([sample({ mine: { minionsKilled: 0, jungleMinionsKilled: 0, totalGold: 0, xp: 0 } })], "player").games, 1);
});

test("ignores death events with invalid or missing timestamps", () => {
  const events = [undefined, null, -1, "500000", NaN].map(timestamp =>
    ({ type: "CHAMPION_KILL", victimId: 1, timestamp }));
  assert.equal(laneAt10([sample({ events })], "player").deathRate, 0);
});

test("compares lane-at-ten deltas by champion with explicit sample limits", () => {
  const death = { type: "CHAMPION_KILL", victimId: 1, timestamp: 400000 };
  const weakAhri = sample({ mine: { minionsKilled: 60, jungleMinionsKilled: 2, totalGold: 3700, xp: 4400 }, events: [death] });
  assert.deepEqual(championLaneBreakdown([sample(), weakAhri, sample(), sample({ champion: "Syndra" })], "player"), [
    { champion: "Ahri", games: 3, csDiff: 4, goldDiff: 67, xpDiff: 67, deathRate: 33, limited: false },
    { champion: "Syndra", games: 1, csDiff: 7, goldDiff: 200, xpDiff: 200, deathRate: 0, limited: true }
  ]);
});

test("champion lane comparison excludes malformed frames, off-role games and missing champions", () => {
  const malformed = sample({ mine: { xp: undefined } });
  assert.deepEqual(championLaneBreakdown([
    sample({ champion: "" }), sample({ position: "TOP" }), malformed, sample({ champion: "Orianna" })
  ], "player"), [
    { champion: "Orianna", games: 1, csDiff: 7, goldDiff: 200, xpDiff: 200, deathRate: 0, limited: true }
  ]);
});

test("summarizes measurable takedown, death and first-ward habits before ten minutes", () => {
  const first = sample({ events: [
    { type: "CHAMPION_KILL", killerId: 1, assistingParticipantIds: [1], victimId: 6, timestamp: 100000 },
    { type: "CHAMPION_KILL", killerId: 2, assistingParticipantIds: [1], victimId: 6, timestamp: 200000 },
    { type: "WARD_PLACED", creatorId: 1, timestamp: 60000 }
  ] });
  const second = sample({ events: [
    { type: "CHAMPION_KILL", killerId: 6, victimId: 1, timestamp: 300000 },
    { type: "WARD_PLACED", creatorId: 1, timestamp: 180000 }
  ] });
  assert.deepEqual(earlyHabits([first, second], "player"), {
    games: 2, earlyTakedowns: 1, takedownRate: 50, deathRate: 50,
    wardGames: 2, firstWardSeconds: 120, limited: true
  });
});

test("early habits include the ten-minute boundary and expose missing ward samples", () => {
  const valid = sample({ events: [
    { type: "CHAMPION_KILL", killerId: 1, victimId: 6, timestamp: 600000 },
    { type: "WARD_PLACED", creatorId: 1, timestamp: 600001 },
    { type: "WARD_PLACED", creatorId: 1, timestamp: "120000" }
  ] });
  assert.deepEqual(earlyHabits([valid], "player"), {
    games: 1, earlyTakedowns: 1, takedownRate: 100, deathRate: 0,
    wardGames: 0, firstWardSeconds: null, limited: true
  });
});

test("early habits exclude off-role games and require an identified opposing mid", () => {
  const offRole = sample({ position: "TOP" });
  const noOpponent = sample();
  noOpponent.match.info.participants[1].teamPosition = "TOP";
  assert.deepEqual(earlyHabits([offRole, noOpponent], "player"), { games: 0 });
});

test("compares ranked mid performance by normalized game patch", () => {
  const matches = [
    { ...sample().match, info: { ...sample().match.info, gameVersion: "26.20.123.456", participants: sample().match.info.participants.map((p, i) => i ? p : { ...p, win: true, kills: 5, deaths: 2, assists: 7 }) } },
    { ...sample().match, info: { ...sample().match.info, gameVersion: "26.19.9", participants: sample().match.info.participants.map((p, i) => i ? p : { ...p, win: false, kills: 2, deaths: 4, assists: 2 }) } },
    { ...sample().match, info: { ...sample().match.info, gameVersion: "26.20.999", participants: sample().match.info.participants.map((p, i) => i ? p : { ...p, win: false, kills: 1, deaths: 1, assists: 4 }) } }
  ];
  assert.deepEqual(patchBreakdown(matches, "player"), [
    { patch: "26.20", games: 2, winrate: 50, kda: 5.67, limited: true },
    { patch: "26.19", games: 1, winrate: 0, kda: 1, limited: true }
  ]);
});

test("excludes malformed patches, off-role games and incomplete combat data", () => {
  const valid = sample().match;
  const participant = { ...valid.info.participants[0], win: true, kills: 1, deaths: 0, assists: 3 };
  const make = (gameVersion, overrides = {}) => ({ info: { ...valid.info, gameVersion,
    participants: [{ ...participant, ...overrides }, valid.info.participants[1]] } });
  assert.deepEqual(patchBreakdown([
    make("26.20.1"), make("unknown"), make("26.20.2", { kills: undefined }),
    make("26.20.3", { teamPosition: "TOP" })
  ], "player"), [{ patch: "26.20", games: 1, winrate: 100, kda: 4, limited: true }]);
});

test("summarizes results against each identified mid champion", () => {
  const base = sample().match;
  const make = (championName, win, kills, deaths, assists) => ({ info: { ...base.info,
    participants: [
      { ...base.info.participants[0], win, kills, deaths, assists },
      { ...base.info.participants[1], championName }
    ] } });
  assert.deepEqual(matchupBreakdown([
    make("Ahri", true, 5, 2, 7), make("Ahri", false, 1, 3, 2), make("Syndra", true, 4, 0, 6)
  ], "player"), [
    { champion: "Ahri", games: 2, winrate: 50, kda: 3, limited: true },
    { champion: "Syndra", games: 1, winrate: 100, kda: 10, limited: true }
  ]);
});

test("excludes matchup rows without a valid mid opponent or combat sample", () => {
  const base = sample().match;
  const player = { ...base.info.participants[0], win: true, kills: 2, deaths: 1, assists: 3 };
  const make = (opponent = {}, playerOverrides = {}) => ({ info: { ...base.info,
    participants: [{ ...player, ...playerOverrides }, { ...base.info.participants[1], championName: "Ahri", ...opponent }] } });
  assert.deepEqual(matchupBreakdown([
    make(), make({ championName: "" }), make({ teamPosition: "TOP" }), make({}, { assists: undefined })
  ], "player"), [{ champion: "Ahri", games: 1, winrate: 100, kda: 5, limited: true }]);
});
