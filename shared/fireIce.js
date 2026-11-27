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

// The computer leans toward sensible moves, using what's shown on screen:
// whether it and its opponent are loaded.
// - If you can't attack, it mostly attacks or reloads, and rarely shields.
// - If you can attack, it mostly attacks or shields when it's loaded, and
//   mixes reloading with shielding when it isn't.
const SENSIBLE = {
  // [computer loaded, opponent loaded]: { action: weight }
  "true,false": { ball: 0.6, reload: 0.2, shield: 0.2 },
  "false,false": { reload: 0.8, shield: 0.2 },
  "true,true": { ball: 0.45, reload: 0.1, shield: 0.45 },
  "false,true": { reload: 0.5, shield: 0.5 },
};
// How far it leans from a random pick toward the sensible weights. Wins
// add up over a first-to-five game, so a little goes a long way: at 0.25 a
// player tapping at random wins about 35% of games (50% against pure
// random); at 1 they'd win about 6%.
export const SMARTS = 0.25;

// The computer's pick: a legal action, weighted by the situation.
export function computerMove(
  duel,
  side = 1,
  random = Math.random,
  smarts = SMARTS,
) {
  const actions = legalActions(duel, side);
  const sensible =
    SENSIBLE[[duel.loaded[side], duel.loaded[1 - side]].join()] ?? {};
  const weights = actions.map(
    (a) => smarts * (sensible[a] ?? 0) + (1 - smarts) / actions.length,
  );
  let roll = random() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < actions.length; i++) {
    roll -= weights[i];
    if (roll < 0) return actions[i];
  }
  return actions[actions.length - 1];
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
