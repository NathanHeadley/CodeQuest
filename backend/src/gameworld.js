// Single shared, server-authoritative world: enemy HP/respawns, monster drops (with
// per-player visibility windows), global item spawns (respawn after pickup), choppable
// trees (woodcutting), and fires (firemaking). In-memory; resets on API restart.

export const PLAYER_DMG = 1;
const ENEMY_RESPAWN_MS = 7000;
const DROP_PRIVATE_MS = 30000; // first 30s a drop is visible only to the killer
const DROP_PUBLIC_MS = 60000; // after 60s total an un-picked drop despawns
const GLOBAL_RESPAWN_MS = 30000; // global items respawn 30s after pickup
const TREE_RESPAWN_MS = 15000; // a chopped tree regrows after 15s
const TREE_HP = 3; // trees take 3 hatchet-hits to fell
const ROCK_RESPAWN_MS = 20000; // a mined rock regrows after 20s
const ROCK_HP = 5; // rocks take 5 pickaxe-hits to mine out
const FIRE_MS = 30000; // a fire burns for 30s

export const ENEMY_STATS = {
  sheep: { hp: 3, dmg: 1, drops: ["wool"] },
  cow: { hp: 4, dmg: 1, drops: ["cowhide", "raw beef"] },
};

const ENEMY_DEFS = [
  { id: "e1", type: "sheep", x: 24, y: 6 },
  { id: "e2", type: "sheep", x: 26, y: 9 },
  { id: "e3", type: "sheep", x: 23, y: 14 },
  { id: "e4", type: "cow", x: 25, y: 16 },
  { id: "e5", type: "cow", x: 27, y: 12 },
];
const enemies = new Map();
for (const d of ENEMY_DEFS) {
  const maxHp = ENEMY_STATS[d.type].hp;
  enemies.set(d.id, { ...d, homeX: d.x, homeY: d.y, hp: maxHp, maxHp, alive: true, respawnAt: 0 });
}

// Global, always-there items (respawn 30s after pickup), on walkable town tiles.
const GLOBAL_DEFS = [
  { id: "g_hatchet", item: "hatchet", x: 13, y: 9 },
  { id: "g_tinderbox", item: "tinderbox", x: 8, y: 9 },
];
const globals = new Map();
for (const d of GLOBAL_DEFS) globals.set(d.id, { ...d, available: true, respawnAt: 0 });

// Choppable trees (block movement; regrow after being cut). A grove southwest of centre.
const TREE_DEFS = [
  { id: "t1", x: 6, y: 13 },
  { id: "t2", x: 8, y: 13 },
  { id: "t3", x: 7, y: 14 },
  { id: "t4", x: 6, y: 15 },
  { id: "t5", x: 8, y: 15 },
];
const trees = new Map();
for (const d of TREE_DEFS) trees.set(d.id, { ...d, hp: TREE_HP, maxHp: TREE_HP, alive: true, respawnAt: 0 });

// Mineable rocks near the grove.
const ROCK_DEFS = [
  { id: "r1", x: 4, y: 13 },
  { id: "r2", x: 9, y: 14 },
  { id: "r3", x: 5, y: 16 },
];
const rocks = new Map();
for (const d of ROCK_DEFS) rocks.set(d.id, { ...d, hp: ROCK_HP, maxHp: ROCK_HP, alive: true, respawnAt: 0 });

const drops = new Map(); // id -> { id, item, x, y, ownerId, droppedAt, public }
const fires = new Map(); // id -> { id, x, y, expiresAt }
let dropSeq = 1;
let fireSeq = 1;

const dist = (a, px, py) => Math.abs(a.x - px) + Math.abs(a.y - py); // Manhattan (orthogonal)
const cheb = (a, px, py) => Math.max(Math.abs(a.x - px), Math.abs(a.y - py)); // includes diagonals
const view = (it) => ({ id: it.id, item: it.item, x: it.x, y: it.y });

export function worldSnapshot(viewerId) {
  const now = Date.now();
  const items = [];
  for (const g of globals.values()) if (g.available) items.push(view(g));
  for (const d of drops.values()) {
    const age = now - d.droppedAt;
    if (age < DROP_PRIVATE_MS) {
      if (d.ownerId === viewerId) items.push(view(d));
    } else if (age < DROP_PUBLIC_MS) {
      items.push(view(d));
    }
  }
  return {
    enemies: [...enemies.values()]
      .filter((e) => e.alive)
      .map((e) => ({ id: e.id, type: e.type, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp })),
    items,
    trees: [...trees.values()]
      .filter((t) => t.alive)
      .map((t) => ({ id: t.id, x: t.x, y: t.y, hp: t.hp, maxHp: t.maxHp })),
    rocks: [...rocks.values()]
      .filter((r) => r.alive)
      .map((r) => ({ id: r.id, x: r.x, y: r.y, hp: r.hp, maxHp: r.maxHp })),
    fires: [...fires.values()].map((f) => ({ id: f.id, x: f.x, y: f.y })),
  };
}

export function getEnemy(id) {
  return enemies.get(id);
}

export function getFire(id) {
  return fires.get(id);
}

export { cheb };

export function damageEnemy(id, attackerId) {
  const e = enemies.get(id);
  if (!e || !e.alive) return null;
  e.hp -= PLAYER_DMG;
  if (e.hp <= 0) {
    e.hp = 0;
    e.alive = false;
    e.respawnAt = Date.now() + ENEMY_RESPAWN_MS;
    return { killed: true, enemy: e, dealt: PLAYER_DMG, retaliate: 0, drops: dropItemsFor(e, attackerId) };
  }
  return { killed: false, enemy: e, dealt: PLAYER_DMG, retaliate: ENEMY_STATS[e.type].dmg };
}

// Drop each of the enemy's items onto a separate free tile (skips any with no free tile).
function dropItemsFor(e, ownerId) {
  const out = [];
  for (const name of ENEMY_STATS[e.type].drops || []) {
    const tile = freeTileAround(e);
    if (!tile) continue;
    const id = "d" + dropSeq++;
    const it = { id, item: name, x: tile[0], y: tile[1], ownerId, droppedAt: Date.now(), public: false };
    drops.set(id, it); // added to the map, so the next item picks a different tile
    out.push(view(it));
  }
  return out;
}

function freeTileAround(e) {
  const around = [
    [e.x + 1, e.y], [e.x - 1, e.y], [e.x, e.y + 1], [e.x, e.y - 1],
    [e.x + 1, e.y + 1], [e.x - 1, e.y - 1], [e.x + 1, e.y - 1], [e.x - 1, e.y + 1],
  ];
  for (const [x, y] of around) if (tileFree(x, y)) return [x, y];
  return null;
}

function tileFree(x, y) {
  if (x < 20 || x > 28 || y < 1 || y > 20) return false;
  for (const e of enemies.values()) if (e.alive && e.x === x && e.y === y) return false;
  for (const it of drops.values()) if (it.x === x && it.y === y) return false;
  return true;
}

export function pickupItem(itemId, px, py, viewerId) {
  const g = globals.get(itemId);
  if (g) {
    if (!g.available || cheb(g, px, py) > 1) return null;
    g.available = false;
    g.respawnAt = Date.now() + GLOBAL_RESPAWN_MS;
    return { id: g.id, item: g.item };
  }
  const d = drops.get(itemId);
  if (d) {
    const age = Date.now() - d.droppedAt;
    const visible = age < DROP_PRIVATE_MS ? d.ownerId === viewerId : age < DROP_PUBLIC_MS;
    if (!visible || cheb(d, px, py) > 1) return null;
    drops.delete(itemId);
    return { id: d.id, item: d.item };
  }
  return null;
}

// Chop a tree the player is next to (like combat, but the tree doesn't hit back).
// `dmg` is the hatchet's damage. Returns { id, felled, hp, dmg } or null.
export function chopTree(treeId, px, py, dmg) {
  const t = trees.get(treeId);
  if (!t || !t.alive || cheb(t, px, py) > 1) return null;
  t.hp -= dmg;
  if (t.hp <= 0) {
    t.hp = 0;
    t.alive = false;
    t.respawnAt = Date.now() + TREE_RESPAWN_MS;
    return { id: t.id, felled: true, hp: 0, dmg };
  }
  return { id: t.id, felled: false, hp: t.hp, dmg };
}

// Mine a rock the player is next to (like chopping). Returns { id, felled, hp, dmg } or null.
export function mineRock(rockId, px, py, dmg) {
  const r = rocks.get(rockId);
  if (!r || !r.alive || cheb(r, px, py) > 1) return null;
  r.hp -= dmg;
  if (r.hp <= 0) {
    r.hp = 0;
    r.alive = false;
    r.respawnAt = Date.now() + ROCK_RESPAWN_MS;
    return { id: r.id, felled: true, hp: 0, dmg };
  }
  return { id: r.id, felled: false, hp: r.hp, dmg };
}

export function lightFire(x, y) {
  const id = "f" + fireSeq++;
  fires.set(id, { id, x, y, expiresAt: Date.now() + FIRE_MS });
  return { id, x, y };
}

export function worldTick() {
  const now = Date.now();
  const enemySpawns = [];
  for (const e of enemies.values()) {
    if (!e.alive && now >= e.respawnAt) {
      e.alive = true;
      e.hp = e.maxHp;
      e.x = e.homeX;
      e.y = e.homeY;
      enemySpawns.push({ id: e.id, type: e.type, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp });
    }
  }
  const itemSpawns = [];
  const itemGone = [];
  for (const g of globals.values()) {
    if (!g.available && now >= g.respawnAt) {
      g.available = true;
      itemSpawns.push(view(g));
    }
  }
  for (const d of drops.values()) {
    const age = now - d.droppedAt;
    if (age >= DROP_PUBLIC_MS) {
      drops.delete(d.id);
      itemGone.push(d.id);
    } else if (age >= DROP_PRIVATE_MS && !d.public) {
      d.public = true;
      itemSpawns.push(view(d));
    }
  }
  const treeSpawns = [];
  for (const t of trees.values()) {
    if (!t.alive && now >= t.respawnAt) {
      t.alive = true;
      t.hp = t.maxHp;
      treeSpawns.push({ id: t.id, x: t.x, y: t.y, hp: t.hp, maxHp: t.maxHp });
    }
  }
  const rockSpawns = [];
  for (const r of rocks.values()) {
    if (!r.alive && now >= r.respawnAt) {
      r.alive = true;
      r.hp = r.maxHp;
      rockSpawns.push({ id: r.id, x: r.x, y: r.y, hp: r.hp, maxHp: r.maxHp });
    }
  }
  const fireGone = [];
  for (const f of fires.values()) {
    if (now >= f.expiresAt) {
      fires.delete(f.id);
      fireGone.push(f.id);
    }
  }
  return { enemySpawns, itemSpawns, itemGone, treeSpawns, rockSpawns, fireGone };
}
