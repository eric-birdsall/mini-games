import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { GADGETS, RULES, SPLASH_GADGETS, allowed } from "../shared/config.js";
import { PARTY } from "../shared/party.js";
import { backyard } from "../shared/kidWords.js";

test("every rule and side offers only the four Splash backpack gadgets", () => {
  for (const rule of RULES) {
    const m = new Match("BAG", false, rule);
    for (const team of ["attacker", "defender"]) {
      assert.deepEqual(
        Object.keys(GADGETS)
          .filter((k) => m.canUse({ team }, GADGETS[k]))
          .sort(),
        [...SPLASH_GADGETS].sort(),
      );
      for (const kind of Object.keys(GADGETS))
        assert.equal(
          allowed(rule, kind),
          !!GADGETS[kind].modeWeapon || SPLASH_GADGETS.includes(kind),
        );
    }
  }
});

test("party kits and shops never issue removed backpack gadgets", () => {
  for (const def of Object.values(PARTY)) {
    for (const key of ["hideKit", "seekKit", "runKit", "guardKit", "shop"]) {
      const kit = def[key];
      if (!kit) continue;
      for (const kind of Array.isArray(kit) ? kit : Object.keys(kit))
        assert.ok(allowed("soak", kind), `${def.name}: ${kind}`);
    }
  }
});

test("gadget names and backpack language are kid friendly in every game", () => {
  assert.deepEqual(
    SPLASH_GADGETS.map((k) => GADGETS[k].name),
    ["Smoke Puff", "Glitter Popper", "Peek-a-Boo Ball", "Door Stopper"],
  );
  assert.equal(backyard("YOUR LOADOUT"), "YOUR BACKPACK");
});
