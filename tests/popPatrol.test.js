import test from "node:test";
import assert from "node:assert/strict";
import {
  BUBBLES,
  GIANT,
  LEVELS,
  OBSTACLES,
  PATH,
  PATH_LENGTH,
  RAINBOW,
  TOWERS,
  canPlace,
  createGame,
  distanceToPath,
  layers,
  place,
  pointAt,
  sell,
  startWave,
  step,
  towerStats,
  upgrade,
  waveSpawns,
} from "../shared/popPatrol.js";

const DT = 1 / 30;

// A sensible player: a build order of defenders and upgrades, bought as
// soon as there's money, starting each wave as soon as the last is done.
const PLAN = [
  ["gnome", -7, 2],
  ["gnome", 1, 1],
  ["up", 0, 0],
  ["sprinkler", -7, -2],
  ["up", 1, 0],
  ["up", 0, 1],
  ["sprinkler", 1, -2],
  ["catapult", -7, 9],
  ["up", 2, 1],
  ["fan", 9, 4],
  ["up", 3, 0],
  ["frog", -14, -2],
  ["up", 4, 1],
  ["up", 1, 1],
  ["catapult", 9, -3],
  ["up", 5, 0],
  ["up", 6, 0],
  ["up", 7, 0],
  ["frog", 1, -8],
  ["up", 8, 0],
  ["up", 4, 0],
  ["up", 6, 1],
  ["up", 7, 1],
  ["up", 8, 1],
  ["frog", 16, -5],
  ["up", 9, 0],
  ["up", 9, 1],
  ["up", 5, 1],
  ["up", 5, 0],
  ["up", 6, 0],
  ["up", 8, 0],
  ["up", 8, 1],
  ["up", 9, 0],
  ["up", 9, 1],
  ["frog", -14, 9],
  ["up", 10, 0],
  ["up", 10, 1],
  ["up", 10, 0],
  ["up", 10, 1],
];

function play(level, plan = PLAN) {
  const game = createGame(level);
  let next = 0;
  for (let frame = 0; !game.over && frame < 200000; frame++) {
    while (next < plan.length) {
      const [what, a, b] = plan[next];
      if (what === "up") {
        const tower = game.towers[a];
        if (!tower) break;
        const done = tower.levels[b] >= 2;
        if (!done && !upgrade(game, tower, b)) break;
      } else if (!place(game, what, a, b)) {
        assert.ok(canPlace(game, a, b), `plan spot ${a},${b} is buildable`);
        break;
      }
      next++;
    }
    if (!game.waveActive) startWave(game);
    step(game, DT);
  }
  return game;
}

test("the path runs from the fence gap to the back door", () => {
  assert.deepEqual(pointAt(0), { x: PATH[0][0], z: PATH[0][1] });
  const end = pointAt(PATH_LENGTH);
  assert.deepEqual([end.x, end.z], PATH.at(-1));
  assert.equal(distanceToPath(-11, 0), 0);
});

test("defenders can't stand on the path, obstacles or each other", () => {
  const game = createGame("normal");
  assert.equal(canPlace(game, -11, 0), false);
  assert.equal(canPlace(game, -11 + 1.5, 0), false);
  for (const o of OBSTACLES) assert.equal(canPlace(game, o.x, o.z), false);
  assert.equal(canPlace(game, 30, 0), false);
  assert.ok(place(game, "gnome", -7, 2));
  assert.equal(canPlace(game, -7, 3), false);
  assert.ok(canPlace(game, -7, 4));
});

test("money buys defenders and upgrades; selling gives most of it back", () => {
  const game = createGame("normal");
  const start = game.cash;
  const gnome = place(game, "gnome", -7, 2);
  assert.equal(game.cash, start - TOWERS.gnome.cost);
  assert.ok(upgrade(game, gnome, 0));
  assert.equal(towerStats(gnome).pierce, TOWERS.gnome.base.pierce + 2);
  const spent = start - game.cash;
  sell(game, gnome);
  assert.equal(game.cash, start - spent + Math.floor(spent * 0.7));
  assert.equal(game.towers.length, 0);
  game.cash = 0;
  assert.equal(place(game, "frog", -7, 2), null);
});

test("a pop takes one layer; rainbows and giants burst into smaller ones", () => {
  assert.equal(layers(0), 1);
  assert.equal(layers(4), 5);
  assert.equal(layers(RAINBOW), BUBBLES[RAINBOW].hp + 10);
  assert.equal(layers(GIANT), BUBBLES[GIANT].hp + 3 * layers(RAINBOW));

  const game = createGame("normal");
  place(game, "sprinkler", -5.5, 3);
  game.bubbles.push({
    id: 900,
    tier: 4,
    hp: 0,
    d: 30,
    slow: 1,
    ...pointAt(30),
  });
  game.bubbles.push({
    id: 901,
    tier: RAINBOW,
    hp: 1,
    d: 30,
    slow: 1,
    ...pointAt(30),
  });
  const events = step(game, DT);
  const pops = events.filter((e) => e.type === "pop");
  assert.deepEqual(
    pops.map((p) => [p.id, p.tier, p.to]),
    [
      [900, 4, 3],
      [901, RAINBOW, undefined],
    ],
  );
  assert.equal(game.bubbles.filter((b) => b.tier === 4).length, 2);
  assert.equal(game.bubbles.find((b) => b.id === 900).tier, 3);
});

test("bubbles that reach the door cost lives; an empty yard loses", () => {
  const game = play("easy", []);
  assert.equal(game.over, "lost");
  assert.ok(game.wave <= 7, `lost on wave ${game.wave}`);
});

test("waves get bigger, bring new bubbles, and end with a Big Soapy", () => {
  for (const [level, settings] of Object.entries(LEVELS)) {
    const first = waveSpawns(1, settings);
    assert.ok(
      first.every((s) => s.tier === 0),
      level,
    );
    const last = waveSpawns(settings.waves, settings);
    assert.ok(
      last.some((s) => s.tier === GIANT),
      `${level} ends with a giant`,
    );
    assert.ok(last.length > first.length * 2);
  }
});

test("a sensible build order wins on every difficulty", () => {
  for (const level of Object.keys(LEVELS)) {
    const game = play(level);
    assert.equal(
      game.over,
      "won",
      `${level}: lost on wave ${game.wave} with ${game.towers.length} defenders`,
    );
    console.log(
      `${level}: won with ${game.lives}/${game.settings.lives} lives, $${game.cash} left`,
    );
  }
});

test("half the build order isn't enough on Hard", () => {
  const game = play("hard", PLAN.slice(0, 9));
  assert.equal(game.over, "lost");
});
