import { Router } from "express";

import { authMiddleware } from "../auth/jwt.js";
import { pool } from "../db.js";
import { SPAWN } from "../world.js";
import { levelFromXp, maxHealthForCombat } from "../skills.js";
import { VALID_ACTIONS } from "./validate.js";

const router = Router();

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isInteger(v) ? v : 0));
const XP_PER_DAMAGE = 10;

// GET /api/state -- full snapshot of the signed-in player's progress.
router.get("/state", authMiddleware, async (req, res) => {
  const uid = req.user.id;

  const [[ps]] = await pool.execute(
    `SELECT x, y, current_map, health, combat_xp, survival_xp, coding_xp
       FROM player_state WHERE user_id = :uid`,
    { uid },
  );
  const [actions] = await pool.execute(
    `SELECT action_name, tier, charges_remaining, times_coded, bound_key
       FROM action_progress WHERE user_id = :uid`,
    { uid },
  );
  const [inventory] = await pool.execute(
    `SELECT item_name, quantity FROM inventory WHERE user_id = :uid`,
    { uid },
  );
  const [quests] = await pool.execute(
    `SELECT quest_key FROM player_quests WHERE user_id = :uid`,
    { uid },
  );

  const combatXp = ps ? Number(ps.combat_xp) : 0;
  const survivalXp = ps ? Number(ps.survival_xp) : 0;
  const codingXp = ps ? Number(ps.coding_xp) : 0;
  const combatLevel = levelFromXp(combatXp);
  const maxHealth = maxHealthForCombat(combatLevel);

  res.json({
    user: {
      id: req.user.id,
      display_name: req.user.display_name,
      is_teacher: !!req.user.is_teacher,
    },
    state: ps
      ? { x: ps.x, y: ps.y, current_map: ps.current_map, health: ps.health }
      : { x: SPAWN.x, y: SPAWN.y, current_map: SPAWN.map, health: maxHealth },
    maxHealth,
    skills: {
      combat: { xp: combatXp, level: combatLevel },
      survival: { xp: survivalXp, level: levelFromXp(survivalXp) },
      coding: { xp: codingXp, level: levelFromXp(codingXp) },
    },
    actions,
    inventory,
    quests_done: quests.map((q) => q.quest_key),
  });
});

// POST /api/quest/complete { quest_key } -- one-time quest reward (server-defined).
const QUEST_REWARDS = { lumberjack: { survival: 100 } };
router.post("/quest/complete", authMiddleware, async (req, res) => {
  const { quest_key } = req.body || {};
  const reward = QUEST_REWARDS[quest_key];
  if (!reward) return res.status(400).json({ error: "unknown_quest" });
  const uid = req.user.id;

  const [r] = await pool.execute(
    `INSERT IGNORE INTO player_quests (user_id, quest_key) VALUES (:uid, :q)`,
    { uid, q: quest_key },
  );
  if (r.affectedRows === 0) return res.json({ granted: false }); // already completed

  await pool.execute(
    `INSERT IGNORE INTO player_state (user_id, x, y, current_map) VALUES (:uid, :x, :y, :map)`,
    { uid, x: SPAWN.x, y: SPAWN.y, map: SPAWN.map },
  );
  const [[ps]] = await pool.execute(`SELECT survival_xp FROM player_state WHERE user_id = :uid`, { uid });
  const newXp = Number(ps.survival_xp) + (reward.survival || 0);
  await pool.execute(`UPDATE player_state SET survival_xp = :s WHERE user_id = :uid`, { s: newXp, uid });

  res.json({
    granted: true,
    reward,
    skills: { survival: { xp: newXp, level: levelFromXp(newXp) } },
  });
});

// POST /api/combat/exchange { enemy_type, damage_dealt, damage_taken, killed }
// One turn of combat: award XP (Combat for damage dealt, Survival for damage taken),
// apply damage to the player's persisted health, and log a kill. Returns the new state.
router.post("/combat/exchange", authMiddleware, async (req, res) => {
  const { enemy_type, damage_dealt, damage_taken, killed } = req.body || {};
  if (!ENEMIES.has(enemy_type)) return res.status(400).json({ error: "unknown_enemy" });
  const dealt = clampInt(damage_dealt, 0, 1000);
  const taken = clampInt(damage_taken, 0, 1000);
  const uid = req.user.id;

  // Make sure a row exists (normally created on WebSocket connect).
  await pool.execute(
    `INSERT IGNORE INTO player_state (user_id, x, y, current_map, health)
       VALUES (:uid, :x, :y, :map, 10)`,
    { uid, x: SPAWN.x, y: SPAWN.y, map: SPAWN.map },
  );

  const [[ps]] = await pool.execute(
    `SELECT health, combat_xp, survival_xp FROM player_state WHERE user_id = :uid`,
    { uid },
  );
  // Combat XP from damage dealt. Survival earns nothing from combat (it's a gathering
  // skill — woodcutting/firemaking etc. come later).
  const oldCombatLevel = levelFromXp(ps.combat_xp);
  const newCombatXp = Number(ps.combat_xp) + dealt * XP_PER_DAMAGE;
  const newCombatLevel = levelFromXp(newCombatXp);
  const maxHealth = maxHealthForCombat(newCombatLevel);

  // Take the hit; if Combat levelled up, also heal by the max-HP gained.
  let newHealth = ps.health - taken;
  if (newCombatLevel > oldCombatLevel) {
    newHealth += maxHealth - maxHealthForCombat(oldCombatLevel);
  }
  newHealth = Math.max(0, Math.min(maxHealth, newHealth));

  await pool.execute(
    `UPDATE player_state SET health = :h, combat_xp = :c WHERE user_id = :uid`,
    { h: newHealth, c: newCombatXp, uid },
  );
  if (killed) {
    await pool.execute(
      `INSERT INTO combat_log (user_id, enemy_type, outcome, auto_resolved)
         VALUES (:uid, :enemy, 'win', 0)`,
      { uid, enemy: enemy_type },
    );
  }

  res.json({
    health: newHealth,
    maxHealth,
    skills: {
      combat: { xp: newCombatXp, level: newCombatLevel },
      survival: { xp: Number(ps.survival_xp), level: levelFromXp(ps.survival_xp) },
    },
  });
});

// POST /api/respawn -- restore full health and return to the town spawn.
router.post("/respawn", authMiddleware, async (req, res) => {
  const uid = req.user.id;
  const [[ps]] = await pool.execute(
    `SELECT combat_xp FROM player_state WHERE user_id = :uid`,
    { uid },
  );
  const maxHealth = maxHealthForCombat(levelFromXp(ps ? ps.combat_xp : 0));
  await pool.execute(
    `UPDATE player_state SET health = :h, x = :x, y = :y, current_map = :map WHERE user_id = :uid`,
    { h: maxHealth, x: SPAWN.x, y: SPAWN.y, map: SPAWN.map, uid },
  );
  res.json({ health: maxHealth, maxHealth, state: { x: SPAWN.x, y: SPAWN.y, current_map: SPAWN.map } });
});

// POST /api/consume  { action_name, count } -- spend charges (called as the player acts).
// Decrements charges (floored at 0) and tracks lifetime consumption for high scores.
// The frontend batches several uses into one call to spare the DB.
router.post("/consume", authMiddleware, async (req, res) => {
  const { action_name, count } = req.body || {};
  if (!VALID_ACTIONS.has(action_name)) {
    return res.status(400).json({ error: "unknown_action" });
  }
  const n = Number.isInteger(count) ? count : 1;
  if (n < 1 || n > 1000) return res.status(400).json({ error: "invalid_count" });

  const [result] = await pool.execute(
    `UPDATE action_progress
       SET charges_remaining = GREATEST(charges_remaining - :n, 0)
     WHERE user_id = :uid AND action_name = :action`,
    { n, uid: req.user.id, action: action_name },
  );
  if (result.affectedRows === 0) {
    return res.status(409).json({ error: "action_not_unlocked" });
  }
  await pool.execute(
    `UPDATE users SET total_charges_consumed = total_charges_consumed + :n WHERE id = :uid`,
    { n, uid: req.user.id },
  );

  const [[row]] = await pool.execute(
    `SELECT charges_remaining FROM action_progress WHERE user_id = :uid AND action_name = :action`,
    { uid: req.user.id, action: action_name },
  );
  res.json({
    action_name,
    charges_remaining: row.charges_remaining,
    locked: row.charges_remaining === 0,
  });
});

// GET /api/highscores -- single leaderboard ranked by total level (Combat + Survival).
router.get("/highscores", authMiddleware, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.display_name, ps.combat_xp, ps.survival_xp, ps.coding_xp
       FROM users u JOIN player_state ps ON ps.user_id = u.id`,
  );
  const leaderboard = rows
    .map((r) => {
      const combat = levelFromXp(r.combat_xp);
      const survival = levelFromXp(r.survival_xp);
      const coding = levelFromXp(r.coding_xp);
      return {
        display_name: r.display_name,
        combat_level: combat,
        survival_level: survival,
        coding_level: coding,
        total_level: combat + survival + coding,
      };
    })
    .sort((a, b) => b.total_level - a.total_level || a.display_name.localeCompare(b.display_name))
    .slice(0, 10);

  res.json({ leaderboard });
});

// POST /api/bind-key  { action_name, key } -- bind a coded action to a keyboard key.
router.post("/bind-key", authMiddleware, async (req, res) => {
  const { action_name, key } = req.body || {};
  if (!VALID_ACTIONS.has(action_name)) {
    return res.status(400).json({ error: "unknown_action" });
  }
  if (typeof key !== "string" || key.length < 1 || key.length > 16) {
    return res.status(400).json({ error: "invalid_key" });
  }

  // A key maps to one action only: clear it from anything else that had it first.
  await pool.execute(
    `UPDATE action_progress SET bound_key = NULL WHERE user_id = :uid AND bound_key = :key`,
    { uid: req.user.id, key },
  );
  const [result] = await pool.execute(
    `UPDATE action_progress SET bound_key = :key
       WHERE user_id = :uid AND action_name = :action`,
    { key, uid: req.user.id, action: action_name },
  );
  if (result.affectedRows === 0) {
    return res.status(409).json({ error: "action_not_unlocked" });
  }
  res.json({ ok: true, action_name, bound_key: key });
});

// POST /api/combat  { enemy_type, outcome, auto_resolved } -- record a fight result.
const ENEMIES = new Set(["sheep", "cow"]);
router.post("/combat", authMiddleware, async (req, res) => {
  const { enemy_type, outcome, auto_resolved } = req.body || {};
  if (!ENEMIES.has(enemy_type)) {
    return res.status(400).json({ error: "unknown_enemy" });
  }
  const out = outcome === "loss" ? "loss" : "win";
  await pool.execute(
    `INSERT INTO combat_log (user_id, enemy_type, outcome, auto_resolved)
       VALUES (:uid, :enemy, :outcome, :auto)`,
    { uid: req.user.id, enemy: enemy_type, outcome: out, auto: auto_resolved ? 1 : 0 },
  );
  res.json({ ok: true, enemy_type, outcome: out });
});

export default router;
