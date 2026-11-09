import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLaunch } from "../src/launch.js";

test("URL quick start: the example from the request", () => {
  const launch = parseLaunch("?type=training&team=inf&map=pier9&tripwire=3");
  assert.deepEqual(
    { ...launch, unknown: launch.unknown },
    {
      mode: "training",
      team: "attacker",
      rule: "seen",
      botLevel: "normal",
      map: "docks",
      objective: "extract",
      kit: { tripwire: 3 },
      unknown: [],
    },
  );
});

test("URL quick start: aliases, map names, short codes and junk", () => {
  assert.equal(parseLaunch(""), null, "no type: the normal menu");
  assert.equal(parseLaunch("?map=pier9"), null);
  const solo = parseLaunch(
    "?type=solo&team=sentinel&map=The%20Monolith&rule=removed&TRP=2&smoke=1&cameraDecoy=2",
  );
  assert.equal(solo.mode, "solo");
  assert.equal(solo.team, "defender");
  assert.equal(solo.map, "monolith");
  assert.equal(solo.rule, "removed");
  assert.deepEqual(solo.kit, { tripwire: 2, smoke: 1, cameraDecoy: 2 });
  assert.equal(parseLaunch("?type=solo&bot=Hard").botLevel, "hard");
  assert.equal(parseLaunch("?type=solo&rule=splash").rule, "splash");
  for (const objective of ["Plant", "sweep", "bugsweep", "gauntlet", "lightsout"]) {
    const launch = parseLaunch(`?type=solo&objective=${objective}`);
    assert.equal(launch.objective, "extract");
    assert.deepEqual(launch.unknown, [`objective=${objective}`]);
  }
  assert.deepEqual(parseLaunch("?type=solo&objective=bomb").unknown, [
    "objective=bomb",
  ]);
  const odd = parseLaunch("?type=solo&bot=brutal");
  assert.equal(odd.botLevel, "normal");
  assert.deepEqual(odd.unknown, ["bot=brutal"]);
  for (const [type, mode] of [
    ["range", "training"],
    ["field", "solo"],
    ["private", "multi"],
  ])
    assert.equal(parseLaunch(`?type=${type}`).mode, mode);
  assert.equal(parseLaunch("?type=training&map=docks").map, "docks");
  const junk = parseLaunch("?type=training&map=atlantis&laser=4&tripwire=x");
  assert.equal(junk.mode, "training", "still starts");
  assert.equal(junk.map, null, "falls back to the default map");
  assert.deepEqual(junk.unknown, ["map=atlantis", "laser=4", "tripwire=x"]);
  assert.equal(parseLaunch("?type=chess").mode, null, "unknown type: menu");
});
