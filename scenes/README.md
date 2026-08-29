# Scene modules

This build currently contains seven scenes: `scene-1` through `scene-7`. Scenes 2–5 remain mounted in one shared visual cinematic stack; Scenes 6–7 are ordinary full-screen pages.

Each scene owns its own `scene.html`, `scene.css`, `scene.js`, and optional `assets/` folder. `../app.js` loads the scenes in `manifest.js` order, then starts the shared runtime and editor.

Cross-scene concerns belong in `shared/`: persistence, layout normalization, layer ordering, bindings, Save/Don't save transactions, shared editor controls, and coordinate conversion.


## v46 navigation-driven interaction

Normal browsing is controlled only by the top navigation (`Home / About / Experience / Skills / Projects / Blog / Contact`). Wheel, trackpad pan and page-scroll keyboard input are blocked outside Edit Mode. Scenes 2–5 can still share visual layers and real-tail-frame crossfades, but only the navigation engine changes active domains. Scene 6 is the Blog placeholder; Scene 7 is the Contact placeholder.


## v42 cinematic interaction

Scenes 2–5 still share the single 100dvh cinematic stack. v42 hard-freezes the root scroll and locked stack height in pixels during cinematic interaction, adds an explicit per-video runtime ready state, and makes Scene 1→2 entry momentum direction-aware so a later upward gesture can return normally to Scene 1 without allowing the original downward inertia to bounce the stack.


## v44 interaction domains

Scenes remain visually composable, but interaction is isolated per scene. `activeDomain` is the sole owner of wheel/trackpad and scene-level interaction. Inactive scenes may preload media or participate visually in a system-controlled crossfade, but they never respond to user input. Domain ownership changes only when the relevant boundary or crossfade has fully completed.

Domain order: `scene-1` → `scene-2` → `scene-3` → `scene-4` → `scene-5` → `scene-6`. Scenes 2–5 still share the same visual Cinematic Stack; this no longer means they share interaction ownership.
