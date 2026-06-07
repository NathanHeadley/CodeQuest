// Quest definitions. Step `id`s are derived from game state where possible
// (movement/attack steps map to action names), so progress reflects automatically.
export const QUESTS = [
  {
    id: "apprentice",
    title: "Apprentice Coder",
    steps: [
      { id: "move_right", text: "Code & bind Move right" },
      { id: "move_left", text: "Code & bind Move left" },
      { id: "move_up", text: "Code & bind Move up" },
      { id: "move_down", text: "Code & bind Move down" },
    ],
  },
  {
    id: "warrior",
    title: "Into Battle",
    steps: [
      { id: "defeat2", text: "Defeat 2 animals in the field" },
      { id: "attack", text: "Code & bind your Attack" },
    ],
  },
  {
    id: "lumberjack",
    title: "Lumberjack",
    steps: [
      { id: "lj_chop", text: "Chop down a tree" },
      { id: "lj_fire", text: "Use a tinderbox on a log to make fire" },
    ],
  },
];
