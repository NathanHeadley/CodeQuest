// REST + WebSocket networking. All calls carry the JWT.
import { config, getToken, bus } from "./core.js";

async function request(method, path, body) {
  const headers = { Authorization: `Bearer ${getToken()}` };
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(config.apiBase + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  state: () => request("GET", "/api/state"),
  highscores: () => request("GET", "/api/highscores"),
  validateCode: (action_name, code) =>
    request("POST", "/api/validate-code", { action_name, code }),
  bindKey: (action_name, key) => request("POST", "/api/bind-key", { action_name, key }),
  consume: (action_name, count) => request("POST", "/api/consume", { action_name, count }),
  combat: (enemy_type, outcome, auto_resolved) =>
    request("POST", "/api/combat", { enemy_type, outcome, auto_resolved }),
  combatExchange: (enemy_type, damage_dealt, damage_taken, killed) =>
    request("POST", "/api/combat/exchange", { enemy_type, damage_dealt, damage_taken, killed }),
  respawn: () => request("POST", "/api/respawn"),
  completeQuest: (quest_key) => request("POST", "/api/quest/complete", { quest_key }),
  dashboardPupils: () => request("GET", "/api/dashboard/pupils"),
  dashboardPupil: (id) => request("GET", `/api/dashboard/pupil/${id}`),
};

// --- WebSocket multiplayer --------------------------------------------------
let ws = null;

export function connectSocket() {
  ws = new WebSocket(`${config.wsUrl}?token=${encodeURIComponent(getToken())}`);
  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    bus.emit(`ws:${msg.type}`, msg);
  });
  ws.addEventListener("close", () => bus.emit("ws:closed"));
  ws.addEventListener("error", () => bus.emit("ws:error"));
  return ws;
}

function wsSend(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

export function sendMove(x, y) {
  wsSend({ type: "move", x, y });
}
export function sendAttack(enemyId) {
  wsSend({ type: "attack", enemyId });
}
export function sendPickup(itemId) {
  wsSend({ type: "pickup", itemId });
}
export function sendChop(treeId) {
  wsSend({ type: "chop", treeId });
}
export function sendMine(rockId) {
  wsSend({ type: "mine", rockId });
}
export function sendUse(a, b) {
  wsSend({ type: "use", a, b });
}
export function sendCook(fireId) {
  wsSend({ type: "cook", fireId });
}
export function sendEat(item) {
  wsSend({ type: "eat", item });
}
export function sendSell(item) {
  wsSend({ type: "sell", item });
}
export function sendBuy(item) {
  wsSend({ type: "buy", item });
}
