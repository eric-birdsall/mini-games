export const MEMORY_ROUNDS = 7;
export const MEMORY_LEVELS = {
  easy: { flies: 4, lives: 5, flash: 950, minimum: 550, gap: 300 },
  normal: { flies: 4, lives: 3, flash: 700, minimum: 320, gap: 220 },
  hard: { flies: 4, lives: 2, flash: 480, minimum: 200, gap: 140 },
};
export function createMemory(random = Math.random, level = "normal") {
  const settings = MEMORY_LEVELS[level] || MEMORY_LEVELS.normal;
  return {
    flies: settings.flies,
    sequence: [Math.floor(random() * settings.flies)],
    cursor: 0,
    lives: settings.lives,
    cleared: 0,
    phase: "watch",
  };
}
export function pressMemory(state, tile) {
  if (state.phase !== "recall") return "ignored";
  if (tile !== state.sequence[state.cursor]) {
    state.lives--;
    state.cursor = 0;
    state.phase = state.lives ? "retry" : "lost";
    return state.phase;
  }
  state.cursor++;
  if (state.cursor < state.sequence.length) return "correct";
  state.cleared++;
  state.phase = state.cleared === MEMORY_ROUNDS ? "won" : "complete";
  return state.phase;
}
export function advanceMemory(state, random = Math.random) {
  if (state.phase !== "complete") return;
  state.sequence.push(Math.floor(random() * state.flies));
  state.cursor = 0;
  state.phase = "watch";
}
