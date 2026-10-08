const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { launchThroughClient } = require("../src/services/spectate-flow");
const { requestLocal } = require("../src/services/lcu-http");
const fs = require("node:fs");
const httpError = status => Object.assign(new Error("HTTP " + status), { status });

test("Windows discovery inspects all League client processes", () => {
  const source = fs.readFileSync("src/services/spectate.js", "utf8");
  assert.match(source, /fromProcessList\(commands\)/);
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
    { request: () => req, timeoutMs: 5 }), /n'a pas répondu/);
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
