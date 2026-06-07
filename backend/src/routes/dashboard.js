// Teacher-only dashboard API. Every route requires an authenticated teacher
// (is_teacher is authoritative in the DB, never trusted from the token).
import { Router } from "express";

import { authMiddleware, requireTeacher } from "../auth/jwt.js";
import { pool } from "../db.js";
import { levelFromXp, maxHealthForCombat } from "../skills.js";

const router = Router();
router.use(authMiddleware, requireTeacher);

// GET /api/dashboard/pupils -- one row per pupil with summary progress.
router.get("/pupils", async (req, res) => {
  const [rows] = await pool.query(
    `SELECT
        u.id, u.display_name, u.year_group, u.last_seen_at,
        u.total_charges_consumed                        AS charges_consumed,
        COUNT(DISTINCT ap.action_name)                  AS actions_unlocked,
        COALESCE(SUM(ap.times_coded), 0)                AS commands_coded,
        (SELECT COUNT(*) FROM combat_log cl
           WHERE cl.user_id = u.id AND cl.outcome = 'win') AS enemies_defeated
     FROM users u
     LEFT JOIN action_progress ap ON ap.user_id = u.id
     WHERE u.is_teacher = 0
     GROUP BY u.id
     ORDER BY u.display_name ASC`,
  );

  // "Stuck" heuristic: hasn't been seen in 2+ days, or has never made progress.
  const cutoff = Date.now() - 2 * 24 * 3600 * 1000;
  const pupils = rows.map((p) => {
    const lastSeen = p.last_seen_at ? new Date(p.last_seen_at).getTime() : 0;
    const stuck = Number(p.commands_coded) === 0 || lastSeen < cutoff;
    return { ...p, stuck };
  });

  res.json({ pupils, count: pupils.length });
});

// GET /api/dashboard/pupil/:id -- full breakdown for one pupil.
router.get("/pupil/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const [[user]] = await pool.execute(
    `SELECT u.id, u.display_name, u.year_group, u.last_seen_at, u.created_at, u.total_charges_consumed,
            COALESCE(ps.combat_xp, 0)   AS combat_xp,
            COALESCE(ps.survival_xp, 0) AS survival_xp,
            COALESCE(ps.coding_xp, 0)   AS coding_xp,
            ps.health
       FROM users u LEFT JOIN player_state ps ON ps.user_id = u.id
      WHERE u.id = :id AND u.is_teacher = 0`,
    { id },
  );
  if (!user) return res.status(404).json({ error: "not_found" });

  const combatLevel = levelFromXp(user.combat_xp);
  const survivalLevel = levelFromXp(user.survival_xp);
  const codingLevel = levelFromXp(user.coding_xp);
  user.combat_level = combatLevel;
  user.survival_level = survivalLevel;
  user.coding_level = codingLevel;
  user.total_level = combatLevel + survivalLevel + codingLevel;
  user.max_health = maxHealthForCombat(combatLevel);

  const [actions] = await pool.execute(
    `SELECT action_name, tier, charges_remaining, times_coded, bound_key, updated_at
       FROM action_progress WHERE user_id = :id ORDER BY action_name ASC`,
    { id },
  );
  const [combat] = await pool.execute(
    `SELECT enemy_type,
            SUM(outcome = 'win')  AS wins,
            SUM(outcome = 'loss') AS losses,
            SUM(auto_resolved)    AS auto_resolved
       FROM combat_log WHERE user_id = :id GROUP BY enemy_type`,
    { id },
  );

  res.json({ user, actions, combat });
});

export default router;
