import { Router } from "express";

import { authMiddleware } from "../auth/jwt.js";
import { pool } from "../db.js";
import { levelFromXp } from "../skills.js";
import { SPAWN } from "../world.js";
import { validateCode } from "../services/validator.js";

const router = Router();

const DEFAULT_CHARGES = 50;
const MAX_TIER = 4;
export const VALID_ACTIONS = new Set([
  "move_left",
  "move_right",
  "move_up",
  "move_down",
  "attack",
  "equip",
  "use",
  "pick_up",
  "chop",
  "cook",
  "eat",
  "mine",
]);

// Coding XP per action: { first = on initial unlock, recharge = on every recode }.
const CODING_XP = {
  move_right: { first: 50, recharge: 5 },
  move_left: { first: 50, recharge: 5 },
  move_up: { first: 50, recharge: 5 },
  move_down: { first: 50, recharge: 5 },
  attack: { first: 100, recharge: 10 },
  equip: { first: 80, recharge: 8 },
  use: { first: 120, recharge: 12 },
  pick_up: { first: 70, recharge: 7 },
  chop: { first: 60, recharge: 6 },
  cook: { first: 80, recharge: 8 },
  eat: { first: 60, recharge: 6 },
  mine: { first: 60, recharge: 6 },
};

// POST /api/validate-code  { action_name, code }
// On valid: reset charges, bump tier, AND award Coding XP (first-code vs recharge).
router.post("/validate-code", authMiddleware, async (req, res) => {
  const { action_name, code } = req.body || {};
  if (!VALID_ACTIONS.has(action_name)) {
    return res.status(400).json({ valid: false, feedback: "Unknown action." });
  }

  let result;
  try {
    result = await validateCode(action_name, (code || "").trim());
  } catch (e) {
    return res
      .status(502)
      .json({ valid: false, feedback: "The code checker is unavailable right now -- try again." });
  }
  if (!result.valid) {
    return res.json(result);
  }

  const userId = req.user.id;

  // First unlock or a recharge? Decides which Coding XP value applies.
  const [[existing]] = await pool.execute(
    `SELECT id FROM action_progress WHERE user_id = :uid AND action_name = :action`,
    { uid: userId, action: action_name },
  );
  const isFirst = !existing;

  await pool.execute(
    `INSERT INTO action_progress (user_id, action_name, tier, charges_remaining, times_coded)
       VALUES (:uid, :action, 1, :charges, 1)
     ON DUPLICATE KEY UPDATE
       charges_remaining = :charges,
       times_coded       = times_coded + 1,
       tier              = LEAST(tier + 1, :maxtier)`,
    { uid: userId, action: action_name, charges: DEFAULT_CHARGES, maxtier: MAX_TIER },
  );

  // Award Coding XP (ensure the player_state row exists first).
  const xpTable = CODING_XP[action_name] || { first: 10, recharge: 1 };
  const gain = isFirst ? xpTable.first : xpTable.recharge;
  await pool.execute(
    `INSERT IGNORE INTO player_state (user_id, x, y, current_map) VALUES (:uid, :x, :y, :map)`,
    { uid: userId, x: SPAWN.x, y: SPAWN.y, map: SPAWN.map },
  );
  const [[ps]] = await pool.execute(
    `SELECT coding_xp FROM player_state WHERE user_id = :uid`,
    { uid: userId },
  );
  const oldLevel = levelFromXp(ps.coding_xp);
  const newCodingXp = Number(ps.coding_xp) + gain;
  await pool.execute(`UPDATE player_state SET coding_xp = :c WHERE user_id = :uid`, {
    c: newCodingXp,
    uid: userId,
  });
  const newLevel = levelFromXp(newCodingXp);

  const [[progress]] = await pool.execute(
    `SELECT action_name, tier, charges_remaining, times_coded, bound_key
       FROM action_progress WHERE user_id = :uid AND action_name = :action`,
    { uid: userId, action: action_name },
  );

  res.json({
    valid: true,
    feedback: result.feedback,
    progress,
    coding: { xp: newCodingXp, level: newLevel, gained: gain, leveledUp: newLevel > oldLevel },
  });
});

export default router;
