import { test } from "node:test";
import assert from "node:assert/strict";
import { placementCheck } from "../shared/placement.js";
import { useMap } from "../shared/maps.js";

// Facing the east perimeter wall (x 18.5) from 3 m away on The Compound.
const atWall = (pitch) => ({ x: 15.5, y: 0, z: 12, yaw: -Math.PI / 2, pitch });

test("placement rules give a reason the ghost can show in red", () => {
  useMap("compound");
  assert.equal(placementCheck(atWall(-0.3), "tripwire").ok, true);
  assert.match(placementCheck(atWall(0), "tripwire").reason, /0\.1–1\.5 m/);
  assert.match(placementCheck(atWall(-0.3), "sensor").reason, /flat top/);
  assert.equal(placementCheck(atWall(-0.3), "camera").ok, true);
  const floor = { ...atWall(-1.2) };
  assert.equal(placementCheck(floor, "sensor").ok, true);
  assert.match(placementCheck(floor, "camera").reason, /vertical wall/);
  assert.match(
    placementCheck({ ...atWall(-0.3), yaw: Math.PI, pitch: 0.5 }, "camera")
      .reason,
    /within 7 m/,
  );
  // Second anchor: too far from the first.
  const far = placementCheck(atWall(-0.3), "tripwire", {
    anchor: { x: 5, y: 0.6, z: 12, normal: { x: 1, y: 0, z: 0 } },
    span: 6,
  });
  assert.match(far.reason, /too long: 13\.\d m \(max 6 m\)/);
});

test("anchoring a wire reports its height, so the hint can say if it's jumpable", () => {
  useMap("compound");
  const first = placementCheck(atWall(-0.3), "tripwire");
  // Eye 1.65 m up, 3 m away, aimed 0.3 rad down: about 0.74 m up.
  assert.ok(Math.abs(first.height - (1.65 - 3 * Math.tan(0.3))) < 0.05);
  // A wire's height is its higher end.
  const second = placementCheck(atWall(-0.3), "tripwire", {
    anchor: { x: 18.4, y: 1.2, z: 9, normal: { x: -1, y: 0, z: 0 } },
    span: 6,
  });
  assert.equal(second.height, 1.2);
});

test("only your own side's devices block placement", () => {
  useMap("compound");
  const spot = placementCheck(atWall(-1.2), "sensor").hit;
  const near = (team) => [
    {
      id: 1,
      kind: "camera",
      team,
      x: spot.x,
      y: spot.y,
      z: spot.z + 0.2,
      active: true,
    },
  ];
  assert.equal(
    placementCheck(atWall(-1.2), "sensor", {
      gadgets: near("attacker"),
      team: "defender",
    }).ok,
    true,
    "right next to the other side's device is fine",
  );
  assert.match(
    placementCheck(atWall(-1.2), "sensor", {
      gadgets: near("defender"),
      team: "defender",
    }).reason,
    /one of your devices/,
  );
});
