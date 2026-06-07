export const GAME_DATA = {
  items: {
    coins: {
      name: "Coins",
      stackable: true,
      price: 1,
      sellPrice: 1
    },

    hatchet: {
      name: "Hatchet",
      price: 3,
      sellPrice: 1
    },

    pickaxe: {
      name: "Pickaxe",
      price: 5,
      sellPrice: 2
    },

    hammer: {
      name: "Hammer",
      price: 3,
      sellPrice: 1
    },

    knife: {
      name: "Knife",
      price: 3,
      sellPrice: 1
    },

    log: {
      name: "Log",
      price: 5,
      sellPrice: 3
    },

    ore: {
      name: "Ore",
      price: 8,
      sellPrice: 5
    },

    wool: {
      name: "Wool",
      price: 2,
      sellPrice: 1
    },

    cowhide: {
      name: "Cowhide",
      price: 4,
      sellPrice: 2
    },

    "raw beef": {
      name: "Raw Beef",
      price: 2,
      sellPrice: 1
    },

    beef: {
      name: "Beef",
      edible: true,
      heal: 5,
      price: 4,
      sellPrice: 2
    },

    tinderbox: {
      name: "Tinderbox",
      price: 3,
      sellPrice: 1
    }
  },

  shops: {
    shopkeeper: {
      id: "shopkeeper",

      stock: ["pickaxe", "hammer", "knife"],

      buyMultiplier: 1.0,
      sellMultiplier: 1.0
    }
  }
};