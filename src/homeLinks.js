// iPad Home Screen links, one per game. Each entry gets its own page at
// <base>play/<id>/ (built by the homeLinks plugin in vite.config.js) with the
// game's name and a square crop of its screenshot as the icon, so
// "Add to Home Screen" from that page makes a shortcut that opens straight
// on the character screen with that game picked. <base>play/ lists them all,
// tagged from WIP_GAMES and NEEDS_KEYS in src/released.js.
//
// To add a game: append { id, name, image } (id is its data-game; image is
// a path from the repo root, or null for the Mini Games icon), run
// `node tools/make_home_icons.mjs`, and commit the new icons in
// public-pages/icons/games/. Games whose menu picture is drawn at runtime
// keep a captured copy in tools/home-icon-sources/.
const mode = (file) => `src/assets/modes/${file}`;
export const HOME_LINKS = [
  { id: "acorndrop", name: "Acorn Drop", image: mode("acorn-drop.jpg") },
  {
    id: "animalpatrol",
    name: "Animal Patrol",
    image: mode("animal-patrol-forest.svg"),
  },
  {
    id: "applecatch",
    name: "Backyard Apple Catch",
    image: mode("backyard-apple-catch.jpg"),
  },
  {
    id: "backyardflier",
    name: "Backyard Flier",
    image: mode("backyard-flier.jpg"),
  },
  {
    id: "backyardfling",
    name: "Backyard Fling",
    image: mode("backyard-fling.jpg"),
  },
  {
    id: "livewire",
    name: "Beach Ball Dodge",
    image: mode("beach-ball-dodge.jpg"),
  },
  {
    id: "bigbadburger",
    name: "Big Bad Burger",
    image: mode("big-bad-burger.jpg"),
  },
  { id: "bocce", name: "Bocce Ball", image: mode("bocce.jpg") },
  { id: "boulders", name: "Boulder Dash", image: mode("boulder-dash.jpg") },
  { id: "breakout", name: "Breakout", image: mode("breakout.png") },
  { id: "cometdash", name: "Comet Dash", image: mode("comet-dash.jpg") },
  { id: "fireice", name: "Fire & Ice", image: mode("fire-and-ice.svg") },
  { id: "memory", name: "Firefly Recall", image: mode("firefly-recall.jpg") },
  { id: "hotpotato", name: "Hot Potato", image: null },
  { id: "kickabout", name: "Kickabout", image: mode("kickabout.jpg") },
  { id: "kubb", name: "Kubb · Viking Chess", image: mode("kubb.jpg") },
  {
    id: "lanterntrail",
    name: "Lantern Trail",
    image: "tools/home-icon-sources/lanterntrail.png",
  },
  { id: "leafpiles", name: "Leaf Piles", image: mode("leaf-piles.jpg") },
  { id: "foodfinder", name: "Look & Find", image: mode("look-and-find.jpg") },
  {
    id: "backyardairmail",
    name: "Loop & Glide",
    image: mode("loop-and-glide.jpg"),
  },
  {
    id: "paperplane",
    name: "Paper Plane Pitch",
    image: mode("paper-plane-pitch.jpg"),
  },
  { id: "perchhop", name: "Perch Hop", image: mode("perch-hop.jpg") },
  {
    id: "perfectpizza",
    name: "Perfect Pizza",
    image: mode("perfect-pizza.jpg"),
  },
  { id: "pipecrane", name: "Pipe Crane", image: mode("pipe-crane.jpg") },
  { id: "pondfishing", name: "Pond Fishing", image: mode("pond-fishing.jpg") },
  {
    id: "poolnoodle",
    name: "Pool Noodle Chop",
    image: mode("pool-noodle-chop.jpg"),
  },
  { id: "poppatrol", name: "Pop Patrol", image: mode("pop-patrol.jpg") },
  {
    id: "puckclash",
    name: "Puck Clash",
    image: "tools/home-icon-sources/puckclash.png",
  },
  {
    id: "racetrack",
    name: "Racetrack Builder",
    image: mode("racetrack-builder.jpg"),
  },
  {
    id: "readyornot",
    name: "Ready or Not",
    image: "src/assets/maps/docks.png",
  },
  {
    id: "rivercrossing",
    name: "River Crossing",
    image: mode("river-crossing.jpg"),
  },
  { id: "roofcatch", name: "Roof Catch", image: mode("roof-catch.jpg") },
  {
    id: "shadowshop",
    name: "Shadow Shop",
    image: "tools/home-icon-sources/shadowshop.png",
  },
  { id: "shooaway", name: "Shoo Away", image: mode("shoo-away.jpg") },
  { id: "shuffleboard", name: "Shuffleboard", image: mode("shuffleboard.jpg") },
  {
    id: "sinkorfloat",
    name: "Sink or Float",
    image: mode("sink-or-float.jpg"),
  },
  { id: "skeeball", name: "Skee Ball", image: mode("skee-ball.jpg") },
  { id: "slipstream", name: "Slipstream", image: mode("slipstream.jpg") },
  { id: "splash", name: "Splash", image: "src/assets/maps/docks.png" },
  {
    id: "sprinklers",
    name: "Sprinkler Dodge",
    image: mode("sprinkler-dodge.jpg"),
  },
  { id: "sumo", name: "Sumo Wrestling", image: mode("sumo.jpg") },
  {
    id: "targetblaster",
    name: "Target Blaster",
    image: mode("target-blaster.jpg"),
  },
  { id: "toybox", name: "Toy Box Rescue", image: null },
];
