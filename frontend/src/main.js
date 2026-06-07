// Entry point: auth -> load state -> start Phaser -> wire UI + tutorial.
import { bus, state, loadToken } from "./core.js";
import { api } from "./net.js";
import { ACTIONS } from "./data/actions.js";
import { BootScene } from "./scenes/BootScene.js";
import { GameScene } from "./scenes/GameScene.js";
import { bottom } from "./ui/bottomPanel.js";
import { right } from "./ui/rightPanel.js";
import { startTutorial } from "./ui/tutorial.js";
import { maybeStartLumberjack } from "./ui/lumberjack.js";
import { shop } from "./ui/shop.js";

function showAuthOverlay(msg) {
  const o = document.getElementById("auth-overlay");
  if (msg) document.getElementById("auth-msg").textContent = msg;
  o.classList.remove("hidden");
}

function toast(text) {
  let el = document.getElementById("cq-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "cq-toast";
    el.style.cssText =
      "position:fixed;bottom:250px;left:50%;transform:translateX(-50%);background:#2b2620;" +
      "border:1px solid #5a4f3f;color:#e8e0d0;padding:8px 16px;border-radius:6px;z-index:50;" +
      "pointer-events:none;transition:opacity .3s;font-size:14px;";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = "1";
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.style.opacity = "0"), 1600);
}

// Prompt to learn an action the player can use but hasn't coded yet, based on items
// they already hold. Runs on load and on shop close (covers reloads + shop buys, where
// the live item:acquired prompt is hidden behind the shop dim). One prompt at a time.
function checkLearnPrompts() {
  const has = (n) => state.inventory.some((i) => i.item_name === n && i.quantity > 0);
  if (has("hatchet") && !state.questsDone.includes("lumberjack")) return maybeStartLumberjack();
  if (has("pickaxe") && !state.getAction("mine")) return bus.emit("action:learn", "mine");
  if (has("raw beef") && !state.getAction("cook")) return bus.emit("action:learn", "cook");
  if (has("beef") && !state.getAction("eat")) return bus.emit("action:learn", "eat");
}

async function boot() {
  const token = loadToken();
  if (!token) return showAuthOverlay();

  try {
    const data = await api.state();
    state.setFromServer(data);
  } catch (e) {
    return showAuthOverlay(
      e.status === 401 ? "Your session expired — relaunch from joltcomputing.com." : `Error: ${e.message}`,
    );
  }

  bottom.init();
  right.init();
  shop.init();

  // Global gameplay reactions.
  bus.on("action:depleted", (name) => {
    const label = ACTIONS[name] ? ACTIONS[name].label : name;
    bottom.openCode(name, `Your "${label}" ran out of charges. Recode it to recharge!`);
  });
  bus.on("action:justDepleted", (name) => {
    const label = ACTIONS[name] ? ACTIONS[name].label : name;
    toast(`${label} is out of charges — recode it to recharge.`);
  });
  bus.on("combat:needCode", () => {
    bottom.showDialogue(
      "Guide",
      "That creature won't go down on its own anymore. Code your attack to fight it!",
      [{ label: "Code attack", onClick: () => bottom.openCode("attack") }],
    );
  });
  bus.on("action:learn", (name) => {
    const def = ACTIONS[name];
    if (!def) return;
    bottom.showDialogue("New skill!", `You can learn ${def.label}. Code it to start using it.`, [
      { label: `Code ${def.label}`, onClick: () => bottom.openCode(name) },
    ]);
  });
  bus.on("shop:open", () => {
    bottom.showDialogue(
      "Shopkeeper",
      "Buy from my stock in the window, or sell me your items from the Inventory tab. Close the window when you're done.",
      [],
    );
  });
  bus.on("shop:close", () => {
    bottom.showDialogue("Shopkeeper", "Thanks for stopping by!", [
      { label: "Close", onClick: () => bottom.showDialogue("", "Explore the town!", []) },
    ]);
    checkLearnPrompts(); // e.g. just bought a pickaxe -> prompt to code Mine
  });
  bus.on("loot:learn", () => {
    bottom.showDialogue(
      "Loot!",
      "There's an item on the ground here. Code the Pick up action, then click the item to collect it.",
      [{ label: "Code Pick up", onClick: () => bottom.openCode("pick_up") }],
    );
  });
  bus.on("toast", (t) => toast(t));
  bus.on("ws:closed", () => toast("Disconnected from the world — reload to reconnect."));

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#1b1712",
    pixelArt: true,
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, GameScene],
  });

  bus.on("game:ready", () => {
    startTutorial();
    checkLearnPrompts(); // resume lumberjack / prompt mine/cook/eat for items already held
  });
  bus.on("item:acquired", (item) => {
    if (item === "hatchet") maybeStartLumberjack();
    if (item === "raw beef" && !state.getAction("cook")) bus.emit("action:learn", "cook");
    if (item === "beef" && !state.getAction("eat")) bus.emit("action:learn", "eat");
    if (item === "pickaxe" && !state.getAction("mine")) bus.emit("action:learn", "mine");
  });
}

boot();
