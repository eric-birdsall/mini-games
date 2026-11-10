import { LocalMatch } from "./localMatch.js";
import { resultTrophy } from "./gameResults.js";
import { pauseBar } from "./pauseActions.js";
import { skipsBackpack } from "../shared/party.js";
import boulderDashPreview from "./assets/modes/boulder-dash.jpg";
import sprinklerDodgePreview from "./assets/modes/sprinkler-dodge.jpg";
import beachBallDodgePreview from "./assets/modes/beach-ball-dodge.jpg";
import breakoutPreview from "./assets/modes/breakout.png";
import slipstreamPreview from "./assets/modes/slipstream.jpg";
import fireflyRecallPreview from "./assets/modes/firefly-recall.jpg";
import { installAvatarPicker } from "./avatarPicker.js";
import { CHARACTERS } from "../shared/avatars.js";
import { installSlipstream } from "./slipstream.js";
import { installMemory } from "./memory.js";
import { installBackyardAirMail } from "./backyardAirMail.js";
import { installRoofCatch } from "./roofCatch.js";

import { installToyBox } from "./toyBox.js";
import { installPondFishing } from "./pondFishing.js";
import { installTargetBlaster } from "./targetBlaster.js";
import { installRiverCrossing } from "./riverCrossing.js";
import { installRacetrack } from "./racetrack.js";
import { installAppleCatch } from "./appleCatch.js";
import { installPoolNoodle } from "./poolNoodle.js";
import { installBackyardFlier } from "./backyardFlier.js";
import { installPerchHop } from "./perchHop.js";
import { installAcornDrop } from "./acornDrop.js";
import { installPaperPlane } from "./paperPlane.js";
import { installPerfectPizza } from "./perfectPizza.js";
import { installLeafPiles } from "./leafPiles.js";
import { installBackyardFling } from "./backyardFling.js";
import { installBigBadBurger } from "./bigBadBurger.js";
import { installShooAway } from "./shooAway.js";
import { installCometDash } from "./cometDash.js";
import { installKickabout } from "./kickabout.js";
import { installPopPatrol } from "./popPatrol.js";
import { installPipeCrane } from "./pipeCrane.js";
import { installFoodFinder } from "./foodFinder.js";
import { PadBridge, activeGame } from "./padBridge.js";
import { weaponBlockReason } from "../shared/combat.js";
import { MUSIC_TRACKS } from "./menuMusic.js";
import { createBuilder } from "./builder.js";
import { registerCustomMap, doorNear } from "../shared/customMap.js";
import { colorZones } from "./mapColors.js";
import { CameraClocks } from "./cameraClock.js";
import {
  DEFAULT_DECOY_PROGRAM,
  DECOY_ACTIONS,
  validateProgram,
} from "../shared/decoy.js";
import {
  GADGET_STATS,
  STAT_BUDGET,
  STAT_MAX,
  STAT_MIN,
  defaultStats,
  formatStat,
  activeBuilds,
  isTunable,
  statLevel,
  statTotal,
  statValue,
  validateStats,
  TUNING_MODES,
  UPGRADE_COST,
  UPGRADE_MAX,
  UPGRADE_TOTAL,
} from "../shared/gadgetStats.js";
import { THROWABLE } from "../shared/throwing.js";
import {
  BOT_GADGETS,
  TYPE_LABELS,
  baseOf,
  isPortable,
  isDecoy,
  statKind,
  typeOf,
  variantsOf,
} from "../shared/variants.js";
import {
  InputManager,
  ACTIONS,
  DEFAULTS,
  BUTTONS,
  keyLabel,
  keyboardCode,
} from "./input.js";
import { StanceControl } from "../shared/movement.js";
import "./style.css";
import { World } from "./world.js";
import { AudioFeedback } from "./audio.js";
import {
  GADGETS,
  CONFIG,
  OBJECTIVES,
  allowed,
  wetRule,
} from "../shared/config.js";
import { WALLS, BOUNDS, distance, raySurface } from "../shared/map.js";
import { MAPS, ENABLED_MAPS } from "../shared/maps.js";
import { parseLaunch } from "./launch.js";
import { PARTY, lightsPulse, nextPulse } from "../shared/party.js";
import { ensureBreakoutMap } from "../shared/breakout.js";
import { ensureBouldersMap, sOf, WIDTH } from "../shared/boulders.js";
import { PLAT, ARENA, wireAt, shoveDistance } from "../shared/livewire.js";
import { soften, backyard } from "../shared/kidWords.js";
const $ = (s) => document.querySelector(s);
// The map picker's thumbnails, by map id (captured with ?thumbs).
const MAP_THUMBS = Object.fromEntries(
  Object.entries(
    import.meta.glob("./assets/maps/*.png", {
      eager: true,
      query: "?url",
      import: "default",
    }),
  ).map(([path, url]) => [path.match(/([^/]+)\.png$/)[1], url]),
);
// Stance figures for the HUD's stance indicator: pictograms on a 24 × 24
// grid, heavy-stroked limbs plus a solid head [x, y]. Side views face left.
// Difficulty for every game: bots and rivals, speeds, timers and lives
// (each game's LEVELS table and server/bot.js have the numbers).
const BOT_LEVEL_TEXT = {
  easy: "Slower, more forgiving games and relaxed rivals.",
  normal: "The standard pace with balanced rivals.",
  hard: "Faster games and sharper rivals.",
};
const STANCES = {
  stand: [
    "STANDING",
    "M12 8v6m0 0-1.6 7.5M12 14l1.6 7.5M12 8.6l-3.2 5m3.2-5 3.2 5",
    [12, 3.4],
  ],
  crouch: [
    "CROUCHED",
    "M10.5 10.5 14 15l-4.5 1.5 1 5.5M14 15l1.2 6.5M10.5 11 7 14.5",
    [8.8, 7.4],
  ],
  slide: [
    "SLIDING",
    "M7.5 13.5l4 5h10m-10 0-1.5 3.5M8 14l-3.5 4.5",
    [5.8, 10.2],
  ],
  prone: ["LYING DOWN", "M7 18.8h8.5l6.5 1M8 18.8l-1.5-3.3", [3.8, 17.4]],
  // Mid-stride, leaning into the run.
  sprint: [
    "SPRINTING",
    "M11 7.8 13.5 13.5m0 0-4 2.8-2 4.6m6-7.4 3.6 3 3.4-1.4M11.6 9.2l-3.8 2.6m4.2-2.2 4-1.8",
    [10, 4.2],
  ],
  // A wall on the left, one foot planted on it.
  wallrun: [
    "WALL RUN",
    "M2.5 2v20M10.5 8.5l2.5 5.5-4 3.5-4.5-1M13 14l3.5 3.5.5 4M11 9.5l5 1.5",
    [9.6, 5],
  ],
};
const icon = (name, size = 20) => {
  const paths = {
    arrow: "M4 12h15m-6-6 6 6-6 6",
    flag: "M5 21V3m0 1h14l-3 5 3 5H5",
    eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm7 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
    grid: "M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z",
    shield: "M12 3 3 7v6c0 5 9 8 9 8s9-3 9-8V7l-9-4",
    smoke: "M5 16c-5-1-3-8 2-7-1-7 10-8 11-2 6 0 7 9 1 10H5m2 4h10",
    flashbang:
      "M12 2v4m0 12v4M2 12h4m12 0h4M5 5l3 3m8 8 3 3M5 19l3-3m8-8 3-3M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
    noisemaker: "M4 9h4l5-4v14l-5-4H4zm12 0a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12",
    shutter: "M3 3h18v18H3zM3 8h18M3 13h18M3 18h18",
    scanner:
      "M3 10V3h7m4 0h7v7m0 4v7h-7m-4 0H3v-7m5-2a4 4 0 1 0 8 0 4 4 0 1 0-8 0",
    disarm: "m14 6 4-4 4 4-4 4m-4-4L3 17l4 4L18 10",
    jammer:
      "M12 12v9m-4 0h8M8 8a6 6 0 0 0 0 8m8-8a6 6 0 0 1 0 8M4 4a11 11 0 0 0 0 16M20 4a11 11 0 0 1 0 16",
    tripwire: "M3 5v14m18-14v14M3 12h18M8 9v6m8-6v6",
    actorDecoy:
      "M9 4a3 3 0 1 0 6 0 3 3 0 1 0-6 0M7 10h10v8h-2v4h-2v-4h-2v4H9v-4H7z",
    decoy: "M3 5v14m18-14v14M3 12h3m3 0h3m3 0h3m3 0h1",
    camera: "M3 6h13v13H3zm13 4 6-3v11l-6-3",
    sensor: "M12 17v4M6 21h12M8 8a6 6 0 0 0 0 8m8-8a6 6 0 0 1 0 8M12 4v9",
    pulse:
      "M12 12h.01M8.5 8.5a5 5 0 0 0 0 7m7-7a5 5 0 0 1 0 7M5.5 5.5a9.2 9.2 0 0 0 0 13m13-13a9.2 9.2 0 0 1 0 13",
    cloak:
      "M2 12s4-7 10-7c2 0 4 .7 5.5 1.8M22 12s-4 7-10 7c-2 0-4-.7-5.5-1.8M4 20 20 4",
    chevron: "m9 5 7 7-7 7",
    check: "m5 12 5 5L20 7",
    cross: "m6 6 12 12M6 18 18 6",
    trophy:
      "M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4m10-4h3a3 3 0 0 1-3 4",
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${(
    paths[name] || paths.grid
  )
    .split("___")
    .map((d) => `<path d="${d}"/>`)
    .join("")}</svg>`;
};
const staticHosting = import.meta.env.MODE === "pages";

$("#app").innerHTML = `
<div id="viewport"></div><div class="vignette"></div>
<header><a class="brand" href="${import.meta.env.BASE_URL}" aria-label="Mini Games home"><span class="brand-mark">M<span></span></span>MINI GAMES<span class="build-tag">PROTOTYPE / 0.1</span></a><nav><span class="status-dot"></span><span id="connection-status">BACKYARD HIDE &amp; SEEK</span><button class="text-button" id="music-mute" aria-pressed="false">MUSIC ON</button><button class="text-button" id="controls-button">CONTROLS</button><button class="text-button" id="help-button">FIELD MANUAL <span>↗</span></button></nav></header>
<main id="home" data-screen="mode"><section class="menu"><div class="screen-head" data-nav-row><button class="text-button" id="menu-back" aria-label="Back to the previous screen">← BACK</button><span id="screen-crumb"></span></div><div class="menu-step mode-step"><div class="step-label"><b>01</b> HOW YOU'RE PLAYING</div><div class="choice-row" data-nav-row role="group" aria-label="How you're playing"><button class="choice selected" data-mode="training" aria-pressed="true"><strong>Practice</strong><small>Just you. Every gadget, no timer</small></button><button class="choice" data-mode="solo" aria-pressed="false"><strong>Against AI</strong><small>Take on a bot opponent</small></button><button class="choice" data-mode="multi" aria-pressed="false"><strong>With Friends</strong><small>Host or join a private match</small></button></div></div><div class="menu-step" id="bot-step"><div class="step-label">DIFFICULTY</div><div class="choice-row" data-nav-row data-nav-choice role="group" aria-label="Difficulty">${Object.entries(
  BOT_LEVEL_TEXT,
)
  .map(
    ([id, text]) =>
      `<button class="choice${id === "normal" ? " selected" : ""}" data-bot-level="${id}" aria-pressed="${id === "normal"}"><strong>${id === "normal" ? "Medium" : id[0].toUpperCase() + id.slice(1)}</strong><small>${text}</small></button>`,
  )
  .join(
    "",
  )}</div></div><div class="menu-step game-step"><div class="choice-row two" data-nav-row data-nav-choice role="group" aria-label="Game"><button class="choice" data-game="splash" aria-pressed="false"><strong>Splash</strong><small>Kid-friendly: water balloons. ${CONFIG.splashHits} splashes and you're soaked.</small></button><button class="choice" data-game="hotpotato" aria-pressed="false"><strong>Hot Potato</strong><small>One silly potato! Toss it across before it sneezes confetti. First to 2 rounds.</small></button><button class="choice" data-game="breakout" aria-pressed="false"><strong>Breakout</strong><small>Auto run down three lanes, faster as you go. Jump logs and dodge hay bales. How far can you go?</small></button><button class="choice" data-game="boulders" aria-pressed="false"><strong>Boulder Dash</strong><small>Party: race up a steep channel as boulders roll down. Duck into the recesses, dash for the next. First to the top.</small></button><button class="choice" data-game="sprinklers" aria-pressed="false"><strong>Sprinkler Dodge</strong><small>Dodge pop-up sprinklers in a compact yard. More spray each wave. Last one dry wins!</small></button><button class="choice" data-game="livewire" aria-pressed="false"><strong>Beach Ball Dodge</strong><small>Bots throw beach balls straight across the pool. Step out of their path to stay on the float. Last one dry wins.</small></button></div></div><div class="menu-go"><div class="step-label">START</div><div id="menu-summary"></div><button class="primary" id="deploy">START PRACTICE ${icon("arrow")}</button><div id="join-row" data-nav-row hidden><span>OR JOIN A FRIEND'S MATCH</span><input id="room-code" maxlength="6" placeholder="CODE" aria-label="Room code"><button id="join" class="secondary">JOIN ${icon("arrow", 16)}</button></div><div id="home-error" class="error"></div></div><div class="menu-links" data-nav-row><button class="text-button" id="menu-controls">CONTROLS &amp; SETTINGS</button><button class="text-button" id="menu-manual">FIELD MANUAL</button><button class="text-button" id="menu-builder">MAP BUILDER</button><span class="micro"><span class="status-dot"></span><span id="pad-status">CONTROLLER: PRESS ANY BUTTON</span></span></div></section></main>

<section id="purchase" class="panel-screen" hidden><div class="purchase-heading"><div><div class="eyebrow" id="loadout-label">GAME / BACKPACK</div><h2 id="purchase-title">Pack your bag</h2><div class="role-chip" id="role-chip"></div><p id="purchase-description"></p></div></div><div class="purchase-body"><aside class="loadout-side"><div class="section-label">YOUR BACKPACK</div><div class="credits" id="credits-block"><div><span id="credits">1,000</span><span class="credit-unit">CR LEFT</span></div><div class="credit-bar"><i id="credit-spent"></i></div><small id="credit-note"></small></div><ul id="loadout-list" data-nav-row></ul><div class="room-label" id="room-label">SESSION CODE <strong id="session-code"></strong><button id="copy-code" class="text-button">COPY ↗</button></div></aside><div class="shop"><div class="shop-top"><span>MISSION EQUIPMENT</span><span id="shop-privacy">YOUR PURCHASES ARE PRIVATE ${icon("shield", 15)}</span><span id="training-fill" hidden><button data-fill="all" class="text-button">TAKE ALL</button><button data-fill="none" class="text-button">CLEAR ALL</button></span></div><div id="gadget-grid"></div><div id="bot-loadout" hidden></div><div class="shop-note">${icon("eye", 17)} Pack a Smoke Puff, Glitter Popper, Peek-a-Boo Ball or Door Stopper.</div></div><aside id="gadget-detail" class="gadget-detail" aria-live="polite"></aside></div><footer class="purchase-footer"><div><span class="status-dot"></span><span id="footer-credits"></span><span id="ready-status">RESET CREDITS EACH ROUND · NO PERSISTENT PROGRESSION</span></div><button id="walk-around" class="secondary">WALK AROUND ↗</button><button id="ready" class="primary">PACK BACKPACK ${icon("arrow")}</button></footer></section>
<div id="hud" hidden><div id="flash-veil"></div><div id="splash-veil"></div><div id="chase-veil"></div><div id="climb" hidden><div class="climb-track"><i id="climb-them"></i><i id="climb-you"></i></div><div class="climb-label"><strong id="climb-height">0 M</strong><span id="climb-of">OF 130</span><span id="climb-hits">0 HITS</span></div></div><div id="livewire" hidden><div class="lw-wave"><span>WAVE</span><strong id="lw-wave">1</strong><time id="lw-time">00:00</time></div><div class="lw-row" id="lw-you"><i></i><span>YOU</span><b>0 BUMPS</b></div><div class="lw-row" id="lw-them"><i></i><span>BOT</span><b>0 BUMPS</b></div></div><div id="boulder-warn" hidden><b id="boulder-lane"><i></i><i></i></b><span id="boulder-text">BOULDER</span></div><div id="chase" hidden><div class="chase-label"><span id="chase-who">BREAKOUT</span><strong id="chase-gap">JUMP LOGS · DODGE HAY</strong><span id="chase-run">0 M</span></div></div><div id="soaked-card" hidden>Soaked!<small>You're out. Great try!</small></div><div class="hud-top"><div class="objective"><span id="phase-tag">INFILTRATION</span><div id="objective-text">RAISE THE FLAG</div><small id="round-info">TRAINING GROUND 09</small></div><div class="timer"><span class="status-dot"></span><strong id="timer">04:00</strong><span id="team-tag">INFILTRATOR</span></div></div><div id="crosshair"><span></span><span></span><span></span><span></span></div><div id="compass" aria-hidden="true"><div class="compass-strip"></div><div class="compass-marks"></div><i class="compass-caret"></i></div><div id="bearing">000°</div><div id="camera-banner" hidden>LIVE / CAM 01 <span>KEEP AN INTRUDER IN FRAME TO TAG THEM</span></div><div id="center-feedback"><div id="alert" hidden></div><div id="progress-area" hidden><span id="progress-label"></span><div class="progress-track"><i id="progress-bar"></i></div></div><div id="interaction"></div></div><canvas id="minimap" width="200" height="200"></canvas><div class="map-caption" id="map-caption">THE COMPOUND</div><div id="equipment-bar"></div><div id="stance" data-stance="stand"><div class="stance-icons">${Object.entries(
  STANCES,
)
  .map(
    ([k, [, d, head]]) =>
      `<svg data-stance-icon="${k}" class="${k === "stand" ? "on" : ""}" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/><circle cx="${head[0]}" cy="${head[1]}" r="2.5" fill="currentColor" stroke="none"/></svg>`,
  )
  .join(
    "",
  )}</div><strong id="stance-label">STANDING</strong></div><div class="hud-bottom"><span><kbd>W A S D</kbd> MOVE &nbsp; <kbd>SHIFT</kbd> SPRINT &nbsp; <kbd>C</kbd> CROUCH · HOLD TO LIE DOWN &nbsp; <kbd>SPACE</kbd> JUMP</span><span><kbd>E</kbd> INTERACT &nbsp; <kbd>B</kbd> CAMERAS &nbsp; <kbd>⌘K</kbd> DEV TOOLS &nbsp; <kbd>ESC</kbd> RELEASE</span></div><div id="decoy-runtime" hidden></div><div id="notifications"></div></div>
<div id="lock-overlay" hidden>${pauseBar("Backyard Hide &amp; Seek")}<div class="lock-card game-pause-card"><div class="eyebrow">GAME ON</div><h2>Take your position.</h2><p>Click to enter first-person view.<br>Your mouse controls where you look.</p><button id="resume" class="primary">GO PLAY ${icon("arrow")}</button><button id="open-loadout" class="secondary" hidden>BACK TO BACKPACK</button><button id="training-loadout" class="secondary" hidden>BACK TO TRAINING BACKPACK</button><button id="return-editor" class="secondary" hidden>RETURN TO EDITOR</button><button id="pause-controls" class="text-button">CONTROL SETTINGS ↗</button><button id="manual-ingame" class="text-button">VIEW HOW TO PLAY ↗</button></div></div>
<div id="results" class="modal-backdrop" hidden>${pauseBar("Backyard Hide &amp; Seek")}<div class="result-card"><div class="eyebrow" id="result-verdict">OPERATION COMPLETE</div><span class="result-icon" id="result-icon"></span><h2 id="winner"></h2><p id="result-side"></p><p id="reason"></p><div class="result-stats" id="result-stats"></div><button id="restart" class="primary">NEXT OPERATION ${icon("arrow")}</button><button id="results-editor" class="text-button" hidden>RETURN TO EDITOR ↗</button><button id="results-home" class="text-button">BACK TO THE MENU ↗</button></div></div>
<div id="manual" class="modal-backdrop" hidden><div class="manual-card"><button class="close" id="close-manual" aria-label="Close manual">${icon("cross")}</button><div class="eyebrow">FIELD MANUAL / 01</div><h2>Outsmart the other side.</h2><div class="manual-cols"><div><h3>${icon("flag")} Infiltrator</h3><p>Extract data from two of the three terminals at the north end of the map (A in the warehouse, B in the container yard, C on the quay): hold <kbd>E</kbd> for 8 seconds at each. Progress stays on a terminal if you let go, and the Sentinels hear which terminal is being worked, so fake toward one and finish another. Move behind cover or use smoke to break detection.</p><h3>${icon("eye")} Sentinel</h3><p>Three terminals to cover, and losing two loses the round: about 1.5 s after the intruder starts on one, you hear which. Progress stays on a terminal, so a quiet one may already be part done. You're told when one is lost.<br><b>Seen:</b> Keep any part of the intruder near the centre of your view, in clear sight, for 3 continuous seconds. Losing sight resets progress.<br><b>Water balloons:</b> Throw from the balloon slot; they never run out. ${CONFIG.splashHits} splashes and you're out. Sight and proximity do not eliminate. Peek-a-Boo Balls help you spot the other side. The host chooses the rules for the entire session.</p></div><div><h3 id="manual-ways">Ways in</h3><p id="manual-approaches"></p><h3>Equipment</h3><p id="manual-controls"><kbd>I J K L</kbd> look · Tap <kbd>C</kbd> crouch/stand · Hold <kbd>C</kbd> lie down · <kbd>C</kbd> while sprinting slides<br><kbd>1–5</kbd> equip · <kbd>CLICK / F</kbd> use or place · hold to aim a throw, release to throw, <kbd>Q</kbd> cancels<br>Smoke Puff makes a cloud to hide behind. Glitter Popper briefly dazzles anyone looking at its pop. Peek-a-Boo Ball shows nearby players through walls for a moment.<br>For Door Stopper, click two walls across a doorway; <kbd>Q</kbd> after the first cancels. It opens after a while, or you can splash it with a water balloon.</p></div></div><div class="manual-note">SOLO TEST: 45-second setup can be skipped with <kbd>⌘K</kbd>. Multiplayer requires two browsers connected to the same server. Purchases stay private.</div></div></div>
<aside id="dev-panel" hidden><div class="dev-title">DEVELOPER CONSOLE <button id="close-dev" aria-label="Close developer console">×</button></div><label><input type="checkbox" id="show-geometry"> Geometry & visibility overlays</label><small>Cones · sight rays · wires · scanner range · sensor zones · camera FOV · smoke volumes</small><label><input type="checkbox" id="show-warning" checked> Attacker detection warning</label><label><input type="checkbox" id="sound-enabled" checked> Procedural audio feedback</label><div id="movement-audio-controls"><div class="section-label">MOVEMENT SOUND · AUDITION LEVELS</div></div><div id="solo-tools"><label>Gadget tuning <select id="tuning-mode" aria-label="Gadget tuning mode">${Object.entries(
  TUNING_MODES,
)
  .map(([key, name]) => `<option value="${key}">${name}</option>`)
  .join(
    "",
  )}</select></label><small>Switching resets the round and refunds credits.</small><label><input id="fast-start" type="checkbox"> Start playing immediately after Ready</label><button data-debug="decoyTest">Decoy sandbox: equip & play now</button><button data-debug="skip">Skip preparation</button><button data-debug="stationary">Toggle stationary bot</button><button data-debug="botRoute">Next bot route (infiltrator bot)</button><button data-debug="credits">Grant unlimited credits</button><button data-debug="all">Grant all role gadgets</button><button data-debug="cooldowns">Toggle gadget cooldowns</button><label>Timer <input id="debug-time" type="number" value="240" min="10" max="900"><button id="set-time">Set</button></label><button id="swap-sides" hidden>Switch sides (keep round)</button><button id="switch-team">Switch teams & reset</button></div><button id="dev-reset">Reset round</button><pre id="debug-state"></pre><small id="debug-restriction"></small></aside>
`;
$("#app").insertAdjacentHTML(
  "beforeend",
  `<div id="control-settings" class="modal-backdrop" hidden><div class="controls-card"><button id="close-controls" class="close" aria-label="Close control settings">×</button><div class="eyebrow">INPUT / PERSONAL SETTINGS</div><h2>Make your next move.</h2><p id="controller-status"></p><div class="control-options"><label>Stick deadzone <input id="stick-deadzone" type="range" min=".05" max=".5" step=".01"></label><label>Controller look speed <input id="pad-sensitivity" type="range" min=".3" max="5" step=".1"></label><label>Mouse look speed <input id="mouse-sensitivity" type="range" min=".0003" max=".01" step=".0001"></label><label><input id="invert-look" type="checkbox"> Invert mouse look Y</label><label><input id="pad-invert-y" type="checkbox"> Invert controller look Y</label><label><input id="pad-invert-x" type="checkbox"> Invert controller look X</label><label><input id="swap-sticks" type="checkbox"> Swap movement / look sticks</label></div><p id="binding-message">Select a binding, then press a key, mouse button, or controller button. Conflicting bindings swap.</p><div class="binding-head"><span>ACTION</span><span>KEYBOARD / MOUSE</span><span>XBOX CONTROLLER</span></div><div id="binding-list"></div><button id="reset-controls" class="secondary">RESTORE DEFAULT CONTROLS</button><small>Saved on this browser. LS moves, RS looks. LT slows aim. A selects menus; B goes back. Press a controller button if your browser has not detected it yet.</small></div></div>`,
);
$("#app").insertAdjacentHTML(
  "beforeend",
  `<div id="decoy-editor" class="modal-backdrop" hidden><div class="controls-card"><button class="close" id="close-decoy-editor" aria-label="Close decoy editor">×</button><div class="eyebrow">DECEPTION / ACTION SEQUENCER</div><h2>Give them something to follow.</h2><p>Program your character decoy before Ready. When you trigger it, the ground under your aim becomes its mark. It starts beside you, then follows these actions in order. A move walks straight to the mark, facing where it's going. Look turns it to a heading: 0° north, 90° east.</p><div id="decoy-steps"></div><div class="decoy-editor-tools"><select id="decoy-add-type" aria-label="New decoy action">${Object.entries(
    DECOY_ACTIONS,
  )
    .map(([key, name]) => `<option value="${key}">${name}</option>`)
    .join(
      "",
    )}</select><button id="decoy-add" class="secondary">+ ADD ACTION</button><label>REPEAT <input id="decoy-repeats" type="number" min="1" max="5" value="1" aria-label="Decoy repeat count"></label></div><p id="decoy-editor-error"></p><div class="decoy-editor-footer"><button id="save-decoy" class="primary">SAVE PROGRAM</button><button id="test-decoy" class="primary">SAVE & PLAY TEST NOW ↗</button></div><p>Buy a Programmable decoy for 200 credits. The test button grants 3, equips it, skips preparation, and freezes bot movement. Aim down at open ground, then use your gadget trigger. Each move action uses that same trigger mark. Completed decoys remain in their last pose for up to 90 seconds.</p></div></div>`,
);
$("#app").insertAdjacentHTML(
  "beforeend",
  `<div id="stat-editor" class="modal-backdrop" hidden><div class="controls-card"><button class="close" id="close-stat-editor" aria-label="Close tuning">×</button><div class="eyebrow">EQUIPMENT / TUNING</div><h2 id="stat-title"></h2><p id="stat-help"></p><div class="stat-budget"><span id="stat-budget-label"></span><strong id="stat-points"></strong></div><div id="stat-rows"></div><div class="decoy-editor-footer"><button id="reset-stats" class="secondary">STANDARD ISSUE</button><button id="save-stats" class="primary">SAVE TUNING</button><button id="test-stats" class="primary">SAVE & PLAY TEST NOW ↗</button></div><p id="stat-test-note">The test button grants a full stack of this gadget with your tuning, equips it, starts the round, and freezes bot movement.</p></div></div>`,
);
let decoyDraft = null,
  statDraft = null,
  // The gadget shown in the loadout screen's detail panel.
  detailBase = null;
const audio = new AudioFeedback();
// Start after the first menu interaction, as required by browser audio policy.
window.addEventListener("pointerdown", () => audio.unlock());
window.addEventListener("keydown", () => audio.unlock());
$("#control-settings .control-options").insertAdjacentHTML(
  "beforeend",
  `<label>Menu music <input id="music-volume" aria-label="Menu music volume" type="range" min="0" max="1" step=".01" value="${audio.music.volume}"></label>`,
);
$("#music-volume").oninput = (e) => audio.music.setVolume(e.target.value);
function showMute() {
  const muted = audio.music.muted;
  $("#music-mute").textContent = muted ? "MUSIC OFF" : "MUSIC ON";
  $("#music-mute").setAttribute("aria-pressed", String(muted));
  $("#music-mute").setAttribute(
    "aria-label",
    muted ? "Unmute menu music" : "Mute menu music",
  );
}
$("#music-mute").onclick = () => {
  audio.music.setMuted(!audio.music.muted);
  showMute();
};
showMute();

$("#movement-audio-controls").insertAdjacentHTML(
  "beforebegin",
  `<div class="section-label">MENU MUSIC</div><label>Track <select id="music-track" aria-label="Menu music track">${Object.entries(
    MUSIC_TRACKS,
  )
    .map(([id, track]) => `<option value="${id}">${track.name}</option>`)
    .join(
      "",
    )}</select></label><small>Plays in menus and loadout. Volume / mute: Controls → Menu music.</small>`,
);
$("#music-track").value = audio.music.track;
$("#music-track").onchange = (e) => {
  audio.unlock();
  audio.music.setTrack(e.target.value);
};
const stance = new StanceControl();
$("#movement-audio-controls").innerHTML +=
  ["crawl", "crouch", "walk", "sprint"]
    .map(
      (kind) =>
        `<label>${kind.toUpperCase()} <input type="range" min="0" max="1" step=".01" value="${audio.levels[kind].gain}" data-volume="${kind}" aria-label="${kind} volume"><output id="volume-${kind}">${audio.levels[kind].gain}</output><button data-audition="${kind}">Listen</button></label>`,
    )
    .join("") +
  "<small>Stationary prone is silent. Crawl is deliberately audible for tuning.</small>";
document.querySelectorAll("[data-volume]").forEach(
  (el) =>
    (el.oninput = () => {
      audio.levels[el.dataset.volume].gain = Number(el.value);
      $("#volume-" + el.dataset.volume).textContent = el.value;
    }),
);
document.querySelectorAll("[data-audition]").forEach(
  (el) =>
    (el.onclick = () => {
      audio.unlock();
      audio.footstep(el.dataset.audition);
    }),
);
const world = new World($("#viewport"));
let state = null,
  socket = null,
  // Training comes first for now while the game is in active development.
  mode = "training",
  role = "attacker",
  // Set from the game type (GAMES) below.
  rule = "soak",
  // Objective selected by the game mode.
  objective = "extract",
  botLevel = "normal",
  mapChoice = ENABLED_MAPS[0],
  view = { yaw: 0, pitch: 0 },
  keys = new Set(),
  localDebug = false,
  lastPhase = null,
  lastInventory = "",
  lastEvent = 0,
  scanWarning = true,
  detectionLevel = 0,
  controlsEnabled = false,
  pointerFallback = false,
  sprintLatched = false,
  interactAsUse = false,
  // Slides asked for so far (the server starts one each time it goes up),
  // and whether the crouch key is down from asking for one.
  slideRequests = 0,
  // Builder doors asked to open or shut (counted like slides).
  doorRequests = 0,
  weaponRequests = 0,
  slidePress = false,
  // Aiming a throwable: { action } while the key that started it is held.
  throwAim = null,
  // Buy phase: walking around the arena instead of looking at the buy screen.
  roaming = false;
const input = new InputManager(handleAction, () => refreshPrompts());
const padBridge = new PadBridge();
let menuRepeat = 0,
  suppressClick = false;
const visible = (selector, on) => ($(selector).hidden = !on);
// Training unlocks both roles' gadgets.
// Gadgets you can take: your side's (training: everyone's), and in Splash
// only its short list.
// A party minigame's gadgets for your side this half (see server/party.js).
function partyKinds() {
  const party = state?.party,
    hider = state?.me?.team === "defender";
  if (!party) return null;
  if (party.kind === "sweep")
    return Object.keys(hider ? PARTY.sweep.hideKit : PARTY.sweep.seekKit);
  if (party.kind === "lightsout")
    return Object.keys(
      hider ? PARTY.lightsout.guardKit : PARTY.lightsout.runKit,
    );
  if (
    ["hotpotato", "breakout", "boulders", "livewire", "sprinklers"].includes(
      party.kind,
    )
  )
    return [];
  return hider ? PARTY.gauntlet.shop : Object.keys(PARTY.gauntlet.runKit);
}
// Whether your kit is handed out rather than bought (everyone but the
// Gauntlet's builder).
const partyLocked = () =>
  !!state?.party &&
  !(state.party.kind === "gauntlet" && state.me?.team === "defender");
const partyRole = () =>
  state.party.kind === "sprinklers"
    ? "DODGER"
    : state.party.kind === "livewire"
      ? state.me.team === "defender"
        ? "RED"
        : "BLUE"
      : state.party.kind === "boulders"
        ? state.me.team === "defender"
          ? "RED CLIMBER"
          : "BLUE CLIMBER"
        : state.party.kind === "breakout"
          ? state.me.team === "defender"
            ? "WATCHING"
            : "RUNNER"
          : state.party.kind === "hotpotato"
            ? state.me.team === "defender"
              ? "RED HALF"
              : "BLUE HALF"
            : state.party.kind === "lightsout"
              ? state.me.team === "defender"
                ? "GUARD"
                : "INTRUDER"
              : state.party.kind === "sweep"
                ? state.me.team === "defender"
                  ? "HIDER"
                  : "SWEEPER"
                : state.me.team === "defender"
                  ? "BUILDER"
                  : "RUNNER";
const partySite = () =>
  OBJECTIVES.find((o) => o.id === state.party?.site)?.id || "";
const usable = (kind, g = GADGETS[kind]) =>
  state.party
    ? !g.modeWeapon && partyKinds().includes(kind)
    : !g.modeWeapon &&
      allowed(state.rule, kind) &&
      (state.training || g.team === state.me.team || g.team === "both");
// The prompt's hint for dropping a first anchor, when Cancel throw is bound.
function anchorCancel() {
  const key = input.label("cancelThrow");
  return key === "—" ? "" : ` · <kbd>${key}</kbd> CANCEL`;
}
// Whether a terminal's data is already out (it can't be worked again).
const spent = (o) => !!state?.objectives?.find((s) => s.id === o.id)?.done;
// The objective (terminal or flag) within capture range of `p`, if any;
// with `done`, a spent terminal there instead.
const siteAt = (p, done = false) =>
  OBJECTIVES.find(
    (o) => spent(o) === done && distance(p, o) < CONFIG.captureRadius,
  );
const hasTerminals = () => !!OBJECTIVES[0]?.terminal;
// How many terminals the infiltrators must extract, and have.
const terminalCount = () => ({
  need: state?.needed || 1,
  done: OBJECTIVES.filter(spent).length,
  all: OBJECTIVES.length,
});
// The infiltrator's goal: "EXTRACT DATA · 1 OF 2 · TERMINAL B OR C".
function extractGoal() {
  const { need, done } = terminalCount(),
    left = OBJECTIVES.filter((o) => !spent(o)).map((o) => o.id);
  return `EXTRACT DATA${need > 1 ? ` · ${done} OF ${need}` : ""} · TERMINAL ${left.join(" OR ")}`;
}
// Plant & defend: the terminal you can hold interact at right now, an
// unplanted one for the infiltrator (before the plant) or the planted one
// for a sentinel.
const plantMode = () => state?.objectiveMode === "plant";
const plantSite = (me) =>
  plantMode() && state.phase === "active" && me?.alive
    ? OBJECTIVES.find(
        (o) =>
          distance(me, o) < CONFIG.captureRadius &&
          (me.team === "attacker"
            ? !state.uplink
            : state.uplink?.site === o.id),
      )
    : null;
const terminalIds = () => OBJECTIVES.map((o) => o.id).join(" OR ");
const uplinkName = () =>
  OBJECTIVES.find((o) => o.id === state.uplink?.site)?.name.toUpperCase();
// The builder door in front of you, which E opens or shuts.
const doorAhead = (me) =>
  me && state.phase !== "results" && !me.camera ? doorNear(me) : null;
function interactBusy() {
  const me = state?.me;
  return (
    !me ||
    !!doorAhead(me) ||
    !me.equipped ||
    !me.inventory[me.equipped] ||
    me.equipped === "disarm" ||
    !!me.camera ||
    (me.team === "attacker" && state.phase === "active" && !!siteAt(me)) ||
    !!plantSite(me)
  );
}
// Each jammed feed pauses its REC clock for one second every seven seconds.
const feedClocks = new CameraClocks();
function feedStamp(feed) {
  return new Date(feedClocks.sample(feed.id, feed.jammed)).toLocaleTimeString(
    "en-GB",
  );
}
// Training: pick what the scripted opponent carries. Each gadget is listed
// once with a type switch; counts are per type, capped by its map's spots.
const botTypes = {};
function renderBotLoadout(me) {
  const box = $("#bot-loadout");
  box.hidden = !state.training || state.noBot;
  if (!state.training || state.noBot) return;
  const team = me.team === "attacker" ? "defender" : "attacker",
    kinds = BOT_GADGETS[team].filter((k) => allowed(state.rule, k)),
    loadout = state.botLoadout || {},
    spots = MAPS[state.map]?.botSpots || {};
  box.innerHTML =
    `<div class="shop-top"><span>OPPONENT BACKPACK · ${team === "defender" ? "SENTINEL" : "INFILTRATOR"} BOT</span><span>PUT OUT IN THE FIRST SECONDS OF THE ROUND</span></div>` +
    [...new Set(kinds.map(baseOf))]
      .map((base) => {
        const types = kinds.filter((k) => baseOf(k) === base),
          id = types.includes(botTypes[base]) ? botTypes[base] : types[0],
          g = GADGETS[id],
          count = loadout[id] || 0,
          carried = isPortable(id) || id === "cloak",
          others = types
            .filter((k) => k !== id && !isPortable(k))
            .reduce((sum, k) => sum + (loadout[k] || 0), 0),
          max = carried
            ? g.limit
            : Math.min(g.limit, (spots[base]?.length || 1) - others),
          summary = types
            .filter((k) => loadout[k])
            .map(
              (k) =>
                `${loadout[k]} ${(TYPE_LABELS[typeOf(k)] || "").toUpperCase()}`,
            )
            .join(" · ");
        return `<article class="gadget-row" role="listitem" data-nav-row><span class="gadget-symbol">${icon(base, 30)}</span><div class="gadget-info"><small>${(GADGETS[base] || g).category.toUpperCase()}</small><h3>${g.name}</h3>${
          types.length > 1
            ? `<div class="type-picker" role="group" aria-label="Opponent ${GADGETS[base].name} type">${types
                .map(
                  (k) =>
                    `<button data-bot-type="${k}" class="${k === id ? "selected" : ""}" aria-pressed="${k === id}">${TYPE_LABELS[typeOf(k)]}</button>`,
                )
                .join("")}</div>`
            : ""
        }<p>${carried ? "Worn or used whenever ready." : `Up to ${spots[base]?.length || 0} spots on this map.`}</p>${
          summary ? `<small class="owned">CARRIES: ${summary}</small>` : ""
        }</div><div class="gadget-tuning"></div><strong class="gadget-cost"></strong><div class="quantity"><button data-bot-count="${id}" data-delta="-1" aria-label="Opponent carries one fewer ${g.name}" ${count ? "" : "disabled"}>−</button><span>${count}<small> / ${max}</small></span><button data-bot-count="${id}" data-delta="1" aria-label="Opponent carries one more ${g.name}" ${count < max ? "" : "disabled"}>+</button></div></article>`;
      })
      .join("");
  box.querySelectorAll("[data-bot-type]").forEach(
    (b) =>
      (b.onclick = () => {
        botTypes[baseOf(b.dataset.botType)] = b.dataset.botType;
        lastInventory = "";
      }),
  );
  box.querySelectorAll("[data-bot-count]").forEach(
    (b) =>
      (b.onclick = () =>
        send({
          type: "botLoadout",
          gadget: b.dataset.botCount,
          count:
            (state.botLoadout?.[b.dataset.botCount] || 0) +
            Number(b.dataset.delta),
        })),
  );
}
const ownedGadgets = () =>
  state.me.slots ||
  Object.keys(GADGETS).filter((k) => state.me.inventory[k] > 0);
function send(msg) {
  if (socket?.readyState === 1) socket.send(JSON.stringify(msg));
}
function renderDecoyEditor() {
  $("#decoy-steps").innerHTML = decoyDraft.steps
    .map(
      (action, index) =>
        `<div class="decoy-step"><span class="step-number">${index + 1}</span><select data-step="${index}" data-field="type" aria-label="Action ${index + 1} type">${Object.entries(
          DECOY_ACTIONS,
        )
          .map(
            ([type, name]) =>
              `<option value="${type}" ${type === action.type ? "selected" : ""}>${name}</option>`,
          )
          .join(
            "",
          )}</select>${action.type === "look" ? `<label>HEADING <input data-step="${index}" data-field="heading" type="number" min="0" max="359.9" step=".1" value="${action.heading}" aria-label="Action ${index + 1} heading"> °</label>` : ""}${action.type === "move" ? `<select data-step="${index}" data-field="speed" aria-label="Action ${index + 1} movement speed"><option value="walk" ${action.speed === "walk" ? "selected" : ""}>Walk / stance speed</option><option value="sprint" ${action.speed === "sprint" ? "selected" : ""}>Sprint (standing)</option></select>` : `<label>SECONDS <input data-step="${index}" data-field="duration" type="number" min=".1" max="30" step=".1" value="${action.duration}" aria-label="Action ${index + 1} duration"></label>`}<div class="step-buttons"><button data-reorder="${index}" data-direction="-1" aria-label="Move action ${index + 1} up" ${index === 0 ? "disabled" : ""}>↑</button><button data-reorder="${index}" data-direction="1" aria-label="Move action ${index + 1} down" ${index === decoyDraft.steps.length - 1 ? "disabled" : ""}>↓</button><button data-remove="${index}" aria-label="Remove action ${index + 1}" ${decoyDraft.steps.length === 1 ? "disabled" : ""}>×</button></div></div>`,
    )
    .join("");
  $("#decoy-repeats").value = decoyDraft.repeats;
  $("#decoy-add").disabled = decoyDraft.steps.length >= CONFIG.decoyMaxSteps;
  document.querySelectorAll("[data-step]").forEach(
    (el) =>
      (el.onchange = () => {
        const index = Number(el.dataset.step),
          field = el.dataset.field;
        if (field === "type") {
          const type = el.value;
          decoyDraft.steps[index] =
            type === "move"
              ? { type, speed: "walk" }
              : type === "look"
                ? { type, heading: 0, duration: 1 }
                : { type, duration: type === "wait" ? 1 : 0.4 };
          renderDecoyEditor();
        } else
          decoyDraft.steps[index][field] =
            field === "speed" ? el.value : Number(el.value);
      }),
  );
  document.querySelectorAll("[data-reorder]").forEach(
    (el) =>
      (el.onclick = () => {
        const a = Number(el.dataset.reorder),
          b = a + Number(el.dataset.direction);
        [decoyDraft.steps[a], decoyDraft.steps[b]] = [
          decoyDraft.steps[b],
          decoyDraft.steps[a],
        ];
        renderDecoyEditor();
      }),
  );
  document.querySelectorAll("[data-remove]").forEach(
    (el) =>
      (el.onclick = () => {
        decoyDraft.steps.splice(Number(el.dataset.remove), 1);
        renderDecoyEditor();
      }),
  );
}
function openDecoyEditor() {
  if (!state || state.phase !== "purchase" || state.me.ready) return;
  pauseGame();
  decoyDraft = structuredClone(state.me.decoyProgram || DEFAULT_DECOY_PROGRAM);
  $("#decoy-editor-error").textContent = "";
  visible("#test-decoy", state.solo);
  renderDecoyEditor();
  visible("#decoy-editor", true);
  focusModal();
}
$("#close-decoy-editor").onclick = () => visible("#decoy-editor", false);
const pips = (level, extra = "") =>
  `<span class="stat-pips ${extra}">${Array.from(
    { length: STAT_MAX },
    (_, i) => `<i class="${i < level ? "on" : ""}" data-pip="${i + 1}"></i>`,
  ).join("")}</span>`;
const upgradeMode = () => state.tuningMode === "upgrades";
const myBuilds = () =>
  activeBuilds(state.tuningMode, state.me.gadgetStats, state.me.upgrades);
// Each −/+ button previews the value it would set.
const stepButton = (key, def, step, label, value, disabled, extra = "") =>
  `<button data-stat-step="${step}" aria-label="${step > 0 ? "Raise" : "Lower"} ${def.name}${disabled ? "" : ` to ${value}`}" ${disabled ? "disabled" : ""}><span>${label}</span>${disabled ? "" : `<small>${value}</small>`}${extra}</button>`;
function renderStatEditor() {
  const kind = statDraft.kind,
    focusedRow = document.activeElement?.closest?.(".stat-row")?.dataset.stat,
    focusedStep = document.activeElement?.dataset.statStep;
  $("#stat-title").textContent = GADGETS[kind].name;
  if (upgradeMode()) renderUpgradeRows(kind);
  else renderTuningRows(kind);
  // Keep controller/keyboard focus on the same button after re-rendering.
  if (focusedRow && focusedStep)
    $(
      `#stat-rows [data-stat="${focusedRow}"] [data-stat-step="${focusedStep}"]:not([disabled])`,
    )?.focus();
}
function renderTuningRows(kind) {
  const levels = statDraft.levels,
    total = statTotal(levels);
  $("#stat-help").textContent =
    `Rate each stat from 1 to 5. Level 3 is standard issue. A gadget's levels can total at most ${STAT_BUDGET} points, so raising one stat usually means lowering another. Each button shows the value it would set. Tuning is private, applies to every unit of this gadget, and locks when you confirm your loadout.`;
  $("#stat-budget-label").textContent = "POINTS SPENT";
  $("#stat-points").textContent = `${total} / ${STAT_BUDGET}`;
  $("#stat-points").classList.toggle("full", total >= STAT_BUDGET);
  $("#stat-rows").innerHTML = Object.entries(GADGET_STATS[kind])
    .map(([key, def]) => {
      const level = levels[key];
      return `<div class="stat-row" data-stat="${key}" data-nav-row><div class="stat-name"><b>${def.name}</b><small>${formatStat(kind, key, level)}${level === 3 ? " · standard" : ` · standard ${formatStat(kind, key, 3)}`}</small></div>${stepButton(key, def, -1, "−", level > STAT_MIN && formatStat(kind, key, level - 1), level <= STAT_MIN)}${pips(level)}${stepButton(key, def, 1, "+", level < STAT_MAX && formatStat(kind, key, level + 1), level >= STAT_MAX || total >= STAT_BUDGET)}<span class="stat-level">${level}</span></div>`;
    })
    .join("");
  const setLevel = (key, level) => {
    const others = total - levels[key];
    level = Math.max(STAT_MIN, Math.min(STAT_MAX, level, STAT_BUDGET - others));
    if (level === levels[key]) return;
    levels[key] = level;
    renderStatEditor();
  };
  document.querySelectorAll("#stat-rows .stat-row").forEach((row) => {
    const key = row.dataset.stat;
    row
      .querySelectorAll("[data-stat-step]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            setLevel(key, levels[key] + Number(b.dataset.statStep))),
      );
    row
      .querySelectorAll("[data-pip]")
      .forEach(
        (pip) => (pip.onclick = () => setLevel(key, Number(pip.dataset.pip))),
      );
  });
}
function renderUpgradeRows(kind) {
  const me = state.me,
    owned = me.upgrades?.[kind] || {},
    hasGadget = me.inventory[kind] > 0,
    bought = Object.values(owned).reduce((a, n) => a + n, 0);
  $("#stat-help").textContent =
    `Every property starts at Normal. Buy upgrades one property at a time for ${UPGRADE_COST} CR each: ${UPGRADE_TOTAL} upgrades per gadget, on one property or split across two. Each button shows the value it would set. Upgrades apply to every unit of this gadget, are bought fresh each round, and lock when you confirm your loadout.${hasGadget ? "" : ` Buy a ${GADGETS[kind].name} first to add upgrades.`}`;
  $("#stat-budget-label").textContent =
    `UPGRADES BOUGHT · ${me.credits.toLocaleString()} CR AVAILABLE`;
  $("#stat-points").textContent = `${bought} / ${UPGRADE_TOTAL}`;
  $("#stat-points").classList.toggle("full", bought >= UPGRADE_TOTAL);
  $("#stat-rows").innerHTML = Object.entries(GADGET_STATS[kind])
    .map(([key, def]) => {
      const n = owned[key] || 0,
        level = 3 + n,
        spent = bought >= UPGRADE_TOTAL,
        canBuy =
          hasGadget && n < UPGRADE_MAX && !spent && me.credits >= UPGRADE_COST;
      return `<div class="stat-row upgrade-row" data-stat="${key}" data-nav-row><div class="stat-name"><b>${def.name}</b><small>${formatStat(kind, key, level)}${n ? ` · normal ${formatStat(kind, key, 3)}` : ""}</small></div><span class="upgrade-badge on">${n ? `+${n}` : ""}</span>${stepButton(key, def, -1, "SELL", n > 0 && formatStat(kind, key, level - 1), n === 0)}${stepButton(key, def, 1, n >= UPGRADE_MAX ? "MAX" : spent ? "LIMIT" : `+${n + 1}`, canBuy && formatStat(kind, key, level + 1), !canBuy, canBuy ? `<small class="cost">${UPGRADE_COST} CR</small>` : "")}</div>`;
    })
    .join("");
  document.querySelectorAll("#stat-rows .stat-row").forEach((row) =>
    row.querySelectorAll("[data-stat-step]").forEach(
      (b) =>
        (b.onclick = () =>
          send({
            type: Number(b.dataset.statStep) > 0 ? "upgrade" : "downgrade",
            gadget: kind,
            stat: row.dataset.stat,
          })),
    ),
  );
}
function openStatEditor(kind) {
  if (!state || state.phase !== "purchase" || state.me.ready) return;
  pauseGame();
  statDraft = {
    kind,
    levels: { ...defaultStats(kind), ...state.me.gadgetStats?.[kind] },
  };
  // Upgrades are bought immediately, so there is nothing to save.
  visible("#reset-stats", !upgradeMode());
  visible("#save-stats", !upgradeMode());
  visible("#test-stats", state.solo);
  visible("#stat-test-note", state.solo);
  $("#test-stats").textContent = upgradeMode()
    ? "PLAY TEST NOW ↗"
    : "SAVE & PLAY TEST NOW ↗";
  renderStatEditor();
  visible("#stat-editor", true);
  focusModal();
}
function saveStats(test = false) {
  if (!upgradeMode()) {
    const stats = validateStats(statDraft.kind, statDraft.levels);
    if (!stats) return;
    send({ type: "gadgetStats", gadget: statDraft.kind, stats });
  }
  visible("#stat-editor", false);
  if (test) send({ type: "debug", key: "gadgetTest", gadget: statDraft.kind });
}
$("#close-stat-editor").onclick = () => visible("#stat-editor", false);
$("#reset-stats").onclick = () => {
  statDraft.levels = defaultStats(statDraft.kind);
  renderStatEditor();
};
$("#save-stats").onclick = () => saveStats();
$("#test-stats").onclick = () => saveStats(true);
$("#decoy-repeats").onchange = (e) =>
  (decoyDraft.repeats = Number(e.target.value));
$("#decoy-add").onclick = () => {
  if (decoyDraft.steps.length >= CONFIG.decoyMaxSteps) return;
  const type = $("#decoy-add-type").value;
  decoyDraft.steps.push(
    type === "move"
      ? { type, speed: "walk" }
      : type === "look"
        ? { type, heading: 0, duration: 1 }
        : { type, duration: type === "wait" ? 1 : 0.4 },
  );
  renderDecoyEditor();
};
function saveDecoy(test = false) {
  const program = validateProgram(decoyDraft);
  if (!program) {
    $("#decoy-editor-error").textContent =
      "Check headings (0–359.9°), durations (0.1–30s), and repeats (1–5).";
    return;
  }
  send({ type: "decoyProgram", program });
  visible("#decoy-editor", false);
  if (test) send({ type: "debug", key: "decoyTest" });
}
$("#save-decoy").onclick = () => saveDecoy();
$("#test-decoy").onclick = () => saveDecoy(true);
$("#tuning-mode").onchange = (e) =>
  send({ type: "debug", key: "tuningMode", value: e.target.value });
$("#fast-start").onchange = (e) =>
  send({ type: "debug", key: "fastStart", value: e.target.checked });
const selectedAvatar = installAvatarPicker(() => input.padIndex);

function connect(create) {
  if (staticHosting && mode === "multi") {
    $("#home-error").textContent =
      "Private matches require the Mini Games server.";
    return;
  }
  audio.unlock();
  $("#home-error").textContent = "";
  $("#deploy").disabled = true;
  weaponRequests = 0;
  socket?.close();
  socket = staticHosting
    ? new LocalMatch()
    : new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`,
      );
  socket.addEventListener("open", () =>
    send({
      type: "join",
      avatar: selectedAvatar(),
      create,
      rule,
      botLevel,
      map: mapChoice,
      solo: mode === "solo",
      training: mode === "training" || mode === "freeroam",
      noBot: mode === "training" || mode === "freeroam",
      team: role,
      code: $("#room-code").value,
      // A URL quick start may open a map the menu doesn't offer.
      quickStart: !!quick,
      objective: quick ? quick.objective : objective,
      builderStart: quick?.point,
      // A map from the map builder goes along in full.
      custom:
        create && MAPS[mapChoice]?.custom ? MAPS[mapChoice].def : undefined,
    }),
  );
  socket.addEventListener("message", (ev) => {
    const data = JSON.parse(ev.data);
    if (data.type === "error") {
      $("#home-error").textContent = data.text;
      $("#deploy").disabled = false;
    }
    if (data.type === "joined") {
      // A map-builder map travels with the join: build it before its state.
      if (data.mapDef) registerCustomMap(data.mapDef);
      $("#connection-status").textContent = `SESSION ${data.code} / CONNECTED`;
      visible("#home", false);
      lastEvent = 0;
    }
    if (data.type === "state") {
      countdownBeeps(state, data);
      potatoSounds(state, data);
      wallRunSound(state, data);
      breakoutSounds(state, data);
      bouldersSounds(state, data);
      livewireSounds(state, data);
      state = data;
      kidWords(!!state.kid);
      // Breakout's course is built from its id, here as on the server.
      ensureBreakoutMap(state.map);
      ensureBouldersMap(state.map);
      if (state.map) world.setLevel(state.map, state.objectiveMode);
      if (lastPhase !== state.phase) {
        const from = lastPhase;
        lastPhase = state.phase;
        phaseChanged(from);
      }
      updateUI();
      softenScreen();
      quickStep();
      splashStep();
      partyReadyStep();
    }
  });
  socket.addEventListener("close", () => {
    if (state) {
      $("#connection-status").textContent =
        "CONNECTION LOST — RELOAD TO RECONNECT";
      document.exitPointerLock();
    }
    $("#deploy").disabled = false;
  });
  socket.addEventListener("error", () => {
    $("#home-error").textContent = staticHosting
      ? "Could not start this game. Reload to try again."
      : "Server unavailable. Run npm start and open localhost:3000.";
    $("#deploy").disabled = false;
  });
}
if (staticHosting) $('[data-mode="multi"]').remove();
document.querySelectorAll("[data-mode]").forEach(
  (b) =>
    (b.onclick = () => {
      mode = b.dataset.mode;
      document
        .querySelectorAll("[data-mode]")
        .forEach((x) => x.classList.toggle("selected", x === b));
      document
        .querySelectorAll("[data-mode]")
        .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      visible("#join-row", mode === "multi" && !launchers[menuGame]);
      showBotStep();
      updateSummary();
      // Choosing how you're playing moves on to the game selection.
      showScreen("game");
    }),
);
// The rules choice, remembered in this browser. Splash is the kid-friendly
// game.
function pickRule(next) {
  rule = next;
  document.querySelectorAll("[data-rule]").forEach((x) => {
    x.classList.toggle("selected", x.dataset.rule === rule);
    x.setAttribute("aria-pressed", String(x.dataset.rule === rule));
  });
  saveRules();
  updateSummary();
}
function saveRules() {
  try {
    localStorage.setItem(
      "minigames.rules",
      JSON.stringify({ rule, objective }),
    );
  } catch {}
}
// Keep the selected objective synchronized with the game mode.
function pickObjective(next) {
  objective = next;
  document.querySelectorAll("[data-objective]").forEach((x) => {
    x.classList.toggle("selected", x.dataset.objective === objective);
    x.setAttribute("aria-pressed", String(x.dataset.objective === objective));
  });
  saveRules();
  updateSummary();
}
// Available game modes.
const GAMES = {
  splash: { rule: "splash", objective: "extract", name: "Splash" },
  hotpotato: {
    rule: "soak",
    objective: "hotpotato",
    name: "Hot Potato",
    party: true,
  },
  breakout: {
    rule: "soak",
    objective: "breakout",
    name: "Breakout",
    party: true,
  },
  boulders: {
    rule: "soak",
    objective: "boulders",
    name: "Boulder Dash",
    party: true,
  },
  sprinklers: {
    rule: "soak",
    objective: "sprinklers",
    name: "Sprinkler Dodge",
    party: true,
  },
  livewire: {
    rule: "soak",
    objective: "livewire",
    name: "Beach Ball Dodge",
    party: true,
  },
};
// What each side does in a party game: [Sentinel's, Infiltrator's].
const PARTY_VERBS = {
  breakout: ["watch", "run"],
};
// Hot Potato's halves of the court, by side.
const courtHalf = (team) => (team === "defender" ? "red" : "blue");
let game = "splash";
// Standalone games (Slipstream, Paper Plane Pitch…) open their own overlay.
// Choosing one on the menu only selects it; Start opens it. Each id maps to
// the opener its install function set as the menu entry's click handler.
const launchers = {};
// The game chosen on the menu: a server game (also `game`) or a standalone.
let menuGame = "splash";
// Read before the server-game restore below overwrites it.
let savedGame = null;
try {
  savedGame = localStorage.getItem("minigames.game");
} catch {}
function pickGame(next) {
  if (launchers[next]) menuGame = next;
  else {
    game = menuGame = GAMES[next] ? next : "splash";
    pickObjective(GAMES[game].objective);
    pickRule(GAMES[game].rule);
  }
  document.querySelectorAll("[data-game]").forEach((x) => {
    x.classList.toggle("selected", x.dataset.game === menuGame);
    x.setAttribute("aria-pressed", String(x.dataset.game === menuGame));
  });
  try {
    localStorage.setItem("minigames.game", menuGame);
  } catch {}
  visible("#join-row", mode === "multi" && !launchers[menuGame]);
  updateSummary();
}
// Backyard Hide & Seek words (shared/kidWords.js): every text on screen,
// in every game, says Sneaker, Seeker, cookie jar and so on instead of the
// spy words the game code uses. Kid-friendly matches also say things more
// gently (soften). The gadget names and descriptions, too.
const plainGadgets = Object.fromEntries(
  Object.entries(GADGETS).map(([k, g]) => [k, [g.name, g.description]]),
);
let kidOn = null;
const words = (text) => backyard(kidOn ? soften(text) : text);
function kidWords(on) {
  if (on === kidOn) return;
  kidOn = on;
  for (const [k, [name, description]] of Object.entries(plainGadgets))
    Object.assign(GADGETS[k], {
      name: words(name),
      description: words(description),
    });
  softenScreen();
}
const SKIP_TEXT = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT"]);
function softenNode(node) {
  if (node.softened === node.nodeValue) return;
  if (SKIP_TEXT.has(node.parentNode?.nodeName)) return;
  const soft = words(node.nodeValue);
  if (soft !== node.nodeValue) node.nodeValue = soft;
  node.softened = soft;
}
function softenScreen(root = document.body) {
  if (root.nodeType === Node.TEXT_NODE) return softenNode(root);
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walk.nextNode(); node; node = walk.nextNode())
    softenNode(node);
}
kidWords(false);
// New and changed text is reworded as it appears, before it's drawn.
new MutationObserver((changes) => {
  for (const c of changes)
    if (c.type === "characterData") softenNode(c.target);
    else for (const n of c.addedNodes) softenScreen(n);
}).observe(document.body, {
  subtree: true,
  childList: true,
  characterData: true,
});
// Difficulty is shared by all games and picked on the first menu screen.
function showBotStep() {
  visible("#bot-step", true);
}
document.querySelectorAll("[data-bot-level]").forEach(
  (b) =>
    (b.onclick = () => {
      botLevel = b.dataset.botLevel;
      document.querySelectorAll("[data-bot-level]").forEach((x) => {
        x.classList.toggle("selected", x === b);
        x.setAttribute("aria-pressed", String(x === b));
      });
      updateSummary();
    }),
);
document.querySelectorAll("[data-rule]").forEach(
  (b) =>
    (b.onclick = () => {
      pickRule(b.dataset.rule);
    }),
);
document
  .querySelectorAll("[data-objective]")
  .forEach((b) => (b.onclick = () => pickObjective(b.dataset.objective)));
document
  .querySelectorAll("[data-game]")
  .forEach((b) => (b.onclick = () => pickGame(b.dataset.game)));
// The Field Manual's "ways in" follow the map being played or picked.
let describedMap = null;
function describeMap(id) {
  const map = MAPS[id];
  if (!map || id === describedMap) return;
  describedMap = id;
  const n = map.approaches.filter(([name]) => name.includes("·")).length;
  $("#manual-ways").textContent =
    `${["", "One", "Two", "Three", "Four"][n] || n} ways in`;
  $("#manual-approaches").innerHTML = map.approaches
    .map(([name, text]) => `<b>${name}:</b> ${text}`)
    .join("<br>");
}
// The selected map also becomes the home screen's flyover.
function showMap(id) {
  world.setLevel(id);
  describeMap(id);
  updateSummary();
}
// A map's thumbnail; a map without one (a Map Builder map) gets a
// blueprint tile.
function mapThumb(id, domId) {
  const url = MAP_THUMBS[id],
    attr = domId ? ` id="${domId}"` : "";
  return url
    ? `<span class="map-thumb"${attr}><img src="${url}" alt="" draggable="false"></span>`
    : `<span class="map-thumb blueprint"${attr}><b>${MAPS[id]?.custom ? "CUSTOM" : "NO PREVIEW"}</b></span>`;
}
// One line saying what Start will do, e.g. "Solo · Infiltrator · Seen · Pier 9".
function updateSummary() {
  const summary = $("#menu-summary");
  if (!summary) return;
  const character = CHARACTERS[selectedAvatar().character]?.name;
  if (launchers[menuGame]) {
    const name = document.querySelector(
      `[data-game="${menuGame}"] strong`,
    )?.textContent;
    $("#deploy").innerHTML = `START ${icon("arrow")}`;
    summary.textContent = [
      name,
      `${botLevel === "normal" ? "Medium" : botLevel[0].toUpperCase() + botLevel.slice(1)} difficulty`,
      character,
    ]
      .filter(Boolean)
      .join(" · ");
    return;
  }
  $("#deploy").innerHTML =
    `${{ solo: "START", multi: "HOST A MATCH", training: "START PRACTICE", freeroam: "START PRACTICE" }[mode]} ${icon("arrow")}`;
  summary.textContent = [
    {
      solo: "Against AI",
      multi: "With Friends",
      training: "Practice",
      freeroam: "Free Roam",
    }[mode],
    GAMES[game]?.rule === rule && GAMES[game].objective === objective
      ? GAMES[game].name
      : [
          rule[0].toUpperCase() + rule.slice(1),
          objective === "plant" && "Plant",
        ]
          .filter(Boolean)
          .join(" · "),
    mode === "solo" &&
      `${botLevel[0].toUpperCase() + botLevel.slice(1)} opponent`,
    game === "sprinklers"
      ? MAPS.yard.name
      : game === "hotpotato"
        ? MAPS.court.name
        : game === "breakout"
          ? "A new course each game"
          : game === "boulders"
            ? "A new channel each race"
            : game === "livewire"
              ? MAPS.crucible.name
              : MAPS[mapChoice]?.name,
    character,
  ]
    .filter(Boolean)
    .join(" · ");
}
document.addEventListener("avatarchange", updateSummary);
showMap(mapChoice);
try {
  const saved = JSON.parse(localStorage.getItem("minigames.rules") || "null");
  // Removed or unrecognized saved modes fall back to Splash.
  pickGame(
    saved?.rule === "splash"
      ? "splash"
      : GAMES[saved?.objective]?.party
        ? saved.objective
        : "splash",
  );
} catch {
  pickGame("splash");
}
$("#deploy").onclick = () => {
  if (launchers[menuGame]) {
    launchers[menuGame]();
    return;
  }
  role = Math.random() < 0.5 ? "attacker" : "defender";
  connect(true);
};
// The home menu is three screens, one after another: how you're playing
// (with difficulty), then the game, then your character and Start. Back,
// Escape and the controller's B step back one screen.
const SCREENS = ["mode", "game", "character"];
const MODE_NAMES = {
  solo: "Against AI",
  multi: "With Friends",
  training: "Practice",
  freeroam: "Free Roam",
};
// The game screen shows the finished games, or (behind its Work in Progress
// button) the ones still being built. Set up with the game picker below.
let setGameView = () => {};
function showScreen(name) {
  const home = $("#home");
  // Coming forward from how you're playing always starts on the main games.
  if (name === "game" && home.dataset.screen === "mode") setGameView("main");
  home.dataset.screen = name;
  closeDropdowns();
  $("#screen-crumb").textContent = [
    MODE_NAMES[mode],
    name === "character" &&
      $(`#home [data-game="${menuGame}"] strong`)?.textContent,
  ]
    .filter(Boolean)
    .join(" · ")
    .toUpperCase();
  home.scrollTop = 0;
  const target =
    name === "mode"
      ? $("#home [data-mode].selected")
      : name === "game"
        ? (() => {
            const shown = [
              ...document.querySelectorAll("#home [data-game]"),
            ].filter((el) => !el.hidden);
            return (
              shown.find((el) => el.classList.contains("selected")) || shown[0]
            );
          })()
        : $('#home .headshot[aria-pressed="true"]');
  target?.focus({ preventScroll: true });
}
function menuBack() {
  if ($("#home").hidden) return false;
  const i = SCREENS.indexOf($("#home").dataset.screen);
  if (i <= 0) return false;
  // Work in Progress steps back to the main game list first.
  if (SCREENS[i] === "game" && $("#home").dataset.gameView === "wip") {
    setGameView("main", true);
    return true;
  }
  showScreen(SCREENS[i - 1]);
  return true;
}
$("#menu-back").onclick = menuBack;
// Each home menu step is a dropdown: a button showing the current choice that
// opens the list of options. The options are the same buttons as before, so
// their handlers and the URL quick start work unchanged.
function closeDropdowns(except) {
  document.querySelectorAll(".dropdown.open").forEach((box) => {
    if (box === except) return;
    box.classList.remove("open", "up");
    box
      .querySelector(".dropdown-trigger")
      .setAttribute("aria-expanded", "false");
  });
}
// Register standalone games before capturing the popup options.
installSlipstream(() => botLevel, selectedAvatar);
installMemory(() => botLevel);
installToyBox(() => botLevel);
installRoofCatch(selectedAvatar);
installBackyardAirMail(selectedAvatar);
installPondFishing(() => botLevel, selectedAvatar);
installTargetBlaster(() => botLevel);
installRiverCrossing(() => botLevel, selectedAvatar);
installRacetrack();
installAppleCatch(() => botLevel, selectedAvatar);
installPoolNoodle(() => botLevel, selectedAvatar);
installBackyardFlier(() => botLevel, selectedAvatar);
installPipeCrane(() => botLevel, selectedAvatar);
installFoodFinder(() => botLevel);
installPerchHop(() => botLevel, selectedAvatar);
installAcornDrop(() => botLevel, selectedAvatar);
installPerfectPizza(() => botLevel, selectedAvatar);
installLeafPiles(() => botLevel, selectedAvatar);
installBackyardFling(() => botLevel, selectedAvatar);
installPaperPlane(() => botLevel);
installBigBadBurger(() => botLevel);
installShooAway(() => botLevel, selectedAvatar);
installCometDash(() => botLevel, selectedAvatar);
installKickabout(() => botLevel, selectedAvatar);
installPopPatrol(() => botLevel, selectedAvatar);
// Picking a standalone game selects it; Start opens it (see `launchers`).
document.querySelectorAll("#home [data-game]").forEach((entry) => {
  if (GAMES[entry.dataset.game] || !entry.onclick) return;
  const open = entry.onclick.bind(entry);
  launchers[entry.dataset.game] = () => open();
  entry.onclick = () => pickGame(entry.dataset.game);
});
if (launchers[savedGame]) pickGame(savedGame);

for (const list of document.querySelectorAll("#home .choice-row")) {
  if (list.getAttribute("aria-label") === "How you're playing") continue;
  if (list.getAttribute("aria-label") === "Game") {
    // Screen 2: every game as a card, with the rules of the one under the
    // pointer or focus beside them.
    const options = [...list.querySelectorAll(".choice")];
    const picker = document.createElement("div");
    picker.id = "game-picker";
    picker.className = "game-picker";
    picker.setAttribute("role", "region");
    picker.setAttribute("aria-labelledby", "game-picker-title");
    picker.innerHTML = `<div class="game-picker-head"><div><div class="step-label"><b>02</b> GAME</div><h2 id="game-picker-title">Choose your game.</h2></div><div data-nav-row><button class="secondary game-wip-toggle" id="game-wip-toggle"></button></div></div><div class="game-picker-body"><aside class="game-rules" aria-live="polite"><div class="eyebrow">THE RULES</div><h3></h3><p></p><span class="micro">Select a game to play.</span></aside><div class="game-options"></div></div>`;
    list.before(picker);
    picker.querySelector(".game-options").append(list);
    const gameMaps = {
      hotpotato: "court",
      livewire: "crucible",
      sprinklers: "yard",
    };
    const wipGames = new Set([
      "splash",
      "hotpotato",
      "livewire",
      "toybox",
      "backyardairmail",
      "poolnoodle",
      "applecatch",
      "foodfinder",
      "backyardfling",
      "paperplane",
    ]);
    options.sort(
      (a, b) =>
        Number(wipGames.has(a.dataset.game)) -
        Number(wipGames.has(b.dataset.game)),
    );
    list.append(...options);
    const finished = options.filter((o) => !wipGames.has(o.dataset.game));
    options.forEach((option) => {
      const isWip = wipGames.has(option.dataset.game),
        index = isWip
          ? options.indexOf(option) - finished.length
          : options.indexOf(option);
      const ground = gameMaps[option.dataset.game] || ENABLED_MAPS[0];
      if (!option.querySelector(".map-thumb"))
        option.insertAdjacentHTML(
          "afterbegin",
          option.dataset.game === "toybox"
            ? `<span class="map-thumb toybox-preview" aria-hidden="true"><span>🧸 🚀 🦆</span><b>✥</b><span>🚗 🦕 ⚽</span></span>`
            : option.dataset.game === "sprinklers"
              ? `<span class="map-thumb"><img src="${sprinklerDodgePreview}" alt="Sprinkler Dodge live gameplay: a penguin in a sunny green backyard surrounded by hedges and white fences" draggable="false"></span>`
              : option.dataset.game === "memory"
                ? `<span class="map-thumb"><img src="${fireflyRecallPreview}" alt="Firefly Recall live gameplay: colored fireflies around a backyard campfire beside a tent" draggable="false"></span>`
                : option.dataset.game === "slipstream"
                  ? `<span class="map-thumb"><img src="${slipstreamPreview}" alt="Slipstream live gameplay: a fox and three chicks lined up on a grassy hill with slip n slides and mudpiles ahead" draggable="false"></span>`
                  : option.dataset.game === "livewire"
                    ? `<span class="map-thumb"><img src="${beachBallDodgePreview}" alt="Beach Ball Dodge live gameplay: a red panda on an inflatable float in a backyard pool, a beach ball flying across the water" draggable="false"></span>`
                    : option.dataset.game === "breakout"
                      ? `<span class="map-thumb"><img src="${breakoutPreview}" alt="Breakout gameplay: a baby running a three-lane orchard course with log hurdles" draggable="false"></span>`
                      : option.dataset.game === "boulders"
                        ? `<span class="map-thumb"><img src="${boulderDashPreview}" alt="Boulder Dash live gameplay: a giraffe facing a watermelon rolling down the channel" draggable="false"></span>`
                        : MAP_THUMBS[ground]
                          ? mapThumb(ground)
                          : `<span class="map-thumb game-arena">${icon("flag", 36)}<b>DEDICATED ARENA</b></span>`,
        );
      option.insertAdjacentHTML(
        "beforeend",
        `<span class="game-card-number">${String(index + 1).padStart(2, "0")} / PLAY${isWip ? ' <span class="game-wip-badge">WIP</span>' : ""}</span>`,
      );
    });
    list.removeAttribute("data-nav-choice");
    list.setAttribute("data-nav-row", "");
    const preview = (option) => {
      picker.querySelector("h3").textContent =
        option.querySelector("strong").textContent;
      picker.querySelector(".game-rules p").textContent =
        option.querySelector("small").textContent;
      options.forEach((o) => o.classList.toggle("previewed", o === option));
    };
    // Main view: the finished games. WIP view: only the games still being
    // built. The toggle button in the header switches between them.
    const toggle = picker.querySelector("#game-wip-toggle");
    setGameView = (view, focus = false) => {
      const wip = view === "wip";
      $("#home").dataset.gameView = wip ? "wip" : "main";
      options.forEach((o) => (o.hidden = wipGames.has(o.dataset.game) !== wip));
      picker.querySelector("#game-picker-title").textContent = wip
        ? "Work in progress."
        : "Choose your game.";
      toggle.textContent = wip ? "← ALL GAMES" : "WORK IN PROGRESS →";
      toggle.setAttribute(
        "aria-label",
        wip ? "Back to all games" : "Show games that are still being built",
      );
      const shown = options.filter((o) => !o.hidden),
        pick = shown.find((o) => o.classList.contains("selected")) || shown[0];
      if (pick) preview(pick);
      if (focus) pick?.focus({ preventScroll: true });
      $("#home").scrollTop = 0;
    };
    toggle.onclick = () =>
      setGameView($("#home").dataset.gameView === "wip" ? "main" : "wip", true);
    setGameView("main");
    options.forEach((o) => {
      o.addEventListener("pointerenter", () => preview(o));
      o.addEventListener("focus", () => preview(o));
      // Choosing a game moves on to the character selection.
      o.addEventListener("click", () => showScreen("character"));
    });
    continue;
  }
  const box = document.createElement("div"),
    trigger = document.createElement("button"),
    options = [...list.querySelectorAll(".choice")];
  box.className = "dropdown";
  trigger.className = "dropdown-trigger";
  trigger.setAttribute("aria-haspopup", "true");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", list.getAttribute("aria-label"));
  list.before(box);
  box.append(trigger, list);
  // Options are reached by opening the list, one per controller row.
  list.removeAttribute("data-nav-row");
  list.removeAttribute("data-nav-choice");
  list.classList.add("dropdown-list");
  const selected = () =>
    options.find((o) => o.classList.contains("selected")) || options[0];
  const show = () => {
    const pick = selected();
    trigger.innerHTML = `${pick.querySelector("svg")?.outerHTML ?? ""}<span><strong>${pick.querySelector("strong").textContent}</strong><small>${pick.querySelector("small")?.textContent ?? ""}</small></span>${icon("chevron", 16)}`;
  };
  show();
  new MutationObserver(show).observe(list, {
    subtree: true,
    attributeFilter: ["class"],
  });
  const open = () => {
    closeDropdowns(box);
    box.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    // Open upward when the list would run off the bottom of the screen.
    box.classList.toggle(
      "up",
      list.getBoundingClientRect().bottom > innerHeight - 8,
    );
    selected().focus();
  };
  trigger.onclick = () =>
    box.classList.contains("open") ? closeDropdowns() : open();
  // Left/right on a closed dropdown steps through its options.
  trigger.cycle = (direction) => {
    const usable = options.filter((o) => !o.disabled),
      i = usable.indexOf(selected());
    usable[(i + direction + usable.length) % usable.length]?.click();
  };
  options.forEach((o) =>
    o.addEventListener("click", () => {
      closeDropdowns();
      trigger.focus();
    }),
  );
  box.addEventListener("focusout", (e) => {
    if (!box.contains(e.relatedTarget)) closeDropdowns();
  });
}
document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest?.(".dropdown")) closeDropdowns();
});
document.addEventListener("keydown", (e) => {
  const box = document.querySelector(".dropdown.open");
  if (e.key !== "Escape" || !box) return;
  // Only the list closes; the menu doesn't also step back a screen.
  e.stopImmediatePropagation();
  closeDropdowns();
  box.querySelector(".dropdown-trigger").focus();
});
// URL quick start (dev testing; see src/launch.js): skip the menu, fill the
// kit, confirm it and walk straight into the arena.
let quick = null;
function quickStep() {
  if (!quick || !state?.me) return;
  if (state.phase === "purchase" && !quick.kitSent) {
    quick.kitSent = true;
    // From the map builder: training takes every gadget; solo skips the
    // preparation phase.
    if (quick.fill && state.training)
      send({ type: "trainingStock", fill: "all" });
    if (quick.fast && state.solo && !state.training)
      send({ type: "debug", key: "fastStart", value: true });
    for (const [gadget, count] of Object.entries(quick.kit))
      if (state.training) {
        if (gadget !== baseOf(gadget)) send({ type: "selectType", gadget });
        send({ type: "trainingStock", gadget, count });
      } else for (let i = 0; i < count; i++) send({ type: "buy", gadget });
    send({ type: "ready" });
  }
  if (["prep", "active"].includes(state.phase) && !quick.entered) {
    quick.entered = true;
    enterArena();
  }
}
{
  const launch = parseLaunch(location.search);
  if (launch?.unknown.length)
    console.warn(`Quick start ignored: ${launch.unknown.join(", ")}`);
  if (staticHosting && launch?.mode === "multi") {
    $("#home-error").textContent =
      "Private matches require the Mini Games server.";
  } else if (launch?.mode) {
    quick = launch;
    mode = launch.mode;
    role = launch.team;
    rule = launch.rule;
    botLevel = launch.botLevel;
    if (launch.map) showMap((mapChoice = launch.map));
    connect(true);
  }
}
// Dev: ?thumbs (or ?thumbs=docks,relay) captures the map picker's
// thumbnails, each map's flyover at its first frame, and saves them to
// src/assets/maps/.
if (!staticHosting && new URLSearchParams(location.search).has("thumbs"))
  captureThumbs();
async function captureThumbs() {
  const only = new URLSearchParams(location.search).get("thumbs"),
    ids = only
      ? only.split(",").filter((id) => ENABLED_MAPS.includes(id))
      : ENABLED_MAPS;
  // Give fonts and sign textures a moment to arrive.
  await new Promise((done) => setTimeout(done, 1500));
  const shots = {};
  for (const id of ids) shots[id] = world.snapshot(id);
  showMap(mapChoice);
  const res = await fetch("/__thumbs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(shots),
    }),
    text = res.ok
      ? `saved ${(await res.json()).saved.join(", ") || "nothing"}`
      : `failed (${res.status})`;
  console.info(`[thumbs] ${text}`);
  $("#home-error").textContent = `THUMBNAILS ${text.toUpperCase()}`;
}
$("#join").onclick = () => connect(false);
// Splash skips the loadout screen: the server hands out every gadget, so
// confirm it and go straight in.
let splashReadied = false;
function splashStep() {
  if (state?.phase !== "purchase" || state.rule !== "splash") {
    splashReadied = false;
    return;
  }
  if (splashReadied || state.me?.ready) return;
  splashReadied = true;
  readyAt = performance.now();
  send({ type: "ready" });
}
// These games provide their own equipment. Ready on every new round, including
// Practice and replay; a hosted game waits in the overhead view for a friend.
let partyReadied = false;
function partyReadyStep() {
  if (!skipsBackpack(state?.party?.kind) || state.phase !== "purchase") {
    partyReadied = false;
    return;
  }
  if (partyReadied || state.me?.ready) return;
  partyReadied = true;
  readyAt = performance.now();
  send({ type: "ready" });
}
// Confirming the loadout is a click, which is what grabbing the mouse
// needs: if the round follows right away (training, solo), go straight in.
let readyAt = -Infinity;
$("#ready").onclick = () => {
  readyAt = performance.now();
  send({ type: "ready" });
};
$("#lock-overlay [data-pause-home]").onclick = () =>
  location.assign(location.pathname);
$("#lock-overlay [data-pause-restart]").onclick = () =>
  send({ type: "restart" });
$("#restart").onclick = $("#results [data-pause-restart]").onclick = () =>
  send({ type: "restart" });
$("#results-home").onclick = $("#results [data-pause-home]").onclick = $(
  "#lock-overlay [data-pause-home]",
).onclick;
$("#dev-reset").onclick = () => send({ type: "restart" });
$("#switch-team").onclick = () => send({ type: "switch" });
$("#swap-sides").onclick = () => send({ type: "debug", key: "swapSides" });
$("#copy-code").onclick = async () => {
  try {
    await navigator.clipboard.writeText(state.code);
    $("#copy-code").textContent = "COPIED";
  } catch {
    $("#copy-code").textContent = state.code;
  }
};
// The map builder: open from the menu; Test / Play start a match on the map.
const builder = createBuilder({
  allowHosting: !staticHosting,
  gameWorld: world,
  controls: () => input.config,
  audio,
  onPlay(def, kind, team, point) {
    mapChoice = registerCustomMap(def);
    document.querySelector(`[data-mode="${kind}"]`)?.click();
    role = team === "defender" ? "defender" : "attacker";
    builder.close();
    // Play now (training, solo): straight into the map, as a URL quick
    // start does, with no loadout screen or preparation. Hosting a match
    // goes through the loadout as usual.
    if (kind !== "multi")
      quick = {
        mode: kind,
        team,
        kit: {},
        unknown: [],
        fill: true,
        fast: true,
        point,
      };
    connect(true);
  },
  onClose() {
    visible("#home", true);
    updateSummary();
  },
});
$("#menu-builder").onclick = () => {
  visible("#home", false);
  builder.open();
};
// Back from a custom map to the builder: start fresh (the builder keeps
// your map) and reopen it.
function returnToEditor() {
  try {
    sessionStorage.setItem("minigames.openBuilder", "1");
  } catch {}
  location.reload();
}
$("#return-editor").onclick = returnToEditor;
$("#results-editor").onclick = returnToEditor;
try {
  if (sessionStorage.getItem("minigames.openBuilder")) {
    sessionStorage.removeItem("minigames.openBuilder");
    $("#menu-builder").click();
  }
} catch {}
function showManual() {
  controlsEnabled = false;
  lockState();
  document.exitPointerLock();
  visible("#manual", true);
}
$("#help-button").onclick = showManual;
$("#menu-manual").onclick = showManual;
$("#manual-ingame").onclick = showManual;
$("#training-loadout").onclick = () => send({ type: "restart" });
document
  .querySelectorAll("[data-fill]")
  .forEach(
    (b) =>
      (b.onclick = () => send({ type: "trainingStock", fill: b.dataset.fill })),
  );
$("#pause-controls").onclick = () => showControls();
$("#close-manual").onclick = () => visible("#manual", false);
function toggleDev() {
  visible("#dev-panel", $("#dev-panel").hidden);
  if (!$("#dev-panel").hidden) {
    controlsEnabled = false;
    lockState();
    document.exitPointerLock();
  }
}
$("#close-dev").onclick = toggleDev;
$("#show-geometry").onchange = (e) => (localDebug = e.target.checked);
$("#show-warning").onchange = (e) => (scanWarning = e.target.checked);
$("#sound-enabled").onchange = (e) => (audio.enabled = e.target.checked);
document
  .querySelectorAll("[data-debug]")
  .forEach(
    (b) => (b.onclick = () => send({ type: "debug", key: b.dataset.debug })),
  );
$("#set-time").onclick = () =>
  send({ type: "debug", key: "time", value: Number($("#debug-time").value) });
function phaseChanged(from) {
  world.resize();
  const p = state.phase;
  roaming = false;
  const directEntry = skipsBackpack(state.party?.kind);
  visible("#purchase", p === "purchase" && !directEntry);
  visible(
    "#hud",
    ["prep", "active"].includes(p) || (directEntry && p === "purchase"),
  );
  visible("#results", p === "results");
  visible("#lock-overlay", false);
  lastInventory = "";
  keys.clear();
  input.clear();
  stance.reset();
  controlsEnabled = p === "active" && controlsEnabled;
  if (["purchase", "results"].includes(p)) document.exitPointerLock();
  // Entering the arena (training skips prep): face the way the server
  // spawned you.
  if (p === "prep" || (p === "active" && from !== "prep")) {
    view = { yaw: state.me.yaw, pitch: state.me.pitch };
    world.camera.position.set(state.me.x, 1.65, state.me.z);
  }
  if (["prep", "active"].includes(p)) {
    // Straight in after confirming the loadout, if that was a moment ago
    // (otherwise, e.g. after waiting for a second player, click to enter).
    if (
      directEntry ||
      (from === "purchase" && performance.now() - readyAt < 3000)
    )
      enterArena();
    else lockState();
  }
  if (p === "results") {
    const final = !state.result?.party || state.result.final;
    $("#results").classList.toggle("game-results", final);
    $("#results .game-pause-bar").hidden = !final;
    $("#results .game-pause-name").textContent = arenaGameName();
    const restart = $("#results [data-pause-restart]");
    restart.disabled = !state.canRestart;
    restart.title = restart.disabled
      ? "Only the host can restart the match."
      : "Restart";
  }
  if (p === "results" && state.result?.party) partyResults();
  else if (p === "results") {
    $("#restart").innerHTML = `PLAY AGAIN ${icon("arrow")}`;
    const r = state.result,
      won = r.winner === state.me?.team;
    $("#results .result-card").classList.toggle("won", won);
    $("#results .result-card").classList.toggle("lost", !won);
    $("#result-verdict").textContent =
      `${arenaGameName().toUpperCase()} · FINAL`;
    $("#winner").textContent = won ? "You win." : "You lose.";
    $("#result-side").textContent =
      r.winner === "attacker" ? "Infiltrators prevail." : "Sentinels prevail.";
    $("#reason").textContent = r.reason;
    $("#result-icon").innerHTML = resultTrophy;
    $("#result-stats").innerHTML =
      `<div><strong>${formatTime(r.remaining)}</strong><small>TIME REMAINING</small></div><div><strong>${r.equipment}</strong><small>DEVICES USED</small></div><div><strong>${state.rule === "removed" ? r.captures : r.detections}</strong><small>${state.rule === "removed" ? "CAPTURES" : wetRule(state.rule) ? "SOAKED" : "DETECTIONS"}</small></div><div><strong>${r.traps}</strong><small>WIRES CROSSED</small></div>`;
  }
  visible("#solo-tools", state.solo);
  visible("#swap-sides", !!state.training);
  $("#debug-restriction").textContent = state.solo
    ? "Solo sandbox. Debug changes are server validated."
    : "Multiplayer: gameplay cheats disabled. Host may reset the round.";
}
// A party game's line at the top of the screen.
function partyGoal(me) {
  const party = state.party,
    sweep = party.kind === "sweep",
    hider = me.team === "defender";
  if (party.kind === "lightsout") return lightsGoal(me);
  if (party.kind === "hotpotato") return potatoGoal(me);
  if (party.kind === "breakout") return breakoutGoal(me);
  if (party.kind === "boulders") return bouldersGoal(me);
  if (party.kind === "sprinklers") {
    const r = party.sprinklers;
    return r
      ? `WAVE ${r.wave} · ${r.runners[me.id]?.wet ? "SOAKED!" : "STAY DRY"} · ${r.heads.length} SPRINKLERS`
      : "GET READY TO DODGE";
  }
  if (party.kind === "livewire") return livewireGoal();
  if (state.phase === "purchase")
    return hider && !sweep
      ? `BUY TRAPS FOR THE WAY TO TERMINAL ${partySite()}`
      : "CONFIRM YOUR BACKPACK";
  if (state.phase === "prep")
    return hider
      ? sweep
        ? `HIDE YOUR DEVICES · ${Object.values(me.inventory).reduce((a, b) => a + (b || 0), 0)} LEFT`
        : `TRAP THE WAY TO TERMINAL ${partySite()}`
      : sweep
        ? "HOLD IN STAGING · THEY'RE HIDING DEVICES"
        : "HOLD IN STAGING · THEY'RE SETTING TRAPS";
  if (sweep)
    return hider
      ? `THEY'VE FOUND ${party.found} OF ${party.total}`
      : `FIND AND SHOOT THE BUGS · ${party.found} OF ${party.total} FOUND`;
  const run = `${formatTime(party.elapsed)}${party.caught ? ` +${party.caught * PARTY.gauntlet.wirePenalty} S` : ""}`;
  return hider
    ? `THEIR RUN · ${run} · ${party.caught} WIRE${party.caught === 1 ? "" : "S"}`
    : `REACH TERMINAL ${partySite()} AND EXTRACT · ${run}`;
}
// Breakout's line: how far along.
function breakoutGoal(me) {
  const run = state.party.run,
    watching = me.team === "defender";
  if (state.phase === "purchase")
    return watching ? "THEY RUN · CONFIRM TO WATCH" : "CONFIRM TO START";
  if (state.phase === "prep")
    return watching ? "WATCHING THEIR RUN · GET READY" : "GET READY TO RUN";
  if (!run) return "RUN";
  const far = Math.max(0, Math.round(run.best - run.startS));
  return `${watching ? "THEIR RUN" : "HOW FAR CAN YOU GO?"} · ${far} M`;
}
function livewireGoal() {
  if (state.phase === "purchase") return `WAITING FOR A FRIEND · ${state.code}`;
  if (state.phase === "prep") return "GET READY TO DODGE";
  return "STAY ON THE FLOAT";
}
// Boulder Dash's line: how high you are, and how high they are.
function bouldersGoal(me) {
  const race = state.party.race,
    foe = state.party.scores.find((s) => !s.you),
    them = foe?.bot ? "BOT" : "THEM";
  if (state.phase === "purchase") return "ONE RACE · CONFIRM TO START";
  if (state.phase === "prep") return "GET READY TO CLIMB";
  if (!race) return "CLIMB";
  const mine = race.climbers[me.id],
    theirs = race.climbers[foe?.id],
    all = Math.round(race.finishS),
    m = (c) => Math.max(0, Math.floor(c?.best || 0));
  return `REACH THE TOP · YOU ${m(mine)} M · ${them} ${m(theirs)} M OF ${all}`;
}
// Hot Potato's line: the score, and what to do right now.
function potatoGoal(me) {
  const party = state.party,
    wins = (id) => party.wins?.[id] || 0,
    foe = party.scores.find((s) => !s.you),
    score = `ROUND ${party.half} · YOU ${wins(me.id)} – ${wins(foe?.id)} ${foe?.bot ? "BOT" : "THEM"}`;
  if (state.phase === "purchase")
    return `FIRST TO ${PARTY.hotpotato.toWin} ROUNDS · CONFIRM TO START`;
  if (state.phase === "prep") return `${score} · GET READY`;
  const holding = party.grenades?.some((g) => g.holder === me.id),
    ticking = party.beep ? " · TOO TOASTY!" : "";
  return holding
    ? `${score} · TOSS THE POTATO ACROSS${ticking}`
    : `${score} · WALK OVER THE POTATO TO PICK IT UP${ticking}`;
}
// Lights Out's line: where to go, and when the lights next come on.
function lightsGoal(me) {
  const guard = me.team === "defender";
  if (state.phase === "purchase") return "CONFIRM YOUR BACKPACK";
  if (state.phase === "prep")
    return guard
      ? "THE LIGHTS ARE GOING OUT"
      : "HOLD IN STAGING · LIGHTS OUT SOON";
  const lit = lightsPulse(lightsClock) > 0,
    next = `${lit ? "LIGHTS ON" : `PULSE IN ${Math.ceil(nextPulse(lightsClock))} S`}`;
  return guard
    ? `LISTEN FOR THEM · GUARD TERMINAL ${partySite()} · ${next}`
    : `REACH TERMINAL ${partySite()} AND EXTRACT · ${next}`;
}
// The result screen after each half of a party game: half-time, then who
// won, with both players' results.
function partyResults() {
  if (state.party.kind === "hotpotato") return potatoResults();
  const r = state.result,
    party = state.party,
    me = state.me,
    won = r.final && r.winnerId === me?.id,
    lost = r.final && r.winnerId && r.winnerId !== me?.id;
  $("#results .result-card").classList.toggle("won", won);
  $("#results .result-card").classList.toggle("lost", !!lost);
  $("#result-verdict").textContent = r.final
    ? `${party.name.toUpperCase()} · FINAL`
    : `${party.name.toUpperCase()} · HALF-TIME`;
  $("#winner").textContent =
    party.kind === "breakout" ||
    (["livewire", "sprinklers"].includes(party.kind) && state.noBot)
      ? "Nice run!"
      : !r.final
        ? "Swap sides."
        : won
          ? "You win."
          : lost
            ? "You lose."
            : "It's a tie.";
  // You hid or built this half, so you sweep or run next (and the other
  // way round).
  const next = me?.team === "defender" ? "you" : "they";
  $("#result-side").textContent = !r.final
    ? `Now ${next} ${PARTY_VERBS[party.kind][1]}.`
    : "";
  $("#reason").textContent = r.reason;
  $("#result-icon").innerHTML = r.final
    ? resultTrophy
    : icon(
        won
          ? "trophy"
          : lost
            ? "cross"
            : party.kind === "sweep"
              ? "eye"
              : "flag",
        56,
      );
  $("#result-stats").innerHTML = party.scores
    // Breakout is one run: only the runner has a result.
    .filter((s) => party.kind !== "breakout" || s.played)
    .map(
      (s) =>
        `<div><strong>${s.text}</strong><small>${s.you ? "YOU" : s.bot ? "BOT" : "OPPONENT"}${s.played ? "" : " · NOT YET"}</small></div>`,
    )
    .join("");
  $("#restart").innerHTML = r.final
    ? `PLAY AGAIN ${icon("arrow")}`
    : `SWAP SIDES ${icon("arrow")}`;
}
// Hot Potato's result screen after each round: who it went off on, the
// score, and after the last round who won.
function potatoResults() {
  const r = state.result,
    party = state.party,
    me = state.me,
    won = r.winnerId === me?.id,
    lost = !!r.winnerId && !won,
    wins = (id) => party.wins?.[id] || 0,
    foe = party.scores.find((s) => !s.you);
  $("#results .result-card").classList.toggle("won", won);
  $("#results .result-card").classList.toggle("lost", lost);
  $("#result-verdict").textContent = r.final
    ? `${party.name.toUpperCase()} · FINAL`
    : `${party.name.toUpperCase()} · ROUND ${party.half}`;
  $("#winner").textContent = r.final
    ? won
      ? "You win."
      : "Too toasty! Play again?"
    : won
      ? "Round to you."
      : "Round to them.";
  $("#result-side").textContent = r.final
    ? ""
    : `Next: round ${party.half + 1}. First to ${PARTY.hotpotato.toWin}.`;
  const yours = r.loser === me?.id;
  $("#reason").textContent = r.inHand
    ? `The potato sneezed confetti in ${yours ? "your" : "their"} hand.`
    : r.onLine
      ? `The potato sneezed confetti on the centre line, nearer ${yours ? "you" : "them"}.`
      : `The potato sneezed confetti on ${yours ? "your" : "their"} half.`;
  $("#result-icon").innerHTML = r.final
    ? resultTrophy
    : icon(won ? "trophy" : "cross", 56);
  $("#result-stats").innerHTML = [
    [wins(me?.id), "YOU"],
    [wins(foe?.id), foe?.bot ? "BOT" : "OPPONENT"],
  ]
    .map(
      ([n, who]) =>
        `<div><strong>${n} round${n === 1 ? "" : "s"}</strong><small>${who}</small></div>`,
    )
    .join("");
  $("#restart").innerHTML = r.final
    ? `PLAY AGAIN ${icon("arrow")}`
    : `NEXT ROUND ${icon("arrow")}`;
}
function formatTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}
// The loadout screen: gadget cards grouped by what they're for, a detail
// panel for the selected one (types, upgrades, decoy program) and a summary
// of what you've packed.
const CARD_GROUPS = [
  ["Concealment", ["smoke", "cloak"]],
  ["Traps", ["tripwire", "shutter"]],
  ["Recon & surveillance", ["camera", "sensor", "pulse", "scanner"]],
  ["Countermeasures", ["jammer", "disarm", "flashbang"]],
  ["Deception", ["noisemaker", "actorDecoy"]],
];
const typesOf = (base) => variantsOf(base).filter((k) => usable(k));
const shownType = (me, base) => {
  const types = typesOf(base);
  return types.includes(me.loadoutTypes?.[base])
    ? me.loadoutTypes[base]
    : types[0];
};
const ownedOf = (me, base) =>
  typesOf(base).reduce((sum, k) => sum + (me.inventory[k] || 0), 0);
const priceLabel = (g) => (state.training ? "FREE" : `${g.cost} CR`);
function stepper(me, id) {
  const g = GADGETS[id],
    n = me.inventory[id] || 0,
    full = n >= g.limit || me.ready;
  // A party kit is handed out, not bought.
  if (partyLocked())
    return `<div class="quantity"><button disabled aria-label="Kit item">−</button><span>${n}<small> / ${g.limit}</small></span><button disabled aria-label="Kit item">+</button></div>`;
  return state.training
    ? `<div class="quantity"><button data-stock="${id}" data-step="-1" aria-label="Carry fewer ${g.name}" ${!n || me.ready ? "disabled" : ""}>−</button><span>${n}<small> / ${g.limit}</small></span><button data-stock="${id}" data-step="1" aria-label="Carry more ${g.name}" ${full ? "disabled" : ""}>+</button></div>`
    : `<div class="quantity"><button data-refund="${id}" aria-label="Refund ${g.name}" ${!n || me.ready ? "disabled" : ""}>−</button><span>${n}<small> / ${g.limit}</small></span><button data-buy="${id}" aria-label="Buy ${g.name}" ${full || me.credits < g.cost ? "disabled" : ""}>+</button></div>`;
}
// A selector for the focused control, so focus survives a re-render.
function focusKey() {
  const el = document.activeElement,
    zone = el?.closest?.("#gadget-grid, #gadget-detail, #loadout-list");
  if (!zone || !Object.keys(el.dataset).length) return null;
  return `#${zone.id} ${Object.entries(el.dataset)
    .map(
      ([k, v]) =>
        `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${v}"]`,
    )
    .join("")}`;
}
function renderLoadout(me) {
  const key = focusKey(),
    card = document.activeElement?.closest?.("[data-card]")?.dataset.card,
    bases = [
      ...new Set(
        Object.keys(GADGETS)
          .filter((k) => usable(k))
          .map(baseOf),
      ),
    ],
    grouped = CARD_GROUPS.flat(2),
    groups = [
      ...CARD_GROUPS,
      ["Other", bases.filter((b) => !grouped.includes(b))],
    ]
      .map(([label, list]) => [label, list.filter((b) => bases.includes(b))])
      .filter(([, list]) => list.length);
  if (!bases.includes(detailBase))
    detailBase = bases.find((b) => ownedOf(me, b)) || groups[0]?.[1][0];
  // Nothing to carry at all (Lights Out's intruder).
  if (!bases.length) {
    $("#gadget-grid").innerHTML = `<p class="empty">${
      state.party?.kind === "livewire"
        ? "Nothing to carry. Just jump."
        : state.party?.kind === "boulders"
          ? "Nothing to carry. Just climb."
          : state.party?.kind === "breakout"
            ? me.team === "defender"
              ? "Nothing to carry: you're watching this one from the booth."
              : "Nothing to carry. Just run."
            : "No gadgets this time: just you, your feet and the dark."
    }</p>`;
    $("#loadout-list").innerHTML = `<li class="empty">Nothing to pack.</li>`;
    $("#gadget-detail").innerHTML = "";
    return;
  }
  $("#gadget-grid").innerHTML = groups
    .map(
      ([label, list]) =>
        `<section class="card-group"><div class="section-label">${label.toUpperCase()}</div><div class="card-grid" role="list" data-nav-row>${list
          .map((base) => {
            const types = typesOf(base),
              id = shownType(me, base),
              g = GADGETS[id],
              owned = ownedOf(me, base),
              side =
                state.training && g.team !== "both"
                  ? ` · ${g.team === "attacker" ? "INFILTRATOR" : "SENTINEL"}`
                  : "";
            return `<article class="gadget-card ${owned ? "owned" : ""} ${base === detailBase ? "active" : ""}" role="listitem" data-card="${base}"><button class="card-main" data-detail="${base}" aria-label="${g.name}, ${priceLabel(g)}${owned ? `, ${owned} packed` : ""}"><span class="card-top">${icon(base, 26)}${owned ? `<b class="card-count">×${owned}</b>` : ""}</span><strong>${g.name}</strong><small class="card-meta">${priceLabel(g)}${types.length > 1 ? ` · ${types.length} TYPES` : ""}${side}</small><span class="card-line">${g.description.split(/(?<=\.)\s/)[0]}</span></button>${stepper(me, id)}</article>`;
          })
          .join("")}</div></section>`,
    )
    .join("");
  const packed = Object.keys(GADGETS).filter(
    (k) => usable(k) && me.inventory[k] > 0,
  );
  $("#loadout-list").innerHTML = packed.length
    ? packed
        .map((k) => {
          const ups = Object.entries(me.upgrades?.[k] || {})
            .filter(([, n]) => n && upgradeMode())
            .map(([stat, n]) => `+${n} ${GADGET_STATS[k][stat].name}`)
            .join(" · ");
          return `<li><button data-pick="${k}">${icon(baseOf(k), 18)}<span>${GADGETS[k].name}${ups ? `<small>${ups.toUpperCase()}</small>` : ""}</span><b>×${me.inventory[k]}</b></button></li>`;
        })
        .join("")
    : `<li class="empty">Nothing packed yet. Pick a gadget, then press + to add it.</li>`;
  renderDetail(me);
  wireShop($("#gadget-grid"));
  wireShop($("#loadout-list"));
  const target = key && $(key);
  if (target && !target.disabled) target.focus({ preventScroll: true });
  else if (key)
    $(`#gadget-grid [data-detail="${card || detailBase}"]`)?.focus({
      preventScroll: true,
    });
}
function showDetail(base) {
  if (base === detailBase) return;
  detailBase = base;
  document
    .querySelectorAll(".gadget-card")
    .forEach((c) => c.classList.toggle("active", c.dataset.card === base));
  renderDetail(state.me);
}
function renderDetail(me) {
  const base = detailBase,
    types = typesOf(base),
    id = shownType(me, base),
    g = GADGETS[id],
    lock = me.ready ? "disabled" : "";
  let specs;
  if (id === "actorDecoy")
    specs = `<div class="detail-label">PROGRAM</div><p class="decoy-summary">${(me.decoyProgram?.steps || []).map((a) => DECOY_ACTIONS[a.type]).join(" → ")}</p><button data-program-decoy class="tune-button" ${lock}>PROGRAM ↗</button>`;
  else if (isTunable(id) && upgradeMode()) {
    const owned = me.upgrades?.[id] || {},
      bought = Object.values(owned).reduce((a, n) => a + n, 0),
      has = me.inventory[id] > 0;
    specs = `<div class="detail-label">UPGRADES <span>${bought} / ${UPGRADE_TOTAL}</span></div>${Object.entries(
      GADGET_STATS[id],
    )
      .map(([key, def]) => {
        const n = owned[key] || 0,
          level = 3 + n,
          canBuy =
            has &&
            !me.ready &&
            n < UPGRADE_MAX &&
            bought < UPGRADE_TOTAL &&
            me.credits >= UPGRADE_COST;
        return `<div class="upgrade-line" data-nav-row><div class="upgrade-name"><b>${def.name}</b><small>${formatStat(id, key, level)}${n < UPGRADE_MAX ? ` → ${formatStat(id, key, level + 1)}` : " · MAX"}</small></div>${pips(level, "small")}<button data-down="${key}" aria-label="Sell ${def.name} upgrade" ${n && !me.ready ? "" : "disabled"}>−</button><button data-up="${key}" aria-label="Upgrade ${def.name}" ${canBuy ? "" : "disabled"}>${n >= UPGRADE_MAX ? "MAX" : bought >= UPGRADE_TOTAL ? "LIMIT" : `+1 · ${UPGRADE_COST} CR`}</button></div>`;
      })
      .join(
        "",
      )}<p class="detail-note">${has ? `Up to ${UPGRADE_TOTAL} upgrades, on one property or split. They apply to every unit and are bought fresh each round.` : `Pack one to upgrade it.`}</p>`;
  } else if (isTunable(id))
    specs = `<div class="detail-label">TUNING <span>${statTotal({ ...defaultStats(id), ...me.gadgetStats?.[id] })} / ${STAT_BUDGET}</span></div><div class="stat-summary">${Object.entries(
      GADGET_STATS[id],
    )
      .map(([key, def]) => {
        const level = statLevel(me.gadgetStats, id, key);
        return `<span>${def.name}</span><span class="stat-value ${level !== 3 ? "on" : ""}">${formatStat(id, key, level)}</span>`;
      })
      .join(
        "",
      )}</div><button data-tune="${id}" class="tune-button" ${lock}>TUNE ↗</button>`;
  else if (isDecoy(id))
    specs = `<p class="detail-note">Uses your ${GADGETS[statKind(id)].name} stats.</p>`;
  else specs = `<p class="detail-note">Fixed spec. No upgrades.</p>`;
  const box = $("#gadget-detail");
  box.innerHTML = `<div class="detail-head">${icon(base, 34)}<div><small>${(GADGETS[base] || g).category.toUpperCase()}</small><h3>${g.name}</h3></div></div>${
    types.length > 1
      ? `<div class="type-picker" role="group" aria-label="${GADGETS[base].name} type" data-nav-row>${types
          .map(
            (k) =>
              `<button data-type="${k}" class="${k === id ? "selected" : ""}" aria-pressed="${k === id}" ${lock}>${TYPE_LABELS[typeOf(k)]}</button>`,
          )
          .join("")}</div>`
      : ""
  }<p class="detail-text">${g.description}</p><div class="detail-buy" data-nav-row><strong class="gadget-cost">${state.training ? "FREE" : `${g.cost}<small> CR</small>`}</strong>${stepper(me, id)}</div>${specs}`;
  wireShop(box);
}
// Handlers for every loadout control inside root.
function wireShop(root) {
  const me = state.me,
    on = (attr, fn) =>
      root.querySelectorAll(`[${attr}]`).forEach((b) => (b.onclick = fn(b)));
  on("data-detail", (b) => () => showDetail(b.dataset.detail));
  // Moving focus onto a card (with the D-pad, say) shows it in the panel.
  root
    .querySelectorAll("[data-card]")
    .forEach((c) =>
      c.addEventListener("focusin", () => showDetail(c.dataset.card)),
    );
  on("data-pick", (b) => () => {
    const id = b.dataset.pick;
    if (shownType(me, baseOf(id)) !== id && !me.ready)
      send({ type: "selectType", gadget: id });
    showDetail(baseOf(id));
  });
  on(
    "data-type",
    (b) => () => send({ type: "selectType", gadget: b.dataset.type }),
  );
  on("data-buy", (b) => () => send({ type: "buy", gadget: b.dataset.buy }));
  on(
    "data-refund",
    (b) => () => send({ type: "refund", gadget: b.dataset.refund }),
  );
  on(
    "data-stock",
    (b) => () =>
      send({
        type: "trainingStock",
        gadget: b.dataset.stock,
        count: (me.inventory[b.dataset.stock] || 0) + +b.dataset.step,
      }),
  );
  const id = shownType(me, detailBase);
  on(
    "data-up",
    (b) => () => send({ type: "upgrade", gadget: id, stat: b.dataset.up }),
  );
  on(
    "data-down",
    (b) => () => send({ type: "downgrade", gadget: id, stat: b.dataset.down }),
  );
  on("data-tune", (b) => () => openStatEditor(b.dataset.tune));
  on("data-program-decoy", () => openDecoyEditor);
}
// Light up the current stance; the panel pulses whenever it changes.
function showStance(me) {
  const stance = me.wallRun
      ? "wallrun"
      : me.slide
        ? "slide"
        : me.noise === "sprint" && !me.crouch && !me.prone
          ? "sprint"
          : me.prone
            ? "prone"
            : me.crouch
              ? "crouch"
              : "stand",
    box = $("#stance");
  box.hidden = state?.party?.kind === "boulders";
  if (box.dataset.stance === stance) return;
  box.dataset.stance = stance;
  box
    .querySelectorAll("[data-stance-icon]")
    .forEach((i) => i.classList.toggle("on", i.dataset.stanceIcon === stance));
  $("#stance-label").textContent = STANCES[stance][0];
  box.classList.remove("changed");
  void box.offsetWidth;
  box.classList.add("changed");
}
// Menu music plays on menus and on through preparation, then fades out over
// its last 10 seconds, reaching silence as the round starts. In play it's
// silent. (In steps of 2%, so the fade isn't rescheduled every frame.)
function musicLevel() {
  if (document.hidden) return 0;
  if (state?.phase === "prep" && !state.training)
    return Math.round(Math.min(1, Math.max(0, state.time / 10)) * 50) / 50;
  return inArena() ? 0 : 1;
}
// Beep as the preparation clock crosses 10 and 5…1 seconds, and once
// more (longest) when it runs out and the round starts.
const COUNTDOWN_MARKS = [10, 5, 4, 3, 2, 1];
// Your own feet hitting a wall (others hear a wall run as sprinting).
function wallRunSound(before, after) {
  if (after.me?.wallRun && !before?.me?.wallRun) audio.wallRun();
}
// Breakout: a thud and a bang when you trip on a hurdle.
function breakoutSounds(before, after) {
  const was = before?.party?.run,
    now = after.party?.kind === "breakout" ? after.party.run : null;
  if (!now || !was) return;
  if (now.tripped && !was.tripped) {
    audio.tone(70, 0.25, 0, 0.12);
    audio.bang();
  }
}
// Breakout on screen: whose run you're watching, the hurdles cleared and
// how far along the course they are.
function breakoutHud() {
  const on =
      state?.party?.kind === "breakout" &&
      ["prep", "active"].includes(state.phase),
    run = on ? state.party.run : null;
  // Watching: the other player's run, from the same camera behind them.
  world.watch =
    on && state.me?.team === "defender"
      ? state.players.find((p) => p.team === "attacker") || null
      : null;
  document.body.classList.toggle("breakout", on);
  $("#chase").hidden = !on;
  $("#chase-veil").style.opacity = 0;
  if (!on) return;
  const far = run ? Math.max(0, run.best - run.startS) : 0;
  $("#chase-who").textContent = world.watch ? "WATCHING" : "BREAKOUT";
  $("#chase-gap").textContent = run
    ? `${run.cleared} PASSED`
    : "JUMP LOGS · DODGE HAY";
  $("#chase-run").textContent = `${Math.round(far)} M`;
}
// Beach Ball Dodge: a rising hum as each bot lifts a ball, a boing when one
// hits you, a splash when someone goes into the pool.
function livewireSounds(before, after) {
  const was = before?.party?.run,
    now = after.party?.kind === "livewire" ? after.party.run : null;
  if (!now || !was) return;
  const seen = new Set(was.wires.map((w) => w.id));
  if (now.wires.some((w) => !seen.has(w.id))) audio.tone(220, 0.35, 0, 0.05);
  const me = after.me?.id;
  for (const [id, r] of Object.entries(now.runners)) {
    const old = was.runners[id];
    if (!old) continue;
    if (r.trips > old.trips) {
      audio.tone(id === me ? 520 : 400, 0.12, 0, id === me ? 0.12 : 0.05);
      if (id === me) audio.tone(740, 0.09, 0, 0.06);
    }
    if (r.fell && !old.fell) {
      audio.noise(0, 0.12, 1.2, "lowpass", 900, 120);
      audio.tone(70, 0.8, 0, 0.12);
    }
  }
}
// Beach Ball Dodge on screen: the wave and both players' hits, a red flash
// when you're hit, and the whoosh of each ball on its way, louder the
// closer it is to you.
let lwTrips = 0,
  lwFlash = 0,
  lwHum = 0;
function livewireHud(dt) {
  const on =
      state?.party?.kind === "livewire" &&
      ["purchase", "prep", "active", "results"].includes(state.phase),
    run = on ? state.party.run : null;
  document.body.classList.toggle("livewire", on);
  $("#livewire").hidden = !on || state.phase === "results";
  if (!on) {
    lwTrips = 0;
    return;
  }
  // Seen from a fixed camera to the south: you always face north, so WASD
  // moves you up, left, down and right on screen.
  view.yaw = 0;
  view.pitch = 0;
  const me = state.me,
    foe = state.players.find((p) => p.id !== me.id),
    row = (sel, r, who) => {
      const el = $(sel);
      el.classList.toggle("out", !!r?.fell);
      el.querySelector("span").textContent = who;
      el.querySelector("b").textContent = r?.fell
        ? "SPLASHED!"
        : `${r?.trips || 0} BUMP${r?.trips === 1 ? "" : "S"}`;
    };
  $("#lw-wave").textContent = String(run?.wave || 1);
  $("#lw-time").textContent = formatTime(run?.runners[me.id]?.time || 0);
  row("#lw-you", run?.runners[me.id], "YOU");
  $("#lw-them").hidden = !foe;
  if (foe) row("#lw-them", run?.runners[foe.id], foe.bot ? "BOT" : "THEM");
  const trips = run?.runners[me.id]?.trips || 0;
  if (trips > lwTrips) lwFlash = 1;
  lwTrips = trips;
  lwFlash = Math.max(0, lwFlash - dt * 1.5);
  $("#chase-veil").style.opacity = String(lwFlash);
  // The nearest wire on its way to you hums, faster as it closes in.
  lwHum -= dt;
  if (!run || state.phase !== "active" || lwHum > 0) return;
  const t = run.t,
    near = run.wires
      .map((w) => ({
        w,
        gap: ((w.axis === "z" ? me.z : me.x) - wireAt(w, t)) * w.dir,
      }))
      .filter(
        (n) =>
          n.gap > 0 &&
          n.w.launch <= t &&
          Math.abs((n.w.axis === "z" ? me.x : me.z) - n.w.lane) < 1.2,
      )
      .sort((a, b) => a.gap - b.gap)[0];
  if (near) {
    audio.tone(
      160 + 220 / Math.max(1, near.gap),
      0.06,
      0,
      Math.min(0.06, 0.25 / near.gap),
    );
    lwHum = Math.max(0.08, Math.min(0.5, near.gap / 12));
  }
}
// Boulder Dash: a grinding rumble as each one comes out of the portal, a
// crunch when one flattens you, a thud as one breaks up at the foot.
function bouldersSounds(before, after) {
  const was = before?.party?.race,
    now = after.party?.kind === "boulders" ? after.party.race : null;
  if (!now || !was) return;
  if (now.released > was.released) {
    audio.noise(0, 0.09, 1.4, "lowpass", 260, 70);
    audio.tone(42, 0.9, 0, 0.06);
  }
  const me = after.me?.id;
  if ((now.climbers[me]?.hits || 0) > (was.climbers[me]?.hits || 0)) {
    audio.bang();
    audio.tone(48, 0.5, 0, 0.14);
  }
  const gone = was.boulders.filter(
    (b) => !now.boulders.some((q) => q.id === b.id),
  );
  if (gone.length) audio.noise(0, 0.06, 0.6, "lowpass", 180, 60);
}
// Boulder Dash on screen: the climb bar (you and them, up to the top), the
// warning for the next boulder coming at you (which lane, how soon), the
// rumble of the nearest one and a red flash when one flattens you.
let rumbleStep = 0,
  climbHits = 0,
  flatFlash = 0;
function bouldersHud(dt) {
  const on =
      state?.party?.kind === "boulders" &&
      ["prep", "active"].includes(state.phase),
    race = on ? state.party.race : null,
    map = MAPS[state?.map];
  document.body.classList.toggle("boulders", on);
  $("#climb").hidden = !on;
  if (!on || !map?.boulders) {
    $("#boulder-warn").hidden = true;
    if (state?.party?.kind === "boulders") $("#chase-veil").style.opacity = 0;
    climbHits = 0;
    return;
  }
  const me = state.me,
    mine = race?.climbers[me.id],
    foe = state.players.find((p) => p.id !== me.id),
    theirs = race?.climbers[foe?.id],
    top = map.finishS,
    pct = (c) => `${(1 - Math.min(1, Math.max(0, c?.s || 0) / top)) * 100}%`;
  $("#climb-you").style.top = pct(mine || { s: 0 });
  $("#climb-them").style.top = pct(theirs || { s: 0 });
  $("#climb-them").classList.toggle("bot", !!foe?.bot);
  $("#climb-height").textContent = `${Math.max(0, Math.floor(mine?.s || 0))} M`;
  $("#climb-of").textContent = `OF ${Math.round(top)}`;
  const hits = mine?.hits || 0;
  $("#climb-hits").textContent = `${hits} HIT${hits === 1 ? "" : "S"}`;
  if (hits > climbHits) flatFlash = 1;
  climbHits = hits;
  flatFlash = Math.max(0, flatFlash - dt * 1.2);
  $("#chase-veil").style.opacity = String(flatFlash);
  // The next one coming at you: the nearest above you that would hit your
  // side of the channel.
  const s = me ? sOf(map, me.z) : 0,
    inNook = Math.abs(me?.x || 0) > WIDTH / 2 + 0.1,
    incoming = (race?.boulders || [])
      .filter((b) => b.s > s - b.r && !mine?.done)
      .map((b) => ({ b, eta: Math.max(0, (b.s - s - b.r) / Math.max(1, b.v)) }))
      .sort((a, b) => a.eta - b.eta)[0];
  const warn = !!incoming && incoming.eta < 6;
  $("#boulder-warn").hidden = !warn;
  if (warn) {
    const { b, eta } = incoming,
      // Facing up the channel, west is on your left.
      lane = b.half ? (b.half < 0 ? "LEFT SIDE" : "RIGHT SIDE") : "FULL WIDTH";
    $("#boulder-warn").dataset.lane = b.half
      ? b.half < 0
        ? "left"
        : "right"
      : "full";
    $("#boulder-warn").classList.toggle("near", eta < 2.5);
    $("#boulder-warn").classList.toggle("safe", s < 0 || (inNook && !b.half));
    $("#boulder-text").textContent =
      `${b.half ? "WATERMELON" : "PUMPKIN"} · ${lane} · ${eta < 0.5 ? "NOW" : `${eta.toFixed(1)} S`}`;
  }
  // Its rumble, from where it is, louder as it comes.
  rumbleStep -= dt;
  if (incoming && rumbleStep <= 0 && state.phase === "active") {
    const d = Math.max(1, incoming.b.s - s);
    audio.noise(
      0,
      Math.max(0.01, Math.min(0.12, 2.2 / d)),
      0.32,
      "lowpass",
      140,
      60,
    );
    rumbleStep = 0.22;
  }
}
// Hot Potato: the live grenade beeps for its last seconds, faster as it
// gets close, and everyone hears it go off.
function potatoSounds(before, after) {
  const was = before?.party,
    now = after.party;
  if (now?.kind !== "hotpotato") return;
  if (now.boom && !was?.boom) {
    audio.tone(523, 0.18, 0, 0.08);
    audio.tone(659, 0.22, 0.12, 0.08);
    audio.tone(784, 0.25, 0.24, 0.08);
  }
  if (now.beepLeft === null || now.beepLeft === undefined) return;
  const step = now.beepLeft < 2 ? 0.25 : 0.5,
    before_ = was?.beepLeft ?? Infinity;
  if (Math.floor(before_ / step) !== Math.floor(now.beepLeft / step))
    audio.tone(now.beepLeft < 2 ? 784 : 659, 0.07, 0, 0.07);
}
function countdownBeeps(before, after) {
  if (!before || after.training) return;
  if (before.phase === "prep" && after.phase === "active")
    return audio.countdown(0);
  if (before.phase !== "prep" || after.phase !== "prep") return;
  const mark = COUNTDOWN_MARKS.find((m) => before.time > m && after.time <= m);
  if (mark) audio.countdown(mark);
}
function updateUI() {
  // Observe off-screen feeds too, so switching cameras does not restart the cycle.
  for (const camera of state.gadgets)
    if (camera.kind === "camera" && camera.active)
      feedClocks.sample(camera.id, camera.jammed);
  const me = state.me;
  if (!me) return;
  const teamName = me.team === "attacker" ? "INFILTRATOR" : "SENTINEL";
  $("#loadout-label").textContent =
    `OPERATION ${state.code} / ${state.rule.toUpperCase()}${state.kid ? " · KID-FRIENDLY MATCH" : ""}`;
  $("#credits").textContent = me.credits.toLocaleString();
  // The footer stays pinned while the list scrolls, so credits live there too.
  $("#footer-credits").textContent = state.training
    ? ""
    : `${me.credits.toLocaleString()} CR AVAILABLE`;
  $("#session-code").textContent = state.code;
  $("#purchase-description").textContent = state.training
    ? `PRACTICE · ${wetRule(state.rule) ? `Water balloons: unlimited, ${CONFIG.splashHits} splashes soak. ` : ""}Every gadget from both roles, free. Pick how many of each to carry (none, a few, or all); what you use refills to that count. Tune them here, then enter the range. No timer, and being ${state.rule === "removed" ? "captured" : "identified"} never ends the session.`
    : `${state.rule === "removed" ? "REMOVED · Automatic capture within " + CONFIG.captureDistance + " m." : state.rule === "soak" ? `SOAK · Unlimited water balloons; ${CONFIG.splashHits} splashes and you're out.` : state.rule === "splash" ? `SPLASH · Unlimited water balloons; ${CONFIG.splashHits} splashes and you're soaked.` : "SEEN · 3 continuous seconds of direct sight."} Your purchases are private.`;
  $("#purchase-title").textContent = "Pack your bag";
  visible("#credits-block", !state.training || state.tuningMode === "upgrades");
  visible("#training-loadout", !!state.training && state.rule !== "splash");
  // Playing a map from the map builder: a way straight back to it.
  const custom = !!MAPS[state.map]?.custom;
  visible("#return-editor", custom);
  visible("#results-editor", custom);
  visible("#shop-privacy", !state.training);
  visible("#training-fill", !!state.training);
  visible("#room-label", !state.solo && !state.training);
  $("#hud").classList.toggle("training", !!state.training);
  const spent = Math.max(0, CONFIG.credits - me.credits);
  $("#credit-spent").style.width = `${(spent / CONFIG.credits) * 100}%`;
  // Training's credits only pay for upgrades, from a bottomless pool.
  visible(".credit-bar", !state.training && !partyLocked());
  visible("#credit-note", !state.training && !partyLocked());
  $("#credit-note").textContent =
    `${spent.toLocaleString()} SPENT OF ${CONFIG.credits.toLocaleString()}`;
  $("#role-chip").innerHTML = state.party
    ? state.party.kind === "sprinklers"
      ? `<b>STAY DRY</b><span>SPRINKLER DODGE · LAST DRY PLAYER WINS</span><small>Run around the yard in third person. Yellow circles mark where sprinkler heads are rising. Leave the circle before it turns blue and sprays! Heads retract after each burst. Every 15 seconds more pop up together. Any spray soaks you, even while jumping. WASD / left stick to move, the camera stays fixed above the yard. Move fast by default. No gadgets.</small>`
      : state.party.kind === "livewire"
        ? `${icon("flag", 15)}<b>${partyRole()}</b><span>${state.party.name.toUpperCase()} · ONE RUN · LAST ONE STANDING</span><small>Welcome to Beach Ball Dodge! Bots around the pool throw beach balls straight across it, up and down or side to side. When a bot lifts a ball, its path lights up on the float: step out of it. A hit bumps you along, and off the float is a splash-out! Every ${PARTY.livewire.waveSeconds} s brings a new wave. Last one dry wins; splash together and fewer bumps wins. Use WASD or the left stick to move. Practice lets you play on your own.</small>`
        : state.party.kind === "boulders"
          ? `${icon("flag", 15)}<b>${partyRole()}</b><span>${state.party.name.toUpperCase()} · ONE RACE · ${PARTY.boulders.raceSeconds} S</span><small>You both climb the same steep channel at once, and boulders keep rolling down it. A pumpkin fills the channel: get into one of the recesses in the walls before it reaches you, then dash for the next. A watermelon rolls down one side only: step to the other. A hit flattens you and puts you back in the last recess you reached. First to the top wins; if nobody makes it in ${PARTY.boulders.raceSeconds} s, the higher climb does.</small>`
          : state.party.kind === "breakout"
            ? `${icon(me.team === "attacker" ? "flag" : "eye", 15)}<b>${partyRole()}</b><span>${state.party.name.toUpperCase()} · ONE RUN · AS FAR AS YOU CAN</span><small>${
                me.team === "attacker"
                  ? `You run on your own: press left or right to switch between the three lanes. Logs are low: jump them. Hay bales are stacked too tall to jump: switch to an open lane. Run into one and your run is over. How far can you go?`
                  : `You watch their run through their eyes from a booth.`
              }</small>`
            : state.party.kind === "hotpotato"
              ? `${icon(me.team === "attacker" ? "flag" : "eye", 15)}<b>${partyRole()}</b><span>${state.party.name.toUpperCase()} · ROUND ${state.party.half} · FIRST TO ${PARTY.hotpotato.toWin}</span><small>One silly potato waits on the centre line. Stay on your (${courtHalf(me.team)}) half. Walk over it to pick it up, then press throw to toss it across. The landing circle helps you aim. When it wiggles and chimes, it's getting toasty! If it sneezes confetti in your hand or on your half, the other player gets a point. Bumps never stop you moving. First to ${PARTY.hotpotato.toWin} rounds wins.</small>`
              : `${icon(me.team === "attacker" ? "flag" : "eye", 15)}<b>${partyRole()}</b><span>${state.party.name.toUpperCase()} · HALF ${state.party.half} OF 2 · ${(MAPS[state.map]?.name || "").toUpperCase()}</span><small>${
                  state.party.kind === "lightsout"
                    ? me.team === "defender"
                      ? `Your screen stays dark apart from a flash every ${PARTY.lightsout.pulseEvery} s. Listen for footsteps and stop them before they extract Terminal ${partySite()}. One splash catches them; throws give you away.`
                      : `They can't see you, but they can hear you. Reach Terminal ${partySite()} and extract within ${PARTY.lightsout.runSeconds} s. Crouch or crawl to go quietly, and stay out of sight when the lights flash.`
                    : state.party.kind === "sweep"
                      ? me.team === "defender"
                        ? `Hide these devices during the ${CONFIG.prepSeconds} s preparation. Every one they don't splash in ${PARTY.sweep.seekSeconds} s counts for you.`
                        : `Wait in staging while they hide devices. Then you have ${PARTY.sweep.seekSeconds} s: find each one and splash it with a water balloon. They never run out.`
                      : me.team === "defender"
                        ? `Spend your credits on traps and set them up between staging and Terminal ${partySite()} during preparation. The slower their run, the better.`
                        : `Race to Terminal ${partySite()} and extract. Every wire that catches you adds ${PARTY.gauntlet.wirePenalty} s. Scan for wires; disarm or jump them.`
                } Then you swap sides.</small>`
    : `${icon(me.team === "attacker" ? "flag" : "eye", 15)}<b>${state.training ? "TRAINING" : teamName}</b><span>${state.rule.toUpperCase()} · ${(MAPS[state.map]?.name || "").toUpperCase()}</span><small>${state.training ? "Both sides' gadgets, free." : me.team === "attacker" ? `${plantMode() ? `Plant an uplink on Terminal ${terminalIds().replace(" OR ", " or ")}, then hold it ${CONFIG.uplinkSeconds} s.` : hasTerminals() ? (terminalCount().need > 1 ? `Extract data from ${terminalCount().need} of the ${terminalCount().all} terminals.` : "Extract data from a terminal.") : "Raise the flag."}${wetRule(state.rule) ? " Use cover and your water balloons." : state.rule === "removed" ? " Don't get caught." : " Remain unseen."}` : wetRule(state.rule) ? `Water balloons. ${CONFIG.splashHits} splashes. Stop the infiltrator.` : "Control the sightlines. Identify the intruder."}</small>`;
  $("#ready").disabled = me.ready;
  $("#ready").innerHTML = me.ready
    ? "WAITING FOR OPPONENT…"
    : `${state.noBot ? "START PRACTICE" : state.training ? "ENTER TRAINING RANGE" : "PACK BACKPACK"} ${icon("arrow")}`;
  $("#ready-status").textContent = state.party
    ? `${state.party.name.toUpperCase()} · ${state.party.kind === "boulders" ? "ONE RACE" : ["livewire", "sprinklers"].includes(state.party.kind) ? "ONE RUN" : `HALF ${state.party.half} OF 2`}${state.solo ? " · VS THE BOT" : ""}`
    : state.noBot
      ? "PRACTICE · NO OPPONENT · THE MAP IS ALL YOURS"
      : state.training
        ? me.team === "attacker" && hasTerminals()
          ? "TRAINING RANGE · THE SENTINEL BOT PATROLS THE TERMINALS · ⌘K TO HOLD IT STILL"
          : "TRAINING RANGE · BOT HOLDS STILL UNTIL YOU TOGGLE IT IN ⌘K"
        : state.solo
          ? "SOLO FIELD TEST · SCRIPTED OPPONENT"
          : `${state.players.length}/2 OPERATORS CONNECTED · ${state.players.filter((p) => p.ready).length}/2 READY`;
  $("#fast-start").checked = !!state.debug.fastStart;
  if (document.activeElement !== $("#tuning-mode"))
    $("#tuning-mode").value = state.tuningMode || "upgrades";
  const hash =
    state.tuningMode +
    JSON.stringify(me.upgrades) +
    JSON.stringify(me.loadoutTypes) +
    JSON.stringify(state.botLoadout) +
    state.map +
    JSON.stringify(botTypes) +
    JSON.stringify(me.inventory) +
    JSON.stringify(me.slots) +
    me.team +
    me.equipped +
    me.credits +
    me.ready +
    JSON.stringify(me.gadgetStats) +
    JSON.stringify(me.decoyProgram);
  if (hash !== lastInventory) {
    lastInventory = hash;
    if (!$("#stat-editor").hidden && upgradeMode()) renderStatEditor();
    renderLoadout(me);
    renderBotLoadout(me);
    // In play, only the gadgets you actually carry.
    $("#equipment-bar").innerHTML = ownedGadgets()
      .map((id, i) => {
        const g = GADGETS[id];
        return `<button data-equip="${id}" class="equipment ${!me.inventory[id] ? "spent" : ""} ${me.equipped === id ? "equipped" : ""}" ${!me.inventory[id] ? 'disabled aria-disabled="true"' : ""}><kbd ${i < 5 ? "" : "hidden"}>${i + 1}</kbd>${icon(baseOf(id), 26)}<span>${g.short}</span><strong>${g.reusable ? "∞" : me.inventory[id]}</strong><small>${g.name}</small></button>`;
      })
      .join("");
    document
      .querySelectorAll("[data-equip]")
      .forEach(
        (b) =>
          (b.onclick = () => send({ type: "equip", gadget: b.dataset.equip })),
      );
  }
  $("#map-caption").textContent = MAPS[state.map]?.name.toUpperCase() || "";
  describeMap(state.map);
  $("#timer").textContent =
    state.phase === "purchase"
      ? "BUY PHASE"
      : state.uplink && state.phase === "active"
        ? `UPLINK ${formatTime(state.uplink.remaining)}`
        : state.training
          ? "TRAINING"
          : // Hot Potato's clock is the hidden fuse: only the beep shows it.
            state.party?.kind === "hotpotato" && state.phase !== "prep"
            ? state.party.beep
              ? "TOO TOASTY!"
              : "PASS THE POTATO"
            : state.party?.kind === "breakout" && state.party.run
              ? `${state.party.run.speed.toFixed(1)} M/S`
              : formatTime(state.time);
  $("#timer").classList.toggle(
    "uplink",
    !!state.uplink && state.phase === "active",
  );
  showStance(me);
  $("#team-tag").textContent =
    `${state.party ? partyRole() : teamName}${state.party ? "" : wetRule(state.rule) ? ` · SPLASHES ${me.hits || 0}/${CONFIG.splashHits}` : ""} / ${state.party?.kind === "boulders" ? "PUMPKIN RUN" : me.prone ? "PRONE" : me.crouch ? "CROUCHED" : "STANDING"}`;
  $("#phase-tag").textContent =
    `${state.party ? `${state.party.name.toUpperCase()}${["boulders", "livewire", "sprinklers", "breakout"].includes(state.party.kind) ? "" : ` · ${state.party.kind === "hotpotato" ? "ROUND" : "HALF"} ${state.party.half}`}` : state.rule.toUpperCase()} / ${state.phase === "purchase" ? "BUY PHASE" : state.training ? "TRAINING RANGE" : state.phase === "prep" ? (["hotpotato", "breakout", "boulders", "livewire", "sprinklers"].includes(state.party?.kind) ? "GET READY" : "PREPARATION") : state.party ? (state.party.kind === "sweep" ? "SWEEP" : state.party.kind === "hotpotato" ? "LIVE" : state.party.kind === "boulders" ? "CLIMB" : state.party.kind === "livewire" ? "LIVE" : "RUN") : "INFILTRATION"}`;
  $("#objective-text").textContent = state.party
    ? partyGoal(me)
    : state.phase === "purchase"
      ? "STAY BEHIND THE RED LINE"
      : state.training
        ? "TEST ANY GADGET"
        : state.phase === "prep"
          ? me.team === "attacker"
            ? "HOLD IN STAGING"
            : plantMode()
              ? `KEEP THE UPLINK OFF TERMINAL ${OBJECTIVES.map((o) => o.id).join(" AND ")}`
              : hasTerminals()
                ? `KEEP ${terminalCount().all - terminalCount().need + 1} OF ${terminalCount().all} TERMINALS SAFE`
                : "FORTIFY THE COMPOUND"
          : plantMode() && state.uplink
            ? me.team === "attacker"
              ? `DEFEND THE UPLINK · ${uplinkName()}`
              : `PULL THE UPLINK · ${uplinkName()}`
            : me.team === "attacker" && plantMode()
              ? `PLANT AN UPLINK · TERMINAL ${terminalIds()}`
              : me.team === "attacker"
                ? hasTerminals()
                  ? extractGoal()
                  : "RAISE THE FLAG"
                : (state.rule === "removed"
                    ? "GET CLOSE TO CAPTURE"
                    : wetRule(state.rule)
                      ? `SPLASH THE INFILTRATOR · ${CONFIG.splashHits} SOAK THEM`
                      : "IDENTIFY THE INTRUDER") +
                  (terminalCount().done && hasTerminals()
                    ? ` · ${terminalCount().done} OF ${terminalCount().need} TERMINALS LOST`
                    : "");
  $("#round-info").textContent =
    state.party?.kind === "sprinklers"
      ? "DODGE THE YELLOW CIRCLES · STAY OUT OF BLUE SPRAY"
      : state.party?.kind === "livewire"
        ? `${state.noBot ? "PRACTICE" : state.solo ? "VS BOT" : "WITH FRIENDS"} · DODGE THE BEACH BALLS · STAY DRY`
        : pointerFallback
          ? input.device === "controller"
            ? "RS LOOK / LS MOVE"
            : "KEYBOARD / RIGHT-DRAG TO LOOK"
          : state.training
            ? `${input.label("previous")}/${input.label("next")} CYCLE ALL GADGETS · ESC FOR BACKPACK`
            : `${state.solo ? "SOLO TEST" : "PRIVATE OPERATION"} / ${state.code}`;
  const detection = Math.max(
    0,
    ...Object.entries(state.pairs)
      .filter(([key]) => key.includes(me.id))
      .map(([, v]) => v),
  );
  let progress = 0,
    label = "";
  if (me.clamber) {
    progress = me.clamber.elapsed / CONFIG.clamberSeconds;
    label = "CLAMBERING";
  } else if (me.capture > 0 && plantMode()) {
    const site = OBJECTIVES.find((o) => o.id === me.site),
      need =
        me.team === "attacker" ? CONFIG.plantSeconds : CONFIG.defuseSeconds;
    progress = me.capture / need;
    label = `${me.team === "attacker" ? "PLANTING UPLINK" : "PULLING UPLINK"} / ${site?.name.toUpperCase()} / ${me.capture.toFixed(1)} OF ${need} S`;
  } else if (me.team === "attacker" && state.uplink?.defuse > 0) {
    // You hear them working at it.
    progress = state.uplink.defuse / CONFIG.defuseSeconds;
    label = `SENTINEL PULLING YOUR UPLINK / ${state.uplink.defuse.toFixed(1)} OF ${CONFIG.defuseSeconds} S`;
  } else if (me.capture > 0) {
    const site = OBJECTIVES.find((o) => o.id === me.site),
      need = site?.terminal ? CONFIG.terminalSeconds : CONFIG.captureSeconds;
    progress = me.capture / need;
    label = site?.terminal
      ? `EXTRACTING DATA / ${site.name.toUpperCase()} / ${me.capture.toFixed(1)} OF ${need} S`
      : `RAISING FLAG / ${me.capture.toFixed(1)} S`;
  } else if (me.disarm > 0) {
    progress = me.disarm / statValue(myBuilds(), "disarm", "speed");
    label = `DISARMING DEVICE / ${me.disarm.toFixed(1)} S`;
  } else if (me.cameraTag > 0) {
    progress = me.cameraTag;
    label = "INTRUDER IN FRAME / KEEP THEM IN VIEW TO TAG";
  } else if (me.spotting > 0) {
    progress = me.spotting;
    label =
      me.team === "attacker"
        ? "DEVICE SPOTTED / KEEP IT IN VIEW TO MARK"
        : "DEVICE SPOTTED / KEEP IT IN VIEW TO DESTROY";
  } else if (me.cloak > 0) {
    progress = me.cloak / statValue(myBuilds(), "cloak", "duration");
    label = `CLOAKED / ${me.cloak.toFixed(1)} S · DON'T SPRINT`;
  } else if (me.jamming > 0) {
    progress = me.jamming / statValue(myBuilds(), "jammerPortable", "duration");
    label = `JAMMING AROUND YOU / ${me.jamming.toFixed(1)} S`;
  } else if (me.scan > 0) {
    progress = 1 - me.scan / (me.scanTotal || CONFIG.scanSeconds);
    label = "SCANNING / HOLD POSITION";
  } else if (detection > 0 && (me.team === "defender" || scanWarning)) {
    progress = detection / CONFIG.detectionSeconds;
    label = `${me.team === "defender" ? "IDENTIFYING INTRUDER" : "YOU ARE BEING DETECTED"} / ${detection.toFixed(1)} / 3.0 S`;
  }
  // How close a detection is (0..1); the frame loop sounds it.
  detectionLevel =
    (me.team === "defender" || scanWarning) && state.phase === "active"
      ? detection / CONFIG.detectionSeconds
      : 0;
  visible("#progress-area", progress > 0);
  $("#progress-label").textContent = label;
  $("#progress-bar").style.width = `${Math.min(100, progress * 100)}%`;
  $("#progress-area").classList.toggle(
    "danger",
    detection > 0 ||
      (me.team === "attacker" && state.uplink?.defuse > 0 && !me.capture),
  );
  visible("#alert", me.immobile > 0 && state.party?.kind !== "sprinklers");
  $("#alert").textContent =
    `${state.party?.kind === "boulders" ? "FLATTENED" : state.party?.kind === "livewire" ? "BUMPED" : "IMMOBILIZED"} / ${me.immobile.toFixed(1)} S`;
  let prompt = "";
  const useKeys = `<kbd>${input.label("use")}</kbd> / <kbd>${input.label("interact")}</kbd>`;
  if (plantSite(me))
    prompt = `<kbd>${input.label("interact")}</kbd> HOLD TO ${me.team === "attacker" ? "PLANT UPLINK" : "PULL UPLINK"} · ${plantSite(me).name.toUpperCase()}`;
  else if (
    plantMode() &&
    state.phase === "active" &&
    me.team === "attacker" &&
    siteAt(me)
  )
    prompt = state.uplink?.site === siteAt(me).id ? "UPLINK TRANSMITTING" : "";
  else if (state.phase === "active" && me.team === "attacker" && siteAt(me)) {
    const site = siteAt(me),
      done = state.objectives?.find((o) => o.id === site.id)?.progress || 0;
    prompt = site.terminal
      ? `<kbd>${input.label("interact")}</kbd> HOLD TO EXTRACT DATA · ${site.name.toUpperCase()}${done > 0 ? ` · ${Math.round((done / CONFIG.terminalSeconds) * 100)}% DONE` : ""}`
      : `<kbd>${input.label("interact")}</kbd> HOLD TO RAISE FLAG`;
  } else if (
    state.phase === "active" &&
    me.team === "attacker" &&
    !state.party &&
    siteAt(me, true)
  )
    prompt = `${siteAt(me, true).name.toUpperCase()} · DATA ALREADY EXTRACTED`;
  else if (me.disarmTarget && me.equipped === "disarm")
    prompt = `<kbd>${input.label("interact")}</kbd> HOLD TO DISARM DEVICE`;
  else if (doorAhead(me))
    prompt = `<kbd>${input.label("interact")}</kbd> ${(state.openDoors || []).includes(doorAhead(me).pieceIndex) ? "CLOSE" : "OPEN"} DOOR`;
  else if (world.placement && !world.placement.ok)
    // The ghost is red: say why it can't go there.
    prompt = `<span class="placement-blocked">✕ ${world.placement.reason}</span>${me.anchor ? anchorCancel() : ""}`;
  else if (
    world.placement?.ok &&
    world.placement.height !== undefined &&
    baseOf(me.equipped) === "tripwire"
  ) {
    // Wire anchors: say what this height means for whoever finds it.
    const h = world.placement.height;
    prompt = `${me.anchor ? "WIRE" : "ANCHOR"} ${h.toFixed(1)} M UP · ${
      h <= CONFIG.wireJumpHeight
        ? "LOW: HARD TO SPOT, BUT CAN BE JUMPED"
        : "TOO HIGH TO JUMP · EASIER TO SPOT"
    }${me.anchor ? anchorCancel() : ""}`;
  } else if (me.anchor)
    prompt = `FIRST ANCHOR SET · USE ON A SECOND WALL IN SIGHT, WITHIN ${statValue(myBuilds(), statKind(me.equipped || "tripwire"), "span")} M${anchorCancel()}`;
  else if (me.mirror)
    prompt = `MIRROR EXTENDED · LOOK AROUND · <kbd>${input.label("exitCamera")}</kbd> OR ${useKeys} RETRACT`;
  else if (me.equipped === "sensorPortable")
    prompt = "WORN SENSOR ON · MOVEMENT CLOSE BY OUTLINES INTRUDERS";
  else if (me.equipped === "cameraPortable")
    prompt = `${useKeys} EXTEND MIRROR · PEEK AROUND A CORNER`;
  else if (me.equipped === "actorDecoy" && me.inventory.actorDecoy)
    prompt = `${useKeys} TRIGGER DECOY · AIM AT GROUND TO SET MARK`;
  else if (canThrow()) {
    const name = GADGETS[me.equipped].name.toUpperCase(),
      cancel =
        input.device === "controller"
          ? input.label("stance")
          : input.label("cancelThrow");
    prompt = !throwAim
      ? aimingDownSights()
        ? `${useKeys} THROW ${name} · RELEASE <kbd>${input.label("focus")}</kbd> TO CANCEL`
        : `HOLD ${useKeys} TO AIM ${name} · RELEASE TO THROW · OR HOLD <kbd>${input.label("focus")}</kbd>`
      : throwAim.cancelled
        ? "THROW CANCELLED · RELEASE"
        : `RELEASE TO THROW ${name} · <kbd>${cancel}</kbd> CANCEL`;
  } else if (GADGETS[me.equipped]?.modeWeapon) {
    prompt =
      weaponBlockReason(me, state.phase) ||
      (me.equipped === "potato"
        ? `${useKeys} TOSS THE POTATO · HOLD <kbd>${input.label("focus")}</kbd> TO SEE THE ARC`
        : `${useKeys} THROW A WATER BALLOON · HOLD <kbd>${input.label("focus")}</kbd> TO SEE THE ARC`);
  } else if (me.equipped && me.inventory[me.equipped])
    prompt = `${useKeys} ${me.equipped === "disarm" ? `HOLD ${input.label("interact")} NEAR A DEVICE` : "USE " + GADGETS[me.equipped].name.toUpperCase()}`;
  $("#interaction").innerHTML = prompt;
  const feed = state.gadgets.find((g) => g.id === me.camera && g.active);
  visible("#camera-banner", !!feed);
  if (feed)
    $("#camera-banner").innerHTML =
      `LIVE / CAM ${feed.id} · REC ${feedStamp(feed)} <span>KEEP AN INTRUDER IN FRAME TO TAG THEM · ${input.label("camera")} NEXT · ${input.label("exitCamera")} EXIT</span>`;
  $("#viewport").classList.toggle("mirror", !!me.mirror);
  $("#viewport").classList.toggle("cloaked", me.cloak > 0);
  $("#crosshair").classList.toggle("detecting", detection > 0);
  for (const e of state.events) {
    if (e.id <= lastEvent) continue;
    lastEvent = e.id;
    audio.event(e.text);
    const el = document.createElement("div");
    el.className = "notification";
    el.textContent = e.text;
    $("#notifications").append(el);
    setTimeout(() => el.remove(), 6000);
  }
  if (!$("#dev-panel").hidden)
    $("#debug-state").textContent =
      `mode: ${state.rule}\nphase: ${state.phase}\npairs: ${JSON.stringify(state.pairs)}\nstance: ${me.prone ? "prone" : me.crouch ? "crouched" : "standing"} · noise: ${me.noise || "silent"}\nposition: ${me.x.toFixed(1)}, ${me.y.toFixed(1)}, ${me.z.toFixed(1)}\n${state.gadgets.map((g) => `${g.id} ${g.kind}: ${!g.active ? "inactive" : g.jammed ? "jammed" : "active"}`).join("\n")}`;
  refreshPrompts();
  const ownedDecoys = (state.decoys || []).filter((d) => d.owner === me.id);
  $("#decoy-runtime").hidden = ownedDecoys.length === 0;
  $("#decoy-runtime").textContent = ownedDecoys
    .map(
      (d) =>
        `DECOY ${d.id.replace("decoy-", "")} / ${d.step >= me.decoyProgram.steps.length ? "COMPLETE" : `ACTION ${d.step + 1}/${me.decoyProgram.steps.length}`} · ${d.status} · ${Math.ceil(d.remaining)}s`,
    )
    .join(" | ");
  minimap();
}
function minimap() {
  if (state?.party?.kind === "sprinklers") return;
  const c = $("#minimap"),
    ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 200, 200);
  ctx.fillStyle = "#222222ed";
  ctx.fillRect(0, 0, 200, 200);
  // Fit the active map's floor to the 200 px minimap.
  const sx = 81.4 / BOUNDS.x,
    sz = 88.8 / BOUNDS.z,
    project = (x, z) => [100 + x * sx, 100 + z * sz];
  for (const zone of colorZones(state.map, BOUNDS)) {
    const [x, z] = project(zone.x - zone.w / 2, zone.z - zone.d / 2);
    ctx.fillStyle = zone.color;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x, z, zone.w * sx, zone.d * sz);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#4d4d4d";
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 200; i += 20) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 200);
    ctx.moveTo(0, i);
    ctx.lineTo(200, i);
    ctx.stroke();
  }
  for (const w of WALLS) {
    // Show the walkable tunnel (or open container) below its roof.
    // Builder pieces' hidden colliders (curves, fences) are their footprint.
    if (
      w.kind === "roof" ||
      w.bottom ||
      (w.hidden && !Number.isInteger(w.pieceIndex))
    )
      continue;
    // High ground (platforms, stairs) reads lighter than walls on the map.
    ctx.fillStyle = ["platform", "stairs", "ramp"].includes(w.kind)
      ? "#b4b4b4"
      : w.h > 2
        ? "#6d6d6d"
        : "#8c8c8c";
    const [x, z] = project(w.x - w.w / 2, w.z - w.d / 2);
    if (w.shape === "cylinder") {
      ctx.beginPath();
      ctx.ellipse(
        100 + w.x * sx,
        100 + w.z * sz,
        (w.w / 2) * sx,
        (w.d / 2) * sz,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    } else ctx.fillRect(x, z, w.w * sx, w.d * sz);
  }
  ctx.strokeStyle = "#e8d7a6";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  for (const p of MAPS[state.map].passages || []) {
    const [x, z] = project(p.x - p.w / 2, p.z - p.d / 2);
    ctx.strokeRect(x, z, p.w * sx, p.d * sz);
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = "#d42a2a";
  ctx.fillStyle = "#d42a2a";
  ctx.font = "8px monospace";
  for (const o of OBJECTIVES) {
    const [fx, fz] = project(o.x, o.z);
    // A spent terminal greys out, ticked.
    ctx.globalAlpha = spent(o) ? 0.45 : 1;
    ctx.strokeRect(fx - 4, fz - 4, 8, 8);
    // The planted terminal is filled in, for both sides.
    if (state.uplink?.site === o.id) ctx.fillRect(fx - 3, fz - 3, 6, 6);
    ctx.fillText(
      state.uplink?.site === o.id
        ? `${o.id} UPLINK`
        : o.terminal
          ? `${o.id}${spent(o) ? " ✓" : ""}`
          : "OBJ",
      fx + 8,
      fz + 3,
    );
    ctx.globalAlpha = 1;
  }
  const me = state.me;
  // Opponents your side has outlined (sensor, camera tag, tripwire).
  for (const p of state.players) {
    if (p.id === me.id || !p.alive || !(state.revealed || []).includes(p.id))
      continue;
    const [x, z] = project(p.x, p.z);
    ctx.fillStyle = "#d42a2a";
    ctx.beginPath();
    ctx.arc(x, z, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const p of state.players) {
    if (p.id !== me.id) continue;
    const [x, z] = project(p.x, p.z);
    ctx.save();
    ctx.translate(x, z);
    ctx.rotate(-view.yaw);
    ctx.fillStyle = "#ebebeb";
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-4, 4);
    ctx.lineTo(4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  if (me.signatureTime > 0)
    for (const s of me.signatures || []) {
      const [x, z] = project(s.x, s.z);
      ctx.strokeStyle = "#d42a2a";
      ctx.beginPath();
      ctx.arc(x, z, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
  // Devices your team has marked: an amber square.
  for (const g of state.gadgets.filter((g) => g.active && g.marked)) {
    const [x, z] = project(
      g.b ? (g.x + g.b.x) / 2 : g.x,
      g.b ? (g.z + g.b.z) / 2 : g.z,
    );
    ctx.strokeStyle = "#e8a33c";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 4, z - 4, 8, 8);
    ctx.lineWidth = 1;
  }
  for (const g of state.pings || []) {
    const [x, z] = project(g.x, g.z);
    ctx.fillStyle = "#d42a2a";
    ctx.beginPath();
    ctx.moveTo(x, z - 5);
    ctx.lineTo(x + 4, z);
    ctx.lineTo(x, z + 5);
    ctx.lineTo(x - 4, z);
    ctx.closePath();
    ctx.fill();
  }
  if (localDebug)
    for (const g of state.gadgets.filter((g) => g.active)) {
      const [x, z] = project(g.x, g.z);
      ctx.fillStyle = "#d42a2a";
      ctx.fillRect(x - 2, z - 2, 4, 4);
    }
  ctx.fillStyle = "#a9a9a9";
  ctx.fillText("N ↑", 8, 13);
}
// Ping where you're looking (through a camera feed, from the camera). With
// nothing in range, the spot along your aim at the edge of ping range.
function ping() {
  const me = state?.me;
  if (!me || !inArena()) return;
  const feed = state.gadgets.find((g) => g.id === me.camera && g.active),
    from = feed
      ? { x: feed.x, y: feed.y - 1.65, z: feed.z }
      : { x: me.x, y: me.y, z: me.z, crouch: me.crouch, prone: me.prone },
    aim = { ...from, yaw: view.yaw, pitch: view.pitch },
    hit = raySurface(aim, CONFIG.pingRange),
    spot = hit || {
      x: me.x - Math.sin(view.yaw) * CONFIG.pingRange,
      y: 0,
      z: me.z - Math.cos(view.yaw) * CONFIG.pingRange,
    };
  send({ type: "ping", x: spot.x, y: spot.y, z: spot.z });
}
// Compass: degrees of heading (0 = north, the infiltrators' way in) for a
// point seen from `me`, matching the -yaw convention.
const headingTo = (me, t) =>
  ((((-Math.atan2(-(t.x - me.x), -(t.z - me.z)) * 180) / Math.PI) % 360) +
    360) %
  360;
const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
let compassBuilt = false,
  lastPings = new Set(),
  lastFlashes = new Set(),
  lastPulses = new Set(),
  lastSplashes = new Set(),
  lastHits = 0;
// A 360° strip that slides under a fixed caret, 180° in view at a time,
// with the objective and your side's pings marked on it.
function compass() {
  const box = $("#compass");
  if (!state?.me || box.offsetParent === null) return;
  const width = box.clientWidth,
    perDeg = width / 180,
    strip = box.querySelector(".compass-strip");
  if (compassBuilt !== width) {
    compassBuilt = width;
    let html = "";
    for (let d = -180; d <= 540; d += 5) {
      const n = ((d % 360) + 360) % 360,
        left = d * perDeg;
      if (n % 45 === 0)
        html += `<b style="left:${left}px">${CARDINALS[n / 45]}</b>`;
      else if (n % 15 === 0)
        html += `<span style="left:${left}px">${n}</span><i class="major" style="left:${left}px"></i>`;
      else html += `<i style="left:${left}px"></i>`;
    }
    strip.innerHTML = html;
  }
  const me = state.me,
    heading = ((((-view.yaw * 180) / Math.PI) % 360) + 360) % 360;
  strip.style.transform = `translateX(${width / 2 - heading * perDeg}px)`;
  $("#bearing").textContent =
    `${Math.round(heading) % 360}`.padStart(3, "0") + "°";
  const mark = (t, cls, label) => {
    let rel = ((headingTo(me, t) - heading + 540) % 360) - 180;
    const edge = Math.abs(rel) > 88;
    rel = Math.max(-88, Math.min(88, rel));
    return `<div class="compass-mark ${cls} ${edge ? "edge" : ""}" style="left:${width / 2 + rel * perDeg}px"><i></i><small>${label}</small></div>`;
  };
  box.querySelector(".compass-marks").innerHTML = [
    ...OBJECTIVES.map((o) =>
      state.uplink?.site === o.id
        ? mark(
            o,
            "objective uplink",
            `UPLINK ${o.id} · ${Math.round(distance(me, o))} M`,
          )
        : mark(
            o,
            `objective${spent(o) ? " done" : ""}`,
            o.terminal ? `JAR ${o.id}${spent(o) ? " ✓" : ""}` : "FLAG",
          ),
    ),
    ...(state.pings || []).map((g) =>
      mark(g, "ping", `${Math.round(distance(me, g))} M`),
    ),
  ].join("");
}
// In the arena: the round, or walking around during the buy phase.
const inArena = () =>
  !!state &&
  (["prep", "active"].includes(state.phase) ||
    (state.phase === "purchase" && roaming));
const arenaGameName = () =>
  state?.party?.name ??
  (state?.rule === "splash" ? "Splash" : "Backyard Hide & Seek");
function lockState() {
  const opening = $("#lock-overlay").hidden && inArena() && !controlsEnabled;
  visible("#lock-overlay", inArena() && !controlsEnabled);
  $("#lock-overlay .game-pause-name").textContent = arenaGameName();
  const restart = $("#lock-overlay [data-pause-restart]");
  restart.disabled = !state?.canRestart;
  restart.title = restart.disabled
    ? "Only the host can restart the match."
    : "Restart";
  if (opening) $("#resume").focus({ preventScroll: true });
  visible(
    "#open-loadout",
    state?.phase === "purchase" && !skipsBackpack(state.party?.kind),
  );
}
const steering = () => roaming || ["prep", "active"].includes(state?.phase);
// Buy phase: leave the buy screen to walk around behind your line, and back.
function setRoaming(on) {
  roaming = on;
  visible("#purchase", !on);
  visible("#hud", on);
  if (on) {
    view = { yaw: state.me.yaw, pitch: state.me.pitch };
    lastInventory = "";
    enterArena();
  } else {
    controlsEnabled = false;
    input.clear();
    keys.clear();
    document.exitPointerLock();
    lockState();
  }
}
$("#walk-around").onclick = () => setRoaming(true);
$("#open-loadout").onclick = () => setRoaming(false);
function enterArena() {
  audio.unlock();
  controlsEnabled = true;
  keys.clear();
  lockState();
  // The overhead game needs movement keys, not a captured mouse.
  if (["livewire", "sprinklers"].includes(state?.party?.kind)) return;
  try {
    const request = world.renderer.domElement.requestPointerLock();
    request?.catch(() => {
      pointerFallback = true;
      controlsEnabled = true;
      lockState();
    });
  } catch {
    pointerFallback = true;
  }
}
$("#resume").onclick = enterArena;
document.addEventListener("pointerlockerror", () => {
  pointerFallback = true;
  controlsEnabled = true;
  lockState();
});
document.addEventListener("pointerlockchange", () => {
  keys.clear();
  controlsEnabled = document.pointerLockElement === world.renderer.domElement;
  input.clear();
  stance.cancel();
  lockState();
});
world.renderer.domElement.addEventListener("click", () => {
  if (inArena() && !controlsEnabled) enterArena();
});
world.renderer.domElement.addEventListener("contextmenu", (e) =>
  e.preventDefault(),
);
function menuRoot() {
  return (
    [
      "#dev-panel",
      "#decoy-editor",
      "#stat-editor",
      "#control-settings",
      "#manual",
      "#results",
      "#purchase",
      "#lock-overlay",
      "#home",
    ]
      .map((s) => $(s))
      .find((el) => !el.hidden) || $("#app")
  );
}
// Move focus into a newly opened editor so the next A press acts inside it.
function focusModal() {
  menuItems()
    .find((el) => !el.classList.contains("close"))
    ?.focus({ preventScroll: true });
}
function menuItems() {
  return [...menuRoot().querySelectorAll("button,input,select")].filter(
    (el) => !el.disabled && el.offsetParent !== null,
  );
}
function navigateMenu(direction, horizontal = false) {
  const focused = document.activeElement;
  if (horizontal && focused?.cycle) {
    focused.cycle(direction);
    return;
  }
  if (horizontal && focused?.tagName === "SELECT") {
    focused.selectedIndex =
      (focused.selectedIndex + direction + focused.options.length) %
      focused.options.length;
    focused.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (horizontal && ["range", "number"].includes(focused?.type)) {
    const step = Number(focused.step) || 1;
    focused.value = String(
      Math.max(
        Number(focused.min),
        Math.min(Number(focused.max), Number(focused.value) + step * direction),
      ),
    );
    focused.dispatchEvent(new Event("input", { bubbles: true }));
    if (focused.type === "number")
      focused.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  const items = menuItems();
  if (!items.length) return;
  // Controls inside a [data-nav-row] form one row: up/down moves between
  // rows, left/right moves within one. In a [data-nav-choice] row (Rules,
  // Your role), left/right also selects the option.
  const rowOf = (el) => el.closest("[data-nav-row]") || el,
    current = items.includes(focused) ? focused : null,
    row = current && rowOf(current);
  if (horizontal && row && row !== current) {
    const inRow = items.filter((el) => rowOf(el) === row),
      next = inRow[inRow.indexOf(current) + direction];
    if (next) {
      next.focus();
      markRow(next);
      if (row.hasAttribute("data-nav-choice")) next.click();
    }
    return;
  }
  if (horizontal) {
    let index = items.indexOf(focused);
    index = (index + direction + items.length) % items.length;
    items[index].focus();
    markRow(items[index]);
    items[index].scrollIntoView({ block: "nearest" });
    return;
  }
  const rows = [...new Set(items.map(rowOf))];
  const r = current
      ? (rows.indexOf(row) + direction + rows.length) % rows.length
      : direction < 0
        ? rows.length - 1
        : 0,
    inRow = items.filter((el) => rowOf(el) === rows[r]),
    // Between rows of a grid (maps, characters), stay in the same column.
    column =
      row?.matches(".map-row, [data-nav-grid]") &&
      rows[r].matches(".map-row, [data-nav-grid]")
        ? inRow[
            Math.min(
              items.filter((el) => rowOf(el) === row).indexOf(current),
              inRow.length - 1,
            )
          ]
        : null,
    target =
      column ||
      inRow.find((el) => el.classList.contains("selected")) ||
      inRow[0];
  target.focus();
  markRow(target);
  target.scrollIntoView({ block: "nearest" });
}
// Highlight the row holding the controller's focus. Tracked explicitly
// rather than with :focus-within, which a backgrounded window drops.
function markRow(el) {
  document
    .querySelectorAll(".nav-row-active")
    .forEach((row) => row.classList.remove("nav-row-active"));
  el?.closest("[data-nav-row]")?.classList.add("nav-row-active");
}
document.addEventListener("focusin", (e) => markRow(e.target));
function pauseGame() {
  sprintLatched = false;
  controlsEnabled = false;
  input.clear();
  keys.clear();
  stance.cancel();
  document.exitPointerLock();
  lockState();
}
function showControls() {
  pauseGame();
  visible("#control-settings", true);
  renderControls();
  $("#close-controls").focus();
}
function closeControls() {
  input.capture = null;
  $("#binding-message").textContent =
    "Select a binding to change it. Conflicting bindings swap.";
  visible("#control-settings", false);
  ($("#lock-overlay").hidden
    ? $("#controls-button")
    : $("#pause-controls")
  ).focus({ preventScroll: true });
  input.clear();
}
function renderControls() {
  $("#controller-status").textContent =
    `${input.padIndex === null ? "CONTROLLER: NOT CONNECTED" : "CONNECTED: " + input.padName} / ACTIVE: ${input.device.toUpperCase()}`;
  $("#binding-list").innerHTML = Object.entries(ACTIONS)
    .map(
      ([action, name]) =>
        `<div class="binding-row"><span>${name}</span><button data-bind="keyboard" data-action="${action}">${keyLabel(input.config.keyboard[action])}</button>${action in input.config.controller ? `<button data-bind="controller" data-action="${action}">${BUTTONS[input.config.controller[action]] || "Unbound"}</button>` : `<span class="fixed-binding">${["forward", "back", "left", "right"].includes(action) ? "Movement stick" : action.startsWith("look") ? "Look stick" : "Keyboard only"}</span>`}</div>`,
    )
    .join("");
  document.querySelectorAll("[data-bind]").forEach(
    (b) =>
      (b.onclick = () => {
        input.clear();
        input.capture = {
          group: b.dataset.bind,
          action: b.dataset.action,
          done: () => {
            renderControls();
            refreshPrompts();
            $("#binding-message").textContent = "Binding saved.";
          },
        };
        $("#binding-message").textContent =
          `Press a ${b.dataset.bind === "controller" ? "controller button" : "key or mouse button"} for ${ACTIONS[b.dataset.action]}. Escape cancels.`;
      }),
  );
  for (const [id, key] of [
    ["stick-deadzone", "deadzone"],
    ["pad-sensitivity", "lookSensitivity"],
    ["mouse-sensitivity", "mouseSensitivity"],
  ])
    $("#" + id).value = input.config[key];
  $("#invert-look").checked = input.config.invertY;
  $("#pad-invert-y").checked = input.config.padInvertY;
  $("#pad-invert-x").checked = input.config.padInvertX;
  $("#swap-sticks").checked = input.config.swapSticks;
}
$("#controls-button").onclick = showControls;
$("#menu-controls").onclick = showControls;
$("#close-controls").onclick = closeControls;
$("#reset-controls").onclick = () => {
  input.config = structuredClone(DEFAULTS);
  input.clear();
  input.save();
  renderControls();
  refreshPrompts();
};
for (const [id, key] of [
  ["stick-deadzone", "deadzone"],
  ["pad-sensitivity", "lookSensitivity"],
  ["mouse-sensitivity", "mouseSensitivity"],
])
  $("#" + id).oninput = (e) => {
    input.config[key] = Number(e.target.value);
    input.save();
  };
for (const [id, key] of [
  ["invert-look", "invertY"],
  ["pad-invert-y", "padInvertY"],
  ["pad-invert-x", "padInvertX"],
  ["swap-sticks", "swapSticks"],
])
  $("#" + id).onchange = (e) => {
    input.config[key] = e.target.checked;
    input.save();
  };
function equipOffset(offset) {
  if (!state) return;
  const choices = ownedGadgets().filter((k) => state.me.inventory[k] > 0);
  if (!choices.length) return;
  const index = choices.indexOf(state.me.equipped);
  send({
    type: "equip",
    gadget: choices[(index + offset + choices.length) % choices.length],
  });
}
function handleAction(action, down) {
  if (down && input.device === "controller") audio.unlock();
  if (action === "developer" && down) {
    pauseGame();
    toggleDev();
    return;
  }
  if (action === "settings" && down) {
    visible("#decoy-editor", false);
    visible("#stat-editor", false);
    if ($("#control-settings").hidden) showControls();
    else closeControls();
    return;
  }
  if (action === "pause" && down) {
    if (!$("#decoy-editor").hidden) {
      visible("#decoy-editor", false);
      return;
    }
    if (!$("#stat-editor").hidden) {
      visible("#stat-editor", false);
      return;
    }
    if (!$("#control-settings").hidden) {
      closeControls();
      return;
    }
    if (!$("#manual").hidden) {
      visible("#manual", false);
      return;
    }
    // A controller's Start button starts the match from the character
    // screen (earlier menu screens: picks the focused choice) and confirms
    // the loadout on the next screen. Escape on a keyboard steps back.
    if (input.device === "controller") {
      if (!$("#home").hidden) {
        if ($("#home").dataset.screen === "character") $("#deploy").click();
        else {
          const items = menuItems();
          (items.includes(document.activeElement)
            ? document.activeElement
            : items[0]
          )?.click();
        }
        return;
      }
      if (!$("#purchase").hidden && !$("#ready").disabled) {
        $("#ready").click();
        return;
      }
    }
    if (menuBack()) return;
    if (controlsEnabled) pauseGame();
    else if (inArena()) {
      controlsEnabled = true;
      audio.unlock();
      lockState();
    }
    return;
  }
  if (!controlsEnabled) {
    if (input.device === "controller" && down) {
      if (action === "jump") {
        const items = menuItems();
        (items.includes(document.activeElement)
          ? document.activeElement
          : items[0]
        )?.click();
      } else if (action === "stance") {
        if (!$("#dev-panel").hidden) toggleDev();
        else if (!$("#decoy-editor").hidden) visible("#decoy-editor", false);
        else if (!$("#stat-editor").hidden) visible("#stat-editor", false);
        else if (!$("#control-settings").hidden) closeControls();
        else if (!$("#manual").hidden) visible("#manual", false);
        else menuBack();
      } else if (["slot1", "slot4"].includes(action))
        navigateMenu(-1, action === "slot4");
      else if (["slot2", "slot3"].includes(action))
        navigateMenu(1, action === "slot2");
    }
    return;
  }
  if (
    ["sprinklers", "boulders"].includes(state?.party?.kind) &&
    ["stance", "sprint", "prone"].includes(action)
  )
    return;
  // Controller: L3 toggles sprint; clicking it again while sprinting
  // forward slides (like B), rather than dropping you to a walk. Letting go
  // of the stick still ends the sprint.
  if (action === "sprint" && down && input.device === "controller") {
    if (
      sprintLatched &&
      input.movement().forward > 0.5 &&
      stance.stance === "standing" &&
      !state?.me?.slide
    )
      slideRequests++;
    else sprintLatched = !sprintLatched;
  }
  if (action === "stance" && state?.me.mirror) {
    if (down) send({ type: "mirror", close: true });
    return;
  }
  if (action === "stance" && state?.me.camera) {
    if (down) send({ type: "camera", close: true });
    return;
  }
  if (action === "stance") {
    // Crouch while sprinting forward: slide right away, without touching
    // your crouch, so you come out of it still on your feet. The release of
    // that press is swallowed so it doesn't toggle crouch either.
    const sprinting =
      (input.held("sprint") || sprintLatched) &&
      input.movement().forward > 0.5 &&
      stance.stance === "standing";
    if (down && sprinting && !state?.me?.slide) {
      slideRequests++;
      slidePress = true;
    } else if (!down && slidePress) slidePress = false;
    else if (down) stance.down(performance.now());
    else stance.up(performance.now());
  }
  // Weapons use an explicit trigger in the next input packet, alongside
  // the current aim. They do not go through the generic gadget-use path.
  if (
    GADGETS[state?.me?.equipped]?.modeWeapon &&
    (["use", "useAlt"].includes(action) ||
      (action === "interact" && !interactBusy()))
  ) {
    if (action === "interact") interactAsUse = down;
    if (down) weaponRequests++;
    return;
  }
  // Throwables: hold Use (or E) to aim, release it to throw; Q (on a
  // controller, the stance button) cancels.
  if (throwAim && !down && action === throwAim.action) {
    if (!throwAim.cancelled && canThrow()) send({ type: "use" });
    throwAim = null;
    if (action === "interact") interactAsUse = false;
    return;
  }
  if (
    throwAim &&
    down &&
    (action === "cancelThrow" ||
      (action === "stance" && input.device === "controller"))
  ) {
    throwAim.cancelled = true;
    return;
  }
  // Q (Cancel throw) also drops a wire's or shutter's first anchor.
  if (down && action === "cancelThrow" && !throwAim && state?.me?.anchor) {
    send({ type: "cancelAnchor" });
    return;
  }
  if (action === "interact" && !down) interactAsUse = false;
  if (!down) return;
  if (action === "interact" && doorAhead(state?.me)) {
    doorRequests++;
    return;
  }
  if (
    canThrow() &&
    (["use", "useAlt"].includes(action) ||
      (action === "interact" && !interactBusy()))
  ) {
    // Already aiming down sights: the arc is up, so throw now.
    if (aimingDownSights() && !throwAim) {
      send({ type: "use" });
      return;
    }
    throwAim ??= { action };
    if (action === "interact") interactAsUse = true;
    return;
  }
  // E doubles as a second use/throw trigger, unless it has a job of its own
  // right now (raising the flag, or disarming with the tool).
  if (action === "interact" && !interactBusy()) {
    interactAsUse = true;
    send({ type: "use" });
  }
  if (action === "prone")
    stance.stance = stance.stance === "prone" ? "standing" : "prone";
  if (action === "use" || action === "useAlt") send({ type: "use" });
  if (action === "next") equipOffset(1);
  if (action === "previous") equipOffset(-1);
  if (action === "camera") send({ type: "camera" });
  if (action === "ping") ping();
  if (action === "exitCamera") {
    send({ type: "camera", close: true });
    send({ type: "mirror", close: true });
  }
  if (action.startsWith("slot")) {
    const gadget = ownedGadgets()[Number(action.slice(-1)) - 1];
    if (gadget) send({ type: "equip", gadget });
  }
}
// Aiming down sights: hold the focus binding (right mouse, controller LT)
// on the field. Right-drag is also how you look without pointer lock, so the
// mouse button only counts while the pointer is locked.
function aimingDownSights() {
  const me = state?.me;
  return (
    !!me &&
    controlsEnabled &&
    ["prep", "active"].includes(state.phase) &&
    !me.camera &&
    !me.mirror &&
    input.held("focus") &&
    (input.device === "controller" ||
      input.config.keyboard.focus !== "Mouse2" ||
      document.pointerLockElement === world.renderer.domElement)
  );
}
// A throwable equipped and in hand, on the field, not looking through a feed.
function canThrow() {
  const me = state?.me;
  return (
    !!me &&
    controlsEnabled &&
    ["prep", "active"].includes(state.phase) &&
    !me.camera &&
    THROWABLE.includes(me.equipped) &&
    !!me.inventory[me.equipped]
  );
}
function refreshPrompts() {
  if (!input) return;
  // Row highlights for menu navigation only show while using a controller.
  document.body.classList.toggle("pad-nav", input.device === "controller");
  const pad = input.device === "controller",
    l = (a) => `<kbd>${input.label(a)}</kbd>`;
  $(".hud-bottom").innerHTML =
    state?.party?.kind === "livewire"
      ? `<span>${pad ? "<kbd>LS</kbd>" : `${l("forward")}${l("left")}${l("back")}${l("right")}`} MOVE &nbsp; ${l("pause")} PAUSE</span>`
      : ["sprinklers", "boulders"].includes(state?.party?.kind)
        ? `<span>${pad ? "<kbd>LS</kbd>" : `${l("forward")}${l("left")}${l("back")}${l("right")}`} MOVE &nbsp; ${l("jump")} JUMP &nbsp; ${l("pause")} PAUSE</span>`
        : `<span>${pad ? "<kbd>LS</kbd> MOVE" : `${l("forward")}${l("left")}${l("back")}${l("right")} MOVE`} &nbsp; ${pad ? "<kbd>RS</kbd>" : `${l("lookUp")}${l("lookLeft")}${l("lookDown")}${l("lookRight")}`} LOOK &nbsp; ${l("sprint")} SPRINT &nbsp; ${l("stance")} CROUCH / HOLD PRONE</span><span>${l("jump")} JUMP / HOLD CLAMBER &nbsp; ${l("interact")} INTERACT &nbsp; ${l("use")} USE &nbsp; ${input.label("ping") === "—" ? "" : `${l("ping")} PING &nbsp; `}${input.label("settings") === "—" ? "" : `${l("settings")} CONTROLS &nbsp; `}${l("pause")} PAUSE &nbsp; ${l("developer")} DEV</span>`;
  $("#resume").innerHTML =
    `${pad ? input.label("pause") + " / " + input.label("jump") + " · " : ""}GO PLAY ${icon("arrow")}`;
  $("#manual-controls").innerHTML =
    state?.party?.kind === "boulders"
      ? `${pad ? "<kbd>LS</kbd> move · <kbd>RS</kbd> look" : `${l("forward")}${l("left")}${l("back")}${l("right")} move · ${l("lookUp")}${l("lookLeft")}${l("lookDown")}${l("lookRight")} look`}<br>${l("jump")} jump · ${l("pause")} pause<br>Duck into the marked shelters to avoid the rolling pumpkins.`
      : `${pad ? "<kbd>LS</kbd> move · <kbd>RS</kbd> look" : `${l("forward")}${l("left")}${l("back")}${l("right")} move · ${l("lookUp")}${l("lookLeft")}${l("lookDown")}${l("lookRight")} look`}<br>${l("jump")} jump / hold near a wall to clamber · ${l("sprint")} sprint · ${l("stance")} crouch / hold prone<br>${l("interact")} interact · ${l("use")} use gadget (hold to aim a throw, ${l("cancelThrow")} cancels) · ${l("focus")} aim down sights (zoom; shows a throw's arc)<br>${l("previous")}/${l("next")} cycle gadgets · ${l("camera")} camera · ${l("exitCamera")} leave feed<br>${input.label("settings") === "—" ? "Control settings from the pause menu" : `${l("settings")} customize controls`} · ${l("pause")} pause · ${l("developer")} developer panel`;
  $("#lock-overlay p").textContent =
    state?.party?.kind === "sprinklers"
      ? "Dodge the spray! Move with WASD or the left stick. The camera stays fixed above the yard."
      : state?.party?.kind === "livewire"
        ? "Dodge the beach balls! Move with WASD or the left stick to step out of their path."
        : pad
          ? "Use LS to move and RS to look. Menu resumes; A selects."
          : "Click to enter the yard. Use your configured mouse or look keys.";
  $("#controls-button").textContent =
    input.label("settings") === "—"
      ? "CONTROLS"
      : `${input.label("settings")} / CONTROLS`;
  document
    .querySelectorAll("[data-equip] kbd")
    .forEach((el, i) => (el.textContent = input.label("slot" + (i + 1))));
}
document.addEventListener("mousemove", (e) => {
  if (Math.abs(e.movementX) + Math.abs(e.movementY) > 1)
    input.deviceUsed("keyboard");
  if (
    controlsEnabled &&
    (document.pointerLockElement === world.renderer.domElement ||
      e.buttons === 2)
  ) {
    view.yaw -= e.movementX * input.config.mouseSensitivity;
    view.pitch = Math.max(
      -1.5,
      Math.min(
        1.5,
        view.pitch -
          e.movementY *
            input.config.mouseSensitivity *
            (input.config.invertY ? -1 : 1),
      ),
    );
  }
});
document.addEventListener(
  "mousedown",
  (e) => {
    if (input.capture?.group === "keyboard") {
      suppressClick = true;
      e.preventDefault();
      e.stopPropagation();
      input.key("Mouse" + e.button, true);
      return;
    }
    input.deviceUsed("keyboard");
    if (
      controlsEnabled &&
      (e.target === world.renderer.domElement ||
        document.pointerLockElement === world.renderer.domElement)
    )
      input.key("Mouse" + e.button, true);
  },
  true,
);
document.addEventListener(
  "click",
  (e) => {
    if (suppressClick) {
      e.preventDefault();
      e.stopImmediatePropagation();
      suppressClick = false;
    }
  },
  true,
);
document.addEventListener("mouseup", (e) =>
  input.key("Mouse" + e.button, false),
);
document.addEventListener("keydown", (e) => {
  // A modal game owns the keyboard even if clicking its canvas blurs focus.
  if (document.querySelector("dialog[open][data-game-keyboard]")) return;
  const code = keyboardCode(e);
  if (input.capture) {
    if (e.code.startsWith("Meta")) return;
    e.preventDefault();
    input.key(code, true);
    if (!input.capture) renderControls();
    return;
  }
  if (code === input.config.keyboard.developer) {
    e.preventDefault();
    input.key(code, true);
    return;
  }
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (
    !controlsEnabled &&
    [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Enter",
      "NumpadEnter",
    ].includes(e.code)
  ) {
    e.preventDefault();
    input.deviceUsed("keyboard");
    if (e.code.startsWith("Arrow")) {
      navigateMenu(
        ["ArrowUp", "ArrowLeft"].includes(e.code) ? -1 : 1,
        ["ArrowLeft", "ArrowRight"].includes(e.code),
      );
    } else if (!e.repeat) {
      const items = menuItems(),
        target = items.includes(document.activeElement)
          ? document.activeElement
          : items[0];
      target?.focus({ preventScroll: true });
      target?.click();
    }
    return;
  }
  input.deviceUsed("keyboard");
  if (
    controlsEnabled ||
    ["Escape", input.config.keyboard.settings].includes(code)
  ) {
    e.preventDefault();
    input.key(code, true);
  }
});
document.addEventListener("keyup", (e) => {
  if (e.code === "Tab") {
    for (const code of ["Tab", "Shift+Tab"])
      if (input.keys.has(code)) input.key(code, false);
  } else input.key(keyboardCode(e), false);
  if (e.code.startsWith("Meta")) {
    for (const key of [...input.keys])
      if (key.startsWith("Meta+")) input.key(key, false);
  }
});
window.addEventListener("blur", () => {
  input.clear();
  stance.cancel();
  controlsEnabled = false;
  lockState();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseGame();
});
window.addEventListener("gamepadconnected", (e) => {
  $("#pad-status").textContent =
    `CONTROLLER CONNECTED: ${e.gamepad.id.split("(")[0].trim().toUpperCase()}`;
});
window.addEventListener("gamepaddisconnected", () => {
  input.disconnect();
  $("#pad-status").textContent = "CONTROLLER: PRESS ANY BUTTON";
});
setInterval(() => {
  if (!state) return;
  const locked = controlsEnabled;
  if (locked) stance.update(performance.now());
  else stance.cancel();
  const move = input.movement();
  if (Math.hypot(move.forward, move.side) < 0.1) sprintLatched = false;
  send({
    type: "input",
    input: {
      forward: locked ? move.forward : 0,
      side: locked ? move.side : 0,
      sprint:
        !["sprinklers", "boulders"].includes(state.party?.kind) &&
        locked &&
        (input.held("sprint") || sprintLatched),
      slide: slideRequests,
      door: doorRequests,
      fire: weaponRequests,
      crouch:
        !["sprinklers", "boulders"].includes(state.party?.kind) &&
        stance.stance === "crouch",
      prone:
        !["sprinklers", "boulders"].includes(state.party?.kind) &&
        stance.stance === "prone",
      jump: locked && input.held("jump"),
      interact: locked && input.held("interact") && !interactAsUse,
      // On the pause screen; a solo match holds still until you're back.
      paused: inArena() && !locked,
      // While looking through a camera, your body keeps facing where it was.
      // Off the field (buy screen, results) leave the spawn facing alone.
      ...(steering() && {
        yaw:
          state.party?.kind === "sprinklers"
            ? 0
            : feedLook
              ? feedLook.body.yaw
              : view.yaw,
        pitch:
          state.party?.kind === "sprinklers"
            ? 0
            : feedLook
              ? feedLook.body.pitch
              : view.pitch,
      }),
    },
  });
  // Pan the camera you're viewing to where you're looking.
  if (
    feedLook &&
    (Math.abs(view.yaw - feedLook.sentYaw) > 0.002 ||
      Math.abs(view.pitch - feedLook.sentPitch) > 0.002)
  ) {
    feedLook.sentYaw = view.yaw;
    feedLook.sentPitch = view.pitch;
    send({ type: "cameraPan", yaw: view.yaw, pitch: view.pitch });
  }
}, 1000 / 30);
// Camera feeds: look input pans the camera (within its mount limits) instead
// of turning your body; leaving the feed gives your own view back.
let feedLook = null;
function followFeed() {
  const id = state?.me?.camera,
    feed = id && state.gadgets.find((g) => g.id === id && g.active);
  if (!feed) {
    if (feedLook) view = feedLook.body;
    feedLook = null;
    return;
  }
  if (feedLook?.id !== feed.id) {
    feedLook = {
      id: feed.id,
      body: feedLook?.body || { ...view },
      base: feed.baseYaw ?? feed.yaw,
      sentYaw: feed.yaw,
      sentPitch: feed.pitch,
    };
    view = { yaw: feed.yaw, pitch: feed.pitch };
  }
  const turn = Math.atan2(
    Math.sin(view.yaw - feedLook.base),
    Math.cos(view.yaw - feedLook.base),
  );
  view.yaw =
    feedLook.base +
    Math.max(-CONFIG.cameraPanYaw, Math.min(CONFIG.cameraPanYaw, turn));
  view.pitch = Math.max(
    CONFIG.cameraPanPitch[0],
    Math.min(CONFIG.cameraPanPitch[1], view.pitch),
  );
}
refreshPrompts();
let previous = performance.now(),
  wasBuilderEditing = false;
// Lights Out: the guard's view goes dark between pulses. The clock runs
// on between server updates so the pulse is smooth; a thrum marks each one
// for both sides.
let lightsClock = 0,
  lightsWasLit = false;
function lightsOut(dt) {
  const on =
    state?.party?.kind === "lightsout" &&
    ["prep", "active"].includes(state.phase);
  if (!on) {
    lightsClock = 0;
    world.darkness = 0;
    return;
  }
  const elapsed = state.party.elapsed || 0;
  lightsClock =
    state.phase === "active" && Math.abs(lightsClock + dt - elapsed) < 0.25
      ? lightsClock + dt
      : elapsed;
  const light = lightsPulse(lightsClock);
  world.darkness = state.me?.team === "defender" ? 1 - light : 0;
  if (light > 0 && !lightsWasLit) audio.pulse(0.7);
  lightsWasLit = light > 0;
}
function frame(now) {
  // Schedule the next frame first, so an error in this one can't freeze
  // the game.
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - previous) / 1000);
  previous = now;
  if (builder.inGame()) {
    wasBuilderEditing = true;
    audio.music.update(audio.context, 0);
    builder.frame(dt);
    return;
  }
  if (wasBuilderEditing) {
    controlsEnabled = false;
    input.clear();
    keys.clear();
    wasBuilderEditing = false;
  }
  // In the arena the view fills the window and the pause screen has its own bar.
  const arena = inArena();
  document.body.classList.toggle("playing", arena && controlsEnabled);
  if (document.body.classList.contains("in-arena") !== arena) {
    document.body.classList.toggle("in-arena", arena);
    world.resize();
  }
  audio.music.update(audio.context, musicLevel());
  followFeed();
  const standalone = activeGame();
  if (standalone) {
    // A standalone game owns the controller; the menus behind it don't move.
    if (document.hasFocus() && !document.hidden) {
      const pads = [...(navigator.getGamepads?.() || [])],
        pad = pads[input.padIndex] || pads.find((p) => p?.connected);
      if (padBridge.update(standalone, pad, dt)) input.deviceUsed("controller");
    }
  } else {
    if (padBridge.root) {
      padBridge.detach();
      // The press that closed the game must not also click the menu.
      input.clear();
    }
    if (document.hasFocus() && !document.hidden) input.poll();
  }
  if (!$("#control-settings").hidden)
    $("#controller-status").textContent =
      `${input.padIndex === null ? "CONTROLLER: NOT CONNECTED" : "CONNECTED: " + input.padName} / ACTIVE: ${input.device.toUpperCase()}`;
  if (controlsEnabled) {
    const { invertY, padInvertY, padInvertX, lookSensitivity } = input.config;
    view.yaw +=
      ((+input.held("lookLeft") - +input.held("lookRight")) * 1.5 -
        input.look.x * lookSensitivity * (padInvertX ? -1 : 1)) *
      dt;
    // Look keys follow the mouse invert setting; the right stick has its own.
    const pitch =
      (+input.held("lookUp") - +input.held("lookDown")) * (invertY ? -1 : 1) -
      input.look.y * lookSensitivity * (padInvertY ? -1 : 1);
    view.pitch = Math.max(-1.5, Math.min(1.5, view.pitch + pitch * dt));
  } else if (input.device === "controller" && !input.capture) {
    menuRepeat -= dt;
    const axis =
      Math.abs(input.move.forward) > 0.5
        ? -input.move.forward
        : Math.abs(input.move.side) > 0.5
          ? input.move.side
          : 0;
    if (axis && menuRepeat <= 0) {
      navigateMenu(
        axis > 0 ? 1 : -1,
        Math.abs(input.move.side) > 0.5 && Math.abs(input.move.forward) <= 0.5,
      );
      menuRepeat = 0.23;
    }
    if (!axis) menuRepeat = 0;
  }
  // The arc shows only while a throw is being aimed.
  if (throwAim && !canThrow()) throwAim = null;
  const ads = aimingDownSights();
  world.aimingThrow =
    (!!throwAim && !throwAim.cancelled) ||
    (ads &&
      (canThrow() || ["balloon", "potato"].includes(state?.me?.equipped)));
  lightsOut(dt);
  breakoutHud();
  bouldersHud(dt);
  livewireHud(dt);
  document.body.classList.toggle(
    "sprinklers",
    state?.party?.kind === "sprinklers",
  );
  world.render(state, view, dt, localDebug);
  // Watching a Breakout run, you hear it from the runner's ears.
  audio.movement(
    world.watch ? { ...state, me: world.watch } : state,
    world.watch
      ? { yaw: world.watch.yaw, pitch: 0 }
      : feedLook
        ? feedLook.body
        : view,
    dt,
  );
  audio.cameras(state, feedLook ? feedLook.body : view);
  audio.detection(state?.me ? detectionLevel : 0, state?.me?.team, dt);
  compass();
  // Blinded by a flashbang, or watching a flashed camera: white, holding
  // until its last 0.8 s, then fading.
  const feedNow =
      state?.me?.camera && state.gadgets.find((g) => g.id === state.me.camera),
    blind = feedNow ? feedNow.flashed || 0 : state?.me?.blind || 0;
  $("#flash-veil").style.opacity = String(Math.min(1, blind / 0.8));
  // Water balloons: a whoosh as one is thrown and a splash as it bursts,
  // from where they happen, heard only within their range.
  const splashes = new Set((state?.splashes || []).map((t) => t.id));
  for (const t of state?.splashes || []) {
    if (lastSplashes.has(t.id) || !state.me) continue;
    const dx = t.x - state.me.x,
      dz = t.z - state.me.z,
      range = Math.hypot(dx, dz);
    if (range > t.range) continue;
    const pan =
        range < 0.5
          ? 0
          : (dx * Math.cos(view.yaw) - dz * Math.sin(view.yaw)) / range,
      level = 1 / (1 + (range / 6) ** 2);
    if (t.kind === "burst") audio.splash(pan, level);
    else audio.whoosh(pan, level);
  }
  lastSplashes = splashes;
  // Splashed: water runs down your view.
  const hits = state?.me?.hits || 0;
  if (wetRule(state?.rule) && hits > lastHits) {
    const veil = $("#splash-veil");
    veil.classList.remove("splashed");
    void veil.offsetWidth;
    veil.classList.add("splashed");
  }
  lastHits = hits;
  visible(
    "#soaked-card",
    wetRule(state?.rule) &&
      state.phase === "active" &&
      state.me &&
      !state.me.alive,
  );
  // Everyone hears a flashbang go off (kid-friendly: a glitter popper).
  const flashes = new Set((state?.flashes || []).map((f) => f.id));
  if ([...flashes].some((id) => !lastFlashes.has(id))) audio.sparkle();
  lastFlashes = flashes;
  // Everyone hears a pulse sensor sweep (nearer is louder).
  const pulses = new Set((state?.pulses || []).map((g) => g.id));
  for (const g of state?.pulses || [])
    if (!lastPulses.has(g.id) && state.me)
      audio.pulse(Math.max(0.25, 1 / (1 + (distance(state.me, g) / 20) ** 2)));
  lastPulses = pulses;
  // A chirp when a new ping lands for your side.
  const pings = new Set((state?.pings || []).map((g) => g.id));
  if ([...pings].some((id) => !lastPings.has(id))) audio.ping();
  lastPings = pings;
}
requestAnimationFrame(frame);
