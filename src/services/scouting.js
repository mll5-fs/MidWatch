const isMid = x => [x?.teamPosition, x?.individualPosition].some(v => String(v || "").toUpperCase() === "MIDDLE");

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

function laneRowAt10(sample, puuid) {
    const { match, timeline } = sample || {};
    const participants = match?.info?.participants || [];
    const player = participants.find(x => x.puuid === puuid);
    const opponent = isMid(player) && midOpponent(participants, player);
    const frame = frameAt(timeline, 10);
    const mine = frame?.participantFrames?.[player?.participantId];
    const theirs = frame?.participantFrames?.[opponent?.participantId];
    if (!player || !opponent || !completeFrame(mine) || !completeFrame(theirs)) return null;
    const cs = (mine.minionsKilled || 0) + (mine.jungleMinionsKilled || 0);
    const oppCs = (theirs.minionsKilled || 0) + (theirs.jungleMinionsKilled || 0);
    const earlyDeaths = (timeline.info?.frames || []).flatMap(x => x.events || [])
      .filter(e => e.type === "CHAMPION_KILL" && e.victimId === player.participantId &&
        Number.isFinite(e.timestamp) && e.timestamp >= 0 && e.timestamp <= 600000).length;
    return { champion: String(player.championName || "").trim(), cs, gold: mine.totalGold || 0, xp: mine.xp || 0,
      csDiff: cs - oppCs, goldDiff: (mine.totalGold || 0) - (theirs.totalGold || 0),
      xpDiff: (mine.xp || 0) - (theirs.xp || 0), earlyDeaths };
}

function laneAt10(samples, puuid) {
  const rows = (samples || []).map(sample => laneRowAt10(sample, puuid)).filter(Boolean);
  if (!rows.length) return { games: 0 };
  const avg = key => Math.round(rows.reduce((sum, row) => sum + row[key], 0) / rows.length);
  return { games: rows.length, cs: avg("cs"), gold: avg("gold"), xp: avg("xp"),
    csDiff: avg("csDiff"), goldDiff: avg("goldDiff"), xpDiff: avg("xpDiff"),
    deathRate: Math.round(100 * rows.filter(x => x.earlyDeaths > 0).length / rows.length) };
}

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
    const takedowns = kills.filter(event => event.killerId === player.participantId ||
      (Array.isArray(event.assistingParticipantIds) && event.assistingParticipantIds.includes(player.participantId))).length;
    const deaths = kills.filter(event => event.victimId === player.participantId).length;
    const wards = events.filter(event => event.type === "WARD_PLACED" && event.creatorId === player.participantId)
      .map(event => event.timestamp / 1000).sort((a, b) => a - b);
    rows.push({ takedowns, deaths, firstWardSeconds: wards[0] });
  }
  if (!rows.length) return { games: 0 };
  const wardTimes = rows.map(row => row.firstWardSeconds).filter(Number.isFinite).sort((a, b) => a - b);
  const middle = Math.floor(wardTimes.length / 2);
  const medianWard = wardTimes.length ? (wardTimes.length % 2 ? wardTimes[middle] : (wardTimes[middle - 1] + wardTimes[middle]) / 2) : null;
  const totalTakedowns = rows.reduce((sum, row) => sum + row.takedowns, 0);
  return { games: rows.length,
    earlyTakedowns: +(totalTakedowns / rows.length).toFixed(1),
    takedownRate: Math.round(100 * rows.filter(row => row.takedowns > 0).length / rows.length),
    deathRate: Math.round(100 * rows.filter(row => row.deaths > 0).length / rows.length),
    wardGames: wardTimes.length,
    firstWardSeconds: medianWard === null ? null : Math.round(medianWard),
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
    const group = groups.get(patch) || { patch, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
    group.games++;
    group.wins += player.win ? 1 : 0;
    group.kills += player.kills;
    group.deaths += player.deaths;
    group.assists += player.assists;
    groups.set(patch, group);
  }
  return [...groups.values()].sort((a, b) => {
    const [am, an] = a.patch.split(".").map(Number), [bm, bn] = b.patch.split(".").map(Number);
    return bm - am || bn - an;
  }).map(group => ({
    patch: group.patch,
    games: group.games,
    winrate: Math.round(100 * group.wins / group.games),
    kda: +((group.kills + group.assists) / Math.max(1, group.deaths)).toFixed(2),
    limited: group.games < 3
  }));
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
      kda: +((group.kills + group.assists) / Math.max(1, group.deaths)).toFixed(2),
      limited: group.games < 3
    }));
}

module.exports = { laneAt10, championLaneBreakdown, earlyHabits, participantForScouting, patchBreakdown, matchupBreakdown };
