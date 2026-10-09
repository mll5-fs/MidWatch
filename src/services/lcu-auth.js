// Pure parsers so Windows client discovery can be verified without a running client.
function credentials(port, password, source) {
  if (!/^\d+$/.test(String(port || ""))) return null;
  const value = Number(port);
  if (!Number.isInteger(value) || value < 1 || value > 65535 || !password) return null;
  return { port: value, password, source };
}

function fromCommandLine(command = "") {
  const port = command.match(/(?:^|\s)--app-port(?:=|\s+)(?:"(\d+)"|(\d+))(?=\s|$)/);
  const token = command.match(/(?:^|\s)--remoting-auth-token(?:=|\s+)(?:"([^"\r\n]+)"|([^\s"]+))(?=\s|$)/);
  return port && token ? credentials(port[1] || port[2], token[1] || token[2], "process") : null;
}

function fromProcessListAll(raw = "") {
  const seen = new Set(), result = [];
  for (const command of String(raw || "").split(/\r?\n/)) {
    const auth = fromCommandLine(command.trim());
    const key = auth && `${auth.port}:${auth.password}`;
    if (auth && !seen.has(key)) { seen.add(key); result.push(auth); }
  }
  return result;
}

function fromProcessList(raw = "") { return fromProcessListAll(raw)[0] || null; }

function fromLockfile(raw = "") {
  const fields = raw.trim().split(":");
  if (fields.length !== 5 || fields[4] !== "https") return null;
  return credentials(fields[2], fields[3], "lockfile");
}

module.exports = { fromCommandLine, fromProcessList, fromProcessListAll, fromLockfile };
