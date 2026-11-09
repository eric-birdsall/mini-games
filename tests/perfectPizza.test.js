import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  BACK,
  BOWLS,
  COOK_TIME,
  MOST_ONE,
  MOST_TWO,
  READY_TIME,
  TOPPING_IDS,
  WARN_TIME,
  cookPhase,
  createKitchen,
  currentStep,
  doneness,
  makeOrder,
  orderLine,
  recipe,
  rng,
  roundOrders,
  stationsFor,
  stepLine,
  tap,
  tick,
  voicePhrases,
  wanted,
  wrongLine,
} from "../shared/perfectPizza.js";

const types = (events) => events.map((e) => e.type);
const pizza = (...toppings) => ({
  toppings: toppings.map(([topping, count]) => ({ topping, count })),
});

// Play a kitchen to the end the right way, waiting `wait` seconds at the
// oven. Returns every event.
function playThrough(kitchen, wait = COOK_TIME + 1) {
  const all = [];
  for (let guard = 0; guard < 60 && !kitchen.done; guard++) {
    const step = currentStep(kitchen);
    if (step.kind === "cook") {
      all.push(...tick(kitchen, wait));
      if (kitchen.cook) all.push(...tap(kitchen, wanted(kitchen)[0]));
    } else all.push(...tap(kitchen, step.at[0]));
  }
  return all;
}

// Every order there can be: one topping (1–5), or two (1–3 each, in
// either order).
const allOrders = () => {
  const out = [];
  for (const a of TOPPING_IDS) {
    for (let n = 1; n <= MOST_ONE; n++) out.push(pizza([a, n]));
    for (const b of TOPPING_IDS) {
      if (a === b) continue;
      for (let n = 1; n <= MOST_TWO; n++)
        for (let m = 1; m <= MOST_TWO; m++) out.push(pizza([a, n], [b, m]));
    }
  }
  return out;
};

test("a round is three pizzas with different toppings", () => {
  for (let seed = 1; seed < 200; seed++) {
    const orders = roundOrders(rng(seed));
    assert.equal(orders.length, 3);
    assert.equal(orders[0].toppings.length, 1, "the first is gentle");
    const sets = orders.map((o) =>
      o.toppings
        .map((t) => t.topping)
        .sort()
        .join(),
    );
    assert.equal(new Set(sets).size, 3);
    for (const o of orders) {
      assert.ok(o.toppings.length === 1 || o.toppings.length === 2);
      const most = o.toppings.length === 1 ? MOST_ONE : MOST_TWO;
      const kinds = new Set(o.toppings.map((t) => t.topping));
      assert.equal(kinds.size, o.toppings.length);
      for (const { topping, count } of o.toppings) {
        assert.ok(TOPPING_IDS.includes(topping));
        assert.ok(count >= 1 && count <= most);
      }
    }
  }
});

test("orders vary: every topping, both kinds of order", () => {
  const random = rng(7);
  const seen = new Set();
  const kinds = new Set();
  for (let i = 0; i < 400; i++) {
    const o = makeOrder(random);
    kinds.add(o.toppings.length);
    for (const t of o.toppings) seen.add(t.topping);
  }
  assert.deepEqual([...kinds].sort(), [1, 2]);
  assert.equal(seen.size, TOPPING_IDS.length);
});

test("the counter has every station each step needs", () => {
  for (const order of allOrders()) {
    const { back, front } = stationsFor(order, rng(3));
    assert.deepEqual(back, BACK);
    const all = new Set([...back, ...front]);
    assert.equal(all.size, back.length + front.length, "no doubles");
    assert.equal(front.length, 2 + BOWLS);
    for (const step of recipe(order))
      for (const station of step.at) assert.ok(all.has(station), station);
  }
});

test("a pizza: carry the dough, sauce and cheese, then toppings, bake, out", () => {
  const k = createKitchen(pizza(["pepperoni", 2], ["olives", 1]));
  assert.deepEqual(
    k.steps.map((s) => (s.item ? `${s.kind} ${s.item}` : s.kind)),
    [
      "pick dough",
      "place dough",
      "pick sauce",
      "place sauce",
      "pick cheese",
      "place cheese",
      "top",
      "top",
      "pick pizza",
      "place pizza",
      "cook",
      "place baked",
    ],
  );
  // The pan before the dough: told to pick up the dough first.
  assert.deepEqual(tap(k, "pan"), [{ type: "wrong", want: ["dough"] }]);
  // Each one is two taps: pick it up (nothing on the pizza yet)...
  assert.deepEqual(types(tap(k, "dough")), ["pick", "step"]);
  assert.equal(k.holding, "dough");
  assert.deepEqual(tap(k, "sauce"), [{ type: "wrong", want: ["pan"] }]);
  assert.equal(k.holding, "dough");
  // ...then put it on the pan.
  assert.deepEqual(tap(k, "pan"), [
    { type: "place", item: "dough" },
    { type: "step", step: currentStep(k) },
  ]);
  assert.equal(k.holding, null);
  assert.deepEqual(types(tap(k, "cheese")), ["wrong"]);
  assert.deepEqual(tap(k, "sauce")[0], { type: "pick", item: "sauce" });
  assert.equal(k.holding, "sauce");
  // Scooping again doesn't put it on.
  assert.deepEqual(types(tap(k, "sauce")), ["wrong"]);
  assert.deepEqual(tap(k, "pan")[0], { type: "place", item: "sauce" });
  assert.deepEqual(tap(k, "cheese")[0], { type: "pick", item: "cheese" });
  assert.equal(k.holding, "cheese");
  assert.deepEqual(types(tap(k, "pepperoni")), ["wrong"]);
  assert.deepEqual(tap(k, "pan")[0], { type: "place", item: "cheese" });
  assert.equal(k.holding, null);
  // Olives come second.
  assert.deepEqual(types(tap(k, "olives")), ["wrong"]);
  assert.deepEqual(tap(k, "pepperoni"), [
    { type: "topping", topping: "pepperoni", n: 1 },
  ]);
  assert.deepEqual(types(tap(k, "pepperoni")), ["topping", "counted", "step"]);
  assert.deepEqual(tap(k, "pepperoni"), [{ type: "enough" }]);
  assert.deepEqual(tap(k, "olives"), [
    { type: "topping", topping: "olives", n: 1 },
    { type: "counted", count: 1 },
    { type: "step", step: currentStep(k) },
  ]);
  // The oven before picking the pizza up: nothing moves.
  assert.deepEqual(tap(k, "oven"), [{ type: "wrong", want: ["pan"] }]);
  assert.deepEqual(tap(k, "pan")[0], { type: "pick", item: "pizza" });
  assert.equal(k.holding, "pizza");
  // Putting it back on the pan doesn't bake it.
  assert.deepEqual(types(tap(k, "pan")), ["wrong"]);
  assert.deepEqual(types(tap(k, "oven")), ["place", "cooking"]);
  assert.equal(k.holding, null);
  // Too soon.
  assert.deepEqual(types(tap(k, "oven")), ["notyet"]);
  assert.deepEqual(types(tap(k, "cheese")), ["waiting"]);
  assert.deepEqual(types(tap(k, "pan")), ["waiting"]);
  assert.deepEqual(types(tick(k, COOK_TIME + 0.1)), ["ready"]);
  // Out of the oven into the chef's hands: not served yet.
  assert.deepEqual(types(tap(k, "oven")), ["take", "step"]);
  assert.equal(k.holding, "pizza");
  assert.equal(k.cook, null);
  assert.equal(k.done, false);
  // It can't burn once it's out, however long you wait.
  assert.deepEqual(tick(k, 100), []);
  assert.deepEqual(tap(k, "oven"), [{ type: "wrong", want: ["pan"] }]);
  assert.equal(stepLine(k).text, "Put the pizza on the pan!");
  assert.deepEqual(tap(k, "pan"), [
    { type: "place", item: "baked" },
    { type: "served" },
  ]);
  assert.equal(k.holding, null);
  assert.equal(k.done, true);
  assert.deepEqual(tap(k, "oven"), []);
});

test("the baking clock goes cooking, ready, warn, burnt", () => {
  assert.equal(cookPhase(0), "cooking");
  assert.equal(cookPhase(COOK_TIME), "ready");
  assert.equal(cookPhase(COOK_TIME + READY_TIME), "warn");
  assert.equal(cookPhase(COOK_TIME + READY_TIME + WARN_TIME), "burnt");
  assert.equal(doneness(0), 0);
  assert.equal(doneness(COOK_TIME), 1);
  assert.ok(doneness(COOK_TIME + READY_TIME) > 1);
  assert.equal(doneness(COOK_TIME + READY_TIME + WARN_TIME + 1), 3);
  // Browning never goes backwards.
  let last = -1;
  for (let t = 0; t < 25; t += 0.25) {
    assert.ok(doneness(t) >= last);
    last = doneness(t);
  }
});

const toOven = (k) => {
  while (currentStep(k).kind !== "cook") tap(k, currentStep(k).at[0]);
};

test("each clock change is announced once, even with a big jump", () => {
  const k = createKitchen(pizza(["mushrooms", 1]));
  toOven(k);
  const seen = [];
  for (let i = 0; i < 200; i++) seen.push(...types(tick(k, 0.1)));
  assert.deepEqual(seen, ["ready", "warn", "burnt"]);
  const jump = createKitchen(pizza(["mushrooms", 1]));
  toOven(jump);
  assert.deepEqual(types(tick(jump, COOK_TIME + READY_TIME + 0.5)), [
    "ready",
    "warn",
  ]);
});

test("burning goes back to the dough to make a new one", () => {
  const k = createKitchen(pizza(["peppers", 2], ["pineapple", 3]));
  toOven(k);
  const events = tick(k, COOK_TIME + READY_TIME + WARN_TIME + 0.1);
  assert.ok(types(events).includes("burnt"));
  assert.deepEqual(currentStep(k), {
    kind: "pick",
    item: "dough",
    at: ["dough"],
  });
  assert.equal(k.burns, 1);
  assert.equal(k.cook, null);
  assert.equal(k.holding, null);
  // And it can still be finished.
  playThrough(k);
  assert.equal(k.done, true);

  const slow = createKitchen(pizza(["olives", 3]));
  playThrough(slow, COOK_TIME + READY_TIME + WARN_TIME + 1);
  // Burns every time with that wait; the guard stops it.
  assert.equal(slow.done, false);
  assert.ok(slow.burns > 1);
});

test("every order can be finished the right way", () => {
  for (const order of allOrders()) {
    const k = createKitchen(order);
    const events = playThrough(k);
    assert.equal(k.done, true, JSON.stringify(order));
    for (const { topping, count } of order.toppings) {
      const on = events.filter(
        (e) => e.type === "topping" && e.topping === topping,
      );
      assert.deepEqual(
        on.map((e) => e.n),
        Array.from({ length: count }, (_, i) => i + 1),
      );
    }
  }
});

test("a wrong tap never moves the order on", () => {
  const stations = [...BACK, "pan", "cheese", ...TOPPING_IDS];
  for (const order of allOrders().filter((_, i) => i % 5 === 0)) {
    const k = createKitchen(order);
    for (let guard = 0; guard < 40 && !k.done; guard++) {
      const step = currentStep(k);
      if (step.kind !== "cook") {
        for (const s of stations) {
          if (step.at.includes(s)) continue;
          const before = JSON.stringify(k);
          const events = tap(k, s);
          assert.equal(JSON.stringify(k), before, `${s} at ${step.kind}`);
          assert.equal(events.length, 1);
          if (events[0].want) assert.ok(events[0].want.length);
        }
        tap(k, step.at[0]);
      } else {
        tick(k, COOK_TIME + 1);
        tap(k, wanted(k)[0]);
      }
    }
    assert.equal(k.done, true);
  }
});

test("every line the game says has a recorded clip", () => {
  const phrases = voicePhrases();
  const has = (l) => {
    for (const key of l.keys) assert.ok(phrases[key], key);
    assert.ok(l.text.length > 0);
  };
  for (const order of allOrders()) {
    has(orderLine(order));
    const k = createKitchen(order);
    for (const step of k.steps) has(stepLine(k, step));
    has(wrongLine(k));
  }
  for (const text of Object.values(phrases)) {
    assert.doesNotMatch(text, /\d/, "numbers are words");
    assert.doesNotMatch(text, /undefined/);
  }
  assert.equal(
    orderLine(pizza(["pepperoni", 3], ["olives", 1])).text,
    "Can I have a pizza, with three pepperonis, and one olive, please!",
  );
  assert.equal(
    orderLine(pizza(["peppers", 1])).text,
    "Can I have a pizza, with one green pepper, please!",
  );
  const k = createKitchen(pizza(["mushrooms", 2]));
  const said = [];
  while (currentStep(k).kind !== "cook") {
    said.push(stepLine(k).text);
    tap(k, currentStep(k).at[0]);
  }
  assert.deepEqual(said, [
    "Pick up the dough!",
    "Put the dough on the pan!",
    "Scoop the sauce!",
    "Put the sauce on the pizza!",
    "Pick up the cheese!",
    "Put the cheese on the dough!",
    "Now add two mushrooms!",
    "Now add two mushrooms!",
    "Pick up the pizza!",
    "Put the pizza in the oven!",
  ]);
});

test("the recorded voice matches the phrases, when it's there", () => {
  const map = new URL("../src/assets/pizza/voice.json", import.meta.url);
  if (!existsSync(map)) return;
  const clips = JSON.parse(readFileSync(map, "utf8"));
  for (const key of Object.keys(voicePhrases())) assert.ok(clips[key], key);
});
