// Guided, RESUMABLE tutorial. Teaches each action via: code -> bind -> use it once
// -> next. It skips anything the player has already unlocked, so it works both for a
// brand-new pupil and for someone returning part-way through.
//
// Flow: intro -> move_right -> move_left -> move_up -> move_down -> first (auto) fights
//       -> attack. Movement actions require the pupil to actually use the key once
//       before moving on; attack just needs coding + binding.
import { bus, state } from "../core.js";
import { ACTIONS, MOVE_ACTIONS } from "../data/actions.js";
import { bottom } from "./bottomPanel.js";

function quest(id, text, done = false) {
  bus.emit("quest:update", { id, text, done });
}

/**
 * Teach one action end-to-end.
 * @param {string} actionName
 * @param {string} introText  dialogue shown before the "Code …" button
 * @param {boolean} waitUse   require the pupil to use the action once before continuing
 * @param {function} onDone
 */
function teachAction(actionName, introText, waitUse, onDone) {
  const def = ACTIONS[actionName];
  const clickAction = actionName === "use" || actionName === "pick_up"; // not keybound
  quest(`learn-${actionName}`, `Learn: ${def.label}`);

  bottom.showDialogue("Guide", introText, [
    { label: `Code ${def.label}`, onClick: () => bottom.openCode(actionName) },
  ]);

  const finishStep = () => {
    quest(`learn-${actionName}`, `Learn: ${def.label}`, true);
    onDone();
  };

  const offCode = bus.on("code:success", (a) => {
    if (a !== actionName) return;
    offCode();
    if (clickAction) return finishStep(); // click actions don't need a keybind
    bottom.showDialogue(
      "Guide",
      `Nice! Coding it isn't enough — now BIND ${def.label} to a key (click below, then press the key you want).`,
      [{ label: "Bind a key", onClick: () => bottom.bindKeyFlow(actionName) }],
    );

    const offBind = bus.on("key:bound", (e) => {
      if (e.action_name !== actionName) return;
      offBind();
      if (!waitUse) return finishStep();

      bottom.showDialogue("Guide", `Now press your ${def.label} key to use it at least once.`, []);
      const offUse = bus.on("action:used", (used) => {
        if (used !== actionName) return;
        offUse();
        finishStep();
      });
    });
  });
}

// Walk through the four movement actions in order, skipping any already unlocked.
function teachMovements(onDone) {
  const next = (i) => {
    if (i >= MOVE_ACTIONS.length) return onDone();
    const a = MOVE_ACTIONS[i];
    if (state.getAction(a)) return next(i + 1); // already learned -> skip
    const intro =
      i === 0
        ? "Your first skill is moving right. You'll code it, bind it to a key, then use it."
        : `Great — keep going! Now unlock "${ACTIONS[a].label}": code it, bind it, and give it a go.`;
    teachAction(a, intro, true, () => next(i + 1));
  };
  next(0);
}

function introduceCombat() {
  if (!state.getAction("attack")) {
    teachAction(
      "attack",
      "You can move freely now! Animals roam the field to the east — but to fight them you must code an Attack. Code and bind it.",
      false,
      fightTwo,
    );
  } else {
    fightTwo();
  }
}

function fightTwo() {
  if (state.getAction("pick_up")) return finish();
  quest("fight", "Defeat 2 animals in the eastern field");
  bottom.showDialogue(
    "Guide",
    "Head east to the field. Stand next to an animal and press your attack key — you both trade blows, so watch your health! Defeat 2 of them.",
    [],
  );
  let wins = 0;
  const off = bus.on("combat:won", () => {
    if (++wins >= 2) {
      off();
      teachPickup();
    }
  });
}

function teachPickup() {
  teachAction(
    "pick_up",
    "Defeated animals drop loot on the ground! Code Pick up, then click a drop you're standing on or next to, to collect it.",
    false,
    finish,
  );
}

function finish() {
  bottom.showDialogue(
    "Guide",
    "You're a true adventurer now! Pick up the hatchet in town to begin the Lumberjack quest and start training Survival. Explore!",
    [{ label: "Play", onClick: () => bottom.showDialogue("", "Explore the town! Press your bound keys to act.", []) }],
  );
}

export function startTutorial() {
  const has = (n) => !!state.getAction(n);
  const allMoves = MOVE_ACTIONS.every(has);

  // Fully equipped already -> just welcome back.
  if (allMoves && has("attack")) {
    bottom.showDialogue(
      `Welcome back, ${state.user.display_name}`,
      "Press your bound keys to act. Recode any action whose charges have run out.",
      [],
    );
    return;
  }

  const run = () => teachMovements(introduceCombat);

  if (state.actions.size === 0) {
    bottom.showDialogue(
      "Guide",
      "Welcome to CodeQuest! This whole world runs on Python — to do anything, you write code. Shall we begin?",
      [{ label: "Let's go", onClick: run }],
    );
  } else {
    // Returning mid-way: jump straight to the next thing to learn.
    run();
  }
}
