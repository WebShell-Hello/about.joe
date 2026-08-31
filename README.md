## v54 — Instant trackpad re-arm + forward loop

- Trackpad navigation no longer waits for the full macOS/Safari momentum tail to end before accepting the next deliberate swipe.
- Residual decaying momentum is still swallowed, but a fresh swipe re-arms immediately when its wheel magnitude rises again; the discrete trigger threshold is also reduced for a more keyboard-like response.
- Contact (Scene 7) + DOWN / downward swipe now loops directly back to Home (Scene 1). Home + UP remains clamped to Home.
- Arrow-key navigation and top-navigation behavior are unchanged.

## v52 — Discrete scroll final-frame hold

- Scene 2/3/4 no longer auto-crossfade into the next scene when their video ends.
- Natural video completion freezes on the current scene's final presented frame.
- Only the next discrete wheel/trackpad/touch/navigation action advances to the next scene.
- The frozen final frame participates in the following crossfade, preventing a Safari end-frame flash.

# About Joe — editable multi-scene build

## Code version

- Previous code version: **v45**.
- Current code version: **v46**.
- v46 replaces normal wheel/trackpad scene control with a **navigation-driven portfolio**:
  - Top navigation: `JOSEPH | Home | About | Experience | Skills | Projects | Blog | Contact`.
  - Language control: a compact single `文/A` toggle immediately to the right of `Contact`; each click switches the whole site between English and Chinese.
  - Normal browsing blocks wheel, trackpad pan and page-scroll keyboard input. Edit Mode keeps its existing editing workflow.
  - `Home` opens Scene 1. `About`, `Experience`, and `Skills` enter Scenes 2/3/4 and automatically play the corresponding video. `Projects` opens Scene 5. `Blog` and `Contact` open Scenes 6/7.
  - Scene 1 -> cinematic travel is still driven through the existing Scene 1 scroll-transition timeline, but the browser performs it deterministically after a navigation click rather than user momentum.
  - Scene 2 -> 3 and Scene 3 -> 4 retain the real-tail-frame crossfade; Scene 4 -> 5 retains its existing fade. Natural completion still lands on the next scene's first frame/content.
  - Clicking another navigation item has priority: current playback/timers are cancelled cleanly and the requested scene becomes the only active interaction domain.
  - Scene 6 is a black `Blog` placeholder and Scene 7 is a black `Contact` placeholder.

- v40 removed the 85 ms early video cut-off. Scene 2 and Scene 3 play through the real final presented frame, freeze that frame, and perform a symmetric crossfade into the next scene's frame 1.
- Scene 2 → 3 and Scene 3 → 4 each retain an editable **Video crossfade** duration. One value controls both sides of the crossfade: outgoing opacity 1→0 and incoming opacity 0→1 over the same duration.
- v41 replaces the old Scene 2/3/4 scroll-skip/reverse rules with a simpler state machine:
  - At frame 1, downward wheel/trackpad input starts the video.
  - While playing, downward input is ignored and can never skip the chapter.
  - Upward input while playing triggers a configurable delayed pause (global **Up-scroll pause delay**, default **180 ms**, editable in Scene 2/3/4 transition settings).
  - From a paused frame, downward input resumes playback; upward input softly crossfades back to the same chapter's frame 1.
  - From Scene 3/4 frame 1, upward input softly returns exactly one chapter to the previous chapter's frame 1.
  - From Scene 2 frame 1, upward input unlocks the cinematic stack and returns to Scene 1's native reverse scroll.
  - During any controlled return-to-frame-1 transition, wheel/trackpad input and inertia are swallowed until the transition and gesture tail are finished.
- Future cinematic video layers remain transparent until their transition begins.
- v42 tightens the same state machine without changing the established playback/crossfade model:
  - Scene 1 → 2 hard-locks the cinematic viewport to the current physical `window.innerHeight` in pixels and freezes root scrolling while locked, eliminating `100dvh`/trackpad momentum bounce in Chrome/Safari.
  - Scene 2 entry inertia swallows only the tail of the entering downward gesture. A later genuine upward gesture can immediately release Scene 2 back to Scene 1.
  - Scene 2/3/4 edge shades are fixed viewport chrome while the stack is locked: no scroll transform, CSS transition, or animation is allowed on them.
  - Each video controller now has an explicit runtime `ready` flag: frame-1 idle is not ready; DOWN starts playback and opens ready; pause keeps ready; returning to frame 1, natural completion, and chapter-back transitions close ready.
  - DOWN while playing remains a no-op; DOWN while paused resumes. UP while playing uses the existing global configurable pause inertia delay; a new UP after pause returns only that current scene to frame 1.
  - Scene 3/4/5 chapter-back actions still return exactly one chapter per gesture and all ready flags remain off after the return.

- v43 fixes the Scene 1 → 2 split-frame entry bug:
  - Scene 2 is visually pinned to `top: 0` and Scene 1 is hidden **before** the underlying scroll position is corrected, so a high-momentum wheel/trackpad gesture cannot paint a half Scene 1 / half Scene 2 frame.
  - If a short gesture stops while Scene 2 is only partially visible, an idle-entry snap completes the page turn into Scene 2 instead of leaving the viewport parked between the two scenes.
  - The existing Scene 2 entry inertia guard still swallows the remaining tail of that same downward gesture after the full-screen lock.


- v45 fixes two domain-handoff regressions discovered after v44:
  - Starting Scene 2 no longer re-applies Scene 1 layers (`applyVisuals(2, 1)` was removed for Scene 2), and Scene 1 is visually suppressed whenever Scene 2–5 owns the active domain. This prevents Scene 1 grass/character layers from compositing over Scene 2.
  - Scene 5 no longer hands interaction ownership to Scene 6 before the stack has physically left. Scene 5 keeps the active domain during the exit, Scene 6 receives ownership only after its boundary is reached, and zero-distance overflow/layout scroll events can no longer snap the stack back and flash Scene 1.
  - A dedicated `stackExitForward` state separates the physical Scene 5→6 page exit from chapter interaction and allows a genuine upward reversal to re-lock Scene 5 cleanly.

- v44 introduces **strict per-scene Domain Isolation**:
  - Exactly one scene owns interaction at a time: `scene-1` through `scene-6`.
  - Wheel/trackpad routing is based on `activeDomain`, never inferred from a different scene's scroll position.
  - Inactive scenes may preload and render for crossfades, but they cannot receive pointer interaction, start/resume video, open `ready`, pause, rewind-to-first-frame, or consume wheel gestures.
  - Scene 2→3 / 3→4 / 4→5 crossfades keep the outgoing scene as the active domain for the whole transition. Ownership moves to the incoming scene only after the transition completes.
  - Scene 1 scroll progress, parallax/lens behaviour and linked layers freeze while another domain is active. Scene 5 therefore cannot indirectly drive Scene 1.
  - Scene 6 keeps ownership while the cinematic stack is only partially visible on an upward return; Scene 5 becomes interactive only when the stack has fully aligned to the viewport.
  - Each scene root receives `interaction-domain-active` / `interaction-domain-inactive` plus `data-domain-active`, and inactive roots have pointer interaction disabled in normal mode.
  - Runtime debug API: `window.__joeSimpleVideoStory.getActiveDomainId()` and `getDomainSnapshot()`.


Run locally with:

```bash
python3 server.py
```

Then open:

- Portfolio: `http://localhost:8080/`
- Edit Mode: use the **EDIT MODE / 编辑模式** button at the current page position.

## Current scene scope

Scenes 1–7 are included in this build.

## Editing model

- `data/layout01.json` = committed/live layout.
- `data/layout02.json` = edit-session draft.
- **Save** commits layout02 → layout01.
- **Cancel** restores the exact committed layout.
- Entering Edit Mode, Preview, Save and Cancel preserve the current scene and relative scroll position.

## Text editing

Each text layer can maintain both languages at the same time:

- English
- 中文

The saved JSON uses a compact bilingual form such as:

```json
"text":{"en":"Projects","zh":"项目"}
```

instead of storing duplicate `text + localized + texts` fields.

Text layers also support:

- Font family
- Font size / weight / spacing / line height
- Color and alignment
- Link or internal jump target
- Same-tab / new-tab behavior
- Internal jump offset in pixels

While Edit Mode is active, website hyperlinks are disabled so linked text behaves as ordinary editable text.

## Editor window

- Drag from the header or any outer border.
- Resize width and height from the lower-right resize handle.
- Position and dimensions are remembered locally.
- Undo / Redo keeps up to 20 editing steps.


## v15 editor updates

- Browser tab title is bilingual and editable in **Site settings** (`English` / `中文`).
- The whole editor can be moved **only by its visible 1px outer border**. Clicking inside the editor never starts a window drag.
- The editor resize handle stays at the lower-right corner and resizes the editor width/height.
- Every editor module has its own right-edge width handle. Module widths, editor width/height, position, and collapsed state are remembered in localStorage and restored next time Edit Mode opens.
- **Preview** is a temporary `layout02.json` draft preview and does not commit or discard anything. Edit/Preview/Normal mode, language, and scene-relative scroll position are now stored internally with session state, so the browser address remains clean (`/`). Preview shows **Return to editor / 返回编辑器** and resumes the same draft and viewport location.
- Save still commits `layout02.json -> layout01.json`; Cancel still restores the committed version.

## Editor horizontal-scroll chrome fix

The editor outer frame is separated from the horizontally scrolling module strip. The 1px right drag border and bottom-right resize handle are pinned to the editor viewport and no longer move into the middle when the modules are scrolled sideways.

## v7 — Text box reflow editing

- Text selection handles resize the text box width instead of scaling the font.
- Left/right text-only resize handles are shown for a single selected text layer.
- Text settings include a Text box width / 文本框宽度 numeric control.
- Resized text boxes use normal wrapping with preserved manual line breaks (`pre-wrap`).
- Font size and layer scale remain unchanged while resizing a text box.
- Text box height follows the reflowed content automatically.


## v8 x-ray rendering fix

- X-ray masks are forced to `no-repeat`, `100% 100%`, origin `0 0` to prevent duplicated/ghost reveal regions in Safari and Chrome.
- Stale mask geometry is cleared when the lens is inactive.
- Editor drag border thickness increased from 1px to 2px.


## Clean URL state (v10)

- The address bar stays at `/`; `lang`, `scene`, `rel`, `edit`, and `preview` are no longer written into the URL.
- Active language and current view mode are stored per browser tab in `sessionStorage`.
- Scene + relative scroll location is passed internally only during Edit / Preview / Save / Cancel transitions and consumed after restoration.
- Old bookmarked URLs such as `?lang=zh&scene=2&rel=...` are migrated once and immediately cleaned with `history.replaceState`.

## v11 — Editor module width memory

- Every editor module now has a stable persistence ID.
- Module widths are stored independently as `moduleId -> width`.
- Hidden Scene-specific modules are never measured as `0px` and therefore cannot overwrite their remembered width.
- Resizing one module updates only that module's width memory.
- Returning to a previous Scene restores each module to its own previous width.
- Existing v1 editor UI width settings are migrated when possible.


## v21 interaction notes
- Scene 1 now accepts text/image layers correctly.
- UI Scene 2 text follows its background transition offset.
- Canvas text layers support Command/Ctrl+C and Command/Ctrl+V duplication.
- Move drags can cross scene boundaries.
- Every scene transition includes dwellRatio (页面暂留比例).
