# MINI GAMES

A playable first-person tactical stealth vertical slice. Built with Three.js, Node.js, and WebSockets. No firearms or health system.

## Play online

[Play Mini Games](https://eric-birdsall.github.io/mini-games/) in your browser.
Practice, AI opponents, and games that share one device run on GitHub Pages.
The public build uses the Pop character designs with procedurally generated bodies and animations.
Private matches across devices use the Node.js server below.

## Run locally

Requires Node.js 22.12+ (tested on Node 24).

Place the purchased `ChibiCritters3D_v1.0` folder at the repository root before running or building the game. The character picker uses all 16 models in `ChibiCritters3D_v1.0/Models/GLB`, plus a Squirrel, Giraffe, Astronaut, Baby, Shark and big-headed Dog built from the pack's parts: run each `tools/make_<name>.mjs` once (for example `node tools/make_shark.mjs`) to create its `.glb` there. The picker shows collectible-vinyl-figure "Pop" versions of every character, with a big rounded-square head, plus the Dog, which already has one; run `node tools/make_pops.mjs` after the others to build them. The originals are kept as hidden `classic-<name>` characters in `shared/avatars.js`. They share the pack's rig, palette and animations; the shared building code is in `tools/critterKit.mjs` (and `tools/popKit.mjs` for the Pop figures). The source pack is kept out of Git.

Art: Chibi Critters 3D by DhanVarsha Consultant Ltd.

```sh
npm install
npm start
```

Open **http://localhost:3000** in a desktop browser. Start a **Solo field test**, select either role, buy equipment, and confirm your loadout. Use **⌘K → Skip preparation** to begin immediately. Click **Enter arena** to control the player.

For 1v1, choose **Private operation → Create operation**. Share the six-character code shown in the loadout screen. The second player opens the same server address, chooses the opposite role, selects Private operation, enters the code, and joins. Both players must confirm their loadout. Two tabs or browser windows on the same machine work; separate devices must reach the host's LAN address on port 3000. No hosted matchmaking or internet relay is included.

The host can start the next operation or reset the room. Opponent disconnects reset the remaining player to purchase. Rooms exist in server memory.

### Quick start from the URL (dev testing)

Add parameters to the address to skip the menu. The game starts, fills the kit, confirms it and puts you straight in the arena with keyboard look:

```
localhost:3000/?type=training&team=inf&map=pier9&tripwire=3
```

That's a Training Range game on Pier 9, as the Infiltrator, carrying three tripwires.

| Parameter                   | Values                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `type` (required)           | `training` (or `range`), `freeroam` (or `roam`), `solo` (or `field`), `multi` (or `private`)                           |
| `team`                      | `inf` / `infiltrator` / `attacker` (default), `sen` / `sentinel` / `defender`                                          |
| `map`                       | a map id or name, any case or spacing: `pier9`, `docks`, `monolith`, `the quad`… Can open maps the menu doesn't offer. |
| `rule`                      | `seen` (default), `soak`, `splash` or `removed` (`shoot` is an old name for `soak`)                                    |
| `bot`                       | the solo opponent's difficulty: `easy`, `normal` (default) or `hard`                                                   |
| any gadget id or short code | how many to carry (training) or buy (solo/multi), e.g. `tripwire=3`, `TRP=3`, `smoke=2`, `cameraDecoy=1`               |

Notes:

- In solo and multi, purchases still cost credits and follow each side's gadgets, so anything you can't afford or use is skipped.
- Unrecognised parameters are listed in a console warning.
- Without `type`, the normal menu shows.
- The parsing lives in `src/launch.js` and is tested in `tests/launch.test.js`.

## Theme: Backyard Hide & Seek

The game looks and talks like a sunny backyard hide-and-seek. Sneakers (blue) sneak cookies from the cookie jars; Seekers (coral) watch the jars and tag the Sneaker.

- **Words:** the code and server still say infiltrator, sentinel, terminal, uplink and so on. `backyard()` in `shared/kidWords.js` rewords every text on screen as it appears (Infiltrator → Sneaker, Sentinel → Seeker, terminal → cookie jar, data → cookies, uplink → flag, operation → game, loadout → backpack, credits → coins, sidearm → blaster, eliminated → out). A `MutationObserver` in `src/main.js` applies it to new and changed text; kid-friendly matches also get `soften()`. To change a word, edit the `BACKYARD` list (longer phrases first).
- **Look:** leafy-green panels, cream text, sunny-yellow buttons and coral for the objective (`src/style.css`), with Fredoka and Nunito fonts. The world has a blue sky, warm sun, lawn-green ground and cream walls (`src/world.js`, `src/mapColors.js`); the team colours are in `src/characters.js`.

## Main menu

The home menu is three screens, one after another, over a live flyover of the map. **← Back** at the top (or Escape, or B on a controller) steps back one screen; beside it, a line recalls what you've chosen so far.

1. **How you're playing:** three big cards: Practice (selected by default), Against AI or With Friends (host a match, or join one with its code). Picking one moves on to the game. Controls & Settings, How to Play and Map Builder are at the foot of this screen.
2. **Game:** every game as a card, with the rules of the focused one above them. Picking a game selects it (standalone games such as Slipstream and Paper Plane Pitch included; nothing opens until Start) and moves on to the character. The choice is remembered in this browser (`minigames.game`).
3. **Your character, difficulty and Start:** every character's portrait in a grid of three rows, with a live 3D preview of the selected one doing its own dance (each character has one, only on this screen; `src/dances.js`) and ← / → and the colour swatches beside it; focus starts on the grid. Each player has a coloured chip (P1–P4) on the portrait they picked. P1 is the keyboard, mouse, touch and first controller. Any other controller joins as P2–P4 with **A**, moves its chip with the stick or D-pad, changes colour with **X** and leaves with **B**; a card per player appears under the grid once a second controller is connected. Leaf Piles uses those picks: P2–P4 play their characters in their corners and are already seated in the four-player lobby. Beside it, **Difficulty** (Easy, Medium or Hard) controls AI opponents, Slipstream rivals, Firefly Recall and the standalone games (Medium uses the internal `normal` level; see [Solo opponent](#solo-opponent)). A summary line says what Start will do, e.g. "Practice · Splash · Pier 9 · Panda", then one big **Start** button: for a standalone game it opens that game; otherwise it starts, hosts or practises as the mode says. Leaving a standalone game comes back to this screen with Start focused.

**Search:** a search box at the top of the game screen filters every game (finished and Work in Progress) by name and rules as you type. Enter picks the top result, ↓ moves to the results, Escape clears it. With a controller, ↑ from the cards reaches the box.

**Direct link:** `?game=<id or name>` skips the menu and opens that game, as if picked and Start pressed, e.g. [`?game=bigbadburger`](https://eric-birdsall.github.io/mini-games/?game=bigbadburger). Names match ignoring case, spaces and punctuation (`?game=big-bad-burger` works too). Leaving the game lands on the character screen.

**Kids view:** the normal page shows every game. Open it with `?kids` (e.g. `localhost:3000/?kids`) to show only the games listed in `RELEASED_GAMES` in `src/released.js` (so far Big Bad Burger), with no search and no Work in Progress button. Games are released to the kids one at a time: add a game's id to that list to release it. On the `?kids` game screen, typing **all** on the keyboard reloads without `?kids`, keeps how you're playing and opens back on the game screen.

With a controller, A picks on every screen and the stick only moves focus. The Start button picks the focused card on the first two screens and presses Start on the third.

Below the steps:

- **Map picker:** full screen, the maps three to a row, the focused one outlined with red reticle corners and a ✓ on the current pick. Left of the grid, text only: the focused map's name, description and ways in. Click (or A) picks a map; Back, Escape (or B / Start) leaves the choice as it was. Map Builder maps follow the built-in ones on a blueprint tile. The home flyover changes only once you pick.
- **Map thumbnails:** `src/assets/maps/<id>.png`, 640×360, the first frame of each map's home-screen flyover (`World.flyover` in `src/world.js`). After changing a map, open `localhost:3000/?thumbs` (or `?thumbs=docks,relay` for some) and the dev server saves fresh ones.
- **Links:** Controls & settings and the Field manual sit under the button.

Arrow keys, the D-pad or the left stick move between rows, left and right choose within a row, and Enter or A starts.

## Elimination modes

Choose **Seen**, **Soak** or **Splash** before creating a session. The host chooses the rules; joining players inherit them, and resets preserve the choice. All modes retain the attacker/defender roles, flag objective and time limit.

- **Seen:** three uninterrupted seconds of direct sight eliminate the attacker. Breaking sight resets the timer. No mode weapons.
- **Soak:** water balloons in a real match. The party games play it. It throws exactly like Splash (below): unlimited balloons, one every 0.7 s, three splashes and you're out, and a splash fizzles out the other side's placed devices. Unlike Splash it isn't training and isn't kid-friendly: there's a winner and a loser, the full loadout and shop, and the bots throw sooner (no extra reaction delay, a balloon a second at most). Sight/proximity do not eliminate. Either side wins by soaking the opponent; infiltrators can also complete the objective. There are no guns in the game; the old `shoot` rule now opens Soak.
- **Splash (kid-friendly):** water balloons, always played as training. Balloons never run out, but you can throw one only every 0.7 s. Click (LMB / RT) to throw along your aim; hold aim (right mouse / LT) to see the arc and where it lands. A balloon flies a real arc of about 20 m and bursts on the first person it touches or where it lands, and splashes everyone within 2 m of the burst (so a direct hit can soak people standing next to the target too). Three splashes and you're soaked and out; splashes don't dry off. A splash also fizzles out the other side's placed devices. A burst is heard within about 18 m and a throw within about 8 m, so throwing doesn't give you away to the whole map. Droplets over each player you can see show how many splashes they've taken, and being splashed runs water down your screen. Bots throw at where you're standing, so moving dodges them. In training, getting soaked resets your droplets and the session carries on. The numbers are `balloonRange`, `splashRadius`, `splashHits`, `splashHearing` and `throwHearing` in `shared/config.js`.

**Kid-friendly:** Splash is the kid-friendly game. Each balloon is a random bright colour (the one in your hand shows your next throw's). Both sides get the same four simple gadgets: smoke, glitter popper, pulse sensor and shutter lock (there's no disarming tool, so a shutter opens when its time is up or a balloon bursts on it); the same list limits training and the bots. Words are softer everywhere: "eliminated" becomes "out", "Intruder visually identified" becomes "Infiltrator spotted", and the flashbang is a **glitter popper** (the same effect, but a sparkly burst and chimes instead of a bang). The list is `SPLASH_GADGETS` in `shared/config.js`, and the words are in `shared/kidWords.js`.

**Persistent equipment slots:** equipment carried into play keeps its slot after its final charge is spent. Empty slots remain visible, greyed out and unavailable to equip; other slots keep their numbers. Cycling skips empty slots. A new round clears the old loadout and restores the water balloon. Training still refills ordinary gadgets. Water balloons are automatic issue, not shop purchases. Training reports eliminations without ending the session.

## Controls

| Input                         | Action                                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| WASD                          | Walk                                                                                                                         |
| Mouse                         | Look with pointer lock                                                                                                       |
| Right mouse drag / arrow keys | Look fallback when pointer lock is unavailable                                                                               |
| Shift                         | Sprint                                                                                                                       |
| C (tap / hold)                | Tap: crouch, or stand up from a crouch; from lying down, a tap brings you to a crouch. Hold: lie down                        |
| Space                         | Jump                                                                                                                         |
| 1–5                           | Equip one of your first five gadgets                                                                                         |
| Tab / R                       | Next / previous gadget                                                                                                       |
| Left click / F                | Use or place equipped gadget                                                                                                 |
| E (tap / hold)                | Use or throw the equipped gadget (like left-click); hold to raise the flag at the objective or disarm with the tool equipped |
| C                             | Enter / cycle deployed camera feeds                                                                                          |
| V                             | Exit camera feed                                                                                                             |
| Esc                           | Release controls                                                                                                             |
| ⌘K                            | Developer panel                                                                                                              |

**Placement ghost:** while you aim a tripwire, camera, sensor or decoy mark, a ghost of it appears where it would go: white if it can be placed there, red if not, with the reason in the prompt (too high on the wall, wire too long, anchors can't see each other, not a floor, too close to staging, and so on). After the first tripwire anchor, the ghost wire stretches from it to your aim. A rejected second anchor keeps your first one; press **Q** (Cancel throw) or switch gadgets to drop it. This works for shutter locks too. The server and the ghost use the same rules (`shared/placement.js`). Every wall is drawn with dark edge lines and a slightly different shade, so overlapping walls and their ends stay readable.

Only your own side's devices block placement: you can put a device right next to the other side's (say, a sensor beside an enemy camera), just not on top of one of yours. Tripwires require two clicks on vertical surfaces, 0.1–1.5 m above ground, in sight of each other and within the span (6 m standard). Cameras require walls. Sensors require horizontal physical surfaces. Aim downward to place a floor device. A small placement cursor appears only for the device you are placing; enemy equipment has no automatic outline or warning marker.

## Implemented loop

- Private purchases: 1,000 credits per player, refunds, role restrictions, costs and inventory limits.
- 45-second defender preparation; attacker stays in staging. Countdown beeps: a longer one at 10 seconds left, short ones at 5, 4, 3, 2 and 1, and the longest when it reaches 0 and the round starts. (The buy phase itself has no timer; it ends when both players confirm.)
- Four-minute active round; five-second uninterrupted flag capture.
- Three-second direct visual identification through a 12° half-angle cone, within 24 m.
- Cover, crouching, smoke, distance, and turning away reset detection immediately.
- Detection progress is independent for each defender–attacker pair. Camera viewing blocks personal detection.
- Nine gadgets (smoke, scanner, disarming tool, programmable decoy, jammer, tripwire, camera, motion sensor), several with Deployable / Portable / Decoy types.
- Wires restrain for five seconds, never eliminate directly. Decoys do not restrain and appear identical to real wires to enemies and scanners.
- **Wire height matters.** A running jump clears a wire up to 0.55 m (measured in tests). Anything higher can't be jumped, or crawled under. While you place a wire, the prompt shows its height and what that means: "low: hard to spot, but can be jumped" or "too high to jump · easier to spot". The bot's wire spots mix low (0.32 m) and waist-high (1 m) wires.
- **A tripped wire tells the sentinels where and who.** It outlines the intruder through walls for 3 seconds and drops a marker at the wire on their minimap for 12 seconds. The intruder isn't told. A decoy wire still restrains no one and reveals nothing.
- Scanner is reusable, takes 1.5 seconds, covers a forward sector, reports uncertain nearby signature regions, and has a four-second cooldown.
- Disarm requires a visible anchor/device within three meters and 2.5 seconds of continuous interaction.
- Eight-second smoke blocks the server's sight tests. Six-second jammers affect cameras and sensors, not mechanical wires.
- Static live camera feeds use the actual 3D scene. Jammed feeds are obscured. Cameras and motion sensors cannot eliminate.
- Motion sensors announce a named map region, not an exact enemy position.
- Win/loss results include remaining time, deployed equipment, detections, and wires crossed.
- Optional debug geometry and gadget states; solo-only grants, timer changes, cooldown toggle, stationary bot, skip setup, and team switching.
- Procedural placeholder audio on gadget events. Audio can be disabled in ⌘K.

## Maps

Choose one of three maps on the home screen under **Map**; the background flyover shows the selected one. The host's choice applies to the whole session.

### The Compound

The north flag court connects to three intersecting approaches: center/direct, west/warehouse, east/service yard. Low barriers allow crouched concealment. Containers, doorways, exposed lanes, wall recesses, electrical cabinets, and open warehouse beams create placement and sightline choices. The minimap shows the compound, objective, and your own position; enemy players and traps are not automatically marked. Scanner circles appear temporarily after an active scan.

### The Lanes

Three narrow hallways of different widths run from the attacker staging area (south) to the defender plaza around the flag (north). They cut through solid blocks, with short hallways crossing between them, and there is more cover than open floor.

- **West hallway (about 4 m):** staggered crates all the way up, with two nooks cut into the outer wall.
- **Center ridge:** a 3 m wide ridge, 2 m up, with stairs at both ends and parapets on top, between two 3 m trenches full of crates.
- **East:** a 3.5 m low path packed with crates, under a 4 m catwalk (2.4 m up) with a railing and parapets.
- **Crossings:** two short hallways link west and center; one links center and east.
- **Plaza:** crates and containers around the flag, and a raised balcony overlooking it. Staging has a raised loading dock and crates.

### The Quad

Four parallel lanes, each about 4 m wide, run from staging to the flag plaza through solid blocks, with crates staggered down every lane and nooks in the outer walls. The **shortcut**, a hallway through the central block, links the two inner lanes (B and C) and is signposted from both sides; covered tunnels also link A–B, B–C and C–D (see Stealth cover below). The plaza and staging match The Lanes.

### The Monolith

A monumental arena about 52 × 76 m, roughly twice the floor of the other maps. It's an open stone courtyard under towering 7 m monoliths.

- **Courtyard (B):** a raised **altar** (1.2 m) in the middle with stairs on every side, framed by slabs and monoliths that break the long views.
- **Galleries (A and C):** 2.4 m galleries along each side, with stairs at both ends and the middle, parapets and offset barriers on top.
- **Flank corridors:** run behind each gallery along the outer walls, broken by alternating stubs.
- **Plaza:** the flag sits in a plaza of crates and containers, with a 1.6 m overlook on each side.
- **Staging:** two raised terraces.

The minimap, floor, shadows and flyover scale with the map's size.

High ground is reached by stairs: players step up automatically onto ledges up to 0.45 m, and drop off platform edges. (This also lets you vault onto 1.1 m cover from a jump.) The minimap draws high ground lighter than walls.

**Loadout screen:** gadgets are cards grouped by purpose (Concealment, Traps, Recon & surveillance, Countermeasures, Deception), each with its price and a **−/+** stepper. Selecting a card (or moving onto it with the D-pad) opens it in the detail panel on the right: full description, type switch, upgrades, and the decoy's **Program** button. The left column lists what you've packed, with your credits left and spent; select a line to open that gadget. With a controller, the D-pad moves between cards and controls, A presses, and Start confirms your loadout.

**No sight of the other side before the round:** during the buy phase and the 45-second preparation, neither side can see or hear the other.

- **Hidden server-side:** the server doesn't send the opposing players at all until infiltration starts: no body, outline, footsteps or marker.
- **No signs but the district letters:** the maps carry no text labels (no map names, staging markings, container numbers or terminal signs). Each district is marked by its letter alone, on a compact board: on Pier 9, **A**, **B** and **C** beside each house’s front door. The bunker's door screens show only the countdown, framed in the lane's colour.
- **Pier 9's spawn bunker:** infiltrators start in a long, roofed bunker across the whole south edge of the map (52 × 7 m). About two-thirds of its north wall (doors included) is **one-way glass**, like a hero-shooter spawn room: windows between pillars over a waist-high sill, with the bays furthest from the doors solid wall (`glassShare`), and three glass doors facing north, one per lane, in lane-coloured frames: **Left** (amber) toward the amber house, **Centre** (blue) toward the terracotta house, **Right** (green) toward the blue house. A stripe in each lane's colour runs across the floor from the spawn to its door.
  - **One-way glass:** from inside you see out through frosted glass, a little milky and blurred (from the bunker, infiltrators can see about 57% of all open ground on the map, and over 90% of its southern half); from outside it's a dark, mirrored panel and sentinels see nothing in. In the code, glass walls have `oneWay: "attacker"`, and the sight check takes the viewer's side (`clearSight(a, b, smokes, viewer)`). It's still a wall for everything else: movement, shots, throws, flashbangs, cameras, and sentinel identification all treat it as solid.
  - **Before the round:** the other side isn't sent to you, except that infiltrators receive any sentinel in clear view through the glass (at any distance). Sentinels never receive the infiltrators, and must stay 8 m (`prepGap`) from every door while preparing. They can never enter the bunker.
  - **Doors:** glass like the windows, shut through the buy phase and preparation, opening when infiltration starts. A countdown screen framed in the lane's colour hangs above each door: BUY PHASE, then OPENS 0:45 … 0:01, then GO.
  - **Briefing table:** a map of Pier 9 lies flat on the table behind the spawn, lined up with the world (north toward the doors): walls by height, all three terminals, each door in its lane colour with a dashed line on to its lane, and YOU ARE HERE.
  - Lockers line the back wall, crates sit at the far ends, and light strips run along the ceiling. The scripted infiltrator leaves by the door toward its route's lane. Built by `spawnRoom()` in `shared/maps.js`.
- **Staging gate (other maps):** a solid, dark barrier with a red stripe stands wall to wall just north of the infiltrators' staging line, 14 m tall, so no line of sight can cross it from any height. It opens (disappears) the moment the round starts. A test samples every map: with the gate up, no point in staging can see any point on the far side, at standing or container-top heights.
- **Sentinels in preparation** may go anywhere except the last 8 m before the gate (`prepGap`), so none is waiting at the gate when it opens. Their red line shows where that is.

**Straight into the arena:** confirming your loadout takes you straight into first-person (it grabs the mouse) when the round follows right away, as in Training and Solo. After waiting for a second player, you click to enter as before.

**Buy phase on foot:** choose **Walk around** on the buy screen to move around while you shop. Each team stays behind a line across the map, drawn in red on the ground: infiltrators stay in staging, sentinels in the plaza. Press Esc and choose **Back to loadout** to keep buying. During preparation, infiltrators are still held behind their line, while sentinels are free to set up.

**Spawn screens:** on every map, a wall stands about 2.5 m in front of each team's spawn, so neither side can see the other straight off spawn. A test checks every standing and crouching eye position within 2.5 m of each spawn against the other team's, so a future map edit can't reopen a sightline.

Maps live in `shared/maps.js` as data: walls, spawns, the flag, the scripted bot's route, the spots where it places each gadget, and area names for sensor alerts. Each server room activates its own map before simulating, so rooms on different maps can run side by side.

**Briefings:** each map has its own one-line infiltrator brief on the loadout screen, and the Field Manual's "ways in" list that map's approaches.

**Bot routes:** the scripted infiltrator picks one of several routes at random each round: its hand-tuned main route, or one through each route's low ground (on The Monolith, also either flank corridor). The pick isn't announced, so a sentinel can't know it. Profile routes are via points; the bot paths around walls between them and replans every second. **⌘K → Next bot route** cycles through the routes (applied at once), and back to random. A test runs every route on every map to the flag.

**Being seen:** while a detection timer runs, you hear it. An infiltrator hears a heartbeat that quickens and climbs toward the 3-second mark; a sentinel hears a lock-on tick that speeds up the same way. The infiltrator's pulse follows the **Attacker detection warning** setting in ⌘K, like the on-screen bar.

**Stance indicator:** beside the minimap, three figures (standing, crouched, lying down) show your stance: the current one lit with its name below, and the panel outlined whenever you aren't standing. While you slide, a sliding figure takes the crouch figure's place; while you sprint (moving at sprint speed, not just holding the key) a running figure labelled **SPRINTING** takes the standing figure's place, and wall running shows **WALL RUN** there too. The panel pulses briefly on every change.

**Compass:** a 360° strip at the top of the HUD slides under a fixed center line, showing 180° at a time. It has a tick every 5°, numbers every 15°, cardinal and intercardinal letters, and your heading in degrees below it. 0° is north, the infiltrators' way in. The flag (outlined diamond) and your side's pings (solid diamonds, with distance) are marked on it, and pinned to the edge when they are behind you. Through a camera feed it follows the camera's direction.

**Pings:** press **G** (rebindable in Controls; unbound on controller, since every pad button is taken) to mark the spot you're aiming at, up to 80 m away, or through a camera feed. With nothing in range, the ping lands along your aim at that distance. Only your own side sees it: a red beam and turning diamond drawn through walls, a minimap diamond, a compass mark with distance, and a two-note chirp. You have one ping at a time: a new one moves it, and pinging the same spot again clears it. Pings last 12 seconds and blink at the end (`pingSeconds` and `pingRange` in configuration). In 1v1 they're notes for yourself; with teams they'd reach teammates.

## Solo opponent

The bot only knows what a player would. It has a field of view (it can't see behind itself) and **notices you over a moment** rather than at once: faster up close and in the middle of its view, slower when you crouch, lie prone, stand still, cloak or show only your head over cover. It hears footsteps by how loud they are (sprinting about 22 m, walking 12 m, crouching 5 m, crawling 2.5 m), along with doors, noisemakers and gunshots, and it knows what its side's gadgets report (sensors, tripwires, camera tags, pulses, terminal alerts). A **?** over its head means something caught its eye; **!** means it has seen you.

- **Sentinel bot:** patrols the terminals and the routes in, watching the ways in from each post, and sometimes checks one of its cameras. It goes to look at whatever it hears or half-sees, runs to a terminal alert, and if it loses sight of you it heads to where you were going, then searches the area before going back to patrol. In Seen it keeps you centred to identify you; in Shoot it fires after a reaction time.
- **Infiltrator bot:** walks its route and sneaks (crouched) near the objective or when it hears you close by. If you're in view but looking elsewhere it freezes low; if you look its way it throws smoke at you (it carries two in Solo) and gets out of sight, then tries another way in, or another terminal if you were guarding its first choice. Once it has one terminal's data it heads for the nearest one left. At a terminal it backs off if you come close, unless it's nearly done, and returns later (terminals keep their progress). It jumps low tripwires it has marked and avoids high ones.
- **Difficulty:** Easy has a narrow view, slow reactions, shorter hearing and no tricks; Hard has a wide view, sharp ears and quick reactions, and checks its cameras more. The values are `BOT_LEVELS` in `server/bot.js`. In training the bot uses Normal, and its cloak and jammer still go off whenever they're ready so you can practise against them.

## Architecture and tuning

- `shared/config.js`: movement, phase duration, detection, credits, gadget definitions/costs/limits, team size, and spawns.
- `shared/map.js`: solid geometry, surface ray tests, movement collision, smoke obstruction, and wire distances.
- `server/simulation.js`: authoritative match simulation, per-player state, phase management, purchases, placement validation, gadgets, interactions, pairwise detection, and per-client snapshots.
- `server/bot.js`: the solo opponent's senses and decisions, and its difficulty levels.
- `server/index.js`: HTTP/Vite server, room membership, role capacity, bounded messages, input rate limiting, and 30 Hz WebSocket snapshots.
- `src/world.js`: 3D environment, first-person and surveillance views, player placeholders, gadget meshes, smoke, and debug overlays.
- `src/main.js`: screens, HUD, input, socket client, minimap, and developer controls.
- `src/audio.js`: synthesized placeholder gadget feedback.

The client sends movement intent, orientation, and requested actions. It cannot submit player positions, detection progress, elapsed time, or victory. The host computes all gameplay transitions. Snapshots omit enemy inventories/credits and disguise decoy types. Geometry and visibility are shared between client rendering and server simulation.

For a future 2v2 experiment, increase `maxPlayers` to 4 and `playersPerTeam` to 2 in configuration. Detection and victory logic already iterate team members independently. The current lobby and map spawns target 1v1; team spawn separation and a team lobby would still need to be added.

## Validation

```sh
npm test
npm run build
# While npm start is running:
node tests/network-smoke.js
```

Gameplay tests cover continuous detection, interruptions, viewing angle/range, crouched cover, camera restrictions, smoke, capture, timeout, decoys, scanner/disarm, jammer effects, economy/privacy, phases/reset, debug isolation, physical surface placement, and independent detection pairs. The network smoke check connects two actual WebSocket clients and checks session creation/join, private purchases, synchronized preparation, authoritative movement, attacker staging, and host reset.

## Prototype assumptions and limits

- Textured rigged operators with blended locomotion and procedural stance poses; simple smoke meshes and prototype sound effects. Character posing is still a prototype rather than a finished animation set.
- Solo defender turns toward an attacker visible within range and otherwise patrols. Solo attacker follows a simple waypoint route. Bots are testing aids and do not purchase or improvise; the defender test includes seeded defensive equipment.
- Floor/cover placement and wire wall anchors are supported. Camera pan, changing wire height after placement, movable props, roofed interiors, and complex character collision are outside this slice.
- Holding any interaction stops movement. Capture resets when released or outside its zone; restraint also interrupts it. Disarming is performed at the device or wire anchor.
- Scanner region readings are intentionally uncertain but are not physically occluded, modeling electronic signals. Motion sensors can sense through nearby walls.
- Smoke uses a simplified cylindrical obstruction volume, up to four meters tall; the visual is approximate. The volume and effect duration are server authoritative.
- Detection is continuously evaluated from the latest server-received look direction; no latency compensation, client prediction, reconnect recovery, secure accounts, anti-wallhack culling, or competitive anti-cheat. Networked positions are lightly interpolated for rendering. LAN play is the initial target.
- Debug visualizations and the attacker warning are local testing options. Gameplay-changing developer actions are rejected in multiplayer, apart from the host's round reset.
- Equipment-used statistics count deployments; reusable scanner sweeps/disarm interactions are not counted as deployed equipment. Wires-crossed includes real and decoy activations.
- Google Fonts improve presentation when available; local sans-serif and monospace fallbacks work offline. The client build is generated by Vite; `npm start` serves the prototype through Vite middleware and the game server together.

This is a functional testbed for the core loop, not a balanced or production-hardened release. Extended multi-round human latency/play-balance testing remains to be done.

## Movement sound listening test

Stationary lying is silent. Moving prone produces an audible fabric scrape; crouch walking has softer footfalls; walking is louder; sprinting is loudest and fastest. Prone movement is an army crawl at 0.65 m/s with a 0.3 m eye height. Sprint and jump are disabled while prone. Actual server-validated movement drives the sounds, so pushing against a wall makes no footsteps. Both local and opponent movement are audible, with distance attenuation and stereo direction for opponents.

Open **⌘K → Movement sound** for separate crawl, crouch, walk, and sprint volume sliders and **Listen** buttons. These preview sounds without needing to move. Footsteps now default to about a third of their earlier audition levels (crawl 0.05, crouch 0.08, walk 0.14, sprint 0.22); stationary prone remains silent. Sliders apply locally for the current page session. Edit `MOVEMENT_AUDIO` in `shared/config.js` to save future defaults; durations, cadences, and filter frequencies are configurable there too.

## Xbox controller and custom bindings

Connect an Xbox controller through the operating system, focus the game, and press a button to let the browser detect it. Browser-standard Gamepad API controllers are supported; no driver or account is bundled. The active input switches on actual mouse/key/button/stick activity. Neutral stick drift is filtered with an adjustable deadzone. HUD, gadget slots, interactions, camera prompts, resume text, and field-manual controls follow the latest device and its saved bindings. Disconnecting clears held input and returns to keyboard prompts.

| Xbox default             | Action                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| Left stick / right stick | Move / look                                                                                 |
| LS click                 | Toggle sprint while moving; stopping cancels; click again while sprinting to slide (like B) |
| A                        | Jump; select menu item                                                                      |
| B                        | Tap crouch, hold prone; back in menus; exit camera while viewing                            |
| RS click                 | Toggle prone                                                                                |
| X                        | Hold interact / disarm / raise flag                                                         |
| RT                       | Use / place gadget                                                                          |
| LT                       | Aim (hold): shows a throw's arc                                                             |
| LB / RB                  | Previous / next owned gadget                                                                |
| D-pad up/right/down/left | Gadgets 1/2/3/4; navigate menus                                                             |
| Y                        | Enter / cycle camera feeds                                                                  |
| Menu (Start)             | Pause / resume; Start on the main menu; Confirm loadout                                     |
| View                     | Developer panel                                                                             |

Open **Controls** in the header, with **?** (the /? key), or from the pause menu (**Control settings**). Control settings have no controller button by default; bind one if you like. Change keyboard, mouse-button, and controller-button bindings by selecting an action and pressing its replacement. Occupied bindings swap. Escape cancels capture. Settings also include mouse/controller sensitivity, deadzone, separate invert options (mouse look Y, controller look Y, and controller look X), stick swapping, and restoring defaults. The mouse invert option also applies to the IJKL look keys. Analog sticks remain axes; stick roles can be swapped. Keyboard sprint is held; controller LS sprint toggles. Movement remains server validated.

Mappings persist in this browser's local storage. Controller menus support left stick/D-pad navigation and A selection, including the purchase screen. Move left/right on a focused slider to adjust it. **⌘K** or the controller's **View** button toggles the developer panel; both bindings are customizable. With a controller, the D-pad and A navigate the panel and B closes it. If you saved a controller map when View opened control settings, View now opens the developer panel instead and control settings become unbound. Existing C stance controls and IJKL aiming remain defaults.

Input handling was checked with synthetic standard Xbox button/axis samples and keyboard/mouse browser interaction, including saved remaps and Command-K. Physical Xbox hardware was not available for an end-to-end device test.

### Controller in the standalone games

Slipstream, Firefly Recall, Toy Box Rescue, Roof Catch, Loop & Glide, Pond Fishing, Target Blaster, River Crossing, Racetrack Builder, Backyard Apple Catch, Pool Noodle Chop, Backyard Flier, Pipe Crane, Perch Hop, Acorn Drop, Backyard Fling, Perfect Pizza, Leaf Piles, Paper Plane Pitch, Big Bad Burger, Shoo Away, Comet Dash, Pop Patrol, Kickabout and Skee Ball run in their own overlays. While one is open, `src/padBridge.js` owns the controller (the menus behind it don't move) and turns it into the keys the game already uses:

| Xbox               | During play                                                                                                                     | On a start, pause or results screen               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Left stick / D-pad | Steer, aim, dive/flare, hop, look around, move the yard cursor, aim the roll (W A S D)                                          | Move to the nearest button that way               |
| Right stick        | Look (Slipstream, Shoo Away; I J K L)                                                                                           | —                                                 |
| A / RT             | Drop, cast, reel, release, fire, shoo, jump, build, shoot / lunge, belly dive, hold to roll (Space)                             | Press the highlighted button (A only)             |
| X / LT             | Pump the water blaster (R, Target Blaster); dash (Comet Dash); start wave / fast (Pop Patrol); pass / switch player (Kickabout) | —                                                 |
| B                  | Pause (Escape)                                                                                                                  | Back / resume (Escape)                            |
| Menu (Start)       | Pause                                                                                                                           | Press the main button (Start, Resume, Play again) |

A game opens with its main button highlighted, not "Back to games". In Firefly Recall, Y X B A (or the D-pad) pick the firefly of the same colour in that spot of the diamond, and Menu pauses (B is the red firefly there, not pause). A game marks its root with `padPlaying()` (true while the controller should steer), optionally `padFaces()` (Y X B A press ↑ ← → ↓ instead of their usual keys) and optionally `padTargets()` (limit navigation to certain buttons). These games use fixed controller buttons; the Controls remapping applies to the arena games. Slipstream's local 2-player mode still needs the keyboard for player two. Leaf Piles' 4-player mode is the exception to one-controller-for-everything: it marks its dialog with `padSeats()` and reads every controller itself, one per corner.

## Characters

Characters use a locally bundled, textured Vanguard soldier rig with independent skeletons. Infiltrators wear sand/olive materials, a light harness and compact pack; Sentinels wear navy/slate materials, heavier chest armor, shoulder guards and a larger radio pack. Idle, walk and run animations blend with movement speed. Crouching and crawling pose joints without squashing the model; sidearms have a visible two-handed stance. Soft character shadows and separate fabric/armor/visor finishes improve grounding. Decoys and sensor reveals use the same team models. Collision and hit detection remain server controlled.

Open `/character-lab.html` on the development server to compare both teams, test stances and turn the models around. The base model is sourced from the official Three.js examples; source and licensing notes are in `src/assets/characters/ATTRIBUTION.md`.

## Programmable character decoys

This is a new character lure, separate from the existing fake tripwire. Either role can buy a **Programmable decoy** for 200 credits (up to 3). In the equipment list, choose **Program** on the decoy row. The default sequence is **Crouch → Move to the trigger mark → Lie down**.

The editor supports up to 12 actions: crouch, stand, move to mark, lie down, look at a compass heading, and wait. Add, remove, reorder, set durations/headings, choose standing walk/sprint, and repeat the sequence 1–5 times. Stance persists between actions, so moving after crouch means crouch-walking; moving after lie-down means crawling. A move walks straight to the mark, facing the way it's going; the Look action turns the decoy to a compass heading (0° north, 90° east). Each move action uses the same mark for that activation. The decoy takes the shortest walkable route to the mark: it searches a 0.5 m grid in eight directions around walls and cover, then pulls the route taut so it walks straight wherever it can. Programs remain private and can be edited only before confirming Ready. A saved program is retained across round resets within the session.

Equip the decoy (**1** by default, because it is the first gadget; other gadgets shift to 2–5), aim down at open ground within 40 m, then trigger with **left click / F / RT**. The server validates the aim ray, locks that ground position as the mark, spawns the decoy beside the player, and starts action 1 immediately. Later activations get their own mark. Invalid marks do not consume a charge. Move actions route around solid geometry on the ground; roof/cover-top marks and unreachable destinations are rejected. The HUD reports the current action and completion.

The decoy looks like its owner's team, emits stance/speed-dependent movement sounds, and can distract the scripted defender and motion sensors. A defender can neutralize an attacking decoy with Seen detection or Removed capture; this does not eliminate a real player or end the round. Decoys never raise the flag or mechanically trigger tripwires. They retain the final pose until neutralized or the configurable 90-second lifetime expires.

### Immediate playtest

1. Enter a **Solo field test**, then choose **Program** on the decoy row.
2. Edit the actions or keep the default three-step sequence.
3. Choose **Save & Play Test Now**. This grants/equips 3 decoys, starts the active round immediately, and freezes bot movement.
4. Enter the arena, use **K** or the mouse/right stick to aim at nearby ground, and trigger the decoy.

The **⌘K** developer panel also includes **Decoy sandbox: equip & play now** and **Start playing immediately after Ready**. The latter keeps the buy screen available but skips the 45-second preparation phase when Ready is confirmed. Developer shortcuts remain solo-only. The normal buy phase already ends on manual Ready rather than a countdown.

`shared/decoy.js` contains program validation, grounded pathfinding, and the sequence runner. Important limits are in `shared/config.js`. The authoritative server runs and replicates decoy movement, stance, and action progress; clients cannot submit arbitrary destinations or progress.

To exercise decoy replication across two real WebSocket clients while the server is running:

```sh
node tests/decoy-network.js
```

This check intentionally waits through the normal 45-second multiplayer preparation phase, triggers a decoy, verifies that the opponent receives its movement without the private program/mark, and checks the final prone pose. Controller users can navigate the editor with the stick/D-pad and adjust focused selections or numeric values with left/right.

## Gadget types

Some gadgets come in types. In the buy screen, a typed gadget's detail panel has a **Deployable / Portable / Decoy** switch: pick a type, then buy and upgrade it. Each type has its own price and stock, so you can carry, say, two real tripwires and two decoys. In play, the gadget bar shows only what you bought.

| Gadget              | Deployable                                                                                                           | Portable                                                                                                 | Decoy                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Signal jammer       | Thrown; jams cameras and sensors where it lands, with an electric crackle                                            | Worn: jams devices close around you for a few seconds, then recharges                                    | — (removed)                             |
| Motion sensor       | Placed on a floor; pulses, and movement in range outlines intruders through walls for its reveal time (3 s standard) | Worn: active while equipped; movement close around you outlines intruders                                | — (removed)                             |
| Tripwire            | Click an anchor, then a second anchor in sight of it within the span (6 m standard)                                  | —                                                                                                        | Anchored the same way; restrains no one |
| Surveillance camera | Placed on a wall; live feed                                                                                          | **Mirror pole**: extend it to peek around corners from its tip while you stay behind cover (either role) | Placed the same way; no feed            |

Smoke, the flashbang, the noisemaker, the scanner, the disarming tool, the cloak, the shutter lock and the programmable decoy have no types.

**Panning cameras:** while viewing a feed, use your look controls (mouse, look keys or right stick) to pan the camera up to about 60° either side of where it's mounted, with limited tilt. Your body keeps facing where it was. Every pan makes a short servo whir from the camera: the opponent hears it with the same distance falloff and left/right direction as footsteps (you don't hear your own), and they can see the camera turn.

**Jamming is silent.** A jammed camera stays in the defender's feed rotation and keeps showing its last clean frame, so anyone who walks past afterwards never appears on it. The only tell is the feed's REC timestamp, which advances normally for six seconds, then holds for one second in a repeating seven-second cycle. It loses one second per cycle without catching up (switching to an already-jammed camera shows the scene empty). A jammed sensor simply stays quiet.

## Cloak

**Pulse sensor** (250 CR, up to 2, **both sides**): a thrown motion sensor. Throw it like smoke (hold to aim, release); one second after it lands it sends out a single pulse. Every opponent within its radius (8 m standard), through walls, is outlined for your side for 3 seconds. You're told how many contacts it found ("Pulse: 1 contact outlined." or "Pulse: no contacts."). Everyone hears the sweep (louder nearby) and sees its green ring race out, and anyone it catches is told they were swept, so they know to move. Upgrades: throw range (10–24 m), pulse radius (5–11 m) and outline time (1.5–4.5 s). It's a separate gadget from the placed **Motion sensor**, which stays as the Sentinel's lasting tripwire for movement; the pulse is a one-off snapshot, and the Infiltrator's only way to find the Sentinel.

Infiltrators can buy a **Cloak** (350 CR, reusable). Activate it to shimmer nearly out of sight: while it lasts, a sentinel's Seen bar fills at a fraction of its normal speed (30% standard). Sprinting, raising the flag, disarming, or using any other gadget drops it, and it then recharges. It hides you from eyes, not from motion sensors, which still reveal a cloaked mover; and in Removed mode close-range capture still works.

- **Spotting devices:** keep an opponent's deployed device (real or decoy) near the centre of your view, within 15 m and in clear sight. Smoke breaks the spot.
  - **Sentinels destroy it** after 2 seconds. They have no disarming tool, and the infiltrator's devices are jammers and decoys.
  - **Infiltrators only mark it** after 1 second. A marked device gets an amber diamond your team sees through walls, plus an amber square on the minimap; the sentinel isn't told. The **disarming tool is the only way to remove a sentinel's device**: walk up and hold E. Otherwise, step over the wire, smoke or jam the camera, or take another route.
  - Portable gadgets are carried, so they can't be spotted or destroyed, which is why their stats are lower.
- **Decoys** look exactly like the real device to opponents: there's no visible tell, so only the scanner (which reads them as real anyway), the disarming tool or trying your luck finds them out. Your own side's decoys are drawn about 5% darker, so you know which of yours are fake. Decoys use your deployable's stats (span, timing), so they never give themselves away by behaving differently.
- **Mirror pole:** use it to extend the mirror along the way you are facing, then look around from its tip. You can't walk while it's out; use it again, crouch, or exit-camera to retract it.

## Thrown gadgets

The smoke device, signal jammer and flashbang are thrown, not dropped. **Hold** the use key (left-click, F, or E) to aim: a thick red arc shows the flight, and a red ring at the end marks where it will land, sized to its effect area (cloud radius or jamming radius). **Release** to throw. Changed your mind? Press **Q** while still holding (on a controller, the crouch button) to cancel, then let go. Q is rebindable as "Cancel throw" in Controls. The arc only shows while you're aiming, not just because a throwable is equipped. Once thrown, the canister flies the arc, bounces off walls, can come to rest on top of cover or containers, and takes effect where it stops. Opponents can see it in flight. The aim preview and the server use the same flight code (`shared/throwing.js`), so it lands where the ring shows. Throw range is a tunable stat.

**Coloured smoke (Seen rules):** under Seen, every smoke cloud is a random colour, and each one's hue is at least 60° away from the previous cloud's, so consecutive throws look clearly different. The server picks the colour, so everyone sees the same cloud, and standing inside it tints your view to match. Under Shoot (and the legacy Removed rule) smoke stays grey.

**Smoke you can't see through:** the cloud has a dense, near-opaque core filling the same 4 m-radius, 4 m-tall column that blocks detection, wrapped in a softer billowing shell. It's mostly self-lit, so it reads as vapour rather than lit rock. With your eye inside the cloud, the view turns thick grey (fog closes in to about 2 m), so being in smoke hides you and blinds you too.

**Telling canisters apart in flight:** smoke is a tall pale grenade with a dark cap and vent ring. A jammer is a squat dark box with an antenna and an amber light, and it keeps the antenna once it lands. A flashbang is a stubby black can with yellow bands and a spoon lever.

## Flashbang

Both sides can buy a **Flashbang** (300 CR, up to 2). Throw it like smoke (hold to aim, release to throw). When it lands it bursts, with a white flash and a bang that everyone hears.

- **Who it blinds:** anyone within its radius (8 m standard) with a clear line of sight to the burst, the thrower too. Facing it, you're blinded for the full time (3 s standard); turned away, for 40% of it. Your screen whites out and fades back over the last 0.8 s.
- **Sentinels:** a blinded sentinel can't build detection, so it's a way past a guard at close range. They also can't mark or destroy devices by sight while blind.
- **Cameras:** a camera that can see the burst whites out for the same time, so its feed shows nothing.
- **Smoke and walls** block the flash.
- **The cost:** the bang marks where it went off on the other side's minimap for 12 seconds.
- **Tunable stats:** throw range, blind radius (5–11 m) and blind time (1.5–4.5 s).

The **decoy jammer** was removed. It jammed nothing, so a camera feed kept working right beside it and gave it away, and the programmable decoy does misdirection far better.

## Detection: any part of the body counts

Seen detection used to need the centre of your view within 12° of the intruder's head, with clear sight to that one point. Aiming at their chest, or seeing their body while their head was just behind an edge, didn't count. Now any of four points down their body (head, chest, hips, knees, scaled to their stance) counts, as long as it's within 12° of your view's centre and in clear sight. Camera tags use the same rule. Cover still works: someone crouched behind a low wall is still hidden, because none of their body points can be seen.

## Gadget review (second pass)

**Removed:** the decoy sensor (it did the decoy camera's job less visibly) and, earlier, the decoy jammer. What's left: the decoy tripwire and decoy camera for sentinels, and the programmable decoy for both sides.

**Cheaper:** disarming tool 200 → 150 CR, scanner 400 → 300 CR, thrown jammer 400 → 300 CR.

**Cameras tag intruders:** watching a feed, keep an intruder in frame (within about 28° of where the camera points, in range and clear sight) for 1.5 s and they're outlined for your side for 4 s. A jammed or flashed camera can't tag, and a cloak slows it the same way it slows detection. The HUD shows "INTRUDER IN FRAME" with a progress bar.

**Revealed intruders on the minimap:** anyone outlined for your side shows as a red dot on your minimap too. That covers sensors, camera tags and tripwires.

**New gadgets:**

- **Noisemaker (Infiltrator, 100 CR, up to 3):** thrown. At the landing spot an orange can rattles and makes running footsteps for 6 s, heard like a player's (same falloff and direction). A sentinel bot that can't see anyone turns to it and goes to check. Tunable: throw range, duration, how far it's heard.
- **Shutter lock (Sentinel, 250 CR, up to 2):** placed like a tripwire: click a wall on each side of a doorway, lined up straight across, up to 3.5 m apart.
  - It drops a ribbed steel shutter (2.8 m tall) that blocks walking, sight and throws for 60 s.
  - The disarming tool cuts through it from the middle of the panel, taking its usual time plus 1 s.
  - It won't close on someone standing in the doorway.
  - The sentinel bot paths around it.
  - Tunable: max width, how long it holds, and the extra disarm time.

  Active shutters are added to the shared walls for each match as it ticks, so matches on the same map never see each other's.

## Gadget tuning

Each tunable gadget has three stats rated 1–5. Level 3 is standard issue, so an untouched gadget plays exactly as before. By default, you improve stats by buying **Upgrades** during the buy phase (see below). Solo tests can switch to **10-point builds** in the developer panel: like building a player in a sports game, a gadget's levels can total at most **10 points**, so raising one stat usually means lowering another. Tuning applies to every unit of that gadget, stays private, and locks on Ready.

| Gadget             | Stats (level 1 → 3 → 5)                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Smoke device       | Throw range 10 → 16 → 24 m · Cloud radius 2.5 → 4 → 5.5 m · Duration 4 → 8 → 12 s             |
| Signal jammer      | Throw range 10 → 16 → 24 m · Jamming radius 6 → 10 → 14 m · Duration 3 → 6 → 9 s              |
| Portable scanner   | Scan range 7 → 12 → 17 m · Sweep time 2.5 → 1.5 → 0.8 s · Sector width 32° → 52° → 69°        |
| Disarming tool     | Hold time 1.2 → 0.5 → 0.2 s · Reach 2 → 3 → 4 m · Aim tolerance 20° → 32° → 43°               |
| Tripwire trap      | Hold time 3 → 5 → 7 s · Trigger width 0.25 → 0.4 → 0.6 m · Max span 4 → 6 → 9 m               |
| Motion sensor      | Detection radius 4 → 7 → 10 m · Re-alert delay 7 → 4 → 2 s · Reveal time 2 → 3 → 5 s          |
| Portable jammer    | Jamming radius 3 → 5 → 7 m · Duration 2 → 4 → 6 s · Recharge 12 → 8 → 5 s                     |
| Worn motion sensor | Detection radius 2.5 → 4.5 → 6.5 m · Re-alert delay 7 → 4 → 2 s · Reveal time 1.5 → 2.5 → 4 s |
| Mirror pole        | Pole reach 0.6 → 1.2 → 1.8 m                                                                  |
| Cloak              | Duration 3 → 5 → 8 s · Recharge 20 → 12 → 7 s · Seen speed 60% → 30% → 10% of normal          |

### Tuning modes (developer panel)

Solo tests and the training range can switch between two tuning rules under **⌘K → Gadget tuning**. Switching resets the round and refunds credits. Multiplayer sessions use Upgrades. In both modes, each upgrade or tuning control shows the value it would set (for example, Jamming radius reads 5 m → 6 m).

- **Upgrades** (default): every property starts at **Normal**. Select a gadget's card; its detail panel lists each property with its value now and after one more upgrade. Press **+1 · 100 CR** to buy one property at a time: **2 upgrades per gadget** in total, on one property (+2) or split across two (+1 each). You must own the gadget first. Upgrades apply immediately to every unit of that gadget type. **−** sells an upgrade back. Selling the last unit of a gadget refunds all its upgrades. Upgrades are bought again each round.
- **10-point builds**: choose **Tune** on a gadget row and set each stat from 1 to 5, with up to 10 points per gadget. Builds are free and kept across round resets within the session.

The programmable decoy, cameras, and decoy types keep fixed specs (decoys copy their deployable's stats). In a solo test, **Save & Play Test Now** grants a full stack of the tuned gadget, equips it, starts the round, and freezes bot movement. Stat tables live in `shared/gadgetStats.js`. The server validates every build, and opponents' snapshots never include tuning values.

## Training range

Choose **Training range** on the home screen to try every gadget from both roles in one solo session. Pick a role and rules as usual; your role decides which side the scripted bot plays.

- The loadout screen lists every gadget from both roles, all free. You start with nothing: use **−/+** to carry anywhere from 0 to the gadget's full count, or **Take all** / **Clear all**. Pick each gadget's type there too, and that type is what you carry. Your picks stay when you go back to the training loadout. Tune them (or buy upgrades, in Upgrades mode) there, then choose **Enter training range**. There is no preparation phase.
- Used gadgets refill to the count you picked. Cooldowns still apply unless you turn them off in the developer panel.
- A gadget from the other role deploys for that role, so it behaves as an opponent's would. Your scanner and disarming tool will find a tripwire you place as an Infiltrator, but it never catches you: your own wires, and your side's, never trip for you or your team. Training shows both sides' alerts, such as your own sensor's motion reports, and any role can view its cameras.
- There is no timer. Being identified or captured, and raising the flag, are announced but never end the session.
- **Opponent loadout:** under your own list, choose what the scripted opponent carries. Each gadget it can use is listed once with a type switch (Deployable / Portable / Decoy) and a count. Placed and thrown gadgets are capped by the spots the map has for them (for example four wire spots, shared by real and decoy tripwires). In the first few seconds of the round the opponent puts them out one at a time (0.6 s apart): a Sentinel bot anchors tripwires and mounts cameras and sensors; an Infiltrator bot drops smoke and jammers along its approach. Portable ones are worn (worn sensor) or used whenever ready (cloak first, otherwise the portable jammer). The bot doesn't use the scanner, disarming tool, mirror pole, programmable decoy, flashbang, noisemaker or shutter lock, so they aren't offered. Outside training, a Sentinel bot carries one tripwire, one decoy tripwire, a sensor and a camera.
- An infiltrator bot starts stationary. A sentinel bot on a map with terminals (Pier 9) patrols them from the start: it walks between the two terminals and runs to one as soon as its activity alert goes out, so you can practise hacking under pressure. **⌘K → Toggle stationary bot** holds either one still (and lets it go again). Number keys select the first five gadgets; cycle with the previous/next gadget controls to reach the rest. Press **Esc** and choose **Back to training loadout** to retune.

**Switch sides (keep round)** in the ⌘K panel (training only) swaps you and the opponent bot to the other roles without resetting anything: positions, placed devices and the round all stay. Device ownership swaps with the roles, so a tripwire you anchored as a Sentinel becomes an enemy device once you are the Infiltrator: you can mark it by keeping it in view for 1 s, find it with the scanner, disarm it, or walk into it and get caught. **Switch teams & reset** still starts a fresh round on the other side.

The **⌘K** developer panel works in training: tuning mode, overlays, stationary bot, cooldowns, switch teams, and reset all apply.

## Terrain and sightline pass

All maps now interrupt long views with staggered full-height screens and turns. Tall lane dividers on The Lanes and The Quad keep elevated positions from overlooking every neighboring route. Routes retain connected floor-level bypasses, and the raised positions are reached by actual climbable stairs:

| Map          | Route elevation identities                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Compound | Warehouse terrace **0.8 m**, courtyard perch **1.6 m**, east overlook **2.4 m**, with broken ground-level approaches                                |
| The Lanes    | West terrace **1.2 m**, center ridge **2 m**, east catwalk **2.4 m**; screened low routes run beside them                                           |
| The Quad     | A loading terrace **1.2 m**, B gallery **1.6 m**, C low court with **0.8 m** shelf, D high walk **2.4 m**; the inner shortcut stays at ground level |
| The Monolith | Courtyard altar **1.2 m**, west plaza overlook **1.6 m**, side galleries **2.4 m**; flank corridors run behind the galleries at ground level        |

Even the ridge and catwalk have staggered screens, so gaining height provides local angles rather than an uninterrupted view down the entire map. The attacker bot follows the revised turns. Tripwire placement measures anchor height above the player's footing, allowing traps on high ground. Automated checks cover route connectivity, broken standing/crouching sightlines on low and high routes, climbable stairs, protected spawns, and bot completion.

## Aiming down sights (ADS)

Hold **LT** on a controller or the **right mouse button** (rebindable as "Aim down sights" in Controls) to aim down sights.

- **Nothing zooms:** the view stays at 68° (`fov` in `shared/config.js`).
- **Throwables:** with a water balloon, smoke, a jammer, a flashbang or a noisemaker equipped, holding ADS shows the ghost arc and landing ring. Pressing Use (RT, left-click, F or E) throws straight away; let go of ADS to cancel. Holding Use to aim and releasing to throw still works too.
- **Pointer lock:** without pointer lock, right-drag is how you look, so the right mouse button only aims down sights while the pointer is locked.
- **Camera feeds and the mirror pole:** ADS is off while you're using either.

## Sliding

Both sides can slide: **press crouch (C) while sprinting forward**.

- **Start:** the slide begins the moment you press C, not when you let go, and it doesn't touch your crouch toggle. Holding C a little long won't drop you prone.
- **Movement:** you drop low (crouch height) and keep going the way you were running. You burst out at 1.25× sprint speed and ease out to walking pace over 0.8 s, so there's no sudden stop.
- **After:** you come out of it on your feet; still holding Shift and W, you're straight back into a sprint.
- **Noise:** it scrapes at walking loudness, so it isn't a silent dash.
- **Ending early:** jumping, going prone, hitting a wall or leaving the ground ends it. There's a 1 s cooldown before the next slide.
- **Settings:** the values are `slideSeconds`, `slideBoost` and `slideCooldown` in `shared/config.js`.

## Clambering

Face a nearby wall or obstacle and **hold Jump** (Space / Xbox A by default). After a 0.2-second hold, a reachable ledge within 1 m is grabbed and the character lifts onto it over 0.5 seconds. Tops may be up to 2.6 m above the last footing, allowing shipping containers and elevated terraces to be climbed. A tap still performs a normal jump.

**Wall running:** sprint, jump beside a long, tall, flat wall while moving roughly along it (within 35°), and keep holding forward: you run along the wall for up to 1.2 s (about 5 m), carrying some of the jump up (peaking around 1 m off the ground) and then sinking, before you drop. It's as loud as a sprint (others hear sprint footfalls), drops a cloak, and you hear your feet hit the wall; the view leans about 8° away from the wall and the stance indicator shows **WALL RUN**. One run per jump. Press jump during a run to **kick off**: up, away from the wall and on along it (about 2.4 m sideways), which allows one more run on a different wall, for example across a corridor, before you land. Runnable surfaces are building walls, container sides and other walls at least 1.5 m long that reach from about your feet to 1.6 m above them; not thin cover, railings, ramps, terminals, tanks or crane legs. Both sides can wall run. Values (`wallRunSpeed`, `wallRunSeconds`, `wallRunReach`, `wallRunAngle`, `wallRunRise`, `wallRunSink`, `wallKickPush`, `wallKickSeconds`) are in `shared/config.js`.

**Mid-air mantle:** while you're in the air and pushing forward, a reachable ledge pulls you up whether or not jump is still held. A jump that falls just short of a ledge now makes it, instead of bumping the wall because you let go of jump too early. In the air, reach is measured from your current height rather than where you took off, so a running jump grabs ledges up to 2.6 m above its peak: the 3 m catwalks (like the landing above the foot of Pier 9's south ramp) are reachable this way, while a standing hold-jump still tops out at 2.6 m. Ledges are probed every 0.25 m from your feet to arm's reach, so a thin deck with open space under it still has an edge to grab. In a sweep of 864 approaches (block heights 1.2–2.5 m, straight on and at 40°, walking and sprinting, various jump timings), 852 now reach the top. The 12 misses are walking jumps started 3 m out, which land before reaching the wall. Without pushing forward, a jump next to a wall is still just a jump.

**Vaulting:** a railing or half wall too thin to stand on (the catwalk railings, the ramps' side rails) is vaulted instead: you go up, over it, and down onto the floor just behind it, as long as that floor is no more than 1.2 m (`vaultDrop`) below the rail's top. From the upper half of Pier 9's warehouse ramps, for example, hold jump at the side rail to vault onto the catwalk. While searching for a ledge, anything low enough to just step onto (like the next step of a ramp) is passed over.

There must be a clear lift path and enough space on the top; tall walls, staging-line crossings, restraint, prone stance, camera viewing, and mirror use block clambering. Release jump before grabbing another ledge. The server validates and synchronizes the movement, and the HUD shows **Clambering** during the lift. Values are configurable in `shared/config.js`.

**Gadget cycling:** Tab selects the next owned gadget; **Shift+Tab** selects the previous one, wrapping around at either end. Both bindings remain customizable. Saved default R bindings migrate to Shift+Tab.

## Map colors and menu music

**Map color navigation:** each map now uses colored route walls, paving, high ground, signs and matching minimap zones. Compound: teal warehouse, ochre center, blue east yard. Lanes: jade west, amber ridge, blue east. Quad: cyan, gold, violet and green from west to east. Monolith: turquoise west gallery, sandstone courtyard and violet east gallery. Staging and objective plazas have separate colors; red remains the objective and alert accent.

**Menu music:** Confetti Level, the supplied MP3 (stored in `src/assets/audio/confetti-level.mp3`), loops by default on menus and loadout screens after the first click/key/controller interaction. It keeps playing through the preparation phase, fades out slowly over its last 10 seconds (reaching silence as the round starts), stays silent in the arena, and fades out while the tab is hidden. Adjust or mute **Menu music** in Controls; volume is saved in this browser.

**Music selection:** ⌘K → Menu music → Track switches between Confetti Level (the default), Silent Perimeter, Backyard Sunshine (112 BPM: bouncy major-key bass, plucked chords, a marimba-like tune, shaker and the odd birdsong chirp), Cold Espionage (72 BPM) and Covert Technology (88 BPM, gated sequences, deep sustained bass, random radio static and industrial ticks). Tracks crossfade and your selection is saved. The latter three are original synthesized loops; music still fades out in the arena.

## Stealth cover and covered shortcuts

All four maps now have denser cover chains, mixing 1.15 m crouch cover with 2.15–2.2 m standing refuges. Extra cover across the previously open plazas breaks up approaches to the flag, while stair landings and the flag itself stay accessible.

| Map      | Added cover                      | Covered routes and hiding spaces                                                                                                                                       |
| -------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compound | 28 pieces                        | Warehouse wall cut, hollow shipping-container run and east service tunnel                                                                                              |
| Lanes    | 10 pieces                        | West and east underpasses through the divider blocks; west and ridge hide bays                                                                                         |
| Quad     | 12 pieces                        | Staggered A–B, B–C and C–D tunnels, plus three recessed hide bays; the original inner shortcut remains                                                                 |
| Monolith | none (hand-placed walls instead) | Underpasses beneath both galleries connect the courtyard to the outer flanks; large L walls in the lanes and a broken fence north of the flag replace the crate chains |

Underpasses have solid roofs, standing clearance and painted thresholds (no floating signs: every wall label sits on a wall). Dashed pale outlines on the minimap show their footprints. Roofs block sight and thrown gadgets, and stop jumps at the ceiling; they do not block walking underneath. Ground pathfinding supports these openings, and bots replan through the revised geometry. Automated checks walk a standing player through every underpass, verify ceiling collisions and accessible hide bays, and run every bot route on every map.

### Open containers (building block)

`openContainer(x, z, { axis, length, width, height, name })` in `shared/maps.js` is a shipping container open at both ends, usable on any map. Spread it into a map's walls like stairs: `...openContainer(-15, -24, { length: 5, width: 3 })`. It runs `length` m along `axis` ("z" by default; 6 m long, 2.6 m wide and tall). It's built from two 0.15 m side walls and a roof with 2.45 m headroom, so you can walk through standing. Sight and thrown gadgets pass through the open ends but not the walls or roof, and cameras can mount on its sides.

Each one registers itself as a passage: dashed on the minimap, kept clear by the generated cover, and walked end to end by the underpass test. It's drawn with tinted corrugation ribs, door frames at both ends and a cap rail. The Monolith's two plaza containers are now open ones (moved 1 m north so both ends stay clear of the overlooks). The Compound's, Lanes' and Quad's containers are still solid.

### Maps on offer (temporary)

Only **Pier 9** is playable for now. `ENABLED_MAPS` in `shared/maps.js` lists the maps the menu offers, and the server starts any other requested map as the first enabled one. The Compound, The Lanes, The Quad and The Monolith are still fully built and still covered by the tests; add their ids back to `ENABLED_MAPS` to offer them again.

### Pier 9 (docks)

A 52 × 76 m neighborhood with three homes between the infiltrators' south staging room and the Sentinels' north back lane.

- **A · Amber house (west), B · Terracotta house (centre), C · Blue house (east):** each has a lawn and front path, a walkable interior with front/back and side doors, and a private backyard. Indoor partitions break views straight through the house; shuttered windows give alternate angles.
- **Yards:** dense hedges block sight and movement, with offset plantings that leave routes around them. Planters and garden tables provide low cover. Backyard decks have stairs and heights of 0.8, 1.2 and 1.6 m.
- **Connections:** wooden privacy fences separate properties. The two mid-map connections are open garden gates with folded-back leaves and connecting paths. The back lane links all three yards.
- **Fence holes:** two small openings near staging replace the old ducts. Crouch to cross between neighboring front yards.

**Terminals:** A, B and C sit in their respective backyards. Extracting data from **two of the three** wins.

- **Extracting:** stand by a terminal and hold Interact for **8 seconds**. Progress stays on that terminal when you let go, so you can start one, leave, and come back to finish it, or use it as a fake.
- **Spent terminals:** once a terminal's data is out it can't be worked again. Both sides are told ("Data extracted from Terminal A. 1 more terminal to go." / "Terminal A lost"), its screen shows full to everyone, and it greys out with a ✓ on the compass and minimap. The HUD shows how far along you are ("EXTRACT DATA · 1 OF 2 · TERMINAL B OR C"); Sentinels see how many they've lost. In training, extracting two terminals resets all three and the session carries on.
- **What the Sentinels learn:** about 1.5 seconds after the Infiltrator starts on a terminal, the Sentinels are told which one ("Terminal C: activity detected."). They aren't told how far along it is, and the alert repeats at most every 6 seconds per terminal. Only the Infiltrator sees progress, on the HUD and on the terminal's own screen.
- **Distances:** A and C are each about 55 m from staging and 32–35 m from the Sentinels' spawn, and about 41 m apart (≈ 7.5 s sprinting), with the back lane as the Sentinels' link between them. B sits between them (about 16 m from A and 22 m from C) and is the Sentinels' nearest, in the central backyard, so the cheapest pair for the Infiltrator is usually B plus one of the outer two.
- **Bots:** the Infiltrator bot picks a terminal at random each round and, once it's extracted, goes for the nearest one left. The Sentinel bot patrols posts by the terminals, goes straight to a terminal when it hears an alert, and stops guarding one once it's lost. It does this in training too (as your opponent when you play the Infiltrator) unless you hold it still with ⌘K.
- **Markers:** all three terminals are always on the compass (TERM A / TERM B / TERM C) and the minimap. Each has a mast with a red light and a sign, so you can find it from a distance.
- Values (`terminalSeconds`, `terminalAlertDelay`, `terminalAlertGap`, `objectivesToWin`) are in `shared/config.js`; the terminals themselves are in `MAPS.docks.terminals`. Other maps keep their single flag. A map with fewer than three terminals (an older custom map with two) is won by extracting any one.

**No flicker (z-fighting):** signs and trim use depth offsets; room walls meet at full corners and roofs sit inside their walls. A test checks that overlapping pieces do not share a visible face.

New building blocks in `shared/maps.js`:

- `room(x0, z0, x1, z1, { h, t, openings, skip, roof, skylights, bay })` builds walls with doors and windows, plus an optional roof with skylights.
- Hidden barriers: `hidden: true` walls block but aren't drawn.

Containers can now be stacked (`h` of 5.2 or 7.8 draws two or three tiers) and can lie along either axis. Maps can set their own lamp posts (`lamps`) and colour-band lines (`lines` in `src/mapColors.js`).

Sightlines are tighter than The Monolith's:

|                                             | The Monolith | Pier 9                            |
| ------------------------------------------- | ------------ | --------------------------------- |
| Open-ground point pairs that see each other | 21.8%        | 16.3%                             |
| Clear views over 20 m                       | 10.9%        | 7.0%                              |
| Open ground the flag is visible from        | 16.5%        | 14.0% (nearly all inside the bay) |

A test checks:

- each district reaches the flag
- each cut-through is a short hop
- each bay entrance leads to the flag
- no spot in staging can see the flag
- the waterline holds

### Ramps (building block)

`ramp(x, z, top, { toward, length, width, base })` in `shared/maps.js` is a smooth slope from `base` (default: the ground) up to `top`. `(x, z)` is the middle of its low end, and it climbs `toward` (`"+z"`, `"-z"`, `"+x"` or `"-x"`). For collision it's a row of thin columns, each about 8 cm higher than the last, so you walk up with the normal step-up and no jumping; walking down keeps you on the slope instead of hopping. It's drawn as one sloped piece with painted edge lines. A ramp with a `base` sits on whatever is below, such as a gallery top.

### The Monolith: fewer, larger pieces

The Monolith went from 105 separate structures to 53. The 42 generated crates and 10 hand-placed crates are gone, as are the north lane slabs (the lane T walls cover them) and the four posts on the gallery edges. In their place:

- **Side lanes:** large L walls in the lanes' north halves. Each base reaches from the lane toward the gallery and its arm turns toward the gallery's middle stairs, with gaps at both ends. (The south halves were later reworked; see below.)
- **Defender plaza:** two L walls between the plaza slabs make a broken fence north of the flag with three gaps (both ends and a wide middle), alongside the containers and the Us.

Standing sightlines are tighter than before: 22.0% of open-ground point pairs see each other (was 24.7%), 10.9% of views over 20 m are clear (was 13.0%), and the flag is visible from 19.0% of open ground (was 20.9%). A test checks the structure count, that the flag is reachable from both flanks, both lanes and both sides of the courtyard, and that each plaza gap is open.

### The Monolith: towers, high walls, two different halves

- **No skybridge:** the skybridge, the ramps up to it and its half walls are gone.
- **Framing walls:** the perimeter walls are 14 m tall (were 6 m), with pilasters running their full height.
- **Three towers**, none mirrored, each with steel bands every 4 m:
  - north-east courtyard: 4 × 6 m, 16 m tall, replacing a monolith
  - south-west courtyard: 6 × 6 m, 15 m tall, with a 9 m wing to its east that screens the flag from the courtyard
  - the defender plaza's east corner: 6 × 6 m, 18 m tall, replacing the east overlook
- **North and south differ:** the north half keeps its monolith, slab and lane L walls. The south half has its own pieces:
  - the tower and its wing
  - a T in the east lane
  - a ramp, not stairs, at the west gallery's south end
  - stairs climbing to the east gallery from the east lane
  - one plaza overlook (with its ramp) plus the plaza tower

  Only the spawn screens and the altar's stairs still mirror north to south, and a test enforces that.

- **Sightlines** stay tighter than the original crate layout: 21.8% of open-ground point pairs see each other, 10.9% of views over 20 m are clear, and the flag is visible from 16.5% of open ground. The map has 48 structures.

### Spawn facing

Every spawn sits just behind its spawn screen, so facing straight ahead showed only that wall. Each map now works out a spawn facing on load: the smallest turn from straight ahead that gives a clear 10 m view past the screen (65–125° on the current maps). Players face that way when they spawn and at every round reset, and the client no longer sends its look direction from the buy or results screens, so it can't overwrite the spawn facing. A test checks every map's spawns.

### L, T and U walls (building block)

`shapeWall(type, x, z, { toward, size, arm, t, h, flip })` in `shared/maps.js` builds an `"L"`, `"T"` or `"U"` from flush 3 m slabs, which render as one piece. `(x, z)` is the L's outer corner, or the middle of the T's bar or the U's base; `toward` (`"+z"`, `"-z"`, `"+x"`, `"-x"`) is the way its arms or stem run, and `flip` mirrors an L. The Monolith uses 9: a T and two Ls in attacker staging (nooks facing the attackers), a T in each north lane pointing at the monoliths, an L at two corners of the altar, and a U each side of the flag, open toward the attackers. The generated cover chains now fill in around them. The plaza-overlook bot route's low point moved to (-11.5, -26.5), out of the west U.

### The Lanes: clearance and cover shapes

Lane crates are now slender wall-hugging baffles, and the tall sight screens are 0.24 m thick. Intended gaps have at least 1 m clearance; narrow seams beside walls/platforms are sealed, including the edges of the terrace and catwalk stairs. Six plaza cover pieces are cylindrical tanks with rounded silhouettes and matching circular movement, sight, placement, clamber and projectile collision. Their minimap footprints are round too. Other maps retain their existing geometry. Automated checks audit narrow seams, walk past the east-lane baffle, and verify round-cover corners remain walkable.

### Rendering cost

Map geometry never moves, so after a level is built its plain meshes are merged into one per material (`mergeStatic` in `src/world.js`). Painted face bands and crate battens are queued and merged per color, and colors share one material each. Draw calls per frame on the home flyover fell from about 1,050–1,750 to 140–170 across the four maps. Labels, lights, outlines and the animated flag stay separate.

### One-piece structures

Maps are built from boxes, so a staircase is one box per step and an underpass splits a wall into pieces. `src/structure.js` makes these read as one piece. Touching pieces of a structure share one shade (stairs join their platform). Outlines follow only the real corners of the combined shape, with no lines at the seams where pieces meet flush. Painted bands are skipped on faces pressed against a neighbor.

## Map builder

Choose **Map builder** at the foot of the main menu to make your own map.

- **Editing:** a top-down grid (north up, like the minimap), on a 0.5 m snap. Pick a piece from the library, then **drag** a rectangle to place it. Directional pieces (ramps, stairs, curves) face the way you drag, shown by an arrow on ramps and stairs. **Click** to place the **Infiltrator spawn**, the **Sentinel spawn** and the three **terminals** (the nearest terminal moves to where you click; an older map with only two gets its third where you click). The **eraser** removes the piece you click. Keys: **F** floor, **1** wall, **2 / 3** low / high cover, **4 / 5** platforms, **6 / 7** ramps, **8 / 9** spawns, **0** terminal, **E** eraser, **Ctrl/⌘ Z** undo, **Ctrl/⌘ Shift Z** or **Ctrl Y** redo, **Esc** back to the menu.
- **Piece library:** the same browser appears in the 2D planner (left column) and the gameplay editor (**New Piece**). Search by name, or filter by **Walls**, **Cover**, **Ramps & Stairs**, **Railings & Fences**, **Platforms** or **My Pieces**. Each card shows a rendered picture, the name and its size (footprint and height or rise). Picking a card in 2D sets the tool and its height; in 3D it fills in the New Piece size fields. The pieces:
  - **Walls:** wall, half wall, wall with a doorway (1.4 × 2.6 m, centred), wall with windows (one per 3 m, 1 m sill), curved wall (a quarter curve across its footprint), corner (L) and T-junction walls (they turn with R / Z), and:
    - **Wall with vault window:** a 1.6 m opening with a 0.8 m sill. You can't walk through it; hold jump to vault through.
    - **Wall with crawl vent:** a 0.9 × 0.6 m hole at floor level that only fits you lying prone.
    - **Wall with door:** a hinged door, shut at the start of every round. Face it and press **E** (the prompt says Open / Close door) to swing it open or shut. A shut door blocks movement, sight and shots; it won't shut on someone standing in it. Opening or shutting one is heard like footsteps within 9 m. Bots open doors they walk into, and the map checklist plans routes through doors. In the map editor every door stands open so you can walk the map.
    - **Wall with peek slit:** a 2.4 m slot from 1.35 to 1.75 m. Standing, you see and shoot through it; crouched you're hidden, and nobody fits through.
    - **Archway:** a wide opening between two short piers, under a lintel.
    - **Cross wall (+)**, **alcove wall (U)** (open on the side it faces; turns with R / Z) and **square pillar**.
    - **Chicane wall:** two overlapping halves on opposite edges. You walk through the S-bend, but there's no straight sightline across.
    - **Pillbox:** a roofed 5 × 5 m box with firing slits on three sides and a doorway on the side it faces. Stand on its roof.
    - **One-way glass** (one for each side): the named side sees through it; to the other side it's a dark mirror that blocks sight. Nobody walks, shoots or throws through it.
  - **Cover:** low and high cover, round cover, curved cover, column, colonnade (columns spaced so you fit between them), shipping container (open at both ends, so you walk through it), and **hedge**: you push straight through it, but it blocks sight and shots like smoke that never clears, so it hides whoever's inside. Also: **Jersey barrier** (0.9 m), **battlement cover** (a chest-high wall with taller blocks to duck behind), **sandbag nest** (a low U, open on the side it faces), **barrels** (a cluster of round barrels), **crate stack** (three big steps you clamber up, toward the side it faces) and **storage shelves** (see between the boards, but they block movement and shots).
  - **Ramps & Stairs:** ramps to 1.2, 2.4 and 3.6 m; stairs to 1.2, 2.4 and 4.3 m, and wide stairs (each step at most 0.3 m, so you walk up them); **ladder**: put it against a wall and push forward into it to climb (2.2 m/s), back to climb down. You hang on when you let go, step off onto what's behind at the top, and jump to let go. Walking past one doesn't grab it.
  - **Railings & Fences:** railing (1.05 m), fence and low fence, barred gate. These are **see-through**: players, bots and cameras see through them, but they block movement, shots, throws, wires and captures. Gates don't open.
  - **Platforms:** floor / bridge deck, bridge deck, platforms at 1.2, 2.4 and 3.6 m, round platform, and **catwalk** (a 0.3 m deck with see-through railings down both long sides; set its base elevation for height), **watchtower** (a 3.6 m deck on four legs: walk underneath, add a ladder or ramp to get up) and **stepped dais** (three 0.3 m tiers you walk up).
    Every size is adjustable after picking. Collision follows each piece's real shape: you walk through a doorway, look and shoot through a window, and walk round the inside of a curve.
- **My Pieces:** select one or more pieces and choose **Save selection** (2D) or **Save to My Pieces** (3D properties panel) to save them as a group with their layout, elevations, colors and opacity. Pick a saved group in either library to place copies: it follows the pointer (2D) or your aim (3D); **R** (2D) or **Z** (3D) turns it, and each click places another. Delete a group with the **×** on its card. My Pieces are saved in this browser.
- **Selecting:** with the **Select** tool (**V**, the default) click a piece, spawn or terminal to select it (outlined in yellow; a piece you just drew is selected too). **Shift-click** adds/removes pieces from the selection; drag empty space to box-select fully enclosed pieces. **Del** / **Backspace** removes selected pieces, **arrows / IJKL** nudge the group 0.5 m (**Shift** for 2 m), and **R** rotates the whole group clockwise, preserving its spacing and each ramp’s uphill direction. **Ctrl/⌘ D** or **Duplicate** copies the selected group and selects the copies. Moves stay within the map; undo/redo restore geometry, colors, selection and editing height. A new edit clears the redo branch. Both histories survive a playtest and work in either editing view. Spawns and terminals can be nudged but not deleted.
- **Gameplay map editor:** **Enter Map Editor** opens the actual full-window game renderer with the real player simulation. It starts walking, with normal jumping, crouching, prone, sprinting/sliding and clambering, including low cover. There is no opponent, timer or detection. The equipment slots are **Select / Edit** and **New Piece**. Aim to highlight a whole authored piece and press **E / Xbox X** to select it (Shift+E adds to the selection); selecting doesn't move it. **Move (M)** in the selected-piece panel, or the **M** key, picks the selection up to follow your aim; **Z / Shift+Z** (LB/RB on Xbox) rotates it, **R/F** (D-pad up/down) changes height, the wheel (D-pad left/right) adjusts distance, and M, E or a click puts it down (still selected). Esc/B cancels a move, then deselects. New Piece (**2 / Xbox Y**) opens the piece library with size, placement mode, color and opacity; click/RT places its preview. A ramp preview shows its uphill direction. The selected-piece panel edits size, elevation, color and opacity with one **Apply changes** button (only the fields you changed, as one undo step), plus move, rotate, duplicate, delete and save to My Pieces. Group edits, undo and redo use the same document as the 2D planner.
- **Editor navigation and pause:** WASD / LS moves; IJKL, mouse / RS looks. Space / A jumps or holds to clamber; C / B taps crouch or holds prone. Esc / Menu opens the editor menu: resume, toggle walk/fly, switch to 2D, playtest, save, undo or redo. Walking is default; flying is optional. R/F raises/lowers the flying camera when nothing is selected. LT slows movement/aim; View opens piece options; RS click adds a piece to the selection. Existing player input bindings/settings are loaded for movement and look; editor keyboard R/F and Z are reserved for manipulation. This is a local editing session, not collaborative multiplayer editing. Switching views preserves position and facing; blocked walking positions are moved to a safe surface. Playtests use normal gameplay equipment and return to the shared editor map/history. In-world collision uses the same player simulation as Play Now, not a separate walking implementation.
- **Piece colors and opacity:** choose any color with the color picker and an opacity from 10% to 100%. Enable **Use this color and opacity for new pieces**, or select one/multiple pieces and click **Apply color** or **Apply opacity** (each keeps the other as it is, so mixed colors can share one opacity). **Reset to default** restores type colors and full opacity. Opacity is only how a piece looks: see-through pieces stay solid. Colors and opacity appear in the top-down planner, gameplay editor and playable map; save/share, My Pieces, duplicate/stack and undo preserve them.
- **Slim pieces:** tick **Slim** (2D planner, under the color picker; or the 3D selected-piece panel, then **Apply changes**) to draw a piece 1 cm in from each side and below its top, and 1 cm up from its base when it's off the ground. Faces flush with a neighbor's then stop flickering. Only the drawing changes: placement, the dimensions you typed, and collision stay exactly as they were. In 2D, ticking it with pieces selected changes them (one undo step); with nothing selected it applies to the pieces you draw next. Saved maps, share codes and My Pieces keep it.
- **Elevation:** each piece has a base elevation and a thickness (or rise for ramps), in 0.1 m increments. Choose **Ground**, **On a surface** (top under the first click), or **Custom elevation**. **F** places a 0.3 m **Floor / bridge** deck. Adjust selected pieces with **Apply to selected pieces** or raise/lower the group 0.5 m. **Stack copy ↑** duplicates a selected floor group upward by the chosen floor spacing. Tops may be at most 32 m high; individual thickness/rise is limited to 12 m. Supports are visual design choices, not a structural physics requirement. The perimeter walls are always 10 m above the build limit (currently 42 m), keeping elevated players inside the map.
- **Floors and preview:** set **Editing height** to work on a particular level; other levels are faded (or hidden when the toggle is off), and selection/erasing affects the current level. The planner uses the full canvas height; there is no lower 3D preview. Use **Enter Map Editor** to inspect spaces at player scale. Returning from a playtest restores the editing height and in-world position. Test here uses the closest surface to the editing height, so the same x/z position can test under a bridge or on top of it. Saved maps and share codes include elevation and thickness; older ground-only maps still load.
- **Sizes:** small (26 × 38 m), medium (37 × 53 m) or large (52 × 76 m, like Pier 9); up to 400 pieces.
- **Checks:** a live checklist confirms the spawns and terminals are placed (infiltrators start in the south, at least 10 m south of the sentinels) and that every spawn can walk to every terminal, using the bots' own path planner. Play buttons stay off until everything passes. An older map with only two terminals still plays (either one wins), with a ⚠ suggesting a third.
- **Clearance:** amber overlays and warnings flag gaps narrower than the 0.64 m player footprint, gaps against the boundary, narrow/steep ramps and obstructed upper landings. Touching pieces are allowed. A green/red player-sized cursor shows whether the player fits (including on platforms and ramps). Warnings are advisory; use a playtest to check tricky approaches.
- **Test here:** press **T**, then click a safe spot to enter training there immediately, including elevated surfaces. This does not move the saved team spawns. The server validates the start and permits it only on custom training maps. This test is available even when the route checklist fails, so blocked routes can be investigated. **Esc → Return to editor** restores the selection, tool and undo history.
- **Playing:** **Play now** (training: every gadget, no timer) and **Play now · vs bot** (a solo round) go straight into the map, with no loadout screen and no preparation phase; **Host a match** goes through the loadout as usual so a friend can join. Choose Infiltrator or Sentinel first. While playing a custom map, the pause menu (Esc) and the end-of-round screen have **Return to editor**, which brings you straight back to the builder with your map as you left it. It's a real match on the server with full collision, sight, gadgets and bots (the scripted infiltrator heads straight for a terminal; the sentinel bot patrols both). A friend joining your hosted match gets the map automatically.
- **Saving and sharing:** your current map is kept as you work; **Save** stores it by name in this browser (**Load**, **Delete**, **New**). **Copy code** gives a share code a friend can paste and **Load code**.
- Custom maps carry no hand-placed bot gadget spots, so a scripted opponent doesn't deploy devices on them.
- The format, validation (everything from players or the network is checked and clamped) and map building live in `shared/customMap.js`; the editor in `src/builder.js`; tests in `tests/customMap.test.js`.

## Party minigames: Hot Potato, Breakout, Boulder Dash and Beach Ball Dodge

Short two-player games on the **Game** step of the menu. Breakout has two halves with swapped sides; the other games play simultaneous rounds. Choose Practice, Solo against a bot, or a private match with friends.

- **Against the bot:** In Hot Potato the bot runs for the potato on its half, holds it briefly, and tosses it onto your half.
- **Hot Potato:** A smiling cartoon potato waits on the centre line of The Court. Keep to your blue (south) or red (north) half. After the 3-2-1, walk within 1.25 m to pick it up and press throw to toss it across. Gentle aim assistance and an automatic landing preview help with underhand throws. Bumps drop the potato without stunning anyone. After 20–35 seconds it sneezes colorful confetti with a playful chime; whoever has it in hand or on their half gives the other player a point. A potato on the centre line counts against the nearer player. During the last five seconds it turns pink, wiggles and chimes. First to two rounds wins.
- **Breakout:** a chase down narrow hallways with a scripted Sentinel on your heels. Each game builds a new course from a seed (about 270 m of 2.6 m-wide hallway, straight stretches joined by short jogs east or west, with a chevron on the floor at every turn), and both halves run the same one. Normal WASD movement. After a 3-2-1 at the start line, the Sentinel sets off 12 m behind you at 4.8 m/s, gets 0.03 m/s faster every second up to 5.4 m/s (under your 5.5 m/s sprint, so a clean run pulls away) and follows the middle of the hallway through everything. If it gets within 1.5 m, you're caught. The stretches hold the obstacles, every kind at least once per course:
  - **Beams** (yellow, 1.05 m up): slide under (C while sprinting) or crouch-walk under.
  - **Hurdles** (orange, 0.55 m): jump them.
  - **Wires:** low ones (0.32 m, over red tape) you jump; high ones (1.12 m, over yellow tape) you slide or crouch under. A wire that catches you holds you for 5 s, usually long enough for the Sentinel to catch you.
  - **Falling crates:** 6.5 m before you reach one, its shadow appears on one half of the hallway, and 0.6 s later it drops there. Step to the other half. Sometimes a second one follows on the other half.
  - **Sliding crates:** 5 m out, a crate slides across the hallway from one wall to the other. Go behind it.
  - **Shutters:** steel doors that slam down and lift on their own cycle (up 1.7 s, slam 0.25 s, shut 1 s, lift 0.25 s). Time them; you can slide under one that's still coming down.
  - Running into a beam or hurdle at a sprint, or getting hit by a crate or a slamming shutter, costs a **stumble**: 1.5 s at no more than 3 m/s.
  - **HUD:** the chase bar at the top shows the gap (the Sentinel's red marker closing in on yours, the gap in metres, red under 5 m) and your progress to the exit. Its footsteps come from behind you, louder as it closes in; under 4 m the screen edge goes red and you hear your heartbeat. Turn round and you'll see it coming.
  - **Watching:** the other player waits in a sealed booth and watches the run through the runner's eyes, with the same HUD. Then you swap.
  - **Scoring:** any escape beats any catch. Escapes rank by time, catches (or running out of the 120 s) by distance reached.
  - **Bot:** it sprints down the middle of the hallway and reads each obstacle as it comes: it jumps hurdles and low wires, slides under beams and high wires, steps to the safe half for crates and waits out a shut shutter. It rolls once per obstacle to fumble it (Easy 35%, Normal 20%, Hard 8%), and then reacts late or not at all. In testing (40 runs each), Hard escapes about four runs in five, Normal about half, Easy about one in four.
- **Boulder Dash:** no sides to swap: you both climb the same channel at once, and one race decides it. Each race builds a new channel from a seed: about 128 m of 4 m-wide channel rising 1 m in every 4 (about 14°), from a flat start pad to a landing at the top. Going up the slope nobody is faster than 4 m/s (a sprint on the flat is 5.5). Twelve recesses, lit amber with a yellow stripe along the mouth, are cut 1.4 m into the walls, alternating sides, the gaps between them widening from about 8 m to 12 m. Each fits both of you, and you pass through each other.
  - **Boulders** come out of the portal at the top at 8 m/s and roll down, gaining 0.6 m/s every second up to 12 m/s; at the foot of the slope they break up, so the start pad is safe. A **grey** one (3.4 m across) fills the channel: the only safe place is a recess. An **orange** one (1.8 m) rolls down one side: step to the other. The first comes 2 s after the go, then mostly one every 4.2–6.2 s, sometimes a pair 1.3 s apart, sometimes a lull of 7.5–9.5 s. Over the first 75 s the gaps shrink by up to 15% and the orange share grows from a quarter to nearly half.
  - **Flattened:** a hit puts you back in the last recess you reached (the start pad if none), held for 1.5 s.
  - **Scoring:** the first to the top wins at once. If nobody makes it in 90 s, the higher climb wins, then fewer hits.
  - **HUD:** the climb bar down the right shows you and them against the top, with your height and hits. A warning shows the next boulder coming at you: which lane (left side, right side or full width, as you face up the channel), how many seconds away, red under 2.5 s and green when you're in a recess (or on the pad). You hear each release as a grinding rumble from the top, and the nearest one louder as it comes.
  - **Bot:** it climbs recess to recess. Coming up to each one it looks at the boulders already out: if one would meet it before the next recess, it ducks in and waits; otherwise it carries straight on. Each time it decides to wait it rolls once to go anyway (Easy 30%, Normal 15%, Hard 5%), and once the way is clear it hesitates (1.8/0.8/0.2 s). In the open it sidesteps an orange boulder in its lane. In testing (30 races each), Hard tops out about 29 in 30 at about 1:02, Normal about 22 in 30 at about 1:12, Easy about 20 in 30 at about 1:15.
- **Beach Ball Dodge — Pool Party:** stay on a 5 m inflatable float in the middle of a 13 m backyard pool while bots on the pool deck throw beach balls straight across it, up and down the screen or side to side (no arcs). The dedicated map uses the ID `crucible`; the party kind is still `livewire` in code.
  - **Play:** WASD / left stick moves relative to the screen. When a bot lifts a ball over its head, the ball's path lights up pink across the float for 1.1 s before the throw: step out of it. Jumping doesn't help. Most throws aim at where a player is standing when the bot lifts the ball. A hit shoves you along the ball's direction (further for faster balls), stuns you briefly and grants 1.2 s of grace.
  - **Waves:** every 15 s. Wave 1 throws up and down only; then side to side too, doubles (two bots on one side, at least 2 m apart), crosses (one each way) and triples, with faster balls each wave. At most three balls cross the float at once, and lanes are always settled so there's somewhere on the float to stand.
  - **Winning:** first into the pool splashes out. Splash together and fewer bumps wins. Equal bumps draws.
  - **Bot:** it notices each ball after a reaction delay (and on each ball rolls to miss it, more often in later waves), then walks to the nearest spot out of every lane it has seen coming, drifting back to the middle when it's clear.
  - **Practice:** play with one runner. Against AI and With Friends use the same rules with two runners. Play Again resets the float and throw schedule.
- **Quick start:** `?type=solo&objective=hotpotato`, `?type=solo&objective=breakout`, `?type=solo&objective=boulders` or `?type=solo&objective=livewire`, with `team=sen` to watch first (in Hot Potato, to take the red half; in Boulder Dash, to climb on the right as red).

The numbers are in `PARTY` in `shared/party.js`; the server side is `server/party.js` (Hot Potato's rules in `server/hotPotato.js`, Breakout's in `server/breakout.js`, its course generator in `shared/breakout.js`, Boulder Dash's in `server/boulders.js` and `shared/boulders.js`, Beach Ball Dodge's in `server/livewire.js` and `shared/livewire.js`, its arena as `MAPS.crucible` in `shared/maps.js`), tested in `tests/party.test.js`, `tests/breakout.test.js`, `tests/boulders.test.js` and `tests/livewire.test.js`.

## Future ideas

**The Lanes cover detail pass:** 31 additional pieces include timber crates and tall stacks, thin half walls, low loading ledges, and cover on the center ridge and east catwalk. Scatter uses a fixed seed so the server and every client share the same layout. Openings keep their clearance; all bot routes remain connected. Map signs use separate front-facing text on each side so lettering stays readable from either direction.

### Party minigames

The long-term idea is a party game: a match is a handful of short minigames (2–3 minutes each), with the remaining modes forming the lineup. Each minigame would report 1st/2nd/3rd place rather than just a win, so points add up across the match. One-sided modes swap sides within the minigame so everyone plays both roles. Ordered by how much existing code they reuse:

- **Hot Potato**, **Breakout**, **Boulder Dash** and **Beach Ball Dodge** are built: see [Party minigames](#party-minigames-hot-potato-breakout-boulder-dash-and-beach-ball-dodge).
- **Blend In:** the map is full of the Splash robots walking around. One player is disguised as one of them and must visit 3 terminals; the other has 3 balloons to find the real one, and a balloon that hits a robot costs the seeker. Needs a robot skin for the player. Reuses the robots, bot routes and Splash.
- **Tag:** one player is "It"; under Seen, 3 s of sight passes "It" on. Whoever is "It" when time runs out loses. Works 1v1 or free-for-all; could glow whoever is "It" every 10 s. Reuses Seen detection and the through-wall glow.
- **Courier:** whoever holds a package appears on everyone's minimap every 8 s. Deliver it to a drop point to score; a splash knocks it loose. Best with 3–4 players. Reuses tripwire-style minimap markers and Splash.

## Slipstream

Choose **Slipstream** under **Game** to open the auto-sprinting conveyor racer. Its own mode picker offers a race against three AI rivals, a solo time trial with a locally saved best time, and two-player local split-screen. All modes use the same 420 m course.

Strafe freely with A/D and look around with I/J/K/L. Blue slip 'n slides, edged with striped inflatable bumpers, grant speed and chain up to five boosts; brown mudpiles slow you and clear the chain, and are never placed on a slide. Press **Space** (controller **A**) to dive belly first: a short hop, then a belly slide. Land on a slip 'n slide for a small speed kick; land in mud and it slows you as usual; land on grass and it's a belly flop that stops you dead, face down, for about a second while you get back up (no steering or diving until you're running again). Mud can't touch you during the hop, and you can't start a dive from inside mud. Rivals dive just before a slide's start. In local play, player one uses A/D, Space and I/J/K/L; player two uses left/right arrows, up arrow to dive, and numpad 8/4/5/6 to look. Escape pauses/resumes; leaving the window pauses automatically. Race Again restarts the course; Change Mode returns to the race picker; Back to MINI GAMES returns to the main menu.

### Shared backpacks

Every game now uses the same four backpack gadgets for both sides: **Smoke Puff**, **Glitter Popper**, **Peek-a-Boo Ball**, and **Door Stopper**. Other gadget definitions remain only for legacy simulation and map compatibility; they cannot be packed, bought, or selected for bots. Party kits use this same set, while races and Hot Potato retain their own rules and automatic game items. Backpack screens say **Pack your bag**.

## Firefly Recall

Open **Game Mode → Firefly Recall** for a standalone solo memory challenge. Watch a pattern light up on four fireflies set in a diamond around a small backyard campfire, beside a tent. Each is colored like the Xbox face button in its spot: **yellow** at the top (↑ / Y), **blue** on the left (← / X), **red** on the right (→ / B) and **green** at the bottom (↓ / A). Repeat the pattern by clicking or tapping a firefly, pressing its arrow key (W A S D and 1–4 also work) or its controller button; the D-pad works too. Each gently circles its own fixed spot; fireflies never trade places. Instructions appear once before play, then the backyard fills the play area with the round number along the top. Every cleared round adds one step to the same route, with no last round: play continues until your first mistake, which ends the run. Input is disabled during playback, and recall has no time limit.

The free practice round teaches the controls without affecting your best. **Pause / Resume** replays the current route; switching away from the browser automatically pauses. Best completed-round scores are saved locally when browser storage is available. **Escape** or **Back to games** closes the mode. This mode plays solo regardless of the home screen's opponent setting.

Difficulty for Slipstream adjusts rival pace and steering anticipation. Firefly Recall has endless rounds, four fireflies and a one-mistake ending at every level; difficulty sets playback speed: slower on Easy, standard on Medium, faster on Hard. Firefly best scores are stored separately for each difficulty.

### Sprinkler Dodge

Choose **Sprinkler Dodge** for a third-person survival round in a 40 m backyard, with no gadgets. Random sprinkler heads rise inside yellow warning circles, spray a 3.2 m radius for 2.8 seconds, then retract. Every 15 seconds adds another simultaneous sprinkler (up to 18). Any spray eliminates a player; the last dry player wins. Simultaneous eliminations tie, and players still dry at the three-minute limit share a draw. Supports friends, AI, and solo practice. Quick start: `?type=solo&objective=sprinklers`.

### Toy Box Rescue

Open **Game → Toy Box Rescue** for a solo carnival claw game. Move the claw on two axes using **arrow keys / WASD**, the on-screen directional buttons, or tap and drag inside the box. Align the ground ring over the requested toy and press **Space** or **Drop Claw**. The claw lowers, grabs, and lifts; the next mission appears after a successful rescue. Wrong toys return to the box, and misses let you try again without a time limit. Rescue all six toys to finish, with total drops shown as your score. Difficulty adjusts grab precision. **Start over** reshuffles the box; **Escape** returns to the game picker.

### Roof Catch

Open **Game → Roof Catch** to catch fruit rolling off a tin roof. Your chosen character stands under the eaves with a basket, and things roll down the roof in five lanes and drop off the edge.

- **Playing:** move the basket left and right with A / D or ← / →, or drag on the screen (the basket follows your finger). A controller's stick or D-pad steers.
- **Scoring:** an apple is +10 and a golden pear +30. Every fifth catch in a row adds a +25 streak bonus. A **pebble** (you hear it rattle as it starts rolling) breaks your streak, and **mud** spills the last three fruit out of your basket, taking their points with them.
- **Ending:** the round ends when three fruit hit the ground. Things roll faster and come more often over the first 32 drops, then stay at full speed. The results show your score and the fruit in your basket.
- It plays the same at every difficulty, and no best score is saved.

The game is in `src/roofCatch.js` and the 3D roof in `src/roofCatchScene.js`. Unlike the newer games, its rules aren't in `shared/` and it has no tests.

### Loop & Glide

Open **Game → Loop & Glide** to launch a toy car down a stunt track, through the loop and off the end, then glide it onto a target on a picnic table. Your chosen critter drives.

- **Playing:** the car rides the track by itself. Once it leaves the track you steer the glide: A / D steer left and right, W dives (nose down for more speed and range), S flares (to land shorter), and Space lets go of the glider so the car drops straight down. A controller's stick steers, dives and flares, and A drops.
- **Targets:** three on the table: a paper plate (+100), the picnic basket (+300) and a blueberry pie (+600, small and furthest away). Landing anywhere else on the table, or off it, scores nothing and counts as a miss. After every launch the targets swap places and move from side to side.
- **Ending:** three misses end the game. The results show your launches, targets landed and misses.
- It plays the same at every difficulty, and no best score is saved.

The game is in `src/backyardAirMail.js` (its old name), the flight and targets in `src/backyardAirMailFlight.js`, and the 3D track and yard in `src/backyardAirMailScene.js`. It has no tests. Backyard Fling reuses its track.

### Pond Fishing

Open **Game → Pond Fishing** for a solo fishing round from the end of a dock. Aim at the water (move the mouse, tap, or use the arrow keys / WASD), then cast with a click, tap, **Space**, **Enter** or the **Cast** button. Fish shadows swim around the pond and one heads for your bobber. A few small nibbles are fake-outs. When the bobber dunks under and the red **!** pops up, reel in (same controls, or the **Reel in!** button) before the window closes.

- **Window:** Easy 1.5 s with 0–1 fake nibbles, Medium 1.05 s with 1–2, Hard 0.7 s with 1–3. Reeling before the bite doesn't use up the cast: the fish backs off for about a second. Missing the window does use it ("It got away!").
- **Catches:** little fish +10, big fish +25, golden fish +50, old boot +2, and trash (soda can, soggy sock, paper cup) +5 each for cleaning up the pond. Longer casts shift the odds from little fish toward big and golden fish (big fish 12% → 38%, golden 1% → 6%), and junk is about 40% at any distance.
- **Round:** ten casts. The results show score, fish caught, junk cleaned up, and your best score, which is saved locally for each difficulty.

The rules are in `shared/pondFishing.js` (tested in `tests/pondFishing.test.js`), the game in `src/pondFishing.js`, and the 3D pond in `src/pondFishingScene.js`.

### Target Blaster

Open **Game → Target Blaster** for a solo shooting gallery with a water blaster. You stand on the patio and aim at a table of cans and bottles, a shelf further back, and red-and-white bullseyes that slide back and forth on rails. Aim with the mouse, a tap, or the arrow keys / WASD, and fire with a click, tap, **Space** or **Enter**. The water takes a moment to arrive, so lead the sliding bullseyes.

- **Pressure:** every shot fires the same burst and uses 10% of the meter (ten shots from full). Pump with **R**, **E**, **Shift**, right-click, the **Pump** button, or **X / LT** on a controller. Hold to keep pumping (one stroke every 0.22 s). With less than 10% left the blaster only dribbles, so pump before firing again. The meter refills at the start of every wave.
- **Waves:** three, each ending when its timer runs out. Wave 1 is cans and bottles, wave 2 adds two sliding bullseyes, and wave 3 is the far shelf plus three faster bullseyes. Knocked-down targets come back after 1.8 s.
- **Scoring:** can +10, bottle +15, bullseye +20 / +30 / +50 from the outer ring to the middle. The results show score, targets hit, accuracy, and your best score, saved locally for each difficulty.
- **Difficulty:** Easy has 35 s waves, 25% per pump, bigger targets and slower sliders. Medium has 30 s and 20%. Hard has 25 s, 15%, smaller targets and faster sliders.

The rules are in `shared/targetBlaster.js` (tested in `tests/targetBlaster.test.js`), the game in `src/targetBlaster.js`, and the 3D yard in `src/targetBlasterScene.js`.

### River Crossing

Open **Game → River Crossing** for a solo Frogger-style hop across a river. Your character starts on the near bank and has to reach the flag on the far bank. Hop with the arrow keys / WASD (**Space** also hops forward), by tapping or clicking where you want to go, with the on-screen arrow buttons, or with the left stick / D-pad on a controller.

- **Branches** drift across the river, and neighbouring rows drift opposite ways. Hop on and you ride along with the branch. Hop off before it carries you out of the river.
- **Rocks** never move. They're safe spots to wait on, and they're your checkpoints.
- **Landing ring:** a ring shows where a forward hop would land. It turns green when the hop would land safely right now.
- **Falling in** costs a heart and starts you again from the last rock or bank you stood on. The round ends when you run out of hearts.
- **Crossings:** three. _Lazy river_ has five rows, _Rocky rapids_ has eight, and _Rushing waters_ has ten faster rows with shorter branches.
- **Scoring:** +10 for each new row you reach, +100 for each crossing, a speed bonus for quick crossings, and +25 for each heart left after the last crossing. The results show score, crossings, splashes, and your best score, saved locally for each difficulty.
- **Difficulty:** Easy has 5 hearts, slower water and longer branches. Medium has 4 hearts. Hard has 3 hearts, faster water and shorter branches.

The rules are in `shared/riverCrossing.js` (tested in `tests/riverCrossing.test.js`), the game in `src/riverCrossing.js`, and the 3D river in `src/riverCrossingScene.js`.

### Racetrack Builder

Open **Game → Racetrack Builder** to build a single-lane, closed-loop track for a toy car and test it in a physics simulation.

- **Building:** click a square on the board to pick the starting spot (**Rotate start** / **R** turns it; **Start in the middle** works from the keyboard or a controller). Then add one piece at a time from the open end, marked by an arrow. A see-through preview shows the piece you're pointing at: green fits, red doesn't. **Undo** (Backspace) removes the last piece.
- **Pieces:** straight, left and right curves, climbs and descents, uphill and downhill curves (each changes one level), vertical loops (two levels tall), and boosters. Shortcut keys 1–9, 0 (loop) and B (booster). Track can't leave the board, dig into the floor, or run into other track, but it can pass over track two levels below.
- **Closing:** come back round into the start square, heading the same way, on the floor. The badge then reads _Circuit closed ✓_.
- **Testing:** **Test track** (T) frames the whole course. Pick a push strength (2–12 m/s), press **Push!** (Space), and watch. The car stalls and rolls back on climbs it can't get up, falls out of a loop if it's too slow at the top (about 7.4 m/s going in), and flies off a curve above about 9.5 m/s. Boosters push the car up to 8.6 m/s, so a booster can keep a circuit going forever. Friction slowly takes speed off everywhere else. The run keeps going after a stall or crash until you press **Reset car** or **Back to builder**. **Follow car** swaps the overview for a chase camera. Open tracks can be tested too; the car runs off the end.
- **Camera:** drag to look around, scroll or pinch to zoom.
- **Saving:** the track you're working on is kept automatically. **Saved tracks** names and saves tracks for later, loads or deletes them, and has three example tracks.

The rules and physics are in `shared/racetrack.js` (tested in `tests/racetrack.test.js`), the game in `src/racetrack.js`, and the 3D board in `src/racetrackScene.js`.

### Backyard Apple Catch

Open **Game → Backyard Apple Catch** to catch falling apples in a basket. Four players stand side by side in the yard, each under their own apple tree, and the same things fall in every lane at the same time.

- **Playing:** you don't walk. Your basket is in the middle; hold left to move it to the left spot and right for the right spot, and let go to bring it back. Use A / D or the arrow keys, the controller stick, or press and hold the left or right side of the screen. A branch shakes just before something lets go.
- **Scoring:** each apple is +1. A pinecone costs 5 apples (never below zero) and spills them out of the basket. Two or three things often fall at once, so pick the spot with an apple and keep away from the pinecones; when two apples fall together you can only catch one. 100 apples fall over the round, faster and busier as it goes. The highest total wins.
- **Players:** **Play** puts you against three computer neighbours (different critters). **2 players** is player 1 on the far left (A / D, or the left half of a touch screen) and player 2 on the far right (← / →, or the right half) with two neighbours in between.
- **Difficulty:** Easy has fewer pinecones, slower falls, fewer things at once and neighbours who pick the right spot about 60% of the time. Medium is about 78%. Hard has the most pinecones, the fastest falls and neighbours who are right about 90% of the time. Your best total against the computer is saved per difficulty.

The rules and the neighbours' choices are in `shared/appleCatch.js` (tested in `tests/appleCatch.test.js`), the game in `src/appleCatch.js`, and the 3D yard in `src/appleCatchScene.js`.

### Pool Noodle Chop

Open **Game → Pool Noodle Chop** for a backyard timing contest. Four players stand at chopping stations side by side, each with a foam sword. A rack over each station holds a pool noodle with a dark stripe around it, and all the racks let go together after a short, random wait (they rattle just before).

- **Playing:** press Space (or A, or tap the screen) to swing. The blade sweeps flat at the height of the coloured tab on the rack's post, and the coloured sweep on the grass shows its path. You get one swing per noodle; pressing before the rack lets go does nothing.
- **Scoring:** cutting through the stripe is a perfect 20. Below the stripe (a touch early) scores 19, one less for every 5 cm further down, never below 1. Above the stripe (late) is −5, and missing the noodle altogether (too early, too late or no swing) is −10. Highest total after five rounds wins.
- **Players:** **Play** puts you against three computer neighbours. **2 players** is player 1 on the far left (A / Space, or the left half of a touch screen) and player 2 on the far right (L / Enter, or the right half).
- **Difficulty:** sets how fast the noodles fall, how wide the stripe is, and how close the neighbours' swings land. Your best total against the computer is saved per difficulty.

The rules, timing and the neighbours' swings are in `shared/poolNoodle.js` (tested in `tests/poolNoodle.test.js`), the game in `src/poolNoodle.js`, and the 3D yard in `src/poolNoodleScene.js`.

### Backyard Flier

Open **Game → Backyard Flier** to fly a toy helicopter through an endlessly scrolling backyard, seen side-on, with the critter you picked in the cockpit.

- **Playing:** the helicopter hovers until your first tap. After that it sinks on its own, and every tap (Space, ↑, W, a click or a tap on the screen; A on a controller) gives it a little lift. Slip through the gaps between the tree branches hanging from the canopy and the shrubs growing from the grass. Bumping the canopy just stops your climb; touching a branch, a shrub or the grass ends the flight.
- **Scoring:** each gap you fly through scores one. Your best flight is saved per difficulty.
- **Difficulty:** Easy has the widest gaps, the slowest scroll and gentle changes in height from one gap to the next. Hard has narrow gaps, a faster scroll and bigger jumps. Every gap can always be reached from the one before.

The flight, the course and the crashes are in `shared/backyardFlier.js` (tested in `tests/backyardFlier.test.js`), the game in `src/backyardFlier.js`, and the 3D yard in `src/backyardFlierScene.js`.

### Pipe Crane

Open **Game → Pipe Crane** to lay water pipe on a building site. The trenches are already dug. Pipe A (the water main, with a red valve) comes in from the left, and outlet pipe B pokes in from another edge. A crawler crane at the back, with your critter in the cab, swings its boom to wherever the hook goes.

- **Laying pipe:** tap a stack in the pipe yard (straights, corners and T's, plus crosses on Hard) to put one on the hook, turn it with the big ⟳ button (R / E, Q the other way, the mouse wheel or a right-click), then tap a trench to lower it in. Tap a laid pipe to turn it, or drag it to another trench (or back to the yard). Pipes only go in trenches; some trenches are dead ends. Keyboard and controller: the arrows / WASD / stick move the hook over the site and the yard, and Space / A grabs, lowers and lifts.
- **The water:** a countdown runs at the top. When it ends (or when you press **Water on!** or G), the valve opens and water flows out of pipe A, filling one pipe at a time and leaving through every open end. You can keep laying pipe ahead of it, but full pipes can't be moved. Once everything joins up the water hurries along.
- **Winning and losing:** fill every outlet and the job's done; the next site comes on a little sooner and flows a little faster. From a few sites in, there are two outlets (B and C), so you'll need a T. If water reaches an open end, an empty trench or a pipe that doesn't line up, it spills and the game ends. You score one per site finished, and your best is saved per difficulty.
- **Difficulty:** sets the site size, the countdown, how fast water flows, how many dead-end trenches there are, when two-outlet sites start, and whether crosses are in the yard.

The sites, pipe pieces and water are in `shared/pipeCrane.js` (tested in `tests/pipeCrane.test.js`), the game in `src/pipeCrane.js`, and the 3D site and crane in `src/pipeCraneScene.js`.

### Food Finder

Open **Game → Food Finder** for a seek-and-find picnic. Foods from Kenney's [Food Kit](https://kenney.nl/assets/food-kit) (75 of them, CC0, in `src/assets/food/`) are scattered at random over a gingham blanket: they may touch, but never overlap by more than a fifth of their size. The card at the top shows the one to find.

- **Playing:** tap the food that matches the card. Each prompt is spoken aloud ("Can you find the pear?"), and tapping the card says it again. Tapping a different food names it ("That's the banana. Can you find the pear?") with a soft sound, never a buzz. After three wrong taps, or a long wait, the right food hops on a yellow ring. A found food spins away in confetti and a new one drops into its spot. Arrow keys / WASD (or a controller's stick) move a blue ring between foods, and Space (A) picks one.
- **Difficulty:** Easy spreads 24 foods and asks for 8, Normal 50 and 10, Hard 60 and 12. Your fastest time is saved per difficulty.

The food list, layout and picking are in `shared/foodFinder.js` (tested in `tests/foodFinder.test.js`), the game in `src/foodFinder.js`, and the 3D blanket in `src/foodFinderScene.js`.

The voice is recorded, not the browser's: every line is built from clips in `src/assets/food/voice.mp3` (an MP3 sprite, with `voice.json` mapping each clip to its start and length), made with the Kokoro neural voice `af_heart`. The phrases come from `voicePhrases()` in `shared/foodFinder.js`; after changing the foods or lines, re-record with `~/.cache/kokoro/venv/bin/python tools/make_food_voice.py` (about 4 minutes). Until the clips load, or if they can't, the browser's speech reads the same words.

### Perch Hop

Open **Game → Perch Hop** for a side-on platform race around the backyard, with the critter you picked. Ten perches (a picnic table, a window box, a birdhouse, a swing, a lily pad, a branch…) each carry a little white flag. Land on all ten as fast as you can.

- **Moving:** run with A / D or ← / →, jump with Space, W or ↑, and jump again in the air for a double jump (with a flip). Hold jump longer to go higher; let go early for a short hop. Jump up through ledges from below, and press S or ↓ while standing on one to drop through; holding ↓ in the air falls faster. Trampolines throw you high and give you your double jump back. Some perches slide or bob, and carry you with them. On a touch screen, ◀ ▼ ▶ buttons sit bottom left (slide a finger between them) and a big Jump button bottom right; the yard is drawn above them. A controller's stick runs (pushing up jumps too) and A jumps.
- **Perches:** landing on a perch raises its flag in your colour; the row of flags under the clock shows how many are left. The clock starts at "GO!" and stops on the tenth perch.
- **The pond:** fall in and it's a splash. On Easy you're put back on the deck and the clock keeps running; on Medium and Hard the run is over.
- **Stages:** each difficulty has its own yard. Easy is **The Patio** (big perches, one slow lily pad, a trampoline on the lawn). Medium is **The Garden** (a shed in the middle of the pond, sliding and bobbing perches). Hard is **The Big Oak** (small perches, more movement, the trampoline out in the water). Your best time is saved per difficulty.

The movement, stages and perches are in `shared/perchHop.js` (tested in `tests/perchHop.test.js`, which also tries a spread of real jumps from every place you can stand to check that each perch can be reached), the game in `src/perchHop.js`, and the 3D yard in `src/perchHopScene.js`.

### Acorn Drop

Open **Game → Acorn Drop** for a pegboard game on a garden fence, made for young kids. Your critter starts on a little ledge beside the fence, next to a basket of acorns. Walk it out along the top rail and drop the acorn: it bounces down through rows of white pegs into one of nine clay flower pots along the bottom.

- **Playing:** hold A / D or ← / → to walk, and press Space or Enter to let go. You can only drop over the fence, not from the ledge. After each drop your critter walks back to the ledge on its own and waits there for the next acorn, so you walk it out again every time. Clicking or tapping the fence walks the critter to that spot. On a touch screen, ◀ Drop ▶ buttons sit along the bottom. A controller's stick walks and A drops. Where you drop nudges the odds, but the pegs decide.
- **Flowers:** each pot has a big number from one to five painted on it, with that many dots underneath for counting. The acorn grows that many flowers in the pot it lands in; the middle pot grows five, and the two outside pots are worth two. Every pot grows something, so there's no losing drop. Five acorns make a round, and the results show how many flowers your garden grew. Your biggest garden is saved per difficulty.
- **Difficulty:** Easy has 7 rows of pegs, Normal 9 and Hard 11, with livelier bounces (and a slightly quicker walk) on Hard.

The board, physics and pot values are in `shared/acornDrop.js` (tested in `tests/acornDrop.test.js`, which drops acorns all along the rail on every level to check each one lands, every pot can be reached and none hogs the acorns), the game in `src/acornDrop.js`, and the 3D fence in `src/acornDropScene.js`.

### Backyard Fling

Open **Game → Backyard Fling** to drive your chosen critter's toy car down the same stunt track as Loop & Glide: a big drop, then the loop. After the loop the track opens out into a wide ramp, and for the few seconds it takes to roll up it you're in control. Off the end the car flies and lands rolling on a big picnic table, where each yard has two or three structures built from wooden toy blocks (towers, pyramids, gates, a brick wall). Knock every structure down to clear the yard; a structure counts as down once at least half its blocks are tipped, dropped or pushed away, and the score is the blocks knocked down.

- **Playing:** the car rides the track and loop by itself. On the ramp, steer left and right with A / D or ← / →, and go a little faster or slower with W / S or ↑ / ↓ (faster flies further). You can also hold a finger or the mouse on the left or right of the screen, and touch screens get big ◀ ▶ buttons. A controller's stick steers. On Easy and Normal a glowing ring on the table or lawn shows where the car will land. Each car sets off by itself once everything from the last one has stopped moving (or the car has rolled past every structure).
- **Yards:** Block towers (a tower and a pyramid), Block castle (two towers and a two-floor gate) and Block town (a gate, a brick wall and a pyramid), three yards a round, all on the same picnic table. A block counts as down when it tips over, drops, or gets pushed well away; a structure falls when half its blocks are down. Topple every structure and the next yard comes early; run out of cars and the next yard comes anyway, so there's no losing. The results show how many blocks you knocked down; your best is saved per difficulty.
- **Difficulty:** Easy gives 5 cars a yard, Normal 4 and Hard 3. Hard has no landing ring.

The physics is [cannon-es](https://github.com/pmndrs/cannon-es). The track and ramp are scripted; from the lip on, the car is a rolling ball (so it lands and coasts rather than digging a corner in), the picnic table top and benches are fixed slabs, and the blocks are boxes. The track, ramp, yards and physics are in `shared/backyardFling.js`, tested in `tests/backyardFling.test.js`. The tests check the steering time and rails, that faster flies further, and that the landing ring matches where the car lands. They also check that every block sits on the table, that a straight shot lands on it, that the structures stand still on their own, and they drive a spread of runs at every yard to check most knock blocks down, every structure can be toppled, and runs settle soon. The game is in `src/backyardFling.js`, and the 3D track, ramp and yard are in `src/backyardFlingScene.js`.

### Skee Ball

Open **Game → Skee Ball** for an arcade skee ball lane between two others. Your chosen critter stands on a little step stool at the near end of the machine, holding the ball, and rolls each one underhand: its arm swings back as the power meter fills, then swings through with a lean and a step, and the ball leaves its paw onto the lane. It hops and cheers for a 50 or a 100. Roll the ball up the lane and over the hump into the target board's rings: the middle ring is 50, the rings around it 40, 30, 20 and 10, and the two hooded pockets in the top corners are 100. Outside the rings the ball drops down the gutter for 0. Nine balls a game; the scoreboard over the lane counts up, and the results show your score, tickets (one per 10 points), how many 100s you sank and your best.

- **Playing:** aim with A / D or ← / →: a dotted pink line shows the path the ball will take over the first 70% of the lane (bouncing off the rails); judging the rest of the roll and the flight to the rings is up to you. The aim goes back to straight for every ball, then hold Space or Enter: the power meter on the right swings up and down, with a pointer showing the power (as a percent) you'd roll with if you let go now, and letting go rolls the ball with that power. After the roll the pointer stays on the power you used (in yellow), and a dashed line on the meter marks your last roll so you can go a little harder or softer next time; it shows swipe rolls the same way. On a touch screen (or with the mouse) you can swipe up the lane instead; a faster swipe rolls harder and a slanted swipe aims. Touch screens also get ◀ ▶ aim buttons and a **Hold to roll** button. A controller's stick aims and holding A rolls. The camera follows the ball up to the target and watches it drop. A roll too soft to clear the hump rolls back to you and doesn't use up the ball.
- **Difficulty:** the power meter swings slower on Easy and faster on Hard. On Easy a green ring on the board shows where the ball will land while you hold the roll.

The ball's path up the lane and over the hump is scripted along the lane (slowed by the slope and a little rolling drag, bouncing off the rails); off the hump it flies freely and can bank off the back wall, then rolls into the hole of the ring it lands in. A banked ball can't drop into the hooded 100s. The physics is in `shared/skeeBall.js`, tested in `tests/skeeBall.test.js`: soft rolls come back, more power lands further, the 50 is reachable mid-meter, both 100s can be hit, the landing guide and aim line match the real ball, and rings score correctly. The game is in `src/skeeBall.js`, and the 3D arcade is in `src/skeeBallScene.js`.

### Perfect Pizza

Open **Game → Perfect Pizza** for a little pizza kitchen, made for young kids. A customer critter walks up holding a picture of the pizza they'd like, and your critter, in a chef's hat, makes it. The dough, a pot of marinara and the oven sit on a counter along the back wall; the pizza pan, the cheese and four topping bowls are on an island in front. You walk the aisle between them. Every prompt is spoken, and tapping the order card at the top left says the order and the next step again.

- **Making a pizza:** every pizza is made the same way. Pick up the dough and put it on the pan, scoop the sauce and put it on the pizza, pick up the cheese and put it on the dough (each is two actions: nothing moves to the pan until you carry it there), add the toppings in the picture, pick up the pizza and put it in the oven (two actions again), and when the ring is full, take it out and put it back on the pan for the customer (two actions). Only the toppings change from order to order.
- **Orders:** each round is three pizzas. The first has one kind of topping (one to five of it); the others have one kind, or two kinds with one to three of each, and no two pizzas in a round have the same toppings. The toppings are pepperoni, mushrooms, olives, green peppers and pineapple; four bowls are on the counter, so there's always one you don't need.
- **Playing:** walk with WASD or the arrow keys (a controller's stick), and press **E** (or Space / Enter, a controller's A) to use whatever you're standing next to. That one button does everything: pick up the dough, sauce, cheese or pizza, put it down, add the toppings, open the oven and take the pizza out. Whatever is in reach gets a blue ring and a bobbing **E** above it, and your chef turns to face it. Whatever the chef picks up (the ball of dough, the big spoon full of sauce, a handful of cheese, the pizza) stays in its hands until you walk it over and put it down: on the pan, the pizza in the oven, and the baked pizza back on the pan. Pressing E with nothing in reach shows where to go and says the step. On a touch screen, ◀ ▲ ▼ ▶ buttons sit bottom left and a big ✋ use button bottom right, and tapping anything (or the floor) walks the chef over to it; a tap never uses anything. Using the wrong thing is never a mistake: you hear what to do ("Hmm, not that one. Put the cheese on the dough!"), and the right thing wiggles and hops on a yellow ring. After 10 seconds with nothing done, the hint comes on its own.
- **Baking:** there's no time limit, except for the pizza in the oven. A ring over the oven fills green while it bakes (5 s), dings when it's full, and slowly turns orange (8 s). It then flashes red ("Quick, take it out before it burns!", 4 s) before it burns. Use the oven to take it out (the oven door swings open): the chef holds it, safe from burning, until you put it on the pan. A burnt pizza goes in the bin with "Oops, it burnt!", and you make a new one from the dough. Nothing is counted against you.
- **Counting:** each topping you add is counted out loud ("One! Two! Three! Just like the picture!"). With two kinds, you're told which to add first, then the next. Extra taps on a finished topping hear "That's enough!", and when the pizza is out of the oven, it's "A perfect pizza!".
- **Results:** a plate at the top right fills with each pizza served; the results show the three pizzas and how many toppings you counted.

The orders, steps, baking clock and every spoken line are in `shared/perfectPizza.js` (tested in `tests/perfectPizza.test.js`, which makes every possible order, checks that wrong taps never move an order on, and checks that every line has a recorded clip). The game is in `src/perfectPizza.js`, and the 3D kitchen (with the pizza built from simple shapes, so it can brown as it bakes and show exactly the toppings in the picture) is in `src/perfectPizzaScene.js`.

The voice is recorded with the Kokoro neural voice `af_heart` into `src/assets/pizza/voice.mp3` + `voice.json`, the same way as Food Finder's. The phrases come from `voicePhrases()` in `shared/perfectPizza.js`; after changing a line, re-record with `~/.cache/kokoro/venv/bin/python tools/make_pizza_voice.py` (about 2 minutes).

### Leaf Piles

Open **Game → Leaf Piles** for a four-player raking race in an autumn backyard, seen from above. Each critter has a corner of the yard, tinted in its colour. Leaves keep drifting down from the trees around the fence, and the yard starts with a few already on the grass.

- **Playing:** walk with WASD or the arrow keys (a controller's stick) and press Space or Enter (a controller's A) to swing your rake. The leaves in front of you slide about three metres the way you're facing, so walk round behind them, face your corner and rake. A swing that's nearly pointing at your own corner goes straight at it. Walking through leaves scuffs them about a little. On a touch screen, drag anywhere on the yard for a stick and press the 🍂 button to rake.
- **Scoring:** whatever is lying in your corner when the 60 seconds run out is your pile: a leaf is 1, a sparkly golden leaf 5. Piles aren't safe: anyone can walk into a rival's corner and rake the leaves back out, right up to the whistle. Your corner shows your pile as it grows, with a star for each round won. Players bump into each other but nobody gets knocked down.
- **Leaf blower:** 14 seconds in, a leaf blower turns up near the middle of the yard (with a chime). Walk over it to grab it, then hold the rake button for 6 seconds of strong, wide blowing. The next one turns up 16 seconds after that runs out.
- **Rounds:** best of three. The biggest pile wins the round (a tie counts for everyone tied); first to two wins takes the match, and if three different players win a round each, the most leaves over all three rounds wins.
- **Players:** **Play** is you (front left) against three computer neighbours. **2 players** puts player 1 front left (WASD + Space) and player 2 front right (arrows + Enter), with two neighbours at the back.
- **4 players:** one controller each, all on one screen. **4 players** opens a seat picker: press A on a controller to take the next free corner (player 1 front left, 2 front right, 3 back left, 4 back right), B to leave it, and Menu (or **Start**) to begin. Empty corners are computer neighbours. Without enough controllers, Space seats someone on WASD and Enter someone on the arrow keys. In play, each controller's stick (or D-pad) walks its own critter and A / RT rakes; B or Menu on any seated controller pauses, and the pause and results screens then go back to one controller. An unplugged controller's critter stands still until it's plugged back in. The game reads every controller itself (`padSeats()` on its dialog tells `src/padBridge.js` to stay out); the seat rules are in `shared/leafPiles.js`.
- **Neighbours:** each picks a leaf or clump worth moving, walks round behind it and rakes it home, grabs the blower if it's near, and now and then raids the biggest rival pile. Only one neighbour raids a corner at a time, a raid lasts at most 4 seconds, and each waits 7 seconds before raiding again. Otherwise they leave other corners alone, steer away from leaves someone else is already working on, and give up on a leaf after about 1.4 seconds of getting nowhere (boxed in by the fence or by other players). Easy neighbours walk slower, take longer to decide, aim worse, dawdle more and rarely steal; Hard ones are quick, accurate and raid often. Raking on its own, a neighbour piles up about 51 points a round on Easy, 62 on Normal and 76 on Hard. Your biggest pile against the computer is saved per difficulty.

The yard, leaves, rake, blower, scoring and neighbours are in `shared/leafPiles.js` (tested in `tests/leafPiles.test.js`), the game in `src/leafPiles.js`, and the 3D yard (the leaves are one instanced mesh, heaped up in the corners as the piles grow) in `src/leafPilesScene.js`.

### Paper Plane Pitch

Open **Game → Paper Plane Pitch** to throw paper airplanes off the back porch into a wicker laundry basket on the lawn, seen from where you stand.

- **Throwing:** swipe up from the plane (finger or mouse) and let go. The swipe's direction aims and its length sets how hard you throw. On a keyboard, A / D (← / →) aim, W / S (↑ / ↓) set the power (the bar on the right) and Space or Enter throws; a controller's stick aims and sets power, and A throws. While aiming, white dots show which way the plane will go.
- **The breeze:** a sign at the top shows the wind for this throw, its arrow pointing the way it blows. The windsock, the clothes on the line and the drifting leaves show it too. Wind pushes the plane sideways, so aim into it. The plane glides rather than lobbing like a ball: a hard throw sails long, a soft one drops short.
- **Scoring:** ten planes a round. Land one in the basket for a point; ones in a row build a 🔥 streak. A plane that clips the rim bounces out. Misses tell you why (short, long, to the side, or pushed by the breeze). The basket moves and the wind changes after every throw, and your best round is saved per difficulty.
- **Difficulty:** Easy has a bigger basket close by, light breezes, and dots that trace the first half of the real flight path, wind included. Normal and Hard move the basket further away and further to the side, shrink it, and blow harder (up to 2.4 and 3.2).

The flight physics, levels and swipe mapping are in `shared/paperPlane.js` (tested in `tests/paperPlane.test.js`, which checks every basket position and wind at the edges of each level can still be scored), the game in `src/paperPlane.js`, and the 3D backyard in `src/paperPlaneScene.js`.

### Big Bad Burger

Open **Game → Big Bad Burger** to stack the tallest burger you can on a plate on a diner counter. The burger starts as a bottom bun; the next ingredient slides back and forth above it, and you drop it.

- **Playing:** press Space, Enter, S or ↓, or click or tap anywhere, to drop the sliding ingredient. A controller's A drops. A badge in the corner shows what comes next.
- **Angled drops:** a dropped ingredient keeps some of its sideways slide, so it falls at a slight angle (leaning into it) and lands a little ahead of where it was let go, more so as the slide speeds up. On Easy a landing ring on the stack shows exactly where it will land, allowing for the drift; Normal and Hard have no ring.
- **Ingredients:** patty, cheese, tomato, lettuce, onion, pickles and bacon, never the same one twice in a row (patties and cheese turn up most). Each has its own width and weight: a patty is heavy, lettuce is light, and bacon and lettuce are wider than the bun.
- **Balance:** the burger is a real balance problem. Each layer stays up only while the balance point of everything above it sits over the part it rests on, so a burger leaning one way has to be saved by dropping the next pieces back the other way. When it gets close to falling, it wobbles and you hear which way to drop next ("Drop the next one a bit to the left"). A drop that misses the layer below completely slides off.
- **Perfect drops:** land close enough to the layer below and it snaps right on top for a **Perfect**, with a rising chime for each perfect in a row. Milestones cheer at 10, 20 and 30 layers.
- **Ending:** one topple or slide-off ends the game; only the layers still standing count. The results show your height, perfect drops and best, saved per difficulty, and a line on the counter marks your best height.
- **Difficulty:** sets how far and fast the ingredient slides (it speeds up as the burger grows), how close counts as Perfect, and how much the stack can lean before it falls. Easy has a little "sauce" grip past the edge; Hard has none.

The stacking rules and levels are in `shared/bigBadBurger.js` (tested in `tests/bigBadBurger.test.js`), the game in `src/bigBadBurger.js`, and the 3D diner in `src/bigBadBurgerScene.js`.

### Shoo Away

Open **Game → Shoo Away** to guard a picnic. You sit in the middle of a red gingham blanket with six snacks around you (sandwich, watermelon, cupcake, apple, cookie, strawberry), and squirrels sneak in across the lawn from every direction to steal them. (The game used to be called Whack-a-Squirrel; saved bests carry over.)

- **Foxes:** about one in six arrivals is a Pop fox instead of a squirrel (a fifth as common), and foxes run 25% faster: dashing in, carrying a snack off and scampering away when shooed. Otherwise they play by the same rules. They show as orange dots on the map, yip instead of chattering, and the first one gets a "A fox!" heads-up. The very first critter of a picnic is always a squirrel.

- **Statues:** a squirrel freezes mid-step while it's in view, whether it's sneaking in, fumbling with a snack or running off with one, and a yellow "!" pops up over its head. Squirrels always face the picnic blanket, even backing away from it with a snack or after being shooed. Squirrels only creep closer while you're looking somewhere else (or up at the sky). Shooed ones keep running.
- **Reach:** your arm reaches 3 m, marked by a white ring on the grass (and a dashed ring on the map). A squirrel inside it gets a pulsing yellow ring and can be shooed; tap one further out and you get "Too far!" So the game is: look away to let them creep in, then turn back and shoo them before they reach the snacks.
- **Looking around:** first person, all the way round and up and down (from the blanket to the treetops; you can't move). Drag the lawn (finger or mouse) in any direction, use A / D or ← / → to turn and W / S or ↑ / ↓ to look up and down, or a controller's left or right stick. On touch screens there are ◀ ▶ turn buttons too. Arrows at the screen edges show squirrels you can't see (×2 when there are more; red and pulsing when one is close or carrying a snack), and tapping one turns you that way. The round map in the corner shows the whole lawn with the way you face pointing up: squirrels are brown dots, foxes orange, thieves red, snacks yellow. Tap the map to turn towards that spot. Rustling and chattering are panned left or right to where the squirrel is.
- **Shooing:** tap or click a squirrel and your character's arm (cut from your chosen character's model, with a sleeve in your colour) winds up and sweeps across at it; it hops, puffs dust and scampers off. Space or Enter (A on a controller) shoos the in-reach squirrel nearest the middle of the screen. Taps are forgiving: anywhere near a squirrel counts.
- **Stealing:** squirrels run in short zigzag dashes with sniffing stops, head for the nearest snack (spreading out between snacks), fumble with it for a moment, then run off with it held overhead, slower than they came. Shoo a thief while it's still in reach and it drops the snack, which hops back to its plate; spot one further out and it at least freezes while you watch. Three stolen snacks ends the picnic; your score is how many squirrels you shooed, and your best is saved per difficulty.
- **Difficulty:** more and faster squirrels as the picnic goes on (full crowd at 2:30). Easy starts at up to 2 at a time (4 later), with slow squirrels, long grabs and few from behind you. Hard starts at 4 (8 later), quick ones, short grabs, and over half sneaking in from behind.

The rules (snacks, squirrel movement, freezing, reach, spawning, shooing, stealing and the levels) are in `shared/shooAway.js` (tested in `tests/shooAway.test.js`, which checks that ignoring them loses the picnic, that watched squirrels freeze, that only squirrels in reach can be shooed, that shooing every squirrel in reach never loses a snack, and that foxes are a fifth as common and 25% faster), the game in `src/shooAway.js`, and the 3D picnic (the Pop squirrel and fox critters, Kenney food models and your arm) in `src/shooAwayScene.js`.

### Comet Dash

Open **Game → Comet Dash** for an endless runner across floating sky islands at dusk. Your chosen character runs right by itself, faster the further it gets; you only jump and dash.

- **Jumping:** Space, W or ↑ (A on a controller, or the left half of the screen / the JUMP button on touch). Hold it for a higher jump, and press again in the air for a second jump.
- **Dashing:** D, →, R, X or Shift (X or LT on a controller, the right half of the screen / the DASH button on touch). A dash shoots straight ahead with a rainbow comet tail for a moment. One dash per jump, and a dash in the air gives your second jump back.
- **Crystals:** glowing crystals stand on some islands. Dash into one to smash it (100 points, more for crystals in a row, up to 500). Running into one without dashing costs a star; on Easy it just gets knocked over.
- **Sparkles:** gold sparkles float along the jumps and in rows. Grab them in quick succession for a chain (10 points × the chain, up to ×10).
- **Stars:** running into the side of an island or a crystal, or falling into the sky, costs a star; you carry on at the next island, blinking for a moment. When the stars run out the run ends. Score is metres run plus sparkle and crystal points; your best is saved per difficulty.
- **Difficulty:** Easy has 5 stars, a slower top speed, gaps that never need the second jump and forgiving crystals. Normal and Hard start faster, go faster (up to 15 and 18 m/s), have more crystals, and more gaps that need the second jump.
- **Music:** a little synth loop, toggled with the ♪ button (remembered).

The rules (jump physics, dashing, collisions, course generation and scoring) are in `shared/cometDash.js` (tested in `tests/cometDash.test.js`, where a bot that jumps at the edges and dashes into crystals runs 2.5 km of a dozen courses on every difficulty without losing a star, so every gap can be cleared and every crystal reached on the ground), the game in `src/cometDash.js`, and the 3D sky in `src/cometDashScene.js`.

### Pop Patrol

Open **Game → Pop Patrol** for a backyard tower defense. The neighbour's bubble machine pokes through the fence on the left and blows soap bubbles along the stepping-stone path to your back door, where your chosen character waits on the step. Place backyard defenders on the lawn to pop them first.

- **Bubbles:** each pop strips one layer of soap: pink → yellow → green → blue → clear → gone, and each kind is faster than the one below. Rainbow bubbles (from wave 11) take 4 pops and burst into two pinks; Big Soapy (from wave 15, and the last wave) takes 70 and bursts into three rainbows. A bubble that reaches the door costs lives: its layers (1–5), 10 for a rainbow, 40 for Big Soapy.
- **Defenders:** Pinecone Gnome ($170, pinecones that pierce a few bubbles), Sprinkler ($260, pops everything close by), Balloon Catapult ($420, splashes a crowd), Breezy Fan ($320, slows bubbles in its breeze; half as much on Big Soapy) and Squirt Frog ($550, very fast single shots). Each has two upgrade paths of two steps (both can be bought), shown as gold and blue diamonds around its base. Pick a placed defender to upgrade it, change who it aims at (First, Last, Strongest, Closest) or sell it for 70% of what it cost.
- **Money:** $1 for every layer popped, plus a bonus after each wave ($90 + $6 × the wave).
- **Waves:** start each with **▶ Start wave** (N or R; X on a controller); during a wave the same button press toggles **⏩ Fast** (F), which runs three times as fast.
- **Mouse / touch:** pick a defender in the shop along the bottom (or press 1–5), then click the lawn; the ghost and its reach turn red where it can't go (the path, trees, the pool, the sandbox, other defenders). On touch, the first tap shows where it would go and a second tap there builds. Right-click or Escape cancels. Shift keeps placing the same kind.
- **Keyboard / controller:** arrows or WASD (the stick) move a cursor around the yard. Space (A) on open grass opens the shop, on a defender opens its panel, and while placing builds. The shop and the panel are ordinary buttons, so the stick moves between them and A presses; B (Escape) backs out, then pauses.
- **Difficulty:** Easy has 15 waves, 150 lives, $750 to start, slower bubbles and smaller waves. Medium has 20 waves, 100 lives and $650. Hard has 25 waves, 80 lives, slightly faster bubbles and bigger waves.

The rules (path, bubbles, defenders, upgrades, waves and money) are in `shared/popPatrol.js` (tested in `tests/popPatrol.test.js`, where a scripted build order wins every difficulty, half of it loses on Hard, and an empty yard loses early), the game in `src/popPatrol.js`, and the 3D backyard in `src/popPatrolScene.js`. The menu picture is a frame from the game (`dialog.snapshot()` in the console).

### Kickabout

Open **Game → Kickabout** for 3 v 3 soccer on a backyard lawn, seen from high on the touchline. Each side has a goalkeeper and two outfield players; your team wears your colour and has your character in it, and attacks to the right. Most goals in 3 minutes wins, and a tie goes to golden goal (next goal wins).

- **Who you play:** goalkeepers are always bots. When your team has the ball you play whichever of your two outfielders has it (control follows every pass, including the keeper's throw). When the other team has it, or it's loose, you play the one nearer the ball, marked with a yellow arrow and ring; your teammate plays itself.
- **With the ball:** run with WASD or the arrows (left stick / D-pad, or drag on the left of a touch screen). Hold Space (A, or the SHOOT button) to power up a shot, shown as a bar over your head, and let go to shoot. Shots aim away from the keeper by themselves; hold ↑ or ↓ to aim for the top or bottom post on screen. Facing your own goal, it's a big clearance instead. R or E (X, or PASS) passes to your teammate, leading them.
- **Without it:** run into the player on the ball to win it, or press Space (A, TACKLE) to lunge for it. R (X, SWITCH) swaps to your other player. A pass coming to you is collected by itself if you leave the stick alone.
- **Keepers** track the ball, come out as it gets close, dive for shots (a fast one may be parried out), claim loose balls in their box and throw it to whichever teammate is most open.
- **Difficulty** changes only the other team: Easy opponents are slow, take a long time to win the ball, shoot wildly from far out, and have a small keeper; Hard ones are a touch quicker than you, tackle at once, shoot accurately from close in, and have a long-armed keeper. Winning the ball off them also takes longer on harder levels. Your wins are counted per difficulty.

The rules (ball physics, possession, tackles, saves, who you control and the bots) are in `shared/kickabout.js` (tested in `tests/kickabout.test.js`: whole matches always finish with the ball inside the fence and keepers in their box, control always follows the ball, friendly bots beat Easy and lose to Hard, and a simple scripted player beats Easy), the game in `src/kickabout.js`, and the 3D yard in `src/kickaboutScene.js`.
