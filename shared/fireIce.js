// Fire & Ice: a secret-pick duel. The player picks fire or ice at the start
// and the computer gets the other; the element is only for looks. Each round
// both sides pick at once: attack (throw a ball), reload, or shield. You
// start loaded, and after an attack you must reload before attacking again.
//
//   attack vs reload → hit, a point to the attacker
//   attack vs shield → blocked, nobody scores
//   attack vs attack → the balls meet in a puff of steam, nobody scores
//   anything else    → nothing happens
//
// First to WIN_SCORE points wins.

export const WIN_SCORE = 5;
export const ELEMENTS = ["fire", "ice"];
export const ACTIONS = ["ball", "reload", "shield"];

export const otherElement = (element) => (element === "fire" ? "ice" : "fire");

export function newDuel() {
  return { score: [0, 0], loaded: [true, true], round: 0, winner: null };
}

export const canThrow = (duel, side) => duel.loaded[side];

// Every action a side may pick this round.
export const legalActions = (duel, side) =>
  ACTIONS.filter((a) => a !== "ball" || canThrow(duel, side));

export const isLegal = (duel, side, action) =>
  legalActions(duel, side).includes(action);

// The computer picks at random from its legal actions.
export function computerMove(duel, side = 1, random = Math.random) {
  const actions = legalActions(duel, side);
  return actions[
    Math.min(actions.length - 1, Math.floor(random() * actions.length))
  ];
}

// What happens when action `a` (side 0) meets action `b` (side 1).
// outcome: "steam" | "calm" | "hit" | "blocked"; `by` is the attacking side
// for the last two. `points` is per side.
export function resolve(a, b) {
  const balls = [a, b].filter((x) => x === "ball").length;
  if (balls === 2) return { outcome: "steam", points: [0, 0] };
  if (balls === 0) return { outcome: "calm", points: [0, 0] };
  const by = a === "ball" ? 0 : 1;
  const other = by ? a : b;
  const points = [0, 0];
  if (other === "reload") {
    points[by] = 1;
    return { outcome: "hit", by, points };
  }
  return { outcome: "blocked", by, points };
}

// Play one round: both actions at once. Returns the resolve() result.
export function playRound(duel, a, b) {
  if (duel.winner !== null) throw new Error("The duel is over");
  if (!isLegal(duel, 0, a) || !isLegal(duel, 1, b))
    throw new Error("Illegal move");
  const result = resolve(a, b);
  duel.score[0] += result.points[0];
  duel.score[1] += result.points[1];
  [a, b].forEach((action, side) => {
    if (action === "ball") duel.loaded[side] = false;
    if (action === "reload") duel.loaded[side] = true;
  });
  duel.round++;
  // Only one side scores per round, so both can't reach WIN_SCORE at once.
  if (duel.score[0] >= WIN_SCORE) duel.winner = 0;
  else if (duel.score[1] >= WIN_SCORE) duel.winner = 1;
  return result;
}
