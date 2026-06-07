// Procedurally generated tile + sprite textures, drawn at runtime with Phaser
// Graphics (no binary assets). Restrained, blocky "1-bit-ish" palette -- swap this
// one file for a real Kenney spritesheet later without touching the rest of the game.
import { TILE } from "./townMap.js";

const S = 32; // tile/sprite size in px

// Draw helper: run `draw(g)` then bake it into a texture keyed `name`.
function bake(scene, name, draw, w = S, h = S) {
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  draw(g);
  g.generateTexture(name, w, h);
  g.destroy();
}

function fill(g, color, x, y, w, h) {
  g.fillStyle(color, 1);
  g.fillRect(x, y, w, h);
}

export const TILE_TEXTURE = {
  [TILE.GRASS]: "t_grass",
  [TILE.PATH]: "t_path",
  [TILE.WATER]: "t_water",
  [TILE.TREE]: "t_tree",
  [TILE.WALL]: "t_wall",
  [TILE.FIELD]: "t_field",
  [TILE.FLOOR]: "t_floor",
};

export function generateTextures(scene) {
  // --- Terrain ---
  bake(scene, "t_grass", (g) => {
    fill(g, 0x3b6b35, 0, 0, S, S);
    fill(g, 0x457a3d, 6, 8, 3, 3);
    fill(g, 0x457a3d, 20, 18, 3, 3);
    fill(g, 0x325c2d, 24, 6, 2, 2);
  });
  bake(scene, "t_field", (g) => {
    fill(g, 0x6b8a3a, 0, 0, S, S);
    fill(g, 0x78993f, 10, 12, 4, 2);
    fill(g, 0x5e7a33, 22, 22, 3, 2);
  });
  bake(scene, "t_path", (g) => {
    fill(g, 0xb39a6a, 0, 0, S, S);
    fill(g, 0xa3895a, 4, 4, 3, 3);
    fill(g, 0xc6ad7c, 18, 20, 4, 3);
  });
  bake(scene, "t_water", (g) => {
    fill(g, 0x2f5a8a, 0, 0, S, S);
    fill(g, 0x3d6ea3, 0, 10, S, 3);
    fill(g, 0x3d6ea3, 0, 22, S, 3);
  });
  bake(scene, "t_floor", (g) => {
    fill(g, 0x6b5a3f, 0, 0, S, S);
    fill(g, 0x5a4a32, 0, 0, S, 2);
  });
  bake(scene, "t_tree", (g) => {
    fill(g, 0x3b6b35, 0, 0, S, S); // grass under
    fill(g, 0x4a3620, 14, 20, 4, 8); // trunk
    g.fillStyle(0x244a1f, 1);
    g.fillCircle(16, 14, 11);
    g.fillStyle(0x2f5c27, 1);
    g.fillCircle(13, 11, 6);
  });
  bake(scene, "t_wall", (g) => {
    fill(g, 0x7a7068, 0, 0, S, S);
    g.lineStyle(1, 0x5a514a, 1);
    g.strokeRect(0, 0, S, S);
    fill(g, 0x6b625a, 2, 2, 12, 6);
    fill(g, 0x6b625a, 18, 10, 12, 6);
    fill(g, 0x6b625a, 6, 20, 12, 6);
  });

  // --- Characters / entities (transparent background) ---
  const character = (body, skin = 0xe0b48c) => (g) => {
    fill(g, body, 9, 14, 14, 14); // torso
    g.fillStyle(skin, 1);
    g.fillCircle(16, 9, 6); // head
    fill(g, body, 6, 16, 4, 8); // arms
    fill(g, body, 22, 16, 4, 8);
  };
  bake(scene, "s_player", character(0x3d7ec6));
  bake(scene, "s_other", character(0x9b59b6));
  bake(scene, "s_npc", character(0xc0392b, 0xe0b48c));

  bake(scene, "s_sheep", (g) => {
    g.fillStyle(0xf2efe6, 1);
    g.fillCircle(16, 18, 9); // wool
    g.fillStyle(0x33312c, 1);
    g.fillCircle(22, 14, 4); // head
    fill(g, 0x33312c, 10, 26, 2, 4);
    fill(g, 0x33312c, 20, 26, 2, 4);
  });
  bake(scene, "s_cow", (g) => {
    g.fillStyle(0xf2efe6, 1);
    g.fillRoundedRect(6, 12, 20, 14, 4); // body
    g.fillStyle(0x33312c, 1);
    g.fillCircle(12, 18, 3); // patches
    g.fillCircle(20, 21, 4);
    g.fillStyle(0xd9b6a0, 1);
    g.fillCircle(25, 12, 4); // head
    fill(g, 0x33312c, 9, 26, 2, 4);
    fill(g, 0x22201c, 21, 26, 2, 4);
  });
  bake(scene, "s_fire", (g) => {
    g.fillStyle(0xe07b2f, 1);
    g.fillTriangle(16, 2, 26, 28, 6, 28);
    g.fillStyle(0xf2c14e, 1);
    g.fillTriangle(16, 12, 22, 28, 10, 28);
  });
  bake(scene, "s_sign", (g) => {
    fill(g, 0x6b4a2f, 14, 14, 4, 14); // post
    fill(g, 0x9b7a4f, 4, 4, 24, 12); // board
    g.lineStyle(1, 0x6b4a2f, 1);
    g.strokeRect(4, 4, 24, 12);
  });
  bake(scene, "s_item", (g) => {
    g.fillStyle(0xc9a24a, 1);
    g.fillCircle(16, 18, 8); // generic loot bag
    fill(g, 0x8a6b2f, 12, 9, 8, 4); // tie
    g.fillStyle(0xf2d98a, 1);
    g.fillCircle(13, 16, 2); // glint
  });
  bake(scene, "s_wool", (g) => {
    g.fillStyle(0xf2efe6, 1);
    g.fillCircle(11, 19, 6);
    g.fillCircle(21, 19, 6);
    g.fillCircle(16, 13, 6);
    g.fillCircle(16, 21, 6);
  });
  bake(scene, "s_cowhide", (g) => {
    g.fillStyle(0xd8b489, 1);
    g.fillRoundedRect(5, 8, 22, 16, 5);
    g.fillStyle(0x3a342c, 1);
    g.fillCircle(12, 15, 3);
    g.fillCircle(21, 19, 4);
    g.fillCircle(20, 12, 2);
  });
  bake(scene, "s_rawbeef", (g) => {
    g.fillStyle(0xc0504d, 1);
    g.fillCircle(16, 17, 9);
    g.fillStyle(0xd97a77, 1);
    g.fillCircle(15, 16, 5);
    g.fillStyle(0xf2efe6, 1);
    g.fillCircle(24, 12, 3);
  });
  bake(scene, "s_hatchet", (g) => {
    fill(g, 0x6b4a2f, 15, 9, 3, 18); // handle
    g.fillStyle(0xc2c8cf, 1);
    g.fillTriangle(15, 7, 27, 12, 15, 16); // blade
  });
  bake(scene, "s_tinderbox", (g) => {
    fill(g, 0x6b4a2f, 7, 14, 18, 10); // wooden box
    g.lineStyle(1, 0x4a3620, 1);
    g.strokeRect(7, 14, 18, 10);
    fill(g, 0x8a6b3f, 7, 14, 18, 3); // lid
    g.fillStyle(0xe07b2f, 1);
    g.fillTriangle(16, 6, 20, 14, 12, 14); // spark/flame
  });
  // Mineable rock object (transparent background; drawn over a grass tile).
  bake(scene, "s_rock", (g) => {
    g.fillStyle(0x8a8f96, 1);
    g.fillCircle(16, 19, 10);
    g.fillStyle(0x70757c, 1);
    g.fillCircle(12, 21, 5);
    g.fillStyle(0x5e636a, 1);
    g.fillCircle(21, 22, 4);
    g.fillStyle(0xb9772f, 1); // ore fleck
    g.fillCircle(19, 14, 2);
  });
  // Choppable tree object (transparent background; drawn over a grass tile).
  bake(scene, "s_tree", (g) => {
    fill(g, 0x4a3620, 14, 20, 5, 10); // trunk
    g.fillStyle(0x244a1f, 1);
    g.fillCircle(16, 13, 12);
    g.fillStyle(0x2f5c27, 1);
    g.fillCircle(12, 10, 7);
    g.fillStyle(0x357031, 1);
    g.fillCircle(20, 11, 5);
  });
}
