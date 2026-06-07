import { WebSocketServer } from "ws";

import { verifyToken, upsertUser } from "../auth/jwt.js";
import { pool } from "../db.js";
import { SPAWN } from "../world.js";
import { levelFromXp, maxHealthForCombat } from "../skills.js";
import { GAME_DATA } from "../data/gameData.js";
import {
  worldSnapshot,
  getEnemy,
  damageEnemy,
  pickupItem,
  chopTree,
  mineRock,
  lightFire,
  getFire,
  cheb,
  worldTick,
} from "../gameworld.js";

const HATCHET_DMG = 1; // damage per chop with a normal hatchet
const WOODCUT_XP_PER_DMG = 10; // Survival XP per point of chop damage (mirrors combat)
const PICKAXE_DMG = 1; // damage per mine with a normal pickaxe
const MINE_XP_PER_DMG = 15; // Survival XP per point of mining damage
const FIRE_XP = 40;
const COOK_XP = 30;
const EAT_HEAL = 5;
const EDIBLE = new Set(["beef"]);

// In-memory presence: userId -> { ws, x, y, name, totalLevel }
const players = new Map();

const XP_PER_DAMAGE = 10;

export function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const token = url.searchParams.get("token");
      if (!token) return ws.close(4001, "missing_token");

      const claims = verifyToken(token);
      const user = await upsertUser(claims);
      ws.userId = user.id;

      // Ensure a row exists, then load it.
      await pool.execute(
        `INSERT IGNORE INTO player_state (user_id, x, y, current_map) VALUES (:uid, :x, :y, :map)`,
        { uid: user.id, x: SPAWN.x, y: SPAWN.y, map: SPAWN.map },
      );
      const [[ps]] = await pool.execute(
        `SELECT x, y, current_map, health, combat_xp, survival_xp, coding_xp
           FROM player_state WHERE user_id = :uid`,
        { uid: user.id },
      );
      const totalLevel = totalLevelOf(ps);

      players.set(user.id, {
        ws,
        x: ps.x,
        y: ps.y,
        name: user.display_name,
        totalLevel,
      });

      ws.send(
        JSON.stringify({
          type: "welcome",
          self: { id: user.id, name: user.display_name, x: ps.x, y: ps.y, total_level: totalLevel },
          players: snapshot(user.id),
          world: worldSnapshot(user.id),
        }),
      );
      broadcast(
        { type: "join", player: { id: user.id, name: user.display_name, x: ps.x, y: ps.y, total_level: totalLevel } },
        user.id,
      );

      ws.on("message", (data) => handleMessage(ws, data));
      ws.on("close", () => handleClose(ws));
    } catch (e) {
      ws.close(4001, "auth_failed");
    }
  });

  // World maintenance loop: enemy respawns, global item respawns, drops going public
  // or despawning.
  setInterval(() => {
    const { enemySpawns, itemSpawns, itemGone, treeSpawns, rockSpawns, fireGone } = worldTick();
    for (const e of enemySpawns) broadcastAll({ type: "enemy:spawn", enemy: e });
    for (const it of itemSpawns) broadcastAll({ type: "item:spawn", item: it });
    for (const id of itemGone) broadcastAll({ type: "item:gone", id });
    for (const t of treeSpawns) broadcastAll({ type: "tree:spawn", tree: t });
    for (const r of rockSpawns) broadcastAll({ type: "rock:spawn", rock: r });
    for (const id of fireGone) broadcastAll({ type: "fire:gone", id });
  }, 1000);

  return wss;
}

function totalLevelOf(ps) {
  return (
    levelFromXp(ps.combat_xp) + levelFromXp(ps.survival_xp) + levelFromXp(ps.coding_xp)
  );
}

function handleMessage(ws, data) {
  let msg;
  try {
    msg = JSON.parse(data);
  } catch {
    return;
  }
  if (msg.type === "move") return handleMove(ws, msg);
  if (msg.type === "attack") return handleAttack(ws, msg.enemyId);
  if (msg.type === "pickup") return handlePickup(ws, msg.itemId);
  if (msg.type === "chop") return handleChop(ws, msg.treeId);
  if (msg.type === "mine") return handleMine(ws, msg.rockId);
  if (msg.type === "use") return handleUse(ws, msg.a, msg.b);
  if (msg.type === "cook") return handleCook(ws, msg.fireId);
  if (msg.type === "eat") return handleEat(ws, msg.item);
  if (msg.type === "sell") return handleSell(ws, msg.item);
  if (msg.type === "buy") return handleBuy(ws, msg.item);
}

function handleMove(ws, msg) {
  const p = players.get(ws.userId);
  if (!p) return;
  if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
  p.x = msg.x;
  p.y = msg.y;
  broadcast({ type: "pos", id: ws.userId, x: p.x, y: p.y }, ws.userId);
}

// Server-authoritative combat: enemy HP is shared; the attacker's XP/health are
// resolved and persisted here, then the result is sent back privately.
async function handleAttack(ws, enemyId) {
  const p = players.get(ws.userId);
  if (!p) return;
  const e = getEnemy(enemyId);
  if (!e || !e.alive) return;
  if (Math.abs(e.x - p.x) + Math.abs(e.y - p.y) !== 1) return; // must be adjacent

  const res = damageEnemy(enemyId, ws.userId);
  if (!res) return;

  const [[ps]] = await pool.execute(
    `SELECT health, combat_xp, survival_xp, coding_xp FROM player_state WHERE user_id = :uid`,
    { uid: ws.userId },
  );
  const oldCombatLevel = levelFromXp(ps.combat_xp);
  const newCombatXp = Number(ps.combat_xp) + res.dealt * XP_PER_DAMAGE;
  const newCombatLevel = levelFromXp(newCombatXp);
  const maxHealth = maxHealthForCombat(newCombatLevel);

  let health = ps.health;
  if (newCombatLevel > oldCombatLevel) health += maxHealth - maxHealthForCombat(oldCombatLevel);
  if (!res.killed) health -= res.retaliate;

  let respawn = null;
  if (health <= 0) {
    health = maxHealth;
    p.x = SPAWN.x;
    p.y = SPAWN.y;
    await pool.execute(
      `UPDATE player_state SET health = :h, combat_xp = :c, x = :x, y = :y, current_map = :map
         WHERE user_id = :uid`,
      { h: health, c: newCombatXp, x: SPAWN.x, y: SPAWN.y, map: SPAWN.map, uid: ws.userId },
    );
    respawn = { x: SPAWN.x, y: SPAWN.y };
  } else {
    health = Math.min(maxHealth, health);
    await pool.execute(`UPDATE player_state SET health = :h, combat_xp = :c WHERE user_id = :uid`, {
      h: health,
      c: newCombatXp,
      uid: ws.userId,
    });
  }

  // Shared enemy update to everyone.
  if (res.killed) {
    broadcastAll({ type: "enemy:dead", id: e.id });
    // Only the killer sees the drops for the first 30s; worldTick makes them public later.
    for (const d of res.drops) send(ws, { type: "item:spawn", item: d });
  } else {
    broadcastAll({ type: "enemy:hp", id: e.id, hp: e.hp });
  }

  // Update this player's total level for others' labels if it changed.
  const newTotal = newCombatLevel + levelFromXp(ps.survival_xp) + levelFromXp(ps.coding_xp);
  if (newTotal !== p.totalLevel) {
    p.totalLevel = newTotal;
    broadcastAll({ type: "player:level", id: ws.userId, total_level: newTotal });
  }
  if (respawn) broadcast({ type: "pos", id: ws.userId, x: respawn.x, y: respawn.y }, ws.userId);

  // Private result for the attacker.
  send(ws, {
    type: "you",
    health,
    maxHealth,
    skills: { combat: { xp: newCombatXp, level: newCombatLevel } },
    killed: res.killed,
    enemyType: e.type,
    respawn,
  });
}

async function handlePickup(ws, itemId) {
  const p = players.get(ws.userId);
  if (!p) return;

  const it = pickupItem(itemId, p.x, p.y, ws.userId);
  if (!it) return;

  const itemDef = GAME_DATA.items[it.item];
  const stackable = itemDef?.stackable === true;

  if (stackable) {
    await pool.execute(
      `INSERT INTO inventory (user_id, item_name, quantity)
       VALUES (:uid, :item, 1)
       ON DUPLICATE KEY UPDATE quantity = quantity + 1`,
      { uid: ws.userId, item: it.item }
    );
  } else {
    await pool.execute(
      `INSERT INTO inventory (user_id, item_name, quantity)
       VALUES (:uid, :item, 1)`,
      { uid: ws.userId, item: it.item }
    );
  }

  broadcastAll({ type: "item:gone", id: it.id });
  await sendInventory(ws);
  send(ws, { type: "notice", text: `Picked up ${it.item}.` });
}

// Woodcutting: need a hatchet, be next to the tree. Trees have HP and take hatchet
// damage per chop (XP per hit, like combat); felling yields a log.
async function handleChop(ws, treeId) {
  const p = players.get(ws.userId);
  if (!p) return;
  const [[hatchet]] = await pool.execute(
    `SELECT quantity FROM inventory WHERE user_id = :uid AND item_name = 'hatchet'`,
    { uid: ws.userId },
  );
  if (!hatchet || hatchet.quantity < 1) {
    return send(ws, { type: "notice", text: "You need a hatchet to chop trees." });
  }
  const res = chopTree(treeId, p.x, p.y, HATCHET_DMG);
  if (!res) return;

  await bumpSurvival(ws, res.dmg * WOODCUT_XP_PER_DMG);
  if (res.felled) {
    broadcastAll({ type: "tree:gone", id: res.id });
    await pool.execute(
      `INSERT INTO inventory (user_id, item_name, quantity) VALUES (:uid, 'log', 1)
         ON DUPLICATE KEY UPDATE quantity = quantity + 1`,
      { uid: ws.userId },
    );
    await sendInventory(ws);
    send(ws, { type: "notice", text: "You chop down the tree and collect a log!" });
    send(ws, { type: "chop:result", felled: true });
  } else {
    broadcastAll({ type: "tree:hp", id: res.id, hp: res.hp });
    send(ws, { type: "chop:result", felled: false });
  }
}

// Mining: need a pickaxe, be next to the rock. Rocks have HP and take pickaxe damage
// per hit (Survival XP per hit); mining out yields ore.
async function handleMine(ws, rockId) {
  const p = players.get(ws.userId);
  if (!p) return;
  const [[pick]] = await pool.execute(
    `SELECT quantity FROM inventory WHERE user_id = :uid AND item_name = 'pickaxe'`,
    { uid: ws.userId },
  );
  if (!pick || pick.quantity < 1) {
    return send(ws, { type: "notice", text: "You need a pickaxe to mine." });
  }
  const res = mineRock(rockId, p.x, p.y, PICKAXE_DMG);
  if (!res) return;

  await bumpSurvival(ws, res.dmg * MINE_XP_PER_DMG);
  if (res.felled) {
    broadcastAll({ type: "rock:gone", id: res.id });
    await pool.execute(
      `INSERT INTO inventory (user_id, item_name, quantity) VALUES (:uid, 'ore', 1)
         ON DUPLICATE KEY UPDATE quantity = quantity + 1`,
      { uid: ws.userId },
    );
    await sendInventory(ws);
    send(ws, { type: "notice", text: "You mine out some ore!" });
  } else {
    broadcastAll({ type: "rock:hp", id: res.id, hp: res.hp });
  }
}

// Use one item on another (from the inventory). Only known combinations do something;
// a Use charge is spent by the client only when the result is ok.
async function handleUse(ws, a, b) {
  const p = players.get(ws.userId);
  if (!p) return;
  const combo = new Set([a, b]);

  // tinderbox + log -> fire (firemaking)
  if (combo.has("tinderbox") && combo.has("log")) {
    const [[tinder]] = await pool.execute(
      `SELECT quantity FROM inventory WHERE user_id = :uid AND item_name = 'tinderbox'`,
      { uid: ws.userId },
    );
    const [[log]] = await pool.execute(
      `SELECT quantity FROM inventory WHERE user_id = :uid AND item_name = 'log'`,
      { uid: ws.userId },
    );
    if (!tinder || tinder.quantity < 1 || !log || log.quantity < 1) {
      return send(ws, { type: "use:result", ok: false });
    }
    if (log.quantity <= 1) {
      await pool.execute(`DELETE FROM inventory WHERE user_id = :uid AND item_name = 'log'`, { uid: ws.userId });
    } else {
      await pool.execute(
        `UPDATE inventory SET quantity = quantity - 1 WHERE user_id = :uid AND item_name = 'log'`,
        { uid: ws.userId },
      );
    }
    broadcastAll({ type: "fire:spawn", fire: lightFire(p.x, p.y) });
    await sendInventory(ws);
    await bumpSurvival(ws, FIRE_XP);
    send(ws, { type: "notice", text: `You light a fire. +${FIRE_XP} Survival XP` });
    return send(ws, { type: "use:result", ok: true, effect: "fire" });
  }

  // No known interaction.
  send(ws, { type: "notice", text: "Nothing interesting happens." });
  send(ws, { type: "use:result", ok: false });
}

// Cooking: raw beef on a fire you're next to -> beef + Survival XP. (cook action)
async function handleCook(ws, fireId) {
  const p = players.get(ws.userId);
  if (!p) return;
  const fire = getFire(fireId);
  if (!fire || cheb(fire, p.x, p.y) > 1) return send(ws, { type: "cook:result", ok: false });

  const [[raw]] = await pool.execute(
    `SELECT quantity FROM inventory WHERE user_id = :uid AND item_name = 'raw beef'`,
    { uid: ws.userId },
  );
  if (!raw || raw.quantity < 1) return send(ws, { type: "cook:result", ok: false });

  // Cook exactly one.
  if (raw.quantity <= 1) {
    await pool.execute(`DELETE FROM inventory WHERE user_id = :uid AND item_name = 'raw beef'`, { uid: ws.userId });
  } else {
    await pool.execute(
      `UPDATE inventory SET quantity = quantity - 1 WHERE user_id = :uid AND item_name = 'raw beef'`,
      { uid: ws.userId },
    );
  }
  await pool.execute(
    `INSERT INTO inventory (user_id, item_name, quantity) VALUES (:uid, 'beef', 1)
       ON DUPLICATE KEY UPDATE quantity = quantity + 1`,
    { uid: ws.userId },
  );
  await sendInventory(ws);
  await bumpSurvival(ws, COOK_XP);
  send(ws, { type: "notice", text: `You cook a beef. +${COOK_XP} Survival XP` });
  send(ws, { type: "cook:result", ok: true });
}

// Eating: consume one edible item -> restore EAT_HEAL HP (capped). (eat action)
async function handleEat(ws, item) {
  const p = players.get(ws.userId);
  if (!p) return;
  if (!EDIBLE.has(item)) return send(ws, { type: "eat:result", ok: false });

  const [[inv]] = await pool.execute(
    `SELECT quantity FROM inventory WHERE user_id = :uid AND item_name = :item`,
    { uid: ws.userId, item },
  );
  if (!inv || inv.quantity < 1) return send(ws, { type: "eat:result", ok: false });

  const [[ps]] = await pool.execute(
    `SELECT health, combat_xp FROM player_state WHERE user_id = :uid`,
    { uid: ws.userId },
  );
  const maxHealth = maxHealthForCombat(levelFromXp(ps.combat_xp));
  if (ps.health >= maxHealth) {
    send(ws, { type: "notice", text: "You're already at full health." });
    return send(ws, { type: "eat:result", ok: false });
  }

  if (inv.quantity <= 1) {
    await pool.execute(`DELETE FROM inventory WHERE user_id = :uid AND item_name = :item`, { uid: ws.userId, item });
  } else {
    await pool.execute(
      `UPDATE inventory SET quantity = quantity - 1 WHERE user_id = :uid AND item_name = :item`,
      { uid: ws.userId, item },
    );
  }
  const newHealth = Math.min(maxHealth, ps.health + EAT_HEAL);
  await pool.execute(`UPDATE player_state SET health = :h WHERE user_id = :uid`, { h: newHealth, uid: ws.userId });
  await sendInventory(ws);
  send(ws, { type: "you", health: newHealth, maxHealth });
  send(ws, { type: "notice", text: `You eat the ${item}. +${EAT_HEAL} HP` });
  send(ws, { type: "eat:result", ok: true });
}

// Sell one of an item to the shopkeeper for coins (no action/charge needed).
async function handleSell(ws, item) {
  const itemDef = GAME_DATA.items[item];
  if (!itemDef || itemDef.sellPrice == null) {
    return send(ws, {
      type: "notice",
      text: "The shopkeeper won't buy that.",
    });
  }

  const shop = GAME_DATA.shops.shopkeeper;
  const price = Math.round(itemDef.sellPrice * shop.sellMultiplier);

  const [[inv]] = await pool.execute(
    `SELECT id, quantity FROM inventory WHERE user_id = :uid AND item_name = :item LIMIT 1`,
    { uid: ws.userId, item }
  );

  if (!inv || inv.quantity < 1) return;

  const stackable = itemDef?.stackable === true;

  if (stackable) {
    await pool.execute(
      `UPDATE inventory
       SET quantity = quantity - 1
       WHERE user_id = :uid AND item_name = :item AND quantity > 0`,
      { uid: ws.userId, item }
    );

    await pool.execute(
      `DELETE FROM inventory
       WHERE user_id = :uid AND item_name = :item AND quantity <= 0`,
      { uid: ws.userId, item }
    );
  } else {
    await pool.execute(
      `DELETE FROM inventory WHERE id = :id`,
      { id: inv.id }
    );
  }

  // Give coins (always stackable)
  await pool.execute(
    `INSERT INTO inventory (user_id, item_name, quantity)
     VALUES (:uid, 'coins', :p)
     ON DUPLICATE KEY UPDATE quantity = quantity + :p`,
    { uid: ws.userId, p: price }
  );

  await sendInventory(ws);

  send(ws, {
    type: "notice",
    text: `Sold ${item} for ${price} coin${price === 1 ? "" : "s"}.`,
  });
}

// Buy one of a shop item for coins.
async function handleBuy(ws, item) {
  const shop = GAME_DATA.shops.shopkeeper;
  if (!shop.stock.includes(item)) return;

  const itemDef = GAME_DATA.items[item];
  const cost = Math.round(itemDef.price * shop.buyMultiplier);
  const [[c]] = await pool.execute(
    `SELECT quantity FROM inventory WHERE user_id = :uid AND item_name = 'coins'`,
    { uid: ws.userId },
  );
  if (!c || c.quantity < cost) {
    return send(ws, { type: "notice", text: `Not enough coins — ${item} costs ${cost}.` });
  }
  if (c.quantity - cost <= 0) {
    await pool.execute(`DELETE FROM inventory WHERE user_id = :uid AND item_name = 'coins'`, { uid: ws.userId });
  } else {
    await pool.execute(
      `UPDATE inventory SET quantity = quantity - :cost WHERE user_id = :uid AND item_name = 'coins'`,
      { cost, uid: ws.userId },
    );
  }
  await pool.execute(
    `INSERT INTO inventory (user_id, item_name, quantity) VALUES (:uid, :item, 1)
       ON DUPLICATE KEY UPDATE quantity = quantity + 1`,
    { uid: ws.userId, item },
  );
  await sendInventory(ws);
  send(ws, { type: "notice", text: `Bought ${item} for ${cost} coin${cost === 1 ? "" : "s"}.` });
}

async function sendInventory(ws) {
  const [rows] = await pool.execute(
    `SELECT item_name, quantity FROM inventory WHERE user_id = :uid`,
    { uid: ws.userId }
  );

  const items = [];

  for (const r of rows) {
    const itemDef = GAME_DATA.items[r.item_name];
    const stackable = itemDef?.stackable === true;

    if (stackable) {
      items.push({
        item_name: r.item_name,
        quantity: r.quantity
      });
    } else {
      // create ONE slot per item
      for (let i = 0; i < r.quantity; i++) {
        items.push({
          item_name: r.item_name,
          quantity: 1
        });
      }
    }
  }

  send(ws, { type: "inventory", items });
}

// Add Survival XP, tell the player, and update their broadcast total level if it changed.
async function bumpSurvival(ws, gain) {
  const [[ps]] = await pool.execute(
    `SELECT combat_xp, survival_xp, coding_xp FROM player_state WHERE user_id = :uid`,
    { uid: ws.userId },
  );
  const newSurv = Number(ps.survival_xp) + gain;
  await pool.execute(`UPDATE player_state SET survival_xp = :s WHERE user_id = :uid`, {
    s: newSurv,
    uid: ws.userId,
  });
  send(ws, { type: "you", skills: { survival: { xp: newSurv, level: levelFromXp(newSurv) } } });
  const p = players.get(ws.userId);
  const total = levelFromXp(ps.combat_xp) + levelFromXp(newSurv) + levelFromXp(ps.coding_xp);
  if (p && total !== p.totalLevel) {
    p.totalLevel = total;
    broadcastAll({ type: "player:level", id: ws.userId, total_level: total });
  }
}

async function handleClose(ws) {
  const p = players.get(ws.userId);
  if (p) {
    try {
      await pool.execute(`UPDATE player_state SET x = :x, y = :y WHERE user_id = :uid`, {
        x: p.x,
        y: p.y,
        uid: ws.userId,
      });
    } catch {
      /* best-effort */
    }
  }
  players.delete(ws.userId);
  broadcast({ type: "leave", id: ws.userId }, ws.userId);
}

function snapshot(excludeId) {
  const out = [];
  for (const [id, p] of players) {
    if (id === excludeId) continue;
    out.push({ id, name: p.name, x: p.x, y: p.y, total_level: p.totalLevel });
  }
  return out;
}

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function broadcast(obj, excludeId) {
  const data = JSON.stringify(obj);
  for (const [id, p] of players) {
    if (id === excludeId) continue;
    if (p.ws.readyState === 1) p.ws.send(data);
  }
}

function broadcastAll(obj) {
  const data = JSON.stringify(obj);
  for (const p of players.values()) if (p.ws.readyState === 1) p.ws.send(data);
}
