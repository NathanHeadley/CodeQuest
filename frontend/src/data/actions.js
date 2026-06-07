// Action metadata + the tiered scaffolding shown in the code editor.
//
// The BACKEND validates the final code with Python's ast, so scaffolds only control
// how much help the pupil gets. Each tier gives less: T1 one blank -> T4 description only.

function moveScaffolds(axis, op, dirWord) {
  const answer = `player.${axis} = player.${axis} ${op} 1`;
  return {
    answer,
    tiers: {
      1: {
        starter: `player.${axis} = player.${axis} ${op} __`,
        hint: "Replace __ with the number of steps to move (1).",
      },
      2: {
        starter: `player.${axis} = player.__ __ 1`,
        hint: `Fill in the blanks. Moving ${dirWord} uses player.${axis} and the ${op} operator.`,
      },
      3: {
        starter: "",
        hint: `Write the full line to move ${dirWord} by 1. Use player.${axis}.`,
      },
      4: { starter: "", hint: `Make the player move one step ${dirWord}.` },
    },
  };
}

function callScaffolds(method, args, answerArgs, description) {
  const answer = `player.${method}(${answerArgs.join(", ")})`;
  return {
    answer,
    tiers: {
      1: {
        starter: `player.${method}(${args.map(() => "____").join(", ")})`,
        hint: `Put the ${args.join(" and ")} inside the brackets.`,
      },
      2: {
        starter: `player.____(${answerArgs.join(", ")})`,
        hint: `Call the ${method} method on the player.`,
      },
      3: { starter: "", hint: `Write the full line. ${description}` },
      4: { starter: "", hint: description },
    },
  };
}

export const ACTIONS = {
  move_right: {
    label: "Move right",
    type: "move",
    dx: 1,
    dy: 0,
    suggestedKey: "d",
    ...moveScaffolds("x", "+", "right"),
  },
  move_left: {
    label: "Move left",
    type: "move",
    dx: -1,
    dy: 0,
    suggestedKey: "a",
    ...moveScaffolds("x", "-", "left"),
  },
  move_up: {
    label: "Move up",
    type: "move",
    dx: 0,
    dy: -1,
    suggestedKey: "w",
    ...moveScaffolds("y", "-", "up"),
  },
  move_down: {
    label: "Move down",
    type: "move",
    dx: 0,
    dy: 1,
    suggestedKey: "s",
    ...moveScaffolds("y", "+", "down"),
  },
  attack: {
    label: "Attack",
    type: "attack",
    suggestedKey: " ",
    ...callScaffolds("attack", ["enemy"], ["enemy"], "Call player.attack on the enemy variable."),
  },
  equip: {
    label: "Wield item",
    type: "equip",
    suggestedKey: "e",
    ...callScaffolds("equip", ["item"], ["item_name"], "Call player.equip with the item_name."),
  },
  use: {
    label: "Use item",
    type: "use",
    suggestedKey: "u",
    ...callScaffolds(
      "use",
      ["item", "target"],
      ["item_name", "target_name"],
      "Call player.use with the item_name and the target_name.",
    ),
  },
  pick_up: {
    label: "Pick up",
    type: "pick_up",
    suggestedKey: "g",
    ...callScaffolds("pickup", ["item"], ["item"], "Call player.pickup with the item you want to collect."),
  },
  chop: {
    label: "Chop tree",
    type: "chop",
    suggestedKey: "c",
    ...callScaffolds("chop", ["tree"], ["tree"], "Call player.chop with the tree (needs a hatchet)."),
  },
  mine: {
    label: "Mine rock",
    type: "mine",
    suggestedKey: "m",
    ...callScaffolds("mine", ["rock"], ["rock"], "Call player.mine with the rock (needs a pickaxe)."),
  },
  cook: {
    label: "Cook",
    type: "cook",
    suggestedKey: "k",
    ...callScaffolds("cook", ["food"], ["food"], "Call player.cook with the food."),
  },
  eat: {
    label: "Eat",
    type: "eat",
    suggestedKey: "f",
    ...callScaffolds("eat", ["food"], ["food"], "Call player.eat with the food."),
  },
};

export const MOVE_ACTIONS = ["move_right", "move_left", "move_up", "move_down"];

// Scaffold for a given action at the player's current tier (capped at 4).
export function scaffoldFor(actionName, tier) {
  const a = ACTIONS[actionName];
  if (!a) return null;
  const t = Math.min(Math.max(tier || 1, 1), 4);
  return { ...a.tiers[t], tier: t, label: a.label, answer: a.answer };
}
