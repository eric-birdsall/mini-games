import { test } from "node:test";
import assert from "node:assert/strict";
import { MAPS, useMap, useObjectives } from "../shared/maps.js";
import { clearSight, overlapsFootprint } from "../shared/map.js";
import { decoyPath, freeDecoyPoint } from "../shared/decoy.js";
import { OBJECTIVES, SPAWNS } from "../shared/config.js";
// The older maps' plant sites: A and C, each with three ways in (its
// lane's mouth, a side door from the middle, a back gap toward the
// sentinels) and a lookout that sees its terminal.
const SITES = {
  compound: {
    A: {
      ways: [
        { x: -8.5, z: -2.5 },
        { x: -4.8, z: -11.25 },
        { x: -10.5, z: -19.5 },
      ],
      lookout: { x: -16.65, y: 1.6, z: -16.3 },
    },
    C: {
      ways: [
        // Up the service yard's stairs onto the overlook, then down.
        { x: 16, y: 2.4, z: -8 },
        { x: 4.8, z: -14 },
        { x: 17.2, z: -23.5 },
      ],
      lookout: { x: 16, y: 2.4, z: -8 },
    },
  },
  lanes: {
    A: {
      ways: [
        { x: -14, z: -5 },
        { x: -7.3, z: -9.75 },
        { x: -10, z: -21.5 },
      ],
      lookout: { x: -16.65, y: 1.6, z: -18.3 },
    },
    C: {
      ways: [
        { x: 11, z: -5.5 },
        { x: 7.3, z: -9.75 },
        { x: 10, z: -21.5 },
      ],
      lookout: { x: 16.75, y: 1.6, z: -18.3 },
    },
  },
  quad: {
    A: {
      ways: [
        { x: -14, z: -5.5 },
        { x: -7.3, z: -9.75 },
        { x: -10, z: -21.5 },
      ],
      lookout: { x: -16.65, y: 1.6, z: -18.3 },
    },
    C: {
      ways: [
        { x: 14.8, z: -5.5 },
        { x: 7.3, z: -9.75 },
        { x: 10, z: -21.5 },
      ],
      lookout: { x: 16.75, y: 1.6, z: -18.3 },
    },
  },
  monolith: {
    A: {
      ways: [
        { x: -12.5, z: -10 },
        { x: -7, z: -18 },
        { x: -12.5, z: -22 },
      ],
      lookout: { x: -19.5, y: 2.4, z: -14 },
    },
    C: {
      ways: [
        { x: 12.5, z: -10 },
        { x: 7, z: -18 },
        { x: 12.5, z: -22 },
      ],
      lookout: { x: 19.5, y: 2.4, z: -14 },
    },
  },
};

test("plant mode on the older maps keeps A and C; extract keeps all three", () => {
  for (const id of Object.keys(SITES)) {
    useMap(id);
    useObjectives("plant");
    assert.deepEqual(
      OBJECTIVES.map((o) => o.id),
      ["A", "C"],
      id,
    );
    useObjectives("extract");
    assert.deepEqual(
      OBJECTIVES.map((o) => o.id),
      ["A", "B", "C"],
      id,
    );
    assert.ok(
      MAPS[id].approaches.some(([name]) => name === "Sites"),
      `${id}: the Field Manual describes the sites`,
    );
  }
  useMap("compound");
});

test("each older site has three ways in and a lookout over its terminal", () => {
  for (const [id, sites] of Object.entries(SITES)) {
    useMap(id);
    for (const [site, { ways, lookout }] of Object.entries(sites)) {
      const t = MAPS[id].terminals.find((t) => t.id === site),
        pad = { x: t.x, z: t.z + 1.2 },
        name = `${id} ${site}`;
      assert.ok(freeDecoyPoint(pad), `${name}: open in front of the terminal`);
      assert.ok(decoyPath(SPAWNS.attacker, pad), `${name}: from staging`);
      assert.ok(decoyPath(SPAWNS.defender, pad), `${name}: from the sentinels`);
      for (const w of ways) {
        // A way in from above (The Compound's overlook) is checked by sight.
        if (w.y) continue;
        assert.ok(freeDecoyPoint(w), `${name}: ${w.x},${w.z} open`);
        assert.ok(decoyPath(w, pad, 4000), `${name}: in from ${w.x},${w.z}`);
      }
      assert.ok(
        clearSight(
          { ...lookout, y: lookout.y + 1.2 },
          { x: t.x, y: 1.3, z: t.z },
        ),
        `${name}: the lookout sees the terminal`,
      );
    }
  }
  useMap("compound");
});

test("the plant sites' pieces leave no slit under a metre beside them", () => {
  for (const id of Object.keys(SITES)) {
    const solids = MAPS[id].walls.filter(
      (w) => !w.bottom && w.h > 0.45 && !w.shape && w.kind !== "terminal",
    );
    for (const a of solids.filter((w) => w.plantSite))
      for (const b of solids)
        for (const axis of ["x", "z"]) {
          if (a === b) continue;
          const size = axis === "x" ? "w" : "d",
            other = axis === "x" ? "z" : "x",
            span = axis === "x" ? "d" : "w",
            gap = Math.abs(a[axis] - b[axis]) - (a[size] + b[size]) / 2,
            lo = Math.max(a[other] - a[span] / 2, b[other] - b[span] / 2),
            hi = Math.min(a[other] + a[span] / 2, b[other] + b[span] / 2);
          if (gap <= 0.001 || gap >= 0.95 || hi - lo <= 0.05) continue;
          // Unless something else fills it (a step between two others).
          const p = { [other]: (lo + hi) / 2 };
          p[axis] =
            Math.min(a[axis] + a[size] / 2, b[axis] + b[size] / 2) + gap / 2;
          assert.ok(
            solids.some(
              (w) => w !== a && w !== b && overlapsFootprint(w, p.x, p.z),
            ),
            `${id}: ${gap.toFixed(2)} m slit between the site piece at ${a.x},${a.z} and ${b.kind} at ${b.x},${b.z}`,
          );
        }
  }
});
