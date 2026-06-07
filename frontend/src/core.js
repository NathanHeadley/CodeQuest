// Shared config, a tiny event bus, the auth token, and client-side game state.

export const config = {
  // Same-origin in production (served by nginx alongside the API).
  apiBase: "",
  get wsUrl() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}/ws`;
  },
  tileSize: 32,
};

// --- Tiny pub/sub event bus -------------------------------------------------
const listeners = new Map();
export const bus = {
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event)?.delete(fn);
  },
  emit(event, payload) {
    listeners.get(event)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.error(`bus handler for "${event}" failed:`, e);
      }
    });
  },
};

// --- Auth token -------------------------------------------------------------
// The main site's bridge.php hands us a JWT via ?token=... ; we stash it so a
// page refresh keeps working for the (short) life of the token.
const KEY = "cq_token";
export function loadToken() {
  const url = new URL(location.href);
  const fromQuery = url.searchParams.get("token");
  if (fromQuery) {
    sessionStorage.setItem(KEY, fromQuery);
    url.searchParams.delete("token");
    history.replaceState({}, "", url.pathname + url.search);
    return fromQuery;
  }
  return sessionStorage.getItem(KEY);
}
export function getToken() {
  return sessionStorage.getItem(KEY);
}

// --- Client-side game state -------------------------------------------------
export const state = {
  user: null, // { id, display_name, is_teacher }
  player: { x: 0, y: 0, current_map: "town" },
  maxHealth: 10,
  health: 10,
  skills: {
    combat: { xp: 0, level: 1 },
    survival: { xp: 0, level: 1 },
    coding: { xp: 0, level: 1 },
  },
  actions: new Map(), // action_name -> { tier, charges_remaining, times_coded, bound_key }
  inventory: [], // [{ item_name, quantity }]
  questsDone: [], // completed quest keys
  useSelection: null, // inventory item currently selected for a "use" interaction

  setFromServer(data) {
    this.user = data.user;
    this.player = data.state;
    this.maxHealth = data.maxHealth ?? 10;
    this.health = data.state.health ?? this.maxHealth;
    if (data.skills) this.skills = data.skills;
    this.questsDone = data.quests_done || [];
    this.actions.clear();
    for (const a of data.actions) this.actions.set(a.action_name, a);
    this.inventory = data.inventory || [];
    bus.emit("state:changed");
  },
  getAction(name) {
    return this.actions.get(name);
  },
  upsertAction(progress) {
    this.actions.set(progress.action_name, progress);
    bus.emit("state:changed");
  },
  totalLevel() {
    return this.skills.combat.level + this.skills.survival.level + this.skills.coding.level;
  },
  // Find the action bound to a keyboard key (lower-cased).
  actionForKey(key) {
    for (const a of this.actions.values()) {
      if (a.bound_key && a.bound_key.toLowerCase() === key.toLowerCase()) return a;
    }
    return null;
  },
};
