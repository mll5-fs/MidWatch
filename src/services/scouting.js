const isMid = x => [x?.teamPosition, x?.individualPosition].some(v => String(v || "").toUpperCase() === "MIDDLE");

function winrateInterval(wins, games) {
  if (!Number.isInteger(wins) || !Number.isInteger(games) || games <= 0 || wins < 0 || wins > games) return null;
  const z = 1.96, z2 = z * z, proportion = wins / games, denominator = 1 + z2 / games;
  const center = (proportion + z2 / (2 * games)) / denominator;
  const margin = z * Math.sqrt((proportion * (1 - proportion) + z2 / (4 * games)) / games) / denominator;
  return { low: Math.max(0, Math.round(100 * (center - margin))), high: Math.min(100, Math.round(100 * (center + margin))) };
}

function sampleWindow(matches, sampledAt = Date.now()) {
  const rows = Array.isArray(matches) ? matches : [];
  const now = Number.isFinite(sampledAt) ? sampledAt : Date.now();
  const minimum = Date.UTC(2010, 0, 1), maximum = now + 86400000;
  const valid = value => Number.isFinite(value) && value >= minimum && value <= maximum;
  const timestamps = rows.map(match => [match?.info?.gameStartTimestamp, match?.info?.gameCreation].find(valid))
    .filter(valid).sort((a, b) => a - b);
  if (!timestamps.length) return { games: rows.length, datedGames: 0, partial: rows.length > 0 };
  const oldestAt = timestamps[0], newestAt = timestamps[timestamps.length - 1];
  const latestAgeDays = Math.max(0, Math.floor((now - newestAt) / 86400000));
  return { games: rows.length, datedGames: timestamps.length, oldestAt, newestAt,
    spanDays: Math.ceil((newestAt - oldestAt) / 86400000), latestAgeDays,
    stale: latestAgeDays >= 30, partial: timestamps.length < rows.length };
}

function participantForScouting(match, puuid) {
  if (match?.info?.queueId !== 420) return null;
  const player = (match.info.participants || []).find(x => x.puuid === puuid);
  return isMid(player) ? player : null;
}

function midOpponent(participants, player) {
  return participants.find(x => x.teamId !== player.teamId && isMid(x));
}

function frameAt(timeline, minute) {
  const target = minute * 60 * 1000;
  // Allow one second of timestamp drift, never substitute another minute.
  return (timeline?.info?.frames || []).filter(frame =>
    Number.isFinite(frame.timestamp) && Math.abs(frame.timestamp - target) <= 1000
  ).reduce((best, frame) => {
    if (!best) return frame;
    return Math.abs((frame.timestamp || 0) - target) < Math.abs((best.timestamp || 0) - target) ? frame : best;
  }, null);
}

function completeFrame(frame) {
  return frame && ["minionsKilled", "jungleMinionsKilled", "totalGold", "xp"]
    .every(key => Number.isFinite(frame[key]) && frame[key] >= 0);
}

function laneRowAt(sample, puuid, minute) {
    const { match, timeline } = sample || {};
    const participants = match?.info?.participants || [];
    const player = participants.find(x => x.puuid === puuid);
    const opponent = isMid(player) && midOpponent(participants, player);
    const frame = frameAt(timeline, minute);
    const mine = frame?.participantFrames?.[player?.participantId];
    const theirs = frame?.participantFrames?.[opponent?.participantId];
    if (!player || !opponent || !completeFrame(mine) || !completeFrame(theirs)) return null;
    const cs = (mine.minionsKilled || 0) + (mine.jungleMinionsKilled || 0);
    const oppCs = (theirs.minionsKilled || 0) + (theirs.jungleMinionsKilled || 0);
    const earlyDeaths = (timeline.info?.frames || []).flatMap(x => x.events || [])
      .filter(e => e.type === "CHAMPION_KILL" && e.victimId === player.participantId &&
        Number.isFinite(e.timestamp) && e.timestamp >= 0 && e.timestamp <= minute * 60000).length;
    return { champion: String(player.championName || "").trim(),
      opponentChampion: String(opponent.championName || "").trim(), cs, gold: mine.totalGold || 0, xp: mine.xp || 0,
      csDiff: cs - oppCs, goldDiff: (mine.totalGold || 0) - (theirs.totalGold || 0),
      xpDiff: (mine.xp || 0) - (theirs.xp || 0), earlyDeaths };
}

const laneRowAt10 = (sample, puuid) => laneRowAt(sample, puuid, 10);

function laneAt(samples, puuid, minute) {
  const rows = (samples || []).map(sample => laneRowAt(sample, puuid, minute)).filter(Boolean);
  if (!rows.length) return { games: 0 };
  const avg = key => Math.round(rows.reduce((sum, row) => sum + row[key], 0) / rows.length);
  const median = key => {
    const values = rows.map(row => row[key]).sort((a, b) => a - b), middle = Math.floor(values.length / 2);
    return Math.round(values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2);
  };
  const goldAheadGames = rows.filter(x => x.goldDiff > 0).length;
  const deathGames = rows.filter(x => x.earlyDeaths > 0).length;
  return { games: rows.length, cs: avg("cs"), gold: avg("gold"), xp: avg("xp"),
    csDiff: avg("csDiff"), goldDiff: avg("goldDiff"), xpDiff: avg("xpDiff"),
    medianGoldDiff: median("goldDiff"), goldAheadRate: Math.round(100 * goldAheadGames / rows.length),
    goldAheadInterval: winrateInterval(goldAheadGames, rows.length),
    deathRate: Math.round(100 * deathGames / rows.length), deathInterval: winrateInterval(deathGames, rows.length) };
}

const laneAt5 = (samples, puuid) => laneAt(samples, puuid, 5);
const laneAt10 = (samples, puuid) => laneAt(samples, puuid, 10);

function laneTransitionRow(sample, puuid) {
  const at5 = laneRowAt(sample, puuid, 5), at10 = laneRowAt(sample, puuid, 10);
  if (!at5 || !at10) return null;
  return { champion: at10.champion, opponentChampion: at10.opponentChampion, csSwing: at10.csDiff - at5.csDiff,
    goldSwing: at10.goldDiff - at5.goldDiff, xpSwing: at10.xpDiff - at5.xpDiff };
}

function laneTransition(samples, puuid) {
  const rows = (samples || []).map(sample => laneTransitionRow(sample, puuid)).filter(Boolean);
  if (!rows.length) return { games: 0 };
  const avg = key => Math.round(rows.reduce((sum, row) => sum + row[key], 0) / rows.length);
  return { games: rows.length, csSwing: avg("csSwing"), goldSwing: avg("goldSwing"),
    xpSwing: avg("xpSwing"), goldImprovedRate: Math.round(100 * rows.filter(row => row.goldSwing > 0).length / rows.length),
    limited: rows.length < 3 };
}

function transitionBreakdown(samples, puuid, groupKey) {
  const groups = new Map();
  for (const sample of samples || []) {
    const row = laneTransitionRow(sample, puuid);
    const champion = row?.[groupKey];
    if (!champion) continue;
    const group = groups.get(champion) || { champion, games: 0, csSwing: 0, goldSwing: 0, xpSwing: 0, goldImproved: 0 };
    group.games++;
    group.csSwing += row.csSwing;
    group.goldSwing += row.goldSwing;
    group.xpSwing += row.xpSwing;
    group.goldImproved += row.goldSwing > 0 ? 1 : 0;
    groups.set(champion, group);
  }
  return [...groups.values()].sort((a, b) => b.games - a.games || a.champion.localeCompare(b.champion))
    .slice(0, 6).map(group => ({ champion: group.champion, games: group.games,
      csSwing: Math.round(group.csSwing / group.games), goldSwing: Math.round(group.goldSwing / group.games),
      xpSwing: Math.round(group.xpSwing / group.games),
      goldImprovedRate: Math.round(100 * group.goldImproved / group.games), limited: group.games < 3 }));
}

const championTransitionBreakdown = (samples, puuid) => transitionBreakdown(samples, puuid, "champion");
const opponentTransitionBreakdown = (samples, puuid) => transitionBreakdown(samples, puuid, "opponentChampion");

function championLaneBreakdown(samples, puuid) {
  const groups = new Map();
  for (const sample of samples || []) {
    const row = laneRowAt10(sample, puuid);
    if (!row?.champion) continue;
    const group = groups.get(row.champion) || { champion: row.champion, games: 0, csDiff: 0, goldDiff: 0, xpDiff: 0, deaths: 0 };
    group.games++;
    group.csDiff += row.csDiff;
    group.goldDiff += row.goldDiff;
    group.xpDiff += row.xpDiff;
    group.deaths += row.earlyDeaths > 0 ? 1 : 0;
    groups.set(row.champion, group);
  }
  return [...groups.values()].sort((a, b) => b.games - a.games || a.champion.localeCompare(b.champion))
    .slice(0, 6).map(group => ({
      champion: group.champion,
      games: group.games,
      csDiff: Math.round(group.csDiff / group.games),
      goldDiff: Math.round(group.goldDiff / group.games),
      xpDiff: Math.round(group.xpDiff / group.games),
      deathRate: Math.round(100 * group.deaths / group.games),
      deathInterval: winrateInterval(group.deaths, group.games),
      limited: group.games < 3
    }));
}

function opponentLaneBreakdown(samples, puuid) {
  const groups = new Map();
  for (const sample of samples || []) {
    const row = laneRowAt10(sample, puuid);
    if (!row?.opponentChampion) continue;
    const champion = row.opponentChampion;
    const group = groups.get(champion) || { champion, games: 0, csDiff: 0, goldDiff: 0, xpDiff: 0, deaths: 0 };
    group.games++;
    group.csDiff += row.csDiff;
    group.goldDiff += row.goldDiff;
    group.xpDiff += row.xpDiff;
    group.deaths += row.earlyDeaths > 0 ? 1 : 0;
    groups.set(champion, group);
  }
  return [...groups.values()].sort((a, b) => b.games - a.games || a.champion.localeCompare(b.champion))
    .slice(0, 6).map(group => ({
      champion: group.champion,
      games: group.games,
      csDiff: Math.round(group.csDiff / group.games),
      goldDiff: Math.round(group.goldDiff / group.games),
      xpDiff: Math.round(group.xpDiff / group.games),
      deathRate: Math.round(100 * group.deaths / group.games),
      deathInterval: winrateInterval(group.deaths, group.games),
      limited: group.games < 3
    }));
}

function earlyHabits(samples, puuid) {
  const rows = [];
  for (const { match, timeline } of samples || []) {
    const participants = match?.info?.participants || [];
    const player = participants.find(x => x.puuid === puuid);
    if (!isMid(player) || !midOpponent(participants, player)) continue;
    const events = (timeline?.info?.frames || []).flatMap(frame => frame?.events || [])
      .filter(event => event && Number.isFinite(event.timestamp) && event.timestamp >= 0 && event.timestamp <= 600000);
    const kills = events.filter(event => event.type === "CHAMPION_KILL");
    const phase = (startExclusive, endInclusive) => {
      const phaseKills = kills.filter(event => event.timestamp > startExclusive && event.timestamp <= endInclusive);
      return {
        takedowns: phaseKills.filter(event => event.killerId === player.participantId ||
          (Array.isArray(event.assistingParticipantIds) && event.assistingParticipantIds.includes(player.participantId))).length,
        deaths: phaseKills.filter(event => event.victimId === player.participantId).length
      };
    };
    const before5 = phase(-1, 300000), fiveToTen = phase(300000, 600000);
    const takedowns = before5.takedowns + fiveToTen.takedowns;
    const deaths = before5.deaths + fiveToTen.deaths;
    const wards = events.filter(event => event.type === "WARD_PLACED" && event.creatorId === player.participantId)
      .map(event => event.timestamp / 1000).sort((a, b) => a - b);
    rows.push({ takedowns, deaths, before5, fiveToTen, firstWardSeconds: wards[0] });
  }
  if (!rows.length) return { games: 0 };
  const wardTimes = rows.map(row => row.firstWardSeconds).filter(Number.isFinite).sort((a, b) => a - b);
  const middle = Math.floor(wardTimes.length / 2);
  const medianWard = wardTimes.length ? (wardTimes.length % 2 ? wardTimes[middle] : (wardTimes[middle - 1] + wardTimes[middle]) / 2) : null;
  const totalTakedowns = rows.reduce((sum, row) => sum + row.takedowns, 0);
  const summarizePhase = key => {
    const takedownGames = rows.filter(row => row[key].takedowns > 0).length;
    const deathGames = rows.filter(row => row[key].deaths > 0).length;
    return {
      takedowns: +(rows.reduce((sum, row) => sum + row[key].takedowns, 0) / rows.length).toFixed(1),
      takedownRate: Math.round(100 * takedownGames / rows.length),
      takedownInterval: winrateInterval(takedownGames, rows.length),
      deathRate: Math.round(100 * deathGames / rows.length),
      deathInterval: winrateInterval(deathGames, rows.length)
    };
  };
  return { games: rows.length,
    earlyTakedowns: +(totalTakedowns / rows.length).toFixed(1),
    takedownRate: Math.round(100 * rows.filter(row => row.takedowns > 0).length / rows.length),
    deathRate: Math.round(100 * rows.filter(row => row.deaths > 0).length / rows.length),
    wardGames: wardTimes.length,
    firstWardSeconds: medianWard === null ? null : Math.round(medianWard),
    before5: summarizePhase("before5"),
    fiveToTen: summarizePhase("fiveToTen"),
    limited: rows.length < 3 };
}

function patchBreakdown(matches, puuid) {
  const groups = new Map();
  for (const match of matches || []) {
    const player = participantForScouting(match, puuid);
    const version = String(match?.info?.gameVersion || "").match(/^(\d+)\.(\d+)/);
    if (!player || !version) continue;
    const values = [player.kills, player.deaths, player.assists];
    if (!values.every(value => Number.isFinite(value) && value >= 0) || typeof player.win !== "boolean") continue;
    const patch = `${Number(version[1])}.${Number(version[2])}`;
    const group = groups.get(patch) || { patch, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, champions: new Map() };
    group.games++;
    group.wins += player.win ? 1 : 0;
    group.kills += player.kills;
    group.deaths += player.deaths;
    group.assists += player.assists;
    const champion = String(player.championName || "").trim();
    if (champion) group.champions.set(champion, (group.champions.get(champion) || 0) + 1);
    groups.set(patch, group);
  }
  const rows = [...groups.values()].sort((a, b) => {
    const [am, an] = a.patch.split(".").map(Number), [bm, bn] = b.patch.split(".").map(Number);
    return bm - am || bn - an;
  }).map(group => ({
    patch: group.patch,
    games: group.games,
    winrate: Math.round(100 * group.wins / group.games),
    interval: winrateInterval(group.wins, group.games),
    kda: +((group.kills + group.assists) / Math.max(1, group.deaths)).toFixed(2),
    avgKills: +(group.kills / group.games).toFixed(1),
    avgDeaths: +(group.deaths / group.games).toFixed(1),
    avgAssists: +(group.assists / group.games).toFixed(1),
    limited: group.games < 3,
    champions: [...group.champions].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3).map(([name, games]) => ({ name, games }))
  }));
  return rows.map((row, index) => {
    const previous = rows[index + 1];
    if (!previous) return row;
    return { ...row, comparison: {
      previousPatch: previous.patch,
      currentGames: row.games,
      previousGames: previous.games,
      winrateDelta: row.winrate - previous.winrate,
      kdaDelta: +(row.kda - previous.kda).toFixed(2),
      limited: row.games < 3 || previous.games < 3
    } };
  });
}

function matchupBreakdown(matches, puuid) {
  const groups = new Map();
  for (const match of matches || []) {
    const player = participantForScouting(match, puuid);
    const opponent = player && midOpponent(match.info.participants || [], player);
    const champion = String(opponent?.championName || "").trim();
    if (!player || !opponent || !champion) continue;
    const values = [player.kills, player.deaths, player.assists];
    if (!values.every(value => Number.isFinite(value) && value >= 0) || typeof player.win !== "boolean") continue;
    const group = groups.get(champion) || { champion, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
    group.games++;
    group.wins += player.win ? 1 : 0;
    group.kills += player.kills;
    group.deaths += player.deaths;
    group.assists += player.assists;
    groups.set(champion, group);
  }
  return [...groups.values()].sort((a, b) => b.games - a.games || a.champion.localeCompare(b.champion))
    .slice(0, 6).map(group => ({
      champion: group.champion,
      games: group.games,
      winrate: Math.round(100 * group.wins / group.games),
      interval: winrateInterval(group.wins, group.games),
      kda: +((group.kills + group.assists) / Math.max(1, group.deaths)).toFixed(2),
      limited: group.games < 3
    }));
}

module.exports = { winrateInterval, sampleWindow, laneAt5, laneAt10, laneTransition, championTransitionBreakdown, opponentTransitionBreakdown, championLaneBreakdown, opponentLaneBreakdown, earlyHabits, participantForScouting, patchBreakdown, matchupBreakdown };
