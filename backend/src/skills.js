// Skill XP curve (the classic RuneScape formula): level 2 = 83 XP, level 99 = 13,034,431 XP.
// Level 1->2 is quick; 98->99 takes a very long time.
export const MAX_LEVEL = 99;

function xpForLevel(level) {
  if (level <= 1) return 0;
  let points = 0;
  for (let n = 1; n < level; n++) {
    points += Math.floor(n + 300 * Math.pow(2, n / 7));
  }
  return Math.floor(points / 4);
}

// Precompute thresholds[1..99].
const THRESHOLDS = [0];
for (let l = 1; l <= MAX_LEVEL; l++) THRESHOLDS[l] = xpForLevel(l);

export function levelFromXp(xp) {
  const x = Number(xp) || 0;
  let level = 1;
  for (let l = MAX_LEVEL; l >= 1; l--) {
    if (x >= THRESHOLDS[l]) {
      level = l;
      break;
    }
  }
  return level;
}

// Max hitpoints scale with COMBAT level: 10 at level 1, ~300 at level 99 (linear).
export function maxHealthForCombat(combatLevel) {
  return Math.round(10 + (combatLevel - 1) * (290 / 98));
}

export { xpForLevel };
