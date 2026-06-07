// A small medieval town, built procedurally as a tile grid + entity list.
// Tile indices map to textures generated in tiles.js.

export const TILE = {
  GRASS: 0,
  PATH: 1,
  WATER: 2,
  TREE: 3,
  WALL: 4,
  FIELD: 5,
  FLOOR: 6,
};

// Tiles the player cannot walk onto.
export const BLOCKED = new Set([TILE.WATER, TILE.TREE, TILE.WALL]);

const W = 30;
const H = 22;

function buildGrid() {
  const g = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      let t = TILE.GRASS;
      // Tree border.
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) t = TILE.TREE;
      // Open field on the right third (where animals graze).
      if (x >= 20 && x < W - 1 && y > 0 && y < H - 1) t = TILE.FIELD;
      row.push(t);
    }
    g.push(row);
  }

  // Cross paths through the town centre.
  for (let x = 1; x < 20; x++) g[11][x] = TILE.PATH;
  for (let y = 1; y < H - 1; y++) g[y][10] = TILE.PATH;

  // A small pond.
  rect(g, 2, 2, 4, 3, TILE.WATER);

  // The shop is an open building: wall perimeter, walkable FLOOR interior (so you see
  // and walk inside without the map switching), with a doorway gap.
  shopBuilding(g, 3, 6, 6, 5);
  building(g, 14, 4, 5, 4); // Blacksmith (solid)
  building(g, 13, 14, 6, 5); // Castle (solid)

  return g;
}

function shopBuilding(g, x, y, w, h) {
  rect(g, x, y, w, h, TILE.FLOOR); // floor everywhere inside
  for (let i = x; i < x + w; i++) {
    g[y][i] = TILE.WALL;
    g[y + h - 1][i] = TILE.WALL;
  }
  for (let j = y; j < y + h; j++) {
    g[j][x] = TILE.WALL;
    g[j][x + w - 1] = TILE.WALL;
  }
  g[y + h - 1][x + Math.floor(w / 2)] = TILE.FLOOR; // doorway in the bottom wall
}

function rect(g, x, y, w, h, t) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (g[j] && g[j][i] !== undefined) g[j][i] = t;
}

function building(g, x, y, w, h) {
  rect(g, x, y, w, h, TILE.WALL);
  // doorway floor tile centred on the bottom edge
  const doorX = x + Math.floor(w / 2);
  if (g[y + h]) g[y + h][doorX] = TILE.FLOOR;
}

export const townMap = {
  width: W,
  height: H,
  tiles: buildGrid(),
  spawn: { x: 10, y: 11 },
  // Enemies (sheep/cow) are server-authoritative and arrive via the WebSocket world
  // snapshot. Only static NPCs/signs live here.
  entities: [
    { type: "npc", name: "Guide", x: 11, y: 11 },
    { type: "npc", name: "Shopkeeper", x: 5, y: 8, role: "shop" },
    { type: "sign", name: "Blacksmith", x: 16, y: 8 },
    { type: "sign", name: "Castle", x: 16, y: 19 },
  ],
};

export function isBlocked(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return true;
  return BLOCKED.has(townMap.tiles[y][x]);
}
