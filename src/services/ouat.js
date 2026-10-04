const { net } = require("electron");

const API = "https://api.leamateur.pro";
const TIMEOUT = 12000;
const MID_RE = /^(mid|middle|midlane|mid laner)$/i;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getJson(path, attempts = 5) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const response = await net.fetch(API + path, {
        headers: { "Accept": "application/json", "User-Agent": "MidWatch/2.1" },
        signal: controller.signal
      });
      if (response.ok) return await response.json();

      const error = new Error(`LEA HTTP ${response.status}`);
      error.status = response.status;
      lastError = error;

      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get("retry-after") || 0);
        const delay = retryAfter > 0 ? retryAfter * 1000 : Math.min(8000, 700 * Math.pow(2, attempt));
        await sleep(delay);
        continue;
      }
      throw error;
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1 && (error.name === "AbortError" || error.status === 429 || error.status >= 500)) {
        await sleep(Math.min(8000, 700 * Math.pow(2, attempt)));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("LEA indisponible");
}

function clean(v) { return String(v || "").trim(); }

function splitRiotId(value) {
  const raw = clean(value);
  const i = raw.lastIndexOf("#");
  if (i <= 0 || i === raw.length - 1) return null;
  return {
    gameName: raw.slice(0, i).trim(),
    tagLine: raw.slice(i + 1).trim(),
    platform: "EUW1"
  };
}

function isMid(player) {
  return MID_RE.test(clean(player?.user?.position || player?.position));
}

function playerName(player) {
  const user = player?.user || {};
  const riot = splitRiotId(user.summonerName);
  return clean(user.nickname) || (riot && riot.gameName) || clean(user.summonerName) || `Player ${player?.userId || ""}`;
}

function divisionMap(classification) {
  const map = new Map();
  for (const division of classification?.division || []) {
    for (const group of division?.group || []) {
      for (const entry of group?.tournamentTeams || []) {
        map.set(Number(entry.teamId), {
          division: clean(division.name) || (division.division ? `Division ${division.division}` : ""),
          group: clean(group.name)
        });
      }
    }
  }
  return map;
}

async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try { out[index] = await worker(items[index], index); }
      catch (error) { out[index] = { error }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}

async function selectTournament() {
  const tournaments = await getJson("/tournaments");
  const list = (Array.isArray(tournaments) ? tournaments : tournaments?.data || [])
    .filter(t => /ouatventure/i.test(clean(t.name)));
  if (!list.length) throw new Error("Aucune saison OUATventure trouvée sur LEA.");

  const now = Date.now();
  list.sort((a, b) => {
    const score = t => {
      const start = Date.parse(t.start || 0), end = Date.parse(t.end || 0);
      if (String(t.status).toUpperCase() === "OPEN") return 1000000000000000 - Math.abs(start - now);
      if (start <= now && end >= now) return 900000000000000 - Math.abs(start - now);
      return -Math.abs(start - now);
    };
    return score(b) - score(a);
  });
  return list[0];
}

async function refresh() {
  const tournament = await selectTournament();
  const encodedName = encodeURIComponent(tournament.name);
  const details = await getJson(`/tournaments/${encodedName}`);
  let classification = null;
  try { classification = await getJson(`/clasification/byTournament/${tournament.id}`); } catch (_) {}

  const placements = divisionMap(classification);
  const entries = Array.isArray(details?.tournamentTeams) ? details.tournamentTeams : [];
  if (!entries.length) {
    return {
      url: `https://lol.leamateur.pro/tournaments/${encodedName}`,
      season: clean(tournament.abbreviation) || clean(tournament.name),
      status: clean(tournament.status),
      start: tournament.start || "",
      end: tournament.end || "",
      teams: 0,
      players: [],
      updatedAt: Date.now(),
      warning: "Les inscriptions OUATventure sont ouvertes mais LEA n’expose encore aucune équipe."
    };
  }

  const fetched = await pool(entries, 3, async entry => {
    const teamId = Number(entry.teamId || entry?.team?.id);
    if (!teamId) return [];
    const roster = await getJson(`/team/${teamId}`);
    const team = roster?.data || entry?.team || {};
    const place = placements.get(teamId) || {};
    const mids = (roster?.players || []).filter(isMid);

    return mids.map(member => {
      const user = member.user || {};
      const account = splitRiotId(user.summonerName || user.nickname);
      const name = playerName(member);
      return {
        id: `ouat-${teamId}-${member.userId || name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name,
        team: clean(team.name || entry?.team?.name) || `Team ${teamId}`,
        teamId,
        teamLogo: clean(team.logo || entry?.team?.logo),
        avatar: clean(user.avatar),
        region: "OUAT",
        division: clean(place.division),
        group: clean(place.group),
        platform: "EUW1",
        role: "MID",
        source: "LEA API",
        accounts: account ? [account] : [],
        live: null
      };
    });
  });

  const players = [];
  const failures = [];
  for (let i = 0; i < fetched.length; i++) {
    const result = fetched[i];
    if (result?.error) failures.push(entries[i]?.team?.name || String(entries[i]?.teamId || "?"));
    else if (Array.isArray(result)) players.push(...result);
  }

  const seen = new Set();
  const unique = players.filter(p => {
    const key = `${p.teamId}|${p.name}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) =>
    String(a.division).localeCompare(String(b.division), undefined, { numeric: true }) ||
    a.team.localeCompare(b.team) ||
    a.name.localeCompare(b.name)
  );

  return {
    url: `https://lol.leamateur.pro/tournaments/${encodedName}`,
    season: clean(tournament.abbreviation) || clean(tournament.name),
    status: clean(tournament.status),
    start: tournament.start || "",
    end: tournament.end || "",
    teams: entries.length,
    players: unique,
    updatedAt: Date.now(),
    warning: failures.length ? `${failures.length} roster(s) LEA temporairement indisponible(s).` : ""
  };
}

module.exports = { refresh, selectTournament, splitRiotId, isMid };
