import { config, bus, state } from "../core.js";
import {
  api,
  connectSocket,
  sendMove,
  sendAttack,
  sendPickup,
  sendChop,
  sendMine,
  sendUse,
  sendCook,
  sendEat,
  sendSell,
  sendBuy,
} from "../net.js";
import { townMap, isBlocked, TILE } from "../game/townMap.js";
import { TILE_TEXTURE } from "../game/tiles.js";

const S = config.tileSize;
const center = (t) => t * S + S / 2;
const ENEMY_TEX = { sheep: "s_sheep", cow: "s_cow" };
const ENEMY_NAME = { sheep: "Sheep", cow: "Cow" };
const ITEM_TEX = {
  wool: "s_wool",
  cowhide: "s_cowhide",
  hatchet: "s_hatchet",
  tinderbox: "s_tinderbox",
  "raw beef": "s_rawbeef",
};
const MOVE_INTERVAL = 150; // ms between steps while a move key is held
const isMove = (name) => name.startsWith("move_");

export class GameScene extends Phaser.Scene {
  constructor() {
    super("Game");
    this.others = new Map(); // userId -> { sprite, label, name, level }
    this.enemies = new Map(); // enemyId -> { sprite, label, type, x, y, hp, maxHp }
    this.items = new Map(); // itemId -> { sprite, x, y, item }
    this.trees = new Map(); // treeId -> { sprite, x, y }
    this.rocks = new Map(); // rockId -> { sprite, x, y }
    this.fires = new Map(); // fireId -> { sprite, x, y }
    this.pendingConsume = new Map();
    this.inputLocked = false;
    this.lastLootItem = null;
    this.heldKeys = new Set();
    this.moveTimer = 0;
  }

  create() {
    this.buildWorld();
    this.buildEntities();
    this.buildPlayer();

    this.cameras.main.setBounds(0, 0, townMap.width * S, townMap.height * S);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.wireInput();
    this.wireSocket();
    this.drawMinimap();

    this.time.addEvent({ delay: 4000, loop: true, callback: () => this.flushConsume() });
    window.addEventListener("beforeunload", () => this.flushConsume(true));

    bus.on("ui:codeOpen", () => {
      this.inputLocked = true;
      this.heldKeys.clear();
    });
    bus.on("ui:codeClose", () => (this.inputLocked = false));
    bus.on("state:changed", () => this.updatePlayerLabel());

    bus.emit("game:ready", this);
  }

  buildWorld() {
    for (let y = 0; y < townMap.height; y++) {
      for (let x = 0; x < townMap.width; x++) {
        this.add.image(center(x), center(y), TILE_TEXTURE[townMap.tiles[y][x]]).setDepth(0);
      }
    }
  }

  buildEntities() {
    const tex = { npc: "s_npc", sign: "s_sign" };
    for (const e of townMap.entities) {
      const sprite = this.add.image(center(e.x), center(e.y), tex[e.type] || "s_sign").setDepth(5);
      this.addLabel(e.x, e.y, e.name, e.type === "npc" ? "#ffe14a" : "#d9b65a");
      if (e.role === "shop") {
        sprite.setInteractive({ useHandCursor: true });
        sprite.on("pointerdown", () => bus.emit("shop:open"));
      }
    }
  }

  addLabel(x, y, text, color) {
    return this.add
      .text(center(x), y * S - 2, text, { fontFamily: "monospace", fontSize: "11px", color })
      .setOrigin(0.5, 1)
      .setDepth(15);
  }

  buildPlayer() {
    const { x, y } = state.player;
    this.player = this.add.image(center(x), center(y), "s_player").setDepth(10);
    this.playerLabel = this.add
      .text(center(x), y * S - 2, this.labelText(), {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#7bd47b",
      })
      .setOrigin(0.5, 1)
      .setDepth(15);
  }

  labelText() {
    return `${state.user.display_name} (level ${state.totalLevel()})`;
  }
  updatePlayerLabel() {
    if (this.playerLabel) this.playerLabel.setText(this.labelText());
  }

  // ---- Input ----
  // Movement repeats on a fixed timer in update() while a key is held (so it's smooth
  // and consistent, instead of relying on the OS key-repeat delay/burst). Non-movement
  // actions fire once per keypress.
  wireInput() {
    this.input.keyboard.on("keydown", (ev) => {
      if (this.typingOrLocked()) return;
      const action = state.actionForKey(ev.key);
      if (!action) return;
      ev.preventDefault();

      if (isMove(action.action_name)) {
        if (!this.heldKeys.has(ev.key)) {
          this.heldKeys.add(ev.key);
          this.tryAction(action.action_name); // instant first step
          this.moveTimer = MOVE_INTERVAL;
        }
      } else if (!ev.repeat) {
        this.tryAction(action.action_name);
      }
    });
    this.input.keyboard.on("keyup", (ev) => this.heldKeys.delete(ev.key));
    // Don't leave keys "stuck" if focus leaves the window.
    window.addEventListener("blur", () => this.heldKeys.clear());
  }

  typingOrLocked() {
    const el = document.activeElement;
    return this.inputLocked || (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT"));
  }

  update(time, delta) {
    if (this.heldKeys.size === 0 || this.typingOrLocked()) return;
    this.moveTimer -= delta;
    if (this.moveTimer > 0) return;
    for (const key of this.heldKeys) {
      const action = state.actionForKey(key);
      if (action && isMove(action.action_name)) {
        this.tryAction(action.action_name);
        this.moveTimer = MOVE_INTERVAL;
        return;
      }
    }
  }

  tryAction(actionName) {
    const a = state.getAction(actionName);
    if (!a) return;
    if (a.charges_remaining <= 0) return bus.emit("action:depleted", actionName);

    const move = { move_right: [1, 0], move_left: [-1, 0], move_up: [0, -1], move_down: [0, 1] }[
      actionName
    ];
    if (move) return this.doMove(actionName, move[0], move[1]);
    if (actionName === "attack") return this.doAttack();
    if (actionName === "chop") return this.doChop();
    if (actionName === "mine") return this.doMine();
    // "use" (inventory click) and "pick_up" (click a ground item) are click-triggered.
  }

  enemyAt(x, y) {
    for (const [id, e] of this.enemies) if (e.x === x && e.y === y) return { id, e };
    return null;
  }
  itemAt(x, y) {
    for (const [id, it] of this.items) if (it.x === x && it.y === y) return { id, it };
    return null;
  }
  treeAt(x, y) {
    for (const [id, t] of this.trees) if (t.x === x && t.y === y) return { id, t };
    return null;
  }
  rockAt(x, y) {
    for (const [id, r] of this.rocks) if (r.x === x && r.y === y) return { id, r };
    return null;
  }

  doMove(actionName, dx, dy) {
    const nx = state.player.x + dx;
    const ny = state.player.y + dy;
    if (this.enemyAt(nx, ny)) {
      return bus.emit("toast", "An animal blocks the way — press your attack key!");
    }
    if (this.treeAt(nx, ny)) {
      return bus.emit("toast", "A tree blocks the way — chop it with your chop key!");
    }
    if (this.rockAt(nx, ny)) {
      return bus.emit("toast", "A rock blocks the way — mine it with your mine key!");
    }
    if (isBlocked(nx, ny)) return bus.emit("toast", "Something is in the way.");

    this.spendCharge(actionName);
    state.player.x = nx;
    state.player.y = ny;
    this.tweenTo(this.player, this.playerLabel, nx, ny);
    sendMove(nx, ny);
    bus.emit("player:moved", { x: nx, y: ny });
    this.checkLootUnderfoot(nx, ny);
  }

  // Walking onto an item: prompt to learn Pick up (if not unlocked) or to use it.
  checkLootUnderfoot(x, y) {
    const found = this.itemAt(x, y);
    if (!found) {
      this.lastLootItem = null;
      return;
    }
    if (this.lastLootItem === found.id) return; // already prompted for this drop
    this.lastLootItem = found.id;

    if (!state.getAction("pick_up")) bus.emit("loot:learn");
    else bus.emit("toast", "Click the loot to pick it up.");
  }

  doAttack() {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      const hit = this.enemyAt(state.player.x + dx, state.player.y + dy);
      if (hit) {
        this.spendCharge("attack");
        sendAttack(hit.id); // server resolves shared HP + our XP/health
        return;
      }
    }
    bus.emit("toast", "No enemy next to you.");
  }

  // Click a ground item to pick it up (must be on it or 1 tile away in any direction).
  tryPickup(itemId) {
    const it = this.items.get(itemId);
    if (!it) return;
    const reach = Math.max(Math.abs(state.player.x - it.x), Math.abs(state.player.y - it.y));
    if (reach > 1) return bus.emit("toast", "You're too far away to pick that up.");
    const pu = state.getAction("pick_up");
    if (!pu) return bus.emit("loot:learn");
    if (pu.charges_remaining <= 0) return bus.emit("action:depleted", "pick_up");
    this.spendCharge("pick_up");
    sendPickup(itemId);
  }

  hasItem(name) {
    return state.inventory.some((i) => i.item_name === name && i.quantity > 0);
  }

  doChop() {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dx, dy] of dirs) {
      const t = this.treeAt(state.player.x + dx, state.player.y + dy);
      if (t) {
        if (!this.hasItem("hatchet")) return bus.emit("toast", "You need a hatchet to chop trees.");
        this.spendCharge("chop");
        sendChop(t.id);
        return;
      }
    }
    bus.emit("toast", "No tree next to you.");
  }

  doMine() {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dx, dy] of dirs) {
      const r = this.rockAt(state.player.x + dx, state.player.y + dy);
      if (r) {
        if (!this.hasItem("pickaxe")) return bus.emit("toast", "You need a pickaxe to mine.");
        this.spendCharge("mine");
        sendMine(r.id);
        return;
      }
    }
    bus.emit("toast", "No rock next to you.");
  }

  // Resolve a select+target interaction by recipe. Each recipe maps to a coded action
  // (charge spent only on a successful server result).
  resolveInteraction(a, b, targetId) {
    const pair = new Set([a, b]);
    let recipeAction = null;
    if (pair.has("tinderbox") && pair.has("log")) recipeAction = "use"; // firemaking
    else if (pair.has("raw beef") && pair.has("fire")) recipeAction = "cook"; // cooking

    if (!recipeAction) return bus.emit("toast", "Nothing interesting happens.");
    const act = state.getAction(recipeAction);
    if (!act) return bus.emit("action:learn", recipeAction);
    if (act.charges_remaining <= 0) return bus.emit("action:depleted", recipeAction);

    if (recipeAction === "use") sendUse(a, b);
    else if (recipeAction === "cook") sendCook(targetId);
  }

  // Eat an edible item (click on it in the inventory).
  doEat(item) {
    const eat = state.getAction("eat");
    if (!eat) return bus.emit("action:learn", "eat");
    if (eat.charges_remaining <= 0) return bus.emit("action:depleted", "eat");
    sendEat(item);
  }

  // ---- Charges (batched persistence) ----
  spendCharge(actionName) {
    const a = state.getAction(actionName);
    a.charges_remaining = Math.max(0, a.charges_remaining - 1);
    this.pendingConsume.set(actionName, (this.pendingConsume.get(actionName) || 0) + 1);
    bus.emit("action:used", actionName);
    bus.emit("state:changed");
    if (a.charges_remaining === 0) {
      this.flushConsume();
      bus.emit("action:justDepleted", actionName);
    }
  }

  flushConsume() {
    for (const [actionName, count] of this.pendingConsume) {
      if (count > 0) api.consume(actionName, count).catch(() => {});
    }
    this.pendingConsume.clear();
  }

  // ---- Socket ----
  wireSocket() {
    connectSocket();
    bus.on("ws:welcome", (m) => {
      m.players.forEach((p) => this.upsertOther(p));
      this.loadWorld(m.world);
    });
    bus.on("ws:join", (m) => this.upsertOther(m.player));
    bus.on("ws:pos", (m) => this.moveOther(m.id, m.x, m.y));
    bus.on("ws:leave", (m) => this.removeOther(m.id));
    bus.on("ws:player:level", (m) => this.setOtherLevel(m.id, m.total_level));
    bus.on("ws:enemy:hp", (m) => this.onEnemyHp(m));
    bus.on("ws:enemy:dead", (m) => this.onEnemyDead(m));
    bus.on("ws:enemy:spawn", (m) => this.onEnemySpawn(m.enemy));
    bus.on("ws:item:spawn", (m) => this.onItemSpawn(m.item));
    bus.on("ws:item:gone", (m) => this.onItemGone(m.id));
    bus.on("ws:tree:spawn", (m) => this.onTreeSpawn(m.tree));
    bus.on("ws:tree:gone", (m) => this.onTreeGone(m.id));
    bus.on("ws:tree:hp", (m) => this.onTreeHp(m));
    bus.on("ws:rock:spawn", (m) => this.onRockSpawn(m.rock));
    bus.on("ws:rock:gone", (m) => this.onRockGone(m.id));
    bus.on("ws:rock:hp", (m) => this.onRockHp(m));
    bus.on("ws:fire:spawn", (m) => this.onFireSpawn(m.fire));
    bus.on("ws:fire:gone", (m) => this.onFireGone(m.id));
    bus.on("ws:chop:result", (m) => {
      if (m.felled) bus.emit("tree:felled");
    });
    bus.on("ws:use:result", (m) => this.onUseResult(m));
    bus.on("ws:cook:result", (m) => {
      if (m.ok) this.spendCharge("cook");
    });
    bus.on("ws:eat:result", (m) => {
      if (m.ok) this.spendCharge("eat");
    });
    bus.on("ws:you", (m) => this.onYou(m));
    bus.on("ws:inventory", (m) => this.onInventory(m));
    bus.on("ws:notice", (m) => bus.emit("toast", m.text));
    bus.on("interact", ({ a, b, targetId }) => this.resolveInteraction(a, b, targetId));
    bus.on("interact:eat", ({ item }) => this.doEat(item));
    bus.on("shop:sell", ({ item }) => sendSell(item));
    bus.on("shop:buy", ({ item }) => sendBuy(item));
  }

  onTreeHp(m) {
    const t = this.trees.get(m.id);
    if (!t) return;
    const dmg = Math.max(1, t.hp - m.hp);
    t.hp = m.hp;
    this.floatText(t.x, t.y, `-${dmg}`, "#caa56e");
  }

  onUseResult(m) {
    if (m.ok) {
      this.spendCharge("use"); // charge only spent on a successful interaction
      if (m.effect === "fire") bus.emit("fire:made");
    }
  }

  loadWorld(world) {
    if (!world) return;
    world.enemies.forEach((e) => this.onEnemySpawn(e));
    world.items.forEach((it) => this.onItemSpawn(it));
    (world.trees || []).forEach((t) => this.onTreeSpawn(t));
    (world.rocks || []).forEach((r) => this.onRockSpawn(r));
    (world.fires || []).forEach((f) => this.onFireSpawn(f));
  }

  onTreeSpawn(t) {
    if (this.trees.has(t.id)) return;
    const sprite = this.add.image(center(t.x), center(t.y), "s_tree").setDepth(6);
    this.trees.set(t.id, { sprite, x: t.x, y: t.y, hp: t.hp, maxHp: t.maxHp });
  }
  onTreeGone(id) {
    const t = this.trees.get(id);
    if (t) {
      this.floatText(t.x, t.y, "timber!", "#caa56e");
      t.sprite.destroy();
      this.trees.delete(id);
    }
  }

  onRockSpawn(r) {
    if (this.rocks.has(r.id)) return;
    const sprite = this.add.image(center(r.x), center(r.y), "s_rock").setDepth(6);
    this.rocks.set(r.id, { sprite, x: r.x, y: r.y, hp: r.hp, maxHp: r.maxHp });
  }
  onRockGone(id) {
    const r = this.rocks.get(id);
    if (r) {
      this.floatText(r.x, r.y, "ore!", "#b9772f");
      r.sprite.destroy();
      this.rocks.delete(id);
    }
  }
  onRockHp(m) {
    const r = this.rocks.get(m.id);
    if (!r) return;
    const dmg = Math.max(1, r.hp - m.hp);
    r.hp = m.hp;
    this.floatText(r.x, r.y, `-${dmg}`, "#c9ccd1");
  }
  onFireSpawn(f) {
    if (this.fires.has(f.id)) return;
    const sprite = this.add.image(center(f.x), center(f.y), "s_fire").setDepth(4);
    sprite.setInteractive({ useHandCursor: true });
    sprite.on("pointerdown", () => this.fireClicked(f.id));
    this.fires.set(f.id, { sprite, x: f.x, y: f.y });
  }

  fireClicked(fireId) {
    if (!state.useSelection) return bus.emit("toast", "Select an item first, then click the fire.");
    const f = this.fires.get(fireId);
    const sel = state.useSelection;
    state.useSelection = null;
    bus.emit("use:selection");
    if (f && Math.max(Math.abs(state.player.x - f.x), Math.abs(state.player.y - f.y)) > 1) {
      return bus.emit("toast", "You're too far from the fire.");
    }
    this.resolveInteraction(sel, "fire", fireId);
  }
  onFireGone(id) {
    const f = this.fires.get(id);
    if (f) {
      f.sprite.destroy();
      this.fires.delete(id);
    }
  }

  onEnemySpawn(e) {
    const existing = this.enemies.get(e.id);
    if (existing) {
      existing.x = e.x;
      existing.y = e.y;
      existing.hp = e.hp;
      existing.sprite.setPosition(center(e.x), center(e.y)).setVisible(true);
      existing.label.setPosition(center(e.x), e.y * S - 2).setVisible(true);
      this.redrawMinimap();
      return;
    }
    const sprite = this.add.image(center(e.x), center(e.y), ENEMY_TEX[e.type] || "s_sheep").setDepth(5);
    const label = this.addLabel(e.x, e.y, ENEMY_NAME[e.type] || e.type, "#ffe14a"); // animals are NPCs (yellow)
    this.enemies.set(e.id, { sprite, label, type: e.type, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp });
    this.redrawMinimap();
  }

  onEnemyHp(m) {
    const e = this.enemies.get(m.id);
    if (!e) return;
    const dmg = Math.max(1, e.hp - m.hp);
    e.hp = m.hp;
    this.floatText(e.x, e.y, `-${dmg}`, "#ffd24a");
  }

  onEnemyDead(m) {
    const e = this.enemies.get(m.id);
    if (!e) return;
    this.floatText(e.x, e.y, "defeated!", "#7bd47b");
    e.sprite.destroy();
    e.label.destroy();
    this.enemies.delete(m.id);
    this.redrawMinimap();
  }

  onItemSpawn(it) {
    if (this.items.has(it.id)) return;
    const tex = ITEM_TEX[it.item] || "s_item";
    const sprite = this.add.image(center(it.x), center(it.y), tex).setDepth(4);
    sprite.setInteractive({ useHandCursor: true });
    sprite.on("pointerdown", () => this.tryPickup(it.id));
    this.items.set(it.id, { sprite, x: it.x, y: it.y, item: it.item });
    this.redrawMinimap();
  }
  onItemGone(id) {
    const it = this.items.get(id);
    if (it) {
      it.sprite.destroy();
      this.items.delete(id);
      this.redrawMinimap();
    }
  }

  onYou(m) {
    if (typeof m.health === "number") state.health = m.health;
    if (typeof m.maxHealth === "number") state.maxHealth = m.maxHealth;
    if (m.skills) {
      const ICON = { combat: "⚔", survival: "🌿", coding: "💻" };
      const LABEL = { combat: "Combat", survival: "Survival", coding: "Coding" };
      for (const [k, v] of Object.entries(m.skills)) {
        const prev = state.skills[k] ? state.skills[k].level : 1;
        state.skills[k] = v;
        if (v.level > prev) {
          bus.emit("toast", `${ICON[k] || ""} ${LABEL[k] || k} level up — now level ${v.level}!`);
        }
      }
    }
    if (m.killed) bus.emit("combat:won", { type: m.enemyType });
    if (m.respawn) {
      state.player.x = m.respawn.x;
      state.player.y = m.respawn.y;
      this.tweenTo(this.player, this.playerLabel, m.respawn.x, m.respawn.y);
      bus.emit("toast", "You were defeated! Respawned at town.");
    }
    bus.emit("state:changed"); // refreshes the HP orb, skills tab, and label
  }

  onInventory(m) {
    if (Array.isArray(m.items)) {
      const before = new Set(state.inventory.map((i) => i.item_name));
      state.inventory = m.items;
      for (const it of m.items) if (!before.has(it.item_name)) bus.emit("item:acquired", it.item_name);
    }
    bus.emit("state:changed");
  }

  // ---- Other players ----
  upsertOther(p) {
    if (this.others.has(p.id)) {
      this.moveOther(p.id, p.x, p.y);
      this.setOtherLevel(p.id, p.total_level);
      return;
    }
    const sprite = this.add.image(center(p.x), center(p.y), "s_other").setDepth(9);
    const label = this.add
      .text(center(p.x), p.y * S - 2, `${p.name} (level ${p.total_level ?? 1})`, {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#c9a0e8",
      })
      .setOrigin(0.5, 1)
      .setDepth(15);
    this.others.set(p.id, { sprite, label, name: p.name, level: p.total_level ?? 1, x: p.x, y: p.y });
    this.redrawMinimap();
  }
  moveOther(id, x, y) {
    const o = this.others.get(id);
    if (o) {
      o.x = x;
      o.y = y;
      this.tweenTo(o.sprite, o.label, x, y);
      this.redrawMinimap();
    }
  }
  setOtherLevel(id, lvl) {
    const o = this.others.get(id);
    if (o) {
      o.level = lvl;
      o.label.setText(`${o.name} (level ${lvl})`);
    }
  }
  removeOther(id) {
    const o = this.others.get(id);
    if (o) {
      o.sprite.destroy();
      o.label.destroy();
      this.others.delete(id);
      this.redrawMinimap();
    }
  }

  tweenTo(sprite, label, x, y) {
    this.tweens.add({ targets: sprite, x: center(x), y: center(y), duration: 120 });
    this.tweens.add({ targets: label, x: center(x), y: y * S - 2, duration: 120 });
  }

  floatText(tx, ty, text, color) {
    const t = this.add
      .text(center(tx), ty * S + 4, text, {
        fontFamily: "monospace",
        fontSize: "13px",
        color,
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(60);
    this.tweens.add({ targets: t, y: t.y - 26, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  // ---- Minimap ----
  drawMinimap() {
    const host = document.getElementById("minimap");
    const cv = document.createElement("canvas");
    cv.width = townMap.width;
    cv.height = townMap.height;
    host.innerHTML = "";
    host.appendChild(cv);
    const ctx = cv.getContext("2d");
    const colors = {
      [TILE.GRASS]: "#3b6b35",
      [TILE.FIELD]: "#6b8a3a",
      [TILE.PATH]: "#b39a6a",
      [TILE.WATER]: "#2f5a8a",
      [TILE.TREE]: "#244a1f",
      [TILE.WALL]: "#7a7068",
      [TILE.FLOOR]: "#6b5a3f",
    };
    this.minimapCtx = ctx;
    this.paintMinimapBase = () => {
      for (let y = 0; y < townMap.height; y++) {
        for (let x = 0; x < townMap.width; x++) {
          ctx.fillStyle = colors[townMap.tiles[y][x]] || "#000";
          ctx.fillRect(x, y, 1, 1);
        }
      }
    };
    this.redrawMinimap();
    bus.on("player:moved", () => this.redrawMinimap());
  }

  redrawMinimap() {
    if (!this.minimapCtx) return;
    const ctx = this.minimapCtx;
    this.paintMinimapBase();
    const dot = (x, y, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    };
    for (const e of townMap.entities) if (e.type === "npc") dot(e.x, e.y, "#ffe14a"); // NPCs yellow
    for (const en of this.enemies.values()) dot(en.x, en.y, "#ffe14a"); // animals (NPCs) yellow
    for (const it of this.items.values()) dot(it.x, it.y, "#e0504d"); // ground items red
    for (const o of this.others.values()) dot(o.x, o.y, "#ffffff"); // other players white
    dot(state.player.x, state.player.y, "#7bd47b"); // you green
  }
}
