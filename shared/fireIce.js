// Fire & Ice: a secret-pick duel. Each round both sides pick at once:
// throw a Fire Ball or Ice Ball, raise a Fire Shield or Ice Shield, or
// reload. You start loaded; after a throw you must reload before you can
// throw again.
//
//   ball vs reload               → hit, a point to the thrower
//   ball vs shield, same element → blocked, nobody scores
//   ball vs shield, other element→ bounces back, a point to the shield
//   ball vs ball                 → steam in the middle, nobody scores
//   anything else                → nothing happens
//
// First to WIN_SCORE points wins.

export const WIN_SCORE = 5;
export const ELEMENTS = ["fire", "ice"];

export const MOVES = [
  { action: "ball", element: "fire" },
  { action: "ball", element: "ice" },
  { action: "reload", element: null },
  { action: "shield", element: "fire" },
  { action: "shield", element: "ice" },
];

export function newDuel() {
  return { score: [0, 0], loaded: [true, true], round: 0, winner: null };
}

export const canThrow = (duel, side) => duel.loaded[side];

// Every move a side may pick this round.
export const legalMoves = (duel, side) =>
  MOVES.filter((m) => m.action !== "ball" || canThrow(duel, side));

export function isLegal(duel, side, move) {
  return (
    !!move &&
    MOVES.some((m) => m.action === move.action && m.element === move.element) &&
    (move.action !== "ball" || canThrow(duel, side))
  );
}

// The computer picks at random from its legal moves.
export function computerMove(duel, side = 1, random = Math.random) {
  const moves = legalMoves(duel, side);
  return moves[Math.min(moves.length - 1, Math.floor(random() * moves.length))];
}

// What happens when `a` (side 0) meets `b` (side 1). `points` is per side.
// outcome: "steam" | "calm" | "hit" | "blocked" | "bounce"; `by` is the
// throwing side for the last three.
export function resolve(a, b) {
  const balls = [a, b].filter((m) => m.action === "ball").length;
  if (balls === 2) return { outcome: "steam", points: [0, 0] };
  if (balls === 0) return { outcome: "calm", points: [0, 0] };
  const by = a.action === "ball" ? 0 : 1;
  const ball = by ? b : a;
  const other = by ? a : b;
  const points = [0, 0];
  if (other.action === "reload") {
    points[by] = 1;
    return { outcome: "hit", by, points };
  }
  if (ball.element === other.element) return { outcome: "blocked", by, points };
  points[1 - by] = 1;
  return { outcome: "bounce", by, points };
}

// Play one round: both moves at once. Returns the resolve() result.
export function playRound(duel, a, b) {
  if (duel.winner !== null) throw new Error("The duel is over");
  if (!isLegal(duel, 0, a) || !isLegal(duel, 1, b))
    throw new Error("Illegal move");
  const result = resolve(a, b);
  duel.score[0] += result.points[0];
  duel.score[1] += result.points[1];
  [a, b].forEach((m, side) => {
    if (m.action === "ball") duel.loaded[side] = false;
    if (m.action === "reload") duel.loaded[side] = true;
  });
  duel.round++;
  // Only one side scores per round, so both can't reach WIN_SCORE at once.
  if (duel.score[0] >= WIN_SCORE) duel.winner = 0;
  else if (duel.score[1] >= WIN_SCORE) duel.winner = 1;
  return result;
}
