// Fire & Ice: a secret-pick duel. Each round both sides pick at once:
// throw a Fire Ball or Ice Ball, or raise a Fire Shield or Ice Shield, at the
// head, body or legs.
//
//   ball vs shield, other height        → hit, a point to the thrower
//   ball vs shield, same height, same   → blocked, nobody scores
//   ball vs shield, same height, other  → bounces back, a point to the shield
//   ball vs ball                        → steam in the middle, nobody scores
//   shield vs shield                    → nothing happens
//
// Recharge: after a throw you must raise a shield on your next turn, so
// shields are worth picking (otherwise always throwing wins).
// First to WIN_SCORE points wins.

export const WIN_SCORE = 5;
export const ELEMENTS = ["fire", "ice"];
export const ACTIONS = ["ball", "shield"];
export const ZONES = ["head", "body", "legs"];

export const MOVES = ACTIONS.flatMap((action) =>
  ELEMENTS.map((element) => ({ action, element })),
);

export function newDuel() {
  return { score: [0, 0], recharging: [false, false], round: 0, winner: null };
}

export const canThrow = (duel, side) => !duel.recharging[side];

// Every move a side may pick this round.
export function legalMoves(duel, side) {
  const out = [];
  for (const move of MOVES) {
    if (move.action === "ball" && !canThrow(duel, side)) continue;
    for (const zone of ZONES) out.push({ ...move, zone });
  }
  return out;
}

export function isLegal(duel, side, move) {
  return (
    !!move &&
    ACTIONS.includes(move.action) &&
    ELEMENTS.includes(move.element) &&
    ZONES.includes(move.zone) &&
    (move.action === "shield" || canThrow(duel, side))
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
  if (a.action === "ball" && b.action === "ball")
    return { outcome: "steam", points: [0, 0] };
  if (a.action === "shield" && b.action === "shield")
    return { outcome: "calm", points: [0, 0] };
  const by = a.action === "ball" ? 0 : 1;
  const ball = by ? b : a;
  const shield = by ? a : b;
  const points = [0, 0];
  if (ball.zone !== shield.zone) {
    points[by] = 1;
    return { outcome: "hit", by, points };
  }
  if (ball.element === shield.element)
    return { outcome: "blocked", by, points };
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
  duel.recharging = [a.action === "ball", b.action === "ball"];
  duel.round++;
  // Both can't reach WIN_SCORE in one round: only one side scores per round.
  if (duel.score[0] >= WIN_SCORE) duel.winner = 0;
  else if (duel.score[1] >= WIN_SCORE) duel.winner = 1;
  return result;
}
