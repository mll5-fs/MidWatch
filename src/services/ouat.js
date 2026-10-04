const { BrowserWindow, net } = require("electron");

const OFFICIAL_PAGE = "https://www.onceuponateam.be/?page_id=3104";
const FALLBACK_SEASONS = [20, 23, 22, 21, 19];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const str = (value) => (typeof value === "string" ? value.trim() : "");

function role(value) {
  if (value && typeof value === "object") value = value.value || value.name || value.label;
  return str(value).toUpperCase();
}

function isMidRole(value) {
  return /(^|\W)(MID|MIDDLE|MIDLANE|MIDLANER)(\W|$)/.test(role(value));
}

function nameOf(obj) {
  return str(
    obj?.displayName ||
      obj?.playerName ||
      obj?.summonerName ||
      obj?.nickname ||
      obj?.nick ||
      obj?.gameName ||
      obj?.username ||
      obj?.pseudo ||
      obj?.name
  );
}

function teamOf(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    return str(value.teamName || value.displayName || value.name || value.title || value.tag);
  }
  return "";
}

function extract(payloads) {
  const out = [];
  const seen = new Set();
  const rosterKeys = new Set(["players", "roster", "members", "lineup", "participants"]);
  const orderedRoles = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

  function add(obj, ctx, roleHint = "") {
    const detectedRole = role(obj?.role || obj?.position || obj?.lane || obj?.playerRole || roleHint);
    if (!isMidRole(detectedRole)) return;

    const name = nameOf(obj);
    const team = teamOf(obj?.team || obj?.teamName || obj?.squad) || ctx.team;
    if (!name || !team || name === team) return;

    const rawRiotId = str(obj?.riotId || obj?.riotID || obj?.riot_id);
    let gameName = str(obj?.gameName);
    let tagLine = str(obj?.tagLine || obj?.tag);
    if (rawRiotId.includes("#")) [gameName, tagLine] = rawRiotId.split("#", 2);

    const key = `${team}|${name}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    out.push({
      id: `ouat-${key.replace(/[^a-z0-9]+/g, "-")}`,
      name,
      team,
      region: "OUAT",
      division: ctx.division || str(obj?.division || obj?.group),
      platform: "EUW1",
      role: "MID",
      source: "LEA",
      accounts: gameName && tagLine ? [{ gameName, tagLine, platform: "EUW1" }] : [],
    });
  }

  function walk(value, ctx = { team: "", division: "" }, roleHint = "") {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, ctx, roleHint);
      return;
    }
    if (typeof value !== "object") return;

    const next = { ...ctx };
    const division = teamOf(value.division || value.group || value.pool);
    if (division) next.division = division;

    const hasRoster = [...rosterKeys].some(
      (key) => Array.isArray(value[key]) || (value[key] && value[key].players)
    );
    const possibleTeam = teamOf(value.teamName || value.team || value.squad || (hasRoster ? value.name : ""));
    if (possibleTeam) next.team = possibleTeam;

    add(value, next, roleHint);

    for (const [key, child] of Object.entries(value)) {
      if (!child || typeof child !== "object") continue;

      let hint = /^(mid|middle|midlane|midlaner)$/i.test(key) ? "MID" : "";
      if (rosterKeys.has(key) && Array.isArray(child) && child.length >= 5) {
        child.forEach((player, index) => walk(player, next, orderedRoles[index] || ""));
        continue;
      }
      walk(child, next, hint || roleHint);
    }
  }

  for (const payload of payloads) walk(payload);
  return out.sort(
    (a, b) =>
      (a.division || "").localeCompare(b.division || "") ||
      a.team.localeCompare(b.team) ||
      a.name.localeCompare(b.name)
  );
}

async function discoverOfficialTournamentUrl() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await net.fetch(OFFICIAL_PAGE, {
      headers: { "User-Agent": "Mozilla/5.0 MidWatch/2.0" },
      signal: controller.signal,
    });
    if (!response.ok) return "";
    const html = await response.text();
    const match = html.match(
      /href=["']([^"']*lol\.leamateur\.pro\/tournaments\/OUATventure(?:%20|\s|%2520)[^"']*)["']/i
    );
    if (!match) return "";
    return match[1]
      .replace(/&amp;/g, "&")
      .replace(/^http:/i, "https:")
      .replace(/ /g, "%20");
  } catch (_) {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function capture(url) {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  const payloads = [];
  const responses = new Map();
  let attached = false;

  try {
    window.webContents.debugger.attach("1.3");
    attached = true;
    await window.webContents.debugger.sendCommand("Network.enable");
  } catch (_) {}

  if (attached) {
    window.webContents.debugger.on("message", async (_event, method, params) => {
      if (method === "Network.responseReceived") {
        const type = params.type || "";
        const mime = (params.response?.mimeType || "").toLowerCase();
        const responseUrl = params.response?.url || "";
        if (
          ["XHR", "Fetch"].includes(type) ||
          mime.includes("json") ||
          /api|tournament|team|roster|participant/i.test(responseUrl)
        ) {
          responses.set(params.requestId, { url: responseUrl });
        }
      }

      if (method === "Network.loadingFinished" && responses.has(params.requestId)) {
        try {
          const body = await window.webContents.debugger.sendCommand("Network.getResponseBody", {
            requestId: params.requestId,
          });
          const text = body.base64Encoded
            ? Buffer.from(body.body, "base64").toString("utf8")
            : body.body;
          if (text && /^[\s]*[\[{]/.test(text)) payloads.push(JSON.parse(text));
        } catch (_) {}
      }
    });
  }

  try {
    const load = window
      .loadURL(url, {
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",
      })
      .catch(() => null);

    await Promise.race([load, wait(15000)]);
    await wait(4500);

    const readPage = window.webContents
      .executeJavaScript(`(() => {
        const json = [];
        for (const script of document.scripts) {
          const text = (script.textContent || "").trim();
          if (text && text.length < 5000000 && (text[0] === "{" || text[0] === "[")) json.push(text);
        }
        for (let i = 0; i < localStorage.length; i++) {
          const text = localStorage.getItem(localStorage.key(i));
          if (text && text.length < 5000000 && (text.trim()[0] === "{" || text.trim()[0] === "[")) json.push(text);
        }
        return {
          title: document.title || "",
          text: document.body?.innerText || "",
          json,
        };
      })()`)
      .catch(() => ({ title: "", text: "", json: [] }));

    const page = await Promise.race([
      readPage,
      wait(5000).then(() => ({ title: "", text: "", json: [] })),
    ]);

    for (const item of page.json || []) {
      try {
        payloads.push(JSON.parse(item));
      } catch (_) {}
    }

    return { payloads, page };
  } finally {
    try {
      if (attached) window.webContents.debugger.detach();
    } catch (_) {}
    try {
      window.destroy();
    } catch (_) {}
  }
}

function seasonFrom(url, title = "") {
  const match = (url + " " + title).match(/Saison(?:%20|\s)*(\d+)/i);
  return match ? `S${match[1]}` : "OUATventure";
}

async function refresh(configured = "") {
  const official = await discoverOfficialTournamentUrl();
  const fallbacks = FALLBACK_SEASONS.map(
    (season) => `https://lol.leamateur.pro/tournaments/OUATventure%20Saison%20${season}`
  );
  const urls = [configured, official, ...fallbacks].filter(
    (value, index, array) => value && array.indexOf(value) === index
  );

  let last = "";
  for (const url of urls) {
    try {
      const captured = await capture(url);
      const mids = extract(captured.payloads);
      if (mids.length) {
        return {
          url,
          season: seasonFrom(url, captured.page.title),
          players: mids,
          updatedAt: Date.now(),
          warning: "",
        };
      }
      last = `${url}: aucun roster MID structuré trouvé`;
    } catch (error) {
      last = `${url}: ${error.message}`;
    }
  }

  throw new Error(`Import OUAT impossible. ${last}`);
}

module.exports = { refresh, extract, discoverOfficialTournamentUrl };
