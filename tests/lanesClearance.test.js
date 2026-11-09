import { test } from "node:test";
import assert from "node:assert/strict";
import { MAPS, useMap } from "../shared/maps.js";
import {
  WALLS,
  segmentBox,
  overlapsFootprint,
  movePlayer,
  raySurface,
} from "../shared/map.js";
import { freeDecoyPoint, decoyPath } from "../shared/decoy.js";
import { findClamber } from "../shared/clamber.js";

test("The Lanes has no unfilled rectangular slits narrower than one metre", () => {
  const ws = MAPS.lanes.walls.filter(
    (w) => !w.bottom && w.h > 0.45 && !w.shape,
  );
  for (let i = 0; i < ws.length; i++)
    for (const b of ws.slice(i + 1))
      for (const axis of ["x", "z"]) {
        const a = ws[i],
          size = axis === "x" ? "w" : "d",
          other = axis === "x" ? "z" : "x",
          span = axis === "x" ? "d" : "w",
          gap = Math.abs(a[axis] - b[axis]) - (a[size] + b[size]) / 2,
          lo = Math.max(a[other] - a[span] / 2, b[other] - b[span] / 2),
          hi = Math.min(a[other] + a[span] / 2, b[other] + b[span] / 2);
        if (gap <= 0.001 || gap >= 1 - 0.001 || hi - lo <= 0.05) continue;
        const left = a[axis] < b[axis] ? a : b,
          right = left === a ? b : a;
        // Sample the entire shared opening, rather than only its middle.
        for (let u = 0.1; u < 1; u += 0.2)
          for (let v = 0.1; v < 1; v += 0.2) {
            const p = {};
            p[axis] = left[axis] + left[size] / 2 + gap * u;
            p[other] = lo + (hi - lo) * v;
            assert.ok(
              ws.some(
                (w) =>
                  overlapsFootprint(w, p.x, p.z) &&
                  w.h >= Math.min(a.h, b.h) - 0.001,
              ),
              `unfilled ${gap.toFixed(2)} m ${axis} slit at ${p.x},${p.z}`,
            );
          }
      }
});

test("The Lanes plaza has circular cover reachable from both spawns", () => {
  useMap("lanes");
  const tanks = MAPS.lanes.walls.filter((w) => w.shape === "cylinder");
  assert.equal(tanks.length, 6);
  for (const tank of tanks) {
    // Adjacent refuge/peek position, beyond the actual circular surface.
    const p = { x: tank.x, z: tank.z + tank.w / 2 + 0.7 };
    assert.ok(freeDecoyPoint(p));
    assert.ok(decoyPath(MAPS.lanes.spawns.attacker, p));
    assert.ok(decoyPath(MAPS.lanes.spawns.defender, p));
  }
  assert.ok(
    MAPS.lanes.walls.some((w) => w.kind === "building" && w.d === 0.24),
  );
  useMap("compound");
});

test("round cover uses circular movement, ray, placement, routing and clamber geometry", () => {
  useMap("lanes");
  const saved = [...WALLS],
    tank = {
      x: 0,
      z: 0,
      w: 1.5,
      d: 1.5,
      h: 1.25,
      kind: "tank",
      shape: "cylinder",
    };
  WALLS.splice(0, WALLS.length, tank);
  try {
    assert.equal(
      overlapsFootprint(tank, 0.8, 0.8, 0.32),
      false,
      "bounding-square corner is walkable",
    );
    const p = { x: 0.9, z: 1, y: 0, vy: 0 };
    movePlayer(p, 0, -0.15);
    assert.equal(p.z, 0.85, "walks past the curved corner");
    assert.ok(freeDecoyPoint({ x: 0.9, z: 0.9 }));
    assert.ok(decoyPath({ x: -2, z: 0 }, { x: 2, z: 0 }));
    assert.equal(
      segmentBox({ x: 0.8, y: 0.5, z: 0.8 }, { x: 1.5, y: 0.5, z: 1.5 }, tank),
      null,
    );
    assert.equal(
      segmentBox({ x: -2, y: 0.5, z: 0 }, { x: 2, y: 0.5, z: 0 }, tank),
      0.3125,
    );
    const hit = raySurface({
      x: -2,
      z: 0,
      y: 0,
      yaw: -Math.PI / 2,
      pitch: -0.5,
    });
    assert.ok(Math.abs(hit.normal.x + 1) < 0.001);
    assert.equal(hit.normal.y, 0);
    assert.ok(findClamber({ x: -1.1, z: 0, y: 0, yaw: -Math.PI / 2 }));
  } finally {
    WALLS.splice(0, WALLS.length, ...saved);
    useMap("compound");
  }
});

test("east-lane baffles meet the wall and leave a walkable route around their front", () => {
  useMap("lanes");
  const panel = MAPS.lanes.walls.find(
    (w) => w.style === "panel" && w.z === 13 && w.x > 9,
  );
  assert.equal(
    panel.x - panel.w / 2,
    9,
    "flush with the divider, no false gap behind it",
  );
  const p = { x: 10.3, z: 14.5, y: 0, vy: 0 };
  for (let i = 0; i < 90; i++) movePlayer(p, 0, -0.035);
  assert.ok(p.z < 12, "walks past the baffle at standing height");
  useMap("compound");
});

test("The Lanes adds varied cover on low and raised routes without closing ledge approaches", () => {
  useMap("lanes");
  const props = MAPS.lanes.walls.filter((w) => w.laneDetail);
  // (Fewer since the terminals' pads, the spawn bunker and the plant sites
  // were cleared.)
  assert.ok(props.length >= 20);
  for (const style of ["crate", "halfwall", "ledge"])
    assert.ok(props.some((w) => w.style === style));
  assert.ok(
    props.some((w) => w.bottom === 2) && props.some((w) => w.bottom === 2.4),
  );
  const ledge = props.find(
    (w) => w.style === "ledge" && w.z === 17.5 && w.x < 0,
  );
  const p = {
    x: ledge.x - ledge.w / 2 - 0.35,
    z: ledge.z,
    y: 0,
    yaw: -Math.PI / 2,
  };
  assert.ok(findClamber(p), "new loading ledge can be clambered onto");
  useMap("compound");
});
