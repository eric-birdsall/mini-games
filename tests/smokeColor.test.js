import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { useMap } from "../shared/maps.js";
// Seen rules: every smoke cloud gets its own random colour, clearly
// different from the one before. Other rules keep grey smoke.
const hue = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const throwSmoke = (m) =>
  m.detonate({
    kind: "smoke",
    team: "attacker",
    landing: { x: 0, y: 0, z: 0 },
    radius: 4,
    duration: 8,
  });

test("Seen: each smoke is a random colour, unlike the last", () => {
  const m = new Match("SMOKE", false, "seen", false, "compound");
  for (let i = 0; i < 40; i++) throwSmoke(m);
  const colours = m.smokes.map((s) => s.color);
  assert.ok(
    colours.every((c) => /^#[0-9a-f]{6}$/.test(c)),
    "hex colours",
  );
  assert.ok(new Set(colours).size > 30, "varied");
  for (let i = 1; i < colours.length; i++) {
    const gap = Math.abs(
      ((hue(colours[i]) - hue(colours[i - 1]) + 540) % 360) - 180,
    );
    assert.ok(gap >= 55, `throw ${i}: only ${gap.toFixed(0)}° from the last`);
  }
  useMap("compound");
});

test("Soak keeps grey smoke", () => {
  const m = new Match("SMOKE", false, "soak", false, "compound");
  throwSmoke(m);
  assert.equal(m.smokes[0].color, undefined);
  useMap("compound");
});
