# Follow-ups

Deferred items with the reason they were deferred, so they don't only live in
chat logs or PR threads. Remove entries when addressed.

## From the 3D gizmo work (PR #2, 2026-07)

### F-001 · Gizmo value clamps diverge from slider ranges (user-visible papercut)

`src/PartGizmos.ts` clamps scale drags to ≥ 0.01 and taper to 0–2, and leaves
position/rotation unclamped, while the panel sliders use `RANGES` (`scl` min
0.1, `pos` ±3, `rot` ±π). A gizmo drag can therefore push state outside the
slider's display range — the slider thumb pins at its end while the number
field and state hold the real value.

Deferred because the clean fix (clamping inside the shared `onInput` setters)
would also clamp typed number-field input, and the editor deliberately allows
typing out-of-range values today. Deciding the intended policy — clamp
everything, clamp only drags, or widen `RANGES` — is a product call.

### F-002 · Per-frame taper bounding-box recompute

`updateTaperHandles` calls `computeBoundingBox()` on every taper-target mesh
every frame while in taper mode. Fine for current low-poly parts (a few
thousand vertex reads per frame); a dirty-flag cache keyed on (node, taper
values) was rejected because it goes stale on part-scale edits. Revisit only
if parts get heavier.

### F-003 · Per-frame `getTaperMeshes()` allocation

The gizmo host callback in `src/editor.ts` builds a fresh mesh array every
frame in taper mode. Negligible GC churn today; cache per part key if it ever
shows up in a profile.

### F-004 · Duplicated pointer→NDC raycast setup

`PartGizmos.setRayFromEvent` and the editor's click-to-select `pointerup`
handler both implement the same 4-line NDC/raycaster block. If a
canvas-transform change breaks one, the other needs the same fix — extract a
shared helper next time either is touched.
