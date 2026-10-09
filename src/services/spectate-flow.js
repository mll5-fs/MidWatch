const endpoints = ["/lol-gameflow/v1/spectate/launch", "/lol-spectator/v1/spectate/launch"];

function phaseLabel(phase) {
  return phase && phase !== "inconnue" ? ` Phase client observée : ${phase}.` : "";
}

function failure(error, phase = "inconnue") {
  const observed = phaseLabel(phase);
  if ([401, 403].includes(error.status)) return new Error(`Session League locale refusée. Relance le client League, connecte-toi puis réessaie.${observed}`);
  if (!error.status) return error;
  if ([400, 409, 422].includes(error.status)) return new Error(`Données Spectate refusées par le client League (HTTP ${error.status}). Elles peuvent être expirées ou incompatibles avec l’état actuel ; actualise le statut LIVE puis réessaie.${observed}`);
  if (error.status === 429) return new Error(`Client League momentanément occupé (HTTP 429). Attends quelques secondes avant de réessayer ; aucune seconde demande n’a été envoyée.${observed}`);
  if (error.status >= 500) return new Error(`Service Spectate du client League indisponible (HTTP ${error.status}). Relance le client si l’erreur persiste ; le lancement n’est pas confirmé.${observed}`);
  return new Error(`League refuse la demande Spectate (HTTP ${error.status}). Réessaie depuis le client League ; le lancement n'est pas confirmé.${observed}`);
}

async function launchThroughClient(raw, root, body) {
  let phase = "inconnue";
  try { phase = String((await raw(root, "GET", "/lol-gameflow/v1/gameflow-phase")).data || "inconnue"); }
  catch (error) {
    // An unavailable optional phase endpoint does not prove that launch is unavailable.
    if (![404, 405].includes(error.status)) throw failure(error);
  }
  for (const endpoint of endpoints) {
    try {
      const response = await raw(root, "POST", endpoint, body);
      return { root, accepted: true, method: "LCU", endpoint, phase,
        status: response?.status, auth: response?.auth };
    } catch (error) {
      // Retry another endpoint only when this route does not exist, never after an ambiguous timeout.
      if (![404, 405].includes(error.status)) throw failure(error, phase);
    }
  }
  throw new Error("Les routes Spectate ne sont pas disponibles dans ce client League. Essaie depuis League et vérifie que le client est à jour.");
}

async function diagnoseClient(raw, root) {
  try {
    const response = await raw(root, "GET", "/lol-gameflow/v1/gameflow-phase");
    return {
      root,
      connected: true,
      phase: String(response?.data || "inconnue"),
      status: response?.status,
      auth: response?.auth
    };
  } catch (error) {
    throw failure(error);
  }
}

module.exports = { launchThroughClient, diagnoseClient };
