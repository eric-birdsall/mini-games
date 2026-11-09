# Mini Games

## Always support Xbox controller controls

Every game, menu and screen must be fully playable with an Xbox controller, as well as keyboard/mouse and touch. When adding or changing a game or screen, wire up the controller in the same change and test it.

- **Standalone games** (their own overlay/dialog): call `bindDialogEscape(dialog, …)` from `src/pauseActions.js` (it marks the dialog `data-game-keyboard`, which `activeGame()` in `src/padBridge.js` looks for) and set `dialog.padPlaying = () => …` to true while steering input should go to the game. The bridge turns the pad into the keys the game already handles: left stick / D-pad → WASD, right stick → IJKL, A / RT → Space, X / LT → R, B / Menu → Escape. Outside play, the stick moves focus between the screen's buttons and A presses them. Add the game to the list at the top of `src/padBridge.js` and the README's controller table.
- **Arena games and menus** (`src/main.js`, `src/input.js`): use `[data-nav-row]` / `[data-nav-choice]` rows so the D-pad / left stick and A can reach every control; give a control a `cycle(direction)` method when left/right should step through values.
