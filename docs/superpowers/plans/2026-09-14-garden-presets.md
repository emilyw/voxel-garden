# Garden Presets Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Intended executor: Luna / the lower model selected by the main session. Concept is already approved; do not restart design approval.

**Goal:** Create separate saved gardens from Empty Grounds, Cottage Garden, and Wild Meadow, preserving existing gardens and offering presets only during creation.

**Architecture:** Keep runtime HTML, CSS, model, rendering, and persistence in `voxel-garden.html`. Add versioned preset definitions, editable scenery records, and one versioned localStorage library containing independent garden records. Preserve the old storage key as a migration backup.

**Tech Stack:** Plain JavaScript, inline CSS/HTML, Three.js 0.160.0; Node's built-in test runner for model/storage tests.

## Scope and inspected baseline

- Repository: `/Users/emsot/projects/games/voxel-garden`; baseline commit `3a5d4bb`; worktree was clean before this plan. No applicable ancestor or repository `AGENTS.md` found. No package manifest or tests currently exist.
- Planning deliverable only: no implementation or commits in this session. Execution is a separate handoff.
- Runtime remains a single HTML file; add `tests/garden-model.test.mjs` and `tests/garden-storage.test.mjs` for verification. No framework, bundler, backend, accounts, garden deletion, or import/export UI.
- Practical editability means selecting, deleting, undoing, and replacing objects/patches with existing build tools. The supporting island stays permanent; arbitrary terrain excavation and moving entire sculptures are outside this feature.

## Critical source findings (line numbers refer to baseline)

- Model at 513–940: version 2, numeric object IDs, limits of 240 blocks/40 templates/100 plants. `isValidState()` accepts only the current version.
- `update()` around 805 hardcodes rain shelter at four building coordinates, independently of actual scenery.
- `island()` at 1080–1203 creates irregular ground, paths, tufts, pond, rocks, bridge, gazebo, glasshouse, shed, pergola, hive, beds, trees, flowers, hedges, clouds, and habitat unconditionally.
- `beds()` at 1344 registers permanent planting surfaces. `trees()` at 1426 batches leaves across trees. `flowers()` at 1491 generates permanent flower clumps/hedges and pollinator targets.
- `rebuild()` at 1655 only updates saved blocks/templates/plants. Static scenery is neither saved nor selectable.
- `starter()` at 1760 seeds seven plants on permanent beds. `load()/save()` at 1784 use only `moss-marrow-3d-v2`; invalid data currently falls back to starter and can be overwritten. A failed write disables all later retries.
- `staticOccupied()` at 1896 blocks fixed coordinates; `tap()` around 1999 checks only the placement center and bypasses this check when clicking a block. Model placement does not enforce these restrictions.
- Model bounds allow x/z ±18, but rendered land is x ±18/z ±15 with random edge holes; the invisible 38×32 picking plane also extends beyond land.
- `motion()` at 2509 assumes nonempty `flowerTargets`; around 2651 it unconditionally dereferences `water.material`. Fish, ripples, audio, seasonal decorations, and cached target arrays also assume the original scene.
- `frame()` at 2662 grows plants and saves every ten seconds. `Home` currently resets the camera; preserve that behavior.

## 1. Establish compatibility fixtures and model seams

- [ ] Extract the inline `garden-model` script into a Node VM inside the test harness; do not move runtime code out of HTML. Give the new inline persistence module an ID so it can be tested the same way with injected storage.
- [ ] Add a valid v2 fixture containing blocks, a raised bed, mature/watered plants, nondefault season/weather/sound, elapsed time, and a nontrivial nextId. Assert exact preservation of these values after migration.
- [ ] Preserve v2 validation as a separate legacy validator before introducing state version 3. Do not make old saves valid merely by rewriting their version before validation.
- [ ] Define pure model entry points: `createPresetState(presetId)`, `migrateLegacyState(v2)`, `activeFeatures(state)`, `canPlace(state, action)`, and existing `reduce/update/loadState` behavior. Export them through `GardenModel` for tests and UI reuse.

## 2. Define three distinct starting worlds

- [ ] Add preset IDs `empty`, `cottage`, `meadow` and a hidden migration-only layout ID `legacy`. State v3 adds `layoutId`, `layoutVersion: 1`, and `removedFeatureIds: []` to existing fields. Freeze layout version 1 definitions so future preset changes cannot rearrange saves.
- [ ] Describe scenery as deterministic feature records with string IDs, kind, position/shape, footprint, planting surfaces, and shelter where relevant. Derive active records from the versioned layout minus removed IDs; retain numeric IDs for existing user objects. Validate removed IDs against that layout.
- [ ] Empty Grounds: continuous flat grass over earth for integer x −18…18/z −15…15. No pond, paths, tufts, trees, buildings, beds, flowers, starter plants, or ground decoration. Start in Build with soil selected and explain that soil or a raised bed enables planting.
- [ ] Cottage Garden: same continuous base; cottage using the existing `shed()` geometry at (10, −7), two raised beds at (5, 3) and (11, 3), bench at (−5, 4), trellis at (5, 8), a short path along x=0/z=−8…8, flower clumps at (−4, −5)/(−4, 0), and trees at (−13, −10)/(14, 11). Seed a few supported plants inside the two beds; retain open building space.
- [ ] Wild Meadow: same continuous base; trees at (−14, −10)/(13, −10)/(14, 11), flower clumps at (−9, −5)/(−5, 7)/(4, −8)/(9, 5)/(−12, 10)/(11, 11), and modest removable tuft patches around those clumps. No cottage, formal paths, or pond. Keep the center clear; building soil/beds enables crop planting.
- [ ] Legacy layout: preserve original terrain silhouette, pond, paths, every structure, all three beds, all tree/clump positions, hedges, and seven starter positions where already saved. Migration must not apply a new preset or reset plant progress.
- [ ] Use existing templates for starter raised beds/bench/trellis, with unique numeric IDs and normal deletion. Use feature records for authored scenery; do not consume hundreds of user block slots for decoration.

## 3. Make scene construction and editing follow state

- [ ] Split `island()` into base terrain construction and active-feature rendering. Parameterize existing geometry helpers by parent group; retain their visual geometry. Give each building, tree, bed, flower clump, hedge patch, tuft patch, path patch, and pond feature a selectable group with its feature ID.
- [ ] Keep the legacy pond, rim rocks, habitat, fish, ripples, and long bridge as one removable pond assembly. Its deletion restores flat grass and removes its collision/audio/animation effects; Undo restores the assembly. Treat legacy paths as a removable path patch and restore grass beneath them.
- [ ] Separate each tree's leaf batches so selecting/deleting one cannot remove other trees. Preserve seasonal leaf/flower metadata when adding selection metadata. Include active feature groups in raycasts; do not overwrite soil-surface metadata with generic object metadata.
- [ ] Add `deleteFeature` to the reducer and store its ID in `removedFeatureIds`; use normal history snapshots for Undo. Deleting a bed also removes only plants supported by that bed, accounting for overlapping alternative soil support. Deletions persist across reloads and switching.
- [ ] Make selection distinguish numeric saved-object IDs from string feature IDs. Update Select/Delete captions to include preset scenery. Replacing a removed feature with blocks or existing templates must work; no per-voxel dismantling requirement.
- [ ] Rebuild static geometry only for garden activation and feature edits/undo, not for every plant growth tick. Clear ground/flower targets, leaf batches, fish, ripples, object maps, and old scene groups before constructing the replacement scene.
- [ ] Dispose resources owned by removed scenes, including instanced-mesh resources and unique water/cloud materials/geometries. Preserve shared cube geometry and cached materials still in use. Recreate wildlife/particle registrations without accumulating duplicate objects.

## 4. Remove invisible restrictions and empty-world crashes

- [ ] Replace fixed-coordinate `staticOccupied()` and `authoredRoof` with active-feature geometry. Use one model placement predicate for previews and reducer commits, checking the complete template footprint and rotation rather than just its center.
- [ ] Apply actual playable land membership to new placement, including legacy edge holes and all template footprint cells. Keep legacy validation permissive enough to retain previously valid saved coordinates, even if new placement there is disallowed.
- [ ] For Empty Grounds, verify (−1, −4), (−10, 7), (10, −7), (12, 7), (−11, −7), and (14, 0) are usable: these are former pond/building restrictions. Rain must water exposed plants there.
- [ ] Block placement through active solid scenery, including adjacency placement from existing blocks. Allow planting on exposed valid soil, including legacy soil under glasshouse roofs; roof cover affects rain, not whether a saved bed exists. Deleting scenery immediately releases its footprint and shelter.
- [ ] Preserve existing bridge-over-pond behavior with an explicit exception based on active pond geometry. Do not globally bypass collision checks for every bridge placement.
- [ ] Guard absent water and empty flower targets. Hide pollinators when neither decorative targets nor eligible plants exist; enable them when flowering plants appear. Gate pond sound on pond presence and tree-derived drifting leaves/petals on actual vegetation. Weather, sky, and clouds can remain ambient.

## 5. Add durable garden-library storage and migration

- [ ] New key: `moss-marrow-gardens-v1`. Envelope fields: `version: 1`, `activeGardenId`, `gardens`. Each garden has a stable unique string `id`, `name`, `presetId`, `createdAt`, `updatedAt`, and independent v3 `state`. One atomic envelope write avoids cross-key partial creation/switching; “saved separately” means independent records, not necessarily separate storage keys.
- [ ] Read the new key first. Only when it is absent, read `moss-marrow-3d-v2`; validate and migrate a valid old save into one garden named “My Garden” with presetId/layoutId `legacy`. Keep the legacy key byte-for-byte unchanged and write the new library before reporting migration saved.
- [ ] Migration is idempotent: when the new library exists, never reimport the legacy record. Preserve all original numeric IDs/nextId. Invalid JSON, unsupported versions, invalid records, and dangling active IDs are explicit recovery errors; never silently replace stored data with a starter garden or stale legacy backup.
- [ ] Expose storage outcomes as loaded, absent, or unavailable/invalid. Catch both reads and writes. Keep the current library and active edits in memory after write failure; display “Not saved on this device” and provide Retry Save. Do not permanently disable retries.
- [ ] On create/switch, construct a candidate library containing the latest active state, target record, and target active ID. Persist that candidate before activating it. On failure keep the current garden and dialog intact, retain edits, and show the error; retry must not create duplicate gardens.
- [ ] With unavailable/corrupt storage at startup, show recovery status with Retry and an explicit “Continue without saving” choice. Session-only mode may create/switch in-memory gardens but must never overwrite the unreadable library automatically or claim durable saving.
- [ ] Validate envelope and nested records before use, reject duplicate garden IDs, bound display-name length, and render names with textContent. Do not add multi-tab merging; detect external library changes and block stale writes with a reload notice to prevent silent overwrites.

## 6. Add creation and switching UI

- [ ] Add a Gardens button and current garden name; retain Home as camera reset. Gardens opens an accessible modal listing saved names with Open and a New Garden button. Existing gardens open directly without preset selection.
- [ ] New Garden opens a separate creation view with exactly three labeled preset choices and short descriptions, an optional name defaulting to the preset name, Create Garden, and Cancel. Do not create/save anything until Create Garden is pressed. Permit multiple gardens from the same preset with unique IDs.
- [ ] On first launch with no saved data show creation; use a neutral base scene behind it, with gameplay paused. Cancelling from an existing garden returns without mutations; with no garden, cancellation returns to the empty library view.
- [ ] On successful activation clone target state, clear Undo history/selection/ghost/card/subtray/pointer state, reset camera and growth accumulator/signature, rebuild the world, apply season/weather/sound, and refresh trays/save status. Inactive gardens do not grow offline. Pause simulation/input while a modal is open; reset timing on close.
- [ ] Use a native dialog with labels, focus restoration, Escape/Cancel, keyboard selection, scrollable content, and mobile-safe sizing. Prevent canvas taps/keyboard actions passing through the modal. Keep the UI responsive at 390×844 and desktop sizes.

## 7. Meaningful verification and completion

- [ ] Run `node --test tests/garden-model.test.mjs tests/garden-storage.test.mjs`. Cover exact v2 migration/idempotence; three distinct presets; zero Empty objects/features/plants; valid starter support; removal/Undo/reload; whole-footprint collisions; former forbidden coordinates; rain with absent/deleted/present roofs; and legacy coordinate preservation.
- [ ] Storage tests use a fake storage adapter that throws on get/set and can simulate quota exhaustion. Assert originals remain byte-identical on failed migration/create/switch, dirty active edits survive failures, retry succeeds, duplicate retries do not duplicate records, active ID survives reload, corrupt/future data is not overwritten, and external-change detection blocks stale writes.
- [ ] Serve with `python3 -m http.server 8000`; inspect `http://localhost:8000/voxel-garden.html` in an isolated browser storage context. Three.js currently requires its CDN; report that dependency if unavailable. Never clear the user's actual storage to test.
- [ ] Browser checks: create all three gardens, edit each differently, switch and reload, verify separation and active selection; open a populated legacy fixture and compare its original appearance/progress; delete and Undo representative tree/bed/path/pond/building features, then reload their deleted state.
- [ ] On Empty Grounds build soil and a raised bed, plant/water/grow a crop, build at all former obstruction coordinates and near valid edges, delete/Undo, change every season/weather, and run animation for at least 15 seconds. Confirm no invisible pond, decorations, restrictions, phantom roof shelter, or console exceptions.
- [ ] Switch between legacy pond and Empty repeatedly; verify fish/ripples/targets disappear, scene children/resources do not grow monotonically, sound matches the active garden, and pending ghosts/Undo cannot affect another garden. Verify modal keyboard/mobile behavior and blocked-storage recovery in-browser.
- [ ] Run `git diff --check`; report tests, browser evidence, and limitations. Do not add unrelated cleanup or change the deployment model. Main session controls any commit/publish step separately.
