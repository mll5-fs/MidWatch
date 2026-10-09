const https = require("https");

function requestLocal(auth, method, endpoint, body, { request = https.request, timeoutMs = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    let req;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => {
      finish(new Error("Le client League n'a pas répondu dans les 12 secondes. Vérifie son état avant de réessayer."));
      req?.destroy();
    }, timeoutMs);
    const data = body === undefined ? "" : JSON.stringify(body);
    try {
      req = request({ hostname: "127.0.0.1", port: auth.port, path: endpoint, method,
        rejectUnauthorized: false, headers: {
          Authorization: "Basic " + Buffer.from("riot:" + auth.password).toString("base64"),
          "Content-Type": "application/json", ...(data ? { "Content-Length": Buffer.byteLength(data) } : {})
        } }, res => {
        let out = "";
        res.on("data", chunk => { out += chunk; });
        res.on("error", () => finish(new Error("Réponse du client League interrompue. Réessaie après avoir vérifié son état.")));
        res.on("aborted", () => finish(new Error("Réponse du client League interrompue. Réessaie après avoir vérifié son état.")));
        res.on("end", () => {
          let parsed = out;
          try { parsed = JSON.parse(out); } catch (_) {}
          if (res.statusCode >= 200 && res.statusCode < 300) finish(null, { status: res.statusCode, data: parsed, auth: auth.source });
          else finish(Object.assign(new Error(`Client League: HTTP ${res.statusCode}`), { status: res.statusCode, endpoint }));
        });
      });
      req.on("error", () => finish(new Error("Connexion au client League impossible. Laisse League ouvert et connecté puis réessaie.")));
      if (data) req.write(data);
      req.end();
    } catch (error) { finish(error); }
  });
}

function createLocalRequester(loadCandidates, request = requestLocal) {
  let active = null;
  return async (root, method, endpoint, body) => {
    if (active) return request(active, method, endpoint, body);
    const candidates = await loadCandidates(root);
    let lastError;
    for (const auth of candidates || []) {
      try {
        const response = await request(auth, method, endpoint, body);
        active = auth;
        return response;
      } catch (error) {
        lastError = error;
        // Only the initial read-only probe may safely try another discovered session.
        if (method !== "GET" || (error.status && ![401, 403].includes(error.status))) {
          active = auth;
          throw error;
        }
      }
    }
    throw lastError || new Error("MidPulse ne trouve aucune session locale du client League.");
  };
}

module.exports = { requestLocal, createLocalRequester };
