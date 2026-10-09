const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { launchThroughClient, diagnoseClient } = require("../src/services/spectate-flow");
const { requestLocal, createLocalRequester } = require("../src/services/lcu-http");
const fs = require("node:fs");
const httpError = status => Object.assign(new Error("HTTP " + status), { status });

test("Windows discovery inspects all League client processes", () => {
  const source = fs.readFileSync("src/services/spectate.js", "utf8");
  assert.match(source, /fromProcessListAll\(commands\)/);
  assert.match(source, /createLocalRequester\(lcu\)/);
  assert.doesNotMatch(source, /Select-Object -First 1/);
});

test("spectate acceptance exposes diagnostics without asserting that the game executable launched", async () => {
  const calls = [];
  const result = await launchThroughClient(async (...args) => { calls.push(args);return args[1]==="POST"?{status:204,auth:"process"}:{data:"Lobby"}; }, "root", { puuid: "player" });
  assert.equal(result.accepted, true);
  assert.equal(result.verified, undefined);
  assert.equal(result.phase, "Lobby");
  assert.equal(result.status, 204);
  assert.equal(result.auth, "process");
  assert.equal(calls.length, 2);
});

test("spectate falls back only when a route is unavailable", async () => {
  const calls = [];
  const result = await launchThroughClient(async (_root, method, endpoint) => {
    calls.push(endpoint);
    if (method === "GET") return { data: "None" };
    if (endpoint.startsWith("/lol-gameflow")) throw httpError(404);
    return { status: 204 };
  }, "root", {});
  assert.equal(calls.length, 3);
  assert.equal(result.endpoint, "/lol-spectator/v1/spectate/launch");
});

test("spectate preserves connection failure without claiming authentication", async () => {
  let calls = 0;
  await assert.rejects(launchThroughClient(async () => { calls++; throw new Error("Connexion impossible"); }, "root", {}), /Connexion impossible/);
  assert.equal(calls, 1);
});

test("spectate stops on authentication or server refusal without duplicate POST", async () => {
  for (const status of [401, 403, 400, 500]) {
    let posts = 0;
    await assert.rejects(launchThroughClient(async (_root, method) => {
      if (method === "GET") return { data: "Lobby" };
      posts++; throw httpError(status);
    }, "root", {}), status < 400 || status > 403 || status === 400 ? /HTTP/ : /Session League locale refusée/);
    assert.equal(posts, 1);
  }
});

test("spectate classifies stale, busy and server failures with the observed client phase", async () => {
  const cases = [
    [409, /Données Spectate refusées/, /phase client observée : ChampSelect/i],
    [422, /expirées ou incompatibles/, /phase client observée : ChampSelect/i],
    [429, /momentanément occupé/, /aucune seconde demande n’a été envoyée/],
    [503, /Service Spectate du client League indisponible/, /lancement n’est pas confirmé/]
  ];
  for (const [status, message, detail] of cases) {
    let posts = 0;
    await assert.rejects(launchThroughClient(async (_root, method) => {
      if (method === "GET") return { data: "ChampSelect" };
      posts++; throw httpError(status);
    }, "root", {}), error => message.test(error.message) && detail.test(error.message));
    assert.equal(posts, 1);
  }
});

test("spectate does not resubmit an ambiguous timed out launch", async () => {
  let posts = 0;
  await assert.rejects(launchThroughClient(async (_root, method) => {
    if (method === "GET") return { data: "Lobby" };
    posts++; throw new Error("Délai dépassé");
  }, "root", {}), /Délai dépassé/);
  assert.equal(posts, 1);
});

test("missing phase and launch routes report client incompatibility", async () => {
  await assert.rejects(launchThroughClient(async () => { throw httpError(404); }, "root", {}), /routes Spectate ne sont pas disponibles/);
});

test("client diagnostic reports the observed phase and authentication source", async () => {
  const calls = [];
  const result = await diagnoseClient(async (...args) => {
    calls.push(args);
    return { data: "ChampSelect", status: 200, auth: "lockfile" };
  }, "C:\\Riot Games\\League of Legends");
  assert.deepEqual(calls, [["C:\\Riot Games\\League of Legends", "GET", "/lol-gameflow/v1/gameflow-phase"]]);
  assert.equal(result.connected, true);
  assert.equal(result.phase, "ChampSelect");
  assert.equal(result.status, 200);
  assert.equal(result.auth, "lockfile");
});

test("client diagnostic explains local authentication refusal", async () => {
  await assert.rejects(diagnoseClient(async () => { throw httpError(401); }, "root"), /Session League locale refusée/);
});

test("settings exposes the key-free League client diagnostic end to end", () => {
  const main = fs.readFileSync("src/main.js", "utf8");
  const preload = fs.readFileSync("src/preload.js", "utf8");
  const renderer = fs.readFileSync("src/renderer/app.js", "utf8");
  assert.match(main, /settings:diagnoseLeague/);
  assert.match(preload, /diagnoseLeague/);
  assert.match(renderer, /Tester le client ouvert/);
  assert.match(renderer, /ne nécessite pas de clé Riot/);
});

function fakeRequest(respond) {
  const req = new EventEmitter();
  req.write = () => {};
  req.destroy = () => { req.destroyed = true; };
  req.end = () => respond?.();
  return req;
}

test("local request deadline aborts a silent connection", async () => {
  const req = fakeRequest();
  await assert.rejects(requestLocal({ port: 1234, password: "secret" }, "GET", "/test", undefined,
    { request: () => req, timeoutMs: 5 }), /délai imparti \(0,005 s\)/);
  assert.equal(req.destroyed, true);
});

test("local HTTP parses success and keeps credentials out of errors", async () => {
  for (const status of [200, 401]) {
    const request = (_options, callback) => fakeRequest(() => {
      const res = new EventEmitter(); res.statusCode = status; callback(res);
      res.emit("data", status === 200 ? '"Lobby"' : '{"message":"secret"}'); res.emit("end");
    });
    const result = requestLocal({ port: 1234, password: "secret" }, "GET", "/phase", undefined, { request });
    if (status === 200) assert.equal((await result).data, "Lobby");
    else await assert.rejects(result, error => error.status === 401 && !JSON.stringify(error).includes("secret"));
  }
});

test("local client probing skips stale sessions then pins the responsive credentials", async () => {
  const stale = { port: 1111, password: "old", source: "process" };
  const current = { port: 2222, password: "current", source: "process" };
  const calls = [];
  const raw = createLocalRequester(async () => [stale, current], async (auth, method, endpoint) => {
    calls.push([auth.port, method, endpoint]);
    if (auth === stale) throw new Error("Connexion impossible");
    return method === "GET" ? { data: "Lobby" } : { status: 204, auth: auth.source };
  });
  const result = await launchThroughClient(raw, "root", {});
  assert.equal(result.accepted, true);
  assert.deepEqual(calls, [
    [1111, "GET", "/lol-gameflow/v1/gameflow-phase"],
    [2222, "GET", "/lol-gameflow/v1/gameflow-phase"],
    [2222, "POST", "/lol-gameflow/v1/spectate/launch"]
  ]);
});

test("local client probing uses a short deadline only until credentials are pinned", async () => {
  const stale = { port: 1111, password: "old" };
  const current = { port: 2222, password: "current" };
  const calls = [];
  const raw = createLocalRequester(async () => [stale, current], async (auth, method, endpoint, body, options) => {
    calls.push({ port: auth.port, method, timeoutMs: options?.timeoutMs });
    if (auth === stale) throw new Error("Connexion impossible");
    return method === "GET" ? { data: "Lobby" } : { status: 204 };
  });
  const result = await launchThroughClient(raw, "root", {});
  assert.equal(result.accepted, true);
  assert.deepEqual(calls, [
    { port: 1111, method: "GET", timeoutMs: 2500 },
    { port: 2222, method: "GET", timeoutMs: 2500 },
    { port: 2222, method: "POST", timeoutMs: undefined }
  ]);
});

test("local client requester never switches credentials after a POST failure", async () => {
  const first = { port: 1111, password: "first" }, second = { port: 2222, password: "second" };
  const calls = [], raw = createLocalRequester(async () => [first, second], async (auth, method) => {
    calls.push([auth.port, method]);
    if (method === "POST") throw new Error("Délai dépassé");
    return { data: "Lobby" };
  });
  await assert.rejects(launchThroughClient(raw, "root", {}), /Délai dépassé/);
  assert.deepEqual(calls, [[1111, "GET"], [1111, "POST"]]);
});
