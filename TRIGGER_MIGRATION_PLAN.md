# Trigger Migration Plan

This file tracks the remaining migration of long-running media generation flows to Trigger.dev.

Status conventions:
- `[ ]` not started
- `[-]` in progress
- `[x]` completed

## Goals

- Move long-running asset generation off inline server functions and into Trigger.dev.
- Keep the database as the durable source of truth for completion state.
- Use Trigger run state to enrich the UI with live statuses like `Queued`, `Generating`, `Retrying`, and `Finalizing`.
- Preserve one canonical loading card per generation attempt.

## Already Completed

- [x] Migrate active shot-image generation to Trigger.dev.
- [x] Store Trigger run IDs in `assets.jobId` for shot-image generation.
- [x] Make the shot-image UI Trigger-aware for in-progress state.
- [x] Add richer loading badges and Trigger-backed timers for shot-image generation.
- [x] Reduce duplicate loading placeholders in the shot-detail image UI.

## Remaining Work

### Phase 1: Scene Images

- [x] Add `generate-scene-image-asset` Trigger task.
- [x] Refactor `generateSceneImages` into an enqueue-only server function.
- [x] Store Trigger run IDs in `assets.jobId` for scene-image generation.
- [x] Reuse the same DB-plus-Trigger UI model for scene-image loading state.

### Phase 2: Audio

- [x] Add `generate-voiceover-asset` Trigger task.
- [x] Refactor `generateVoiceoverAudio` into an enqueue-only server function.
- [x] Store Trigger run IDs in `assets.jobId` for voiceover generation.
- [x] Update voiceover UI semantics from immediate completion to queued completion.

- [x] Add `generate-sfx-asset` Trigger task.
- [x] Refactor `generateSoundEffectAudio` into an enqueue-only server function.
- [x] Store Trigger run IDs in `assets.jobId` for sound effect generation.
- [x] Update sound effect UI semantics from immediate completion to queued completion.

- [x] Add `generate-background-music-asset` Trigger task.
- [x] Refactor `generateBackgroundMusic` into an enqueue-only server function.
- [x] Store Trigger run IDs in `assets.jobId` for background music generation.
- [x] Update background music UI semantics from immediate completion to queued completion.

### Phase 3: Kling Video

- [x] Add `start-shot-video-generation` Trigger task.
- [x] Add `check-shot-video-generation` Trigger task.
- [x] Refactor `generateShotVideo` into an enqueue-only server function.
- [x] Save provider prediction ID into `generationId` and Trigger run ID into `jobId`.
- [x] Move video finalization, upload, and DB completion writes into Trigger tasks.
- [x] Reduce or retire `pollVideoAsset` once Trigger owns the lifecycle.
- [ ] Make shot-video UI Trigger-aware for live statuses.
  There is no active shot-video UI surface in the repo today; the backend path is migrated and ready if that UI returns.
- [x] Remove or align dead video-generation code paths that are no longer mounted or no longer match the Trigger architecture.
  This includes unused transition/shot video UI remnants and any stale polling-era helpers left behind after the migration.

- [x] Add `start-transition-video-generation` Trigger task.
- [x] Add `check-transition-video-generation` Trigger task.
- [x] Refactor `generateTransitionVideo` into an enqueue-only server function.
- [x] Save provider prediction ID into `generationId` and Trigger run ID into transition video metadata.
- [x] Move transition video finalization, upload, and DB completion writes into Trigger tasks.
- [x] Reduce or retire `pollTransitionVideo` once Trigger owns the lifecycle.
- [x] Make transition-video UI Trigger-aware for live statuses.

## Cross-Cutting Requirements

- [x] Standardize `jobId` usage for all Trigger-backed media rows.
- [x] Keep stale-write guards in every Trigger task before final DB updates.
- [x] Keep the database as the durable completion source of truth for all migrated flows.
- [x] Standardize immediate UI messaging to `Queued ...` for all migrated flows.
- [x] Standardize richer in-progress labels across image, audio, and video surfaces.
- [x] Verify navigation/remount behavior so one generation attempt maps to one loading card.

## Explicitly Out of Scope For This Pass

These stay as request/response server functions unless they later prove too slow or operationally painful:

- Prompt generation and enhancement flows
- Workshop chat flows
- Scene-description refinement
- Shot-breakdown generation in `approveScenes`

## Working Rules

- Mark a task `[x]` only when code is implemented and verified.
- Prefer single-task Trigger workers for scene images and audio jobs.
- Prefer two-stage Trigger workflows for Kling video jobs because typical runtimes are 3 to 7 minutes.
