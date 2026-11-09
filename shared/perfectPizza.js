// Perfect Pizza: a customer holds up a picture of a pizza and the player
// makes it, step by step, in a little pizza kitchen. Pure logic (no DOM, no
// three.js) so it can be tested: the orders, each order's steps, what a tap
// on each station does, the baking clock, and every spoken line.
//
// Every pizza is made the same way: pick up the dough and put it on the pan,
// scoop the sauce and put it on, pick up the cheese and put it on, then the
// toppings in the picture (what changes from order to order), bake it, and
// take it out before it burns.
//
// Made for young kids: there is no time limit and no wrong answer that
// costs anything. A tap on the wrong station says what to do instead (and
// the game wiggles the right station); a pizza left in too long burns, goes
// in the bin and you make a new one.

export const ORDERS_PER_ROUND = 3;

// Seconds a pizza takes to bake, then how long it waits "ready" (the ring
// goes from green to orange), then the red "quick!" warning before it burns.
export const COOK_TIME = 5;
export const READY_TIME = 8;
export const WARN_TIME = 4;
// Seconds with nothing done before the next step's station wiggles and the
// step is said again.
export const IDLE_HINT = 10;

export const TOPPINGS = {
  pepperoni: { one: "pepperoni", many: "pepperonis" },
  mushrooms: { one: "mushroom", many: "mushrooms" },
  olives: { one: "olive", many: "olives" },
  peppers: { one: "green pepper", many: "green peppers" },
  pineapple: { one: "pineapple", many: "pineapples" },
};
export const TOPPING_IDS = Object.keys(TOPPINGS);

// How many of a topping an order can ask for: up to five when it's the only
// one, up to three each when there are two.
export const MOST_ONE = 5;
export const MOST_TWO = 3;
// Topping bowls on the counter.
export const BOWLS = 4;

// The stations. The dough, the marinara pot and the oven sit on the back
// counter; the pizza pan, the cheese and the topping bowls on the island in
// front.
export const BACK = ["dough", "sauce", "oven"];

export const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five"];

export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// One order: {toppings: [{topping, count}]}, one or two kinds.
export function makeOrder(random, kinds = random() < 0.5 ? 1 : 2) {
  const most = kinds === 1 ? MOST_ONE : MOST_TWO;
  return {
    toppings: shuffle(TOPPING_IDS, random)
      .slice(0, kinds)
      .map((topping) => ({
        topping,
        count: 1 + Math.floor(random() * most),
      })),
  };
}

const sameToppings = (a, b) =>
  a.toppings
    .map((t) => t.topping)
    .sort()
    .join() ===
  b.toppings
    .map((t) => t.topping)
    .sort()
    .join();

// A round: three pizzas. The first has one topping; the others one or two,
// and no two pizzas have the same toppings.
export function roundOrders(random, count = ORDERS_PER_ROUND) {
  const orders = [];
  while (orders.length < count) {
    const o = makeOrder(random, orders.length === 0 ? 1 : undefined);
    if (!orders.some((p) => sameToppings(p, o))) orders.push(o);
  }
  return orders;
}

// The topping bowls on the counter for an order: the ones it needs and
// others to make four, in a random order.
export function toppingBowls(order, random) {
  const need = order.toppings.map((t) => t.topping);
  const others = shuffle(
    TOPPING_IDS.filter((t) => !need.includes(t)),
    random,
  );
  return shuffle([...need, ...others].slice(0, BOWLS), random);
}

// The stations for an order, by where they sit: the back counter, and the
// island in front (the pan, the cheese, then the topping bowls).
export function stationsFor(order, random) {
  return {
    back: [...BACK],
    front: ["pan", "cheese", ...toppingBowls(order, random)],
  };
}

// What to do, in order. Each step is {kind, at: [stations that do it]}.
// The dough, the sauce, the cheese and the finished pizza each take two
// steps: the chef picks it up (and carries it), then puts it down.
//   pick: pick up `item` (dough, sauce or cheese from its station; the
//     pizza from its pan).
//   place: put the `item` being carried on the pan (the pizza: in the oven;
//     "baked": the baked pizza, back on the pan for the customer).
//   top: one counted topping (`count` taps of `topping`).
//   cook: wait for the ring; once it's full, the oven takes it out (the
//     chef is then holding the baked pizza).
export function recipe(order) {
  return [
    ...["dough", "sauce", "cheese"].flatMap((item) => [
      { kind: "pick", item, at: [item] },
      { kind: "place", item, at: ["pan"] },
    ]),
    ...order.toppings.map(({ topping, count }) => ({
      kind: "top",
      at: [topping],
      topping,
      count,
    })),
    { kind: "pick", item: "pizza", at: ["pan"] },
    { kind: "place", item: "pizza", at: ["oven"] },
    { kind: "cook", at: [] },
    { kind: "place", item: "baked", at: ["pan"] },
  ];
}

// The kitchen for one order.
export function createKitchen(order) {
  return {
    order,
    steps: recipe(order),
    step: 0,
    placed: 0, // toppings of the current kind on so far
    holding: null, // "dough", "sauce", "cheese" or "pizza" while carrying it
    cook: null, // {t} while it bakes
    burns: 0,
    done: false,
  };
}

export const currentStep = (k) => k.steps[k.step] ?? null;

// The baking clock: "cooking" (ring filling), "ready" (full ring, green to
// orange), "warn" (red, hurry) and "burnt".
export function cookPhase(t) {
  if (t < COOK_TIME) return "cooking";
  if (t < COOK_TIME + READY_TIME) return "ready";
  if (t < COOK_TIME + READY_TIME + WARN_TIME) return "warn";
  return "burnt";
}

// How browned the pizza is: 0 raw, 1 golden (ready), 2 dark, 3 burnt.
export function doneness(t) {
  if (t < COOK_TIME) return t / COOK_TIME;
  const late = (t - COOK_TIME) / (READY_TIME + WARN_TIME);
  return Math.min(3, 1 + late * 2 + (cookPhase(t) === "burnt" ? 1 : 0));
}

function advance(k, events) {
  k.step++;
  k.placed = 0;
  if (k.step >= k.steps.length) {
    k.done = true;
    events.push({ type: "served" });
    return;
  }
  const next = currentStep(k);
  if (next.kind === "cook") {
    k.cook = { t: 0 };
    events.push({ type: "cooking" });
  } else events.push({ type: "step", step: next });
}

// Tap a station. Returns a list of events for the game to show and say:
//   {type: "pick" | "place", item}  picked up / put on the pan
//   {type: "take"}                 out of the oven, into the chef's hands
//   {type: "topping", topping, n} one more topping, n of that kind so far
//   {type: "counted", count}      that was the last of that kind
//   {type: "step", step}          on to the next step
//   {type: "cooking"}             the clock started
//   {type: "served"}              all done
//   {type: "notyet"}              tapped the oven before it's ready
//   {type: "waiting"}             tapped something else while it bakes
//   {type: "enough"}              a topping that's already all on
//   {type: "wrong", want}         anything else; want: stations to wiggle
export function tap(k, station) {
  const events = [];
  if (k.done) return events;
  const step = currentStep(k);

  if (step.kind === "cook") {
    if (station === "oven") {
      const phase = cookPhase(k.cook.t);
      if (phase === "ready" || phase === "warn") {
        k.cook = null;
        k.holding = "pizza";
        events.push({ type: "take" });
        advance(k, events);
      } else events.push({ type: "notyet" });
    } else events.push({ type: "waiting" });
    return events;
  }

  if (step.at.includes(station)) {
    if (step.kind === "top") {
      k.placed++;
      events.push({ type: "topping", topping: step.topping, n: k.placed });
      if (k.placed >= step.count) {
        events.push({ type: "counted", count: step.count });
        advance(k, events);
      }
      return events;
    }
    if (step.kind === "pick") k.holding = step.item;
    if (step.kind === "place") k.holding = null;
    events.push(
      step.item ? { type: step.kind, item: step.item } : { type: step.kind },
    );
    advance(k, events);
    return events;
  }

  const finishedTopping = k.steps.some(
    (s, i) => s.kind === "top" && s.topping === station && i < k.step,
  );
  events.push(
    finishedTopping ? { type: "enough" } : { type: "wrong", want: wanted(k) },
  );
  return events;
}

// The stations to wiggle for the current step: the one that does it (for
// the baking pizza that's the oven).
export function wanted(k) {
  const step = currentStep(k);
  if (!step) return [];
  if (step.kind === "cook") return ["oven"];
  return step.at.slice(0, 1);
}

// Run the baking clock. Returns events: {type: "ready"} once, {type:
// "warn"} once, then {type: "burnt"} (back to the dough, and `step` says
// what's next).
export function tick(k, dt) {
  const events = [];
  if (!k.cook) return events;
  const before = cookPhase(k.cook.t);
  k.cook.t += dt;
  const now = cookPhase(k.cook.t);
  if (now === before) return events;
  if (now === "ready" || (before === "cooking" && now !== "cooking"))
    events.push({ type: "ready" });
  if (now === "warn") events.push({ type: "warn" });
  if (now === "burnt") {
    k.cook = null;
    k.burns++;
    k.holding = null;
    k.step = 0;
    k.placed = 0;
    events.push({ type: "burnt", step: currentStep(k) });
  }
  return events;
}

// --- What the game says ----------------------------------------------------
// A line is {text, keys}: `keys` are clips in the recorded voice
// (src/assets/pizza/voice.*, made by tools/make_pizza_voice.py from
// voicePhrases()), and `text` is spoken by the browser when the clips
// aren't loaded.

const toppingWords = (topping, n) =>
  `${NUMBER_WORDS[n]} ${n === 1 ? TOPPINGS[topping].one : TOPPINGS[topping].many}`;

const PHRASES = {
  order: "Can I have a pizza,",
  please: "please!",
  hmm: "Hmm, not that one.",
  waiting: "Now it bakes. Watch the ring fill up!",
  notyet: "Not yet! Wait for the ring to fill up.",
  ready: "Ding! It's ready! Take it out of the oven!",
  warn: "Quick, take it out before it burns!",
  burnt: "Oops, it burnt! Into the bin. Let's make a new one!",
  enough: "That's enough! Just like the picture.",
  picture: "Just like the picture!",
  served: "A perfect pizza! Yum, thank you!",
  next: "Here comes a new order!",
  done: "You made three perfect pizzas! Great cooking!",
  step_pick_dough: "Pick up the dough!",
  step_place_dough: "Put the dough on the pan!",
  step_pick_sauce: "Scoop the sauce!",
  step_place_sauce: "Put the sauce on the pizza!",
  step_pick_cheese: "Pick up the cheese!",
  step_place_cheese: "Put the cheese on the dough!",
  step_pick_pizza: "Pick up the pizza!",
  step_place_pizza: "Put the pizza in the oven!",
  step_place_baked: "Put the pizza on the pan!",
};

const line = (...keys) => ({
  text: keys.map((key) => phraseText(key)).join(" "),
  keys,
});

function phraseText(key) {
  if (PHRASES[key]) return PHRASES[key];
  let m = key.match(/^with_(\d)_(\w+)$/);
  if (m) return `with ${toppingWords(m[2], Number(m[1]))},`;
  m = key.match(/^and_(\d)_(\w+)$/);
  if (m) return `and ${toppingWords(m[2], Number(m[1]))},`;
  m = key.match(/^add_(\d)_(\w+)$/);
  if (m) return `Now add ${toppingWords(m[2], Number(m[1]))}!`;
  m = key.match(/^count_(\d)$/);
  if (m) {
    const word = NUMBER_WORDS[Number(m[1])];
    return `${word[0].toUpperCase()}${word.slice(1)}!`;
  }
  return key;
}

// "Can I have a pizza, with three pepperonis, and two olives, please!"
export function orderLine(order) {
  return line(
    "order",
    ...order.toppings.map(
      ({ topping, count }, i) => `${i ? "and" : "with"}_${count}_${topping}`,
    ),
    "please",
  );
}

// What to say for a step.
export function stepLine(k, step = currentStep(k)) {
  if (!step) return line("served");
  if (step.kind === "top") return line(`add_${step.count}_${step.topping}`);
  if (step.kind === "cook") return line("waiting");
  if (step.item) return line(`step_${step.kind}_${step.item}`);
  return line(`step_${step.kind}`);
}

export const countLine = (n) => line(`count_${n}`);
export const countedLine = (n) => line(`count_${n}`, "picture");
export const wrongLine = (k) => {
  const step = stepLine(k);
  return { text: `${PHRASES.hmm} ${step.text}`, keys: ["hmm", ...step.keys] };
};
export const sayLine = (key) => line(key);

// Every clip the lines above can ask for: {key: text}.
export function voicePhrases() {
  const keys = new Set(Object.keys(PHRASES));
  for (const topping of TOPPING_IDS)
    for (let n = 1; n <= MOST_ONE; n++) {
      keys.add(`with_${n}_${topping}`);
      keys.add(`add_${n}_${topping}`);
      if (n <= MOST_TWO) keys.add(`and_${n}_${topping}`);
    }
  for (let n = 1; n <= MOST_ONE; n++) keys.add(`count_${n}`);
  return Object.fromEntries([...keys].map((key) => [key, phraseText(key)]));
}
