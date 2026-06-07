// Centred shop window: shows the shop's stock + prices and lets the player buy with
// coins. (Selling stays in the right-hand Inventory tab.) Closing the window also ends
// the selling session (it emits shop:close, which rightPanel listens to).
import { bus, state } from "../core.js";
import { itemIcon } from "../data/items.js";

const STOCK = [
  { item: "pickaxe", cost: 5 },
  { item: "hammer", cost: 3 },
  { item: "knife", cost: 3},
];

export const shop = {
  init() {
    document.getElementById("shop-close").addEventListener("click", () => bus.emit("shop:close"));
    bus.on("shop:open", () => this.open());
    bus.on("shop:close", () => this.close());
    bus.on("state:changed", () => {
      if (this.isOpen()) this.render(); // keep coins / affordability fresh after a buy/sell
    });
  },

  isOpen() {
    return !document.getElementById("shop-window").classList.contains("hidden");
  },

  open() {
    this.render();
    document.getElementById("shop-window").classList.remove("hidden");
  },

  close() {
    document.getElementById("shop-window").classList.add("hidden");
  },

  render() {
    const coins = state.inventory.find((i) => i.item_name === "coins")?.quantity || 0;
    document.getElementById("shop-coins").textContent = coins;
    const host = document.getElementById("shop-stock");
    host.innerHTML = "";
    for (const s of STOCK) {
      const el = document.createElement("div");
      const afford = coins >= s.cost;
      el.className = "shop-item" + (afford ? "" : " cant");
      el.innerHTML =
        `${itemIcon(s.item)}<div class="nm">${s.item}</div>` +
        `<div class="cost">${s.cost} coin${s.cost === 1 ? "" : "s"}</div>`;
      el.title = afford ? `Buy ${s.item} for ${s.cost}` : "Not enough coins";
      el.addEventListener("click", () => bus.emit("shop:buy", { item: s.item }));
      host.appendChild(el);
    }
  },
};
