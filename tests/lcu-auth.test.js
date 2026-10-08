const test = require("node:test");
const assert = require("node:assert/strict");
const { fromCommandLine, fromProcessList, fromLockfile } = require("../src/services/lcu-auth");

test("reads an actual Windows command line without swallowing following flags", () => {
  assert.deepEqual(fromCommandLine('"C:\\Riot Games\\League of Legends\\LeagueClientUx.exe" --app-port=54321 --remoting-auth-token=test-token --region=EUW'),
    { port: 54321, password: "test-token", source: "process" });
});

test("supports quoted values, whitespace separators and reversed argument order", () => {
  assert.deepEqual(fromCommandLine('--remoting-auth-token "test-token"\t--app-port "54321"'),
    { port: 54321, password: "test-token", source: "process" });
  assert.equal(fromCommandLine('--app-port="1234" --remoting-auth-token="test-token"').port, 1234);
});

test("rejects missing, malformed and out-of-range process credentials", () => {
  for (const cmd of ["", "--app-port=1234", '--app-port=1234 --remoting-auth-token=""',
    "--app-port=0 --remoting-auth-token=test", "--app-port=65536 --remoting-auth-token=test",
    "--app-port=1234oops --remoting-auth-token=test", "--app-port=1234 --remoting-auth-token=\"unterminated",
    "--other-app-port=1234 --remoting-auth-token=test"]) {
    assert.equal(fromCommandLine(cmd), null);
  }
});

test("finds valid credentials after a stale League client process", () => {
  const stale = '"C:\\Riot Games\\LeagueClientUx.exe" --app-port=0 --remoting-auth-token=old';
  const current = '"C:\\Riot Games\\LeagueClientUx.exe" --app-port=54321 --remoting-auth-token=current';
  assert.deepEqual(fromProcessList(stale + "\r\n" + current),
    { port: 54321, password: "current", source: "process" });
});

test("reads the standard HTTPS lockfile with Windows line endings", () => {
  assert.deepEqual(fromLockfile("LeagueClient:123:54321:test-token:https\r\n"),
    { port: 54321, password: "test-token", source: "lockfile" });
});

test("rejects stale or malformed lockfiles", () => {
  for (const raw of ["", "LeagueClient:123:54321:test", "LeagueClient:123:NaN:test:https",
    "LeagueClient:123:0:test:https", "LeagueClient:123:65536:test:https",
    "LeagueClient:123:54321::https", "LeagueClient:123:54321:test:http"]) {
    assert.equal(fromLockfile(raw), null);
  }
});
