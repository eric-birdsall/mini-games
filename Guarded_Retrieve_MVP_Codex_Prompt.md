# Guarded Retrieval — MVP Build Prompt

## Build Goal

Build a small, playable 3D stealth game prototype for the existing mini-games project. The working title is **Guarded Retrieval**; keep the title easy to change.

The player must retrieve a valuable object from a guarded area and escape to an exit. The defining mechanic is a deliberate **Freeze** action: while frozen, the player becomes invisible to guards but cannot move. Walking or sprinting immediately makes the player visible again.

This is a serious, tense stealth game with short levels that introduce one new challenge at a time. Use the project's existing stack and conventions. The wider project uses Vite and Three.js; inspect the repository first and integrate with its structure rather than replacing or restructuring unrelated games.

## Design Decisions

- Camera: third-person 3D.
- Tone: serious stealth.
- Objective: retrieve an object, then reach the exit.
- Freeze: player chooses to hold a button to freeze; freezing is never automatic.
- Visibility: freezing makes the player invisible to guards. Any walking or sprinting makes the player visible again.
- Detection: any movement seen by a guard immediately alerts that guard and starts a chase. Detection is not an instant level failure.
- Failure: guards chase and can physically catch the player. The player can escape by breaking line of sight and hiding.
- Guard behavior: guards react dynamically to the player and to sprint noise.
- Sprint: faster than walking, but produces noise that nearby guards can investigate.
- Cover: different obstacles provide different amounts of protection. Opaque cover blocks sight; other cover may leave some exposure.
- Level structure: short levels that introduce new obstacles or challenges one at a time.

## Core Player Experience

The player studies a guard's position, moves when there is an opening, and chooses when to hold Freeze. The player can freeze in the guard's view to disappear, but gives up all movement while doing so. The player can use cover to advance, wait, or escape a chase. Sprinting helps create distance but can draw a guard toward the sound.

The central tension should come from the player's timing and route choices, not from random instant failures.

## Core Rules

1. **Freeze is player-controlled.** The player must hold the Freeze control to enter the frozen state. The game must not freeze the player automatically when a guard looks their way.
2. **Frozen means stationary and invisible to guards.** While Freeze is held, disable player movement and make the character visually communicate the frozen state. Guards cannot visually detect the player during this state.
3. **Movement reveals the player.** Releasing Freeze or attempting to walk or sprint exits the frozen state immediately. The player becomes visible as soon as movement begins.
4. **Movement in a guard's view triggers detection.** If a guard has a clear line of sight to a moving player, that guard immediately becomes alerted and pursues the player. Do not add a suspicion meter or a long detection grace period.
5. **Detection starts a chase; capture causes failure.** A guard should pursue the player and attempt to make physical contact. The player may escape by getting behind cover or otherwise breaking line of sight.
6. **Cover blocks line of sight according to its type.** Use simple, understandable cover categories, such as solid/opaque, partial, and low. The player should be able to read which objects provide reliable protection.
7. **Sprint creates sound.** Sprinting is faster than walking and emits a sound event. A nearby guard can investigate the sound even without seeing the player. Walking should be quieter.
8. **Objective completion requires retrieval and escape.** The player must interact with the target object, then reach the exit zone. Reaching the exit before retrieving the object does not complete the level.

## Guard AI Scope

Implement a simple, reliable state machine rather than complex simulation:

- **Patrol:** Follow a visible route, with occasional pauses and turns.
- **Investigate:** Move toward a recent sprint sound and look around when arriving.
- **Chase:** Pursue the player's current or last-known position after visual detection.
- **Search:** If the player breaks line of sight, move to the last-known position and search briefly before resuming patrol.

Guards must not know the player's exact location through walls. Freeze protects against visual detection, but it does not cancel a chase already triggered. A chasing guard may continue to the player's last-known location and search there.

Use a clear forward-facing field of view and real line-of-sight checks. Keep patrols and level layouts consistent between attempts so players can learn them. Dynamic reactions should come from player visibility and sound, not unpredictable teleporting or unfairly changing guard positions.

## MVP Content

Build a compact vertical slice with **three short levels**:

1. **Tutorial room:** one guard, clear cover, one retrieval object, and one exit. Teach movement, Freeze, retrieval, and escape.
2. **Sprint and sound:** add a route where sprinting is useful but can draw the guard to the sound.
3. **Cover choices:** add a mix of solid and partial cover, requiring the player to choose a route and time Freeze.

Keep each level small enough to replay quickly. Use placeholder geometry and simple materials if the project has no suitable art assets. Prioritize legibility and responsive controls over visual polish.

## Controls

Provide keyboard and mouse controls at minimum:

- **WASD:** move
- **Mouse:** rotate the third-person camera
- **Shift:** sprint while moving
- **Space (hold):** freeze
- **E:** interact with the retrieval object or exit when in range
- **Escape:** pause/resume

If the existing project has a standard controller or touch-control system, support it using the project's conventions. Otherwise, keep the game architecture ready for those controls without delaying the keyboard/mouse MVP.

## UI and Feedback

- Show the current objective: retrieve the object, then escape.
- Show a brief control guide on the first level.
- Provide clear visual feedback for frozen, visible, detected, and captured states.
- Communicate guard attention through animation, posture, facing direction, and optional sound cues. Do not rely on a suspicion meter.
- Show a simple level-complete screen and a caught/retry screen.
- Make the camera and effects comfortable and readable; avoid intense camera shake or flashing.

## Technical Requirements

- First inspect the repository, package scripts, existing game architecture, and conventions.
- Integrate the game into the existing mini-games project if it has a shared launcher or game registry. Do not break or rewrite other games.
- Use Three.js and the project's current build setup. Avoid adding dependencies unless they are necessary.
- Keep game logic organized into small modules or classes for player movement, guard AI, visibility/line-of-sight, sound events, level setup, and UI.
- Use named constants/configuration for tunable gameplay values such as speeds, field-of-view angle, hearing radius, search duration, interaction range, and chase speed. Avoid scattering magic numbers through the code.
- Ensure player and guard collision behavior is predictable. Do not allow the player to pass through solid cover or get trapped by ordinary level geometry.
- Support window resizing and cleanly dispose of per-level listeners, animation loops, and Three.js resources when restarting or leaving the game.
- Keep all three levels deterministic and restartable.

## Acceptance Criteria

- The game launches through the existing project workflow.
- The player can walk, sprint, hold Freeze, retrieve the object, and reach the exit.
- Holding Freeze makes the player stationary and invisible to guards.
- Walking or sprinting makes the player visible immediately.
- A guard that sees the moving player starts a chase; contact catches the player.
- Sprint sound can attract a guard that has not seen the player.
- Breaking line of sight allows the player to escape; the guard searches the last-known location instead of tracking through walls.
- Cover types have distinct, understandable sight protection.
- The player must retrieve the target before the exit will complete the level.
- Three short levels progressively introduce the defined challenges.
- Restarting a level resets its state cleanly and does not leave duplicate event listeners or stuck controls.
- Existing games and navigation continue to work.

## Implementation Notes

Build the smallest complete version that satisfies the acceptance criteria. Prefer simple geometry, readable guard behavior, and reliable game-state transitions. If repository constraints conflict with any instruction here, preserve the existing project architecture and adapt the implementation while retaining the gameplay rules above.

