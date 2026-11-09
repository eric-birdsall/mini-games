// Kid-friendly words: what the game says, softened. Applied to messages,
// results and HUD text when a match is kid-friendly (Splash always is).
// Longer phrases come first so they win over the single words inside them.
const WORDS = [
  ["Intruder visually identified", "Infiltrator spotted"],
  ["Intruder captured at close range", "Infiltrator tagged up close"],
  ["Intruder identified", "Spotted!"],
  ["eliminations", "outs"],
  ["eliminated", "out"],
  ["eliminates", "puts you out"],
  ["eliminate", "put out"],
  ["elimination", "getting out"],
  ["flashbangs", "glitter poppers"],
  ["flashbang", "glitter popper"],
  ["blinded", "dazzled"],
  ["blind", "dazzle"],
  ["restrained", "tangled"],
  ["restraint", "tangle"],
  ["immobilized", "tangled"],
  ["immobilizes", "tangles"],
  ["captured", "tagged"],
  ["captures", "tags"],
  ["intruders", "infiltrators"],
  ["intruder", "infiltrator"],
  ["weapons", "balloons"],
  ["weapon", "balloons"],
  ["bang", "pop"],
];
const PATTERNS = WORDS.map(([from, to]) => [
  new RegExp(`\\b${from.replace(/ /g, "\\s+")}\\b`, "gi"),
  to,
]);
// Keep the case of the word replaced: "Eliminated" → "Out", "BLIND" → "DAZZLE".
function match(found, to) {
  if (found === found.toUpperCase() && /[A-Z]/.test(found))
    return to.toUpperCase();
  if (found[0] === found[0].toUpperCase())
    return to[0].toUpperCase() + to.slice(1);
  return to;
}
const swap = (patterns) => (text) => {
  if (typeof text !== "string") return text;
  for (const [pattern, to] of patterns)
    text = text.replace(pattern, (found) => match(found, to));
  return text;
};
const compile = (words) =>
  words.map(([from, to]) => [
    new RegExp(`\\b${from.replace(/ /g, "\\s+")}\\b`, "gi"),
    to,
  ]);
export const soften = swap(PATTERNS);

// Backyard Hide & Seek: the spy words, said the backyard way, in every game
// (on top of soften in kid-friendly ones). Sneakers sneak cookies from the
// cookie jars; Seekers watch the jars and tag the Sneaker. Longer phrases
// first, as above.
const BACKYARD = [
  // Whole lines first.
  [
    "Infiltration authorized. Raise the flag",
    "Ready or not, here I come! Grab the flag",
  ],
  ["Infiltration authorized", "Ready or not, here I come"],
  [
    "Hold in staging until infiltration",
    "Wait at the start until the seeking begins",
  ],
  ["Operation in progress", "Game on"],
  ["Operation complete", "Game over"],
  ["Return to base", "Back to the menu"],
  ["Enter arena", "Go play"],
  ["Field manual", "How to play"],
  ["Mission equipment", "Gear shop"],
  ["Tactical stealth laboratory", "Backyard hide & seek"],
  ["Pull it before it transmits", "Pull it before time runs out"],
  ["Uplink complete", "Flag held"],
  ["Intruder visually identified", "Sneaker spotted"],
  ["Intruder captured at close range", "Sneaker tagged up close"],
  ["Intruder identified", "Spotted"],
  ["Guard the", "Watch the"],
  ["stop the intruder", "tag the sneaker"],
  ["hits eliminate", "hits and you're out"],
  ["do not eliminate", "don't get you out"],
  ["hit eliminates", "hit and you're out"],
  ["Terminal(?= [A-Z]\\b)", "Cookie Jar"],
  // The objective: data from terminals becomes cookies from cookie jars.
  ["Data extracted from", "Cookies snagged from"],
  ["data extracted from", "cookies snagged from"],
  ["extract its data", "snag its cookies"],
  ["Extract data from", "Snag cookies from"],
  ["and extract", "and snag the cookies"],
  ["Extracted from", "Cookies from"],
  ["Extracted in", "Cookies in"],
  ["extracting", "snagging"],
  ["extracted", "snagged"],
  ["extraction", "cookie snag"],
  ["extracts", "snags"],
  ["extract", "snag"],
  ["data", "cookies"],
  ["terminals", "cookie jars"],
  ["terminal", "cookie jar"],
  ["TERM", "JAR"],
  ["an uplink", "a flag"],
  ["uplinks", "flags"],
  ["uplink", "flag"],
  // The two sides.
  ["an infiltrator", "a sneaker"],
  ["an intruder", "a sneaker"],
  ["infiltrators", "sneakers"],
  ["infiltrator", "sneaker"],
  ["intruders", "sneakers"],
  ["intruder", "sneaker"],
  ["infiltration", "sneaking"],
  ["sentinels", "seekers"],
  ["sentinel", "seeker"],
  ["the guard", "the seeker"],
  // Gadget names are the same in every game, including alerts.
  ["smoke device", "Smoke Puff"],
  ["flashbang", "Glitter Popper"],
  ["pulse sensor", "Peek-a-Boo Ball"],
  ["shutter lock", "Door Stopper"],
  // Everything else.
  ["operations", "games"],
  ["operation", "game"],
  ["loadouts", "backpacks"],
  ["loadout", "backpack"],
  ["credits", "coins"],
  ["credit", "coin"],
  ["CR", "coins"],
  ["equipment", "gear"],
  ["mission", "adventure"],
  ["arena", "yard"],
  ["stealth", "sneaking"],
  ["deception", "tricks"],
  ["tactical", "sneaky"],
  ["neutralized", "busted"],
  ["destroyed", "busted"],
  ["destroys", "busts"],
  ["destroy", "bust"],
  ["eliminations", "outs"],
  ["eliminated", "out"],
  ["eliminates", "puts you out"],
  ["eliminate", "put out"],
  ["elimination", "getting out"],
  ["captured", "tagged"],
  ["captures", "tags"],
  ["capture", "tag"],
];
export const backyard = swap(compile(BACKYARD));
