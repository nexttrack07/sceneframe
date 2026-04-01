# Motion Graphics Implementation Plan

## Goal

Add a shot-level motion graphics workflow that lives outside the Remotion editor, so users can generate ready-made overlay graphics from shot context and then import them into the editor as native items.

This should reduce the need to open a blank canvas and manually type/build overlays from scratch.

## Product Direction

### Long-term target

- Shot detail view has a dedicated `Graphics` surface.
- Users can generate multiple motion graphic variants for a shot.
- Each graphic is previewable, regenerable, selectable, and importable.
- Graphics are stored as structured overlay specs, not pre-rendered videos.
- The editor imports those specs as native Remotion items so they remain editable.

### V1 scope

V1 is intentionally narrower:

- Text-only motion graphics.
- Template-generated overlay specs from shot description.
- A new `Graphics` tab in shot detail.
- Two initial presets:
  - `lower_third`
  - `callout`
- One-click `Add to editor` action that appends native text items into the saved editor state.

### Explicit V1 limitations

- No arrows, boxes, SVG callouts, or charts yet.
- No LLM-generated overlay copy yet; text is derived from shot description using deterministic helpers.
- No rich preview renderer; only simple shot-detail preview cards.
- Imported overlays are placed on the editor timeline using cumulative shot durations as an approximation.
- No per-overlay editing UI in shot detail yet.

## Architecture

### Data model

Create a dedicated `motion_graphics` table rather than overloading `assets`.

Rationale:

- These are structured overlay specs, not media files.
- They do not belong in the R2-backed asset lifecycle.
- They need their own schema and editor-import semantics.

Table shape:

- `id`
- `scene_id`
- `shot_id`
- `preset`
- `title`
- `source_text`
- `spec`
- `created_at`
- `updated_at`
- `deleted_at`

### Spec format

V1 spec is text-only and editor-friendly.

```ts
type MotionGraphicSpec = {
  items: Array<{
    id: string
    text: string
    role: "headline" | "subheadline" | "label"
    left: number
    top: number
    width: number
    height: number
    fontSize: number
    color: string
    align: "left" | "center" | "right"
    fromOffsetFrames: number
    durationInFrames: number
    enterAnimation: "fade" | "slide-up" | "slide-left" | "pop"
    enterAnimationDurationInSeconds: number
    exitAnimation: "fade" | "slide-up" | "slide-left" | "pop"
    exitAnimationDurationInSeconds: number
  }>
}
```

### Editor import strategy

V1 should not depend on the editor route being open.

Instead:

- The `Add to editor` action loads the project.
- If `project.editor_state` already exists, append new text items into it.
- If not, build an initial state with `buildEditorState(...)`.
- Ensure a text track exists.
- Append generated text items to that track.
- Save the updated editor state back to the project.

This gives the user a concrete result instead of forcing them to manually recreate the overlay.

## UX Plan

### Shot detail tabs

Current tabs:

- `Images`
- `Video`

V1 adds:

- `Graphics`

### Graphics tab content

Top section:

- explanation of what graphics are
- preset buttons:
  - `Generate lower third`
  - `Generate callout`

Generated graphics list:

- card title
- preset badge
- simple preview
- source text summary
- `Add to editor`
- `Delete`

### Preview behavior

V1 preview is intentionally simple:

- use the selected shot image as a background when available
- overlay headline/subheadline text on top
- do not attempt full animated preview in shot detail yet

## Workstreams

### 1. Plan and tracking

- [x] Create this implementation plan.
- [ ] Keep it updated as work lands.

### 2. Data model and queries

- [x] Add `motion_graphics` table to Drizzle schema.
- [x] Add SQL migration for the new table.
- [x] Add TypeScript summary/spec types.
- [x] Load motion graphics in `loadProject`.

### 3. Motion-graphic generation

- [x] Add deterministic V1 spec builders for `lower_third` and `callout`.
- [x] Add server action to create a motion graphic for a shot.
- [x] Add server action to soft-delete a motion graphic.

### 4. Shot-detail UI

- [x] Add `Graphics` to shot media tabs.
- [x] Add `ShotMotionGraphicsPanel`.
- [x] Wire create/delete actions.
- [x] Render preview cards for generated graphics.

### 5. Editor import

- [x] Add server action to import a motion graphic into `editorState`.
- [x] Ensure a text track exists in the editor state.
- [x] Convert spec items into native Remotion text items.
- [x] Approximate timeline placement using cumulative shot durations.

### 6. Validation

- [x] Typecheck passes.
- [ ] Biome passes on touched files.
- [ ] Manual test: create graphic from shot detail.
- [ ] Manual test: add graphic to editor and confirm text layers appear.

## Progress log

### Current focus

- [x] Plan drafted
- [x] V1 implementation started

### Completed

- [x] Text animation presets already exist in the editor inspector and renderer.
- [x] V1 motion-graphics data model, shot-detail tab, and editor import path landed.

### Next

- [ ] Apply the new DB migration locally and in deployed environments.
- [ ] Manually test shot-detail generation and editor import end-to-end.
- [ ] Decide whether V2 should add editable copy fields, arrows, or richer previews first.
