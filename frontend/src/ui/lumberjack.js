// Lumberjack quest: starts when the player first picks up a hatchet. Walks them through
// coding Chop, felling a tree, getting a tinderbox, coding Use, and making a fire.
// Grants 100 Survival XP once on completion (server-enforced via /api/quest/complete).
import { bus, state } from "../core.js";
import { api } from "../net.js";
import { bottom } from "./bottomPanel.js";

let running = false;

const hasItem = (n) => state.inventory.some((i) => i.item_name === n && i.quantity > 0);
const action = (n) => state.getAction(n);
const step = (id) => bus.emit("quest:step:done", id);

export function maybeStartLumberjack() {
  if (running) return;
  if (state.questsDone.includes("lumberjack")) return;
  if (!hasItem("hatchet")) return;
  running = true;
  stepChop();
}

function stepChop() {
  const c = action("chop");
  if (c && c.bound_key) return stepFell();
  if (c) return bindChop();
  bottom.showDialogue(
    "Lumberjack",
    "You found a hatchet! Time to learn woodcutting. Code the Chop action.",
    [{ label: "Code Chop", onClick: () => bottom.openCode("chop") }],
  );
  const off = bus.on("code:success", (a) => {
    if (a === "chop") {
      off();
      bindChop();
    }
  });
}

function bindChop() {
  bottom.showDialogue("Lumberjack", "Now bind Chop to a key.", [
    { label: "Bind a key", onClick: () => bottom.bindKeyFlow("chop") },
  ]);
  const off = bus.on("key:bound", (e) => {
    if (e.action_name === "chop") {
      off();
      stepFell();
    }
  });
}

function stepFell() {
  bottom.showDialogue(
    "Lumberjack",
    "Head to the grove southwest of the centre and chop a tree down — it takes a few hits. You'll get a log.",
    [],
  );
  const off = bus.on("tree:felled", () => {
    off();
    step("lj_chop");
    stepTinderbox();
  });
}

function stepTinderbox() {
  if (hasItem("tinderbox")) return stepUse();
  bottom.showDialogue("Lumberjack", "Now grab the tinderbox in town so you can light a fire.", []);
  const off = bus.on("item:acquired", (item) => {
    if (item === "tinderbox") {
      off();
      stepUse();
    }
  });
}

function stepUse() {
  if (action("use")) return stepFire();
  bottom.showDialogue("Lumberjack", "To combine items you need the Use action. Code it now.", [
    { label: "Code Use", onClick: () => bottom.openCode("use") },
  ]);
  const off = bus.on("code:success", (a) => {
    if (a === "use") {
      off();
      stepFire();
    }
  });
}

function stepFire() {
  bottom.showDialogue(
    "Lumberjack",
    "Open the Items tab, click your tinderbox, then click a log — that lights a fire!",
    [],
  );
  const off = bus.on("fire:made", () => {
    off();
    complete();
  });
}

async function complete() {
  step("lj_fire");
  try {
    const r = await api.completeQuest("lumberjack");
    if (r.granted) {
      if (r.skills && r.skills.survival) state.skills.survival = r.skills.survival;
      if (!state.questsDone.includes("lumberjack")) state.questsDone.push("lumberjack");
      bus.emit("state:changed");
      bus.emit("toast", "Lumberjack quest complete! +100 Survival XP");
    }
  } catch (e) {
    /* ignore */
  }
  bottom.showDialogue(
    "Lumberjack",
    "You're a Lumberjack now! Chop trees and burn logs to train Survival. Well done.",
    [{ label: "Nice!", onClick: () => bottom.showDialogue("", "Explore the town!", []) }],
  );
  running = false;
}
