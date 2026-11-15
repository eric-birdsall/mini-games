import assert from "node:assert/strict";
import test from "node:test";
import {
  TABLE,
  ZONES,
  launchPuck,
  powerForDistance,
  puckPoints,
  scoreEnd,
  stepPucks,
} from "../shared/shuffleboard.js";

function settle(pucks) {
  for (let step = 0; step < 600; step++) {
    if (!stepPucks(pucks, 1 / 120)) return;
  }
  assert.fail("Pucks did not settle");
}

test("meter power maps to stopping distance on a clear table", () => {
  const target = 900;
  const puck = launchPuck(0, 0, powerForDistance(target - TABLE.launch));
  settle([puck]);
  assert.ok(Math.abs(puck.x - target) < 0.001);
  assert.equal(puckPoints(puck), 3);
});

test("a shot can knock a rival off the end and remain on the table", () => {
  const rival = { ...launchPuck(1, 0, 0), x: 949 };
  const shot = launchPuck(0, 0, 1);
  settle([rival, shot]);
  assert.equal(rival.out, true);
  assert.equal(shot.out, false);
  assert.deepEqual(scoreEnd([rival, shot]), { team: 0, points: 3 });
});

test("a puck must clear the scoring line and can score four over the lip", () => {
  const puck = launchPuck(0, 0, 0);
  puck.x = ZONES[0] + TABLE.radius - 1;
  assert.equal(puckPoints(puck), 0);
  puck.x++;
  assert.equal(puckPoints(puck), 1);
  puck.x = TABLE.length - 1;
  assert.deepEqual(scoreEnd([puck]), { team: 0, points: 4 });
});

test("only pucks ahead of the rival's best score, and ties cancel", () => {
  const puck = (team, x) => ({ ...launchPuck(team, 0, 0), x });
  assert.deepEqual(
    scoreEnd([puck(0, 940), puck(0, 910), puck(0, 810), puck(1, 850)]),
    {
      team: 0,
      points: 6,
    },
  );
  assert.equal(scoreEnd([puck(0, 940), puck(1, 940)]).points, 0);
});
