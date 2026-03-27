# Trigger Scaling And Reliability Plan

This document tracks the next phase of work after the core Trigger.dev migration.

The migration itself is largely complete: long-running image, audio, and active video generation have been moved onto Trigger tasks. The next phase is about making that system more durable, more observable, more scalable, and easier to extend.

This file is intentionally detailed so it can be used as an execution checklist, design reference, and progress tracker.

Status conventions:
- `[ ]` not started
- `[-]` in progress
- `[x]` completed

## Purpose

The current Trigger-backed media system works, but it still has a few structural weaknesses:

- different model families share similar queue behavior even when they have very different runtime profiles
- the UI still relies heavily on polling and inferred state instead of explicit run stages
- batch work is fanned out, but not yet coordinated as a first-class workflow
- provider success and app success can still diverge without enough explicit lifecycle staging
- timeouts, retries, and recovery behavior are only partially standardized across model families

This plan addresses those gaps.

## Critical Findings From Architecture Review

A deep review against Trigger.dev documentation revealed that the current implementation uses bare `task()` calls with **zero configuration**. All tasks lack:
- Queue isolation
- Concurrency limits
- Retry policies
- Timeout budgets

Trigger.dev provides native primitives that solve many problems this plan originally proposed to build custom:

### Native Trigger.dev Features To Leverage

**Queue Isolation and Concurrency**
```typescript
export const myTask = task({
  id: "my-task",
  queue: {
    name: "image-generation",
    concurrencyLimit: 10,
  },
  // ...
});
```

**Retry Configuration**
```typescript
export const myTask = task({
  id: "my-task",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
  },
  // ...
});
```

**Batch Processing with `batchTriggerAndWait()`**
```typescript
const results = await myTask.batchTriggerAndWait(
  items.map(item => ({ payload: item }))
);
// Returns array of results, handles partial failures natively
```

**Checkpoint-Resume with `wait.for()`**
```typescript
// Frees compute during wait - no billing for idle time
await wait.for({ seconds: 30 });
// Task resumes from checkpoint after wait
```

**Per-User Rate Limiting with `concurrencyKey`**
```typescript
export const myTask = task({
  id: "my-task",
  queue: {
    name: "video-generation",
    concurrencyLimit: 5,
    concurrencyKey: "user-${userId}", // per-user fairness
  },
  // ...
});
```

### Known Bugs Identified In Review

1. **Missing shot video timeout** — `checkShotVideoJob` has no abandonment threshold; jobs can poll forever
2. **Hard delete in generate-script.ts** — violates soft-delete convention in CLAUDE.md
3. **`loadActiveAsset` duplication** — same helper copy-pasted across 6+ task files
4. **Non-atomic enqueue** — DB inserts and Trigger enqueue are not transactional; can diverge on partial failure
5. **N+1 `runs.retrieve()` calls** — polling loops fetch runs one at a time instead of batching

## Desired End State

At the end of this phase, the media system should behave like this:

1. Every media generation request is routed through a well-defined Trigger workflow.
2. Each workflow uses queueing, concurrency, timeout, and retry policies appropriate for that provider and model family.
3. The UI can distinguish real execution stages, not just broad `generating` placeholders.
4. Batches use native `batchTriggerAndWait()` for coordination.
5. Provider success, file finalization, and DB completion are represented as separate lifecycle stages.
6. Recovery after outages, restarts, or dropped local sessions is predictable and automatic.
7. Adding a new model family should primarily be a configuration change.

## Design Principles

### 1. Database Is The Durable Truth

The database remains authoritative for:
- whether an asset or transition video is complete
- the final URL/storage key
- the canonical error state
- durable timestamps and identity

Trigger should enrich live execution state, not replace persisted completion truth.

### 2. Trigger Owns Workflow Execution

Trigger should own:
- long-running work
- orchestration between workflow stages
- retries
- scheduling and follow-up checks
- model-family-specific execution policy

Server functions should increasingly become enqueue-only entrypoints.

### 3. Provider Success Is Not Completion

A provider returning `succeeded` is only one stage of the lifecycle. Completion should be modeled as:

1. queued
2. submitted to provider
3. waiting on provider
4. provider succeeded
5. output finalized into storage
6. DB row committed as `done`

This distinction matters because several bugs so far have happened after the provider returned success.

### 4. One Attempt Maps To One Canonical Identity

Every generation attempt should map to one stable persisted identity:
- `assets.id` for image/audio/shot-video rows
- `transition_videos.id` for transition videos

Trigger runs may chain or reschedule, but the UI and DB should continue to understand the work as one attempt.

### 5. Use Native Trigger.dev Primitives

Do not build custom orchestration when Trigger.dev provides it natively:
- Use `queue` for isolation, not custom routing
- Use `retry` config, not manual retry loops
- Use `batchTriggerAndWait()` for batches, not custom coordinators
- Use `wait.for()` for polling, not self-rescheduling tasks
- Use `concurrencyKey` for per-user fairness, not application-level throttling

## Scope

This plan covers:
- provider/model concurrency controls via native queues
- explicit run-stage metadata
- batch processing via `batchTriggerAndWait()`
- model-family timeout/retry/recovery policies via native config
- better operational observability
- prerequisite refactoring of scene-actions.ts

This plan does not yet require:
- replacing all polling with realtime subscriptions
- a full cross-device persisted draft system
- a unified registry for every provider in the app beyond media generation

Realtime subscription work is included as a later optional phase, not an immediate prerequisite.

## Workstreams

## Workstream 0: Prerequisite Refactoring

Goal: reduce scene-actions.ts to a maintainable size before adding more complexity.

### Why This Matters

`scene-actions.ts` is currently 3,020 lines. CLAUDE.md requires splitting files at 1,500 lines. Adding reliability infrastructure to a file this large will make maintenance harder.

### Tasks

- [ ] Split scene-actions.ts by domain:
  - `shot-actions.ts` — shot CRUD, shot image/video generation
  - `transition-actions.ts` — transition video generation and polling
  - `scene-actions.ts` — scene-level operations only
- [ ] Extract `loadActiveAsset` helper to shared `trigger/helpers.ts`
- [ ] Fix hard delete in `generate-script.ts` to use soft delete

### Completion Criteria

- scene-actions.ts is under 1,500 lines
- shared helpers are deduplicated
- no hard deletes remain in media generation code

## Workstream 1: Queue And Concurrency Configuration

Goal: add queue isolation and concurrency limits using native Trigger.dev primitives.

### Why This Matters

All current tasks use bare `task()` with no configuration. This means:
- No queue isolation between fast images and slow videos
- No concurrency limits to prevent provider overload
- No per-user fairness

### Queue Strategy

Define 4 shared queues instead of per-model-family queues:

| Queue | Concurrency | Use Case |
|-------|-------------|----------|
| `image-generation` | 10 | All image tasks |
| `audio-generation` | 5 | TTS, music generation |
| `video-generation` | 3 | All video providers |
| `script-generation` | 5 | LLM-based script work |

### Tasks

- [ ] Add queue configuration to `generate-shot-image-asset.ts`
- [ ] Add queue configuration to `generate-scene-image-asset.ts`
- [ ] Add queue configuration to `generate-shot-video-asset.ts`
- [ ] Add queue configuration to `generate-transition-video.ts`
- [ ] Add queue configuration to `generate-voiceover.ts`
- [ ] Add queue configuration to `generate-script.ts`
- [ ] Add `concurrencyKey` for per-user fairness where appropriate
- [ ] Document queue strategy in code comments

### Example Configuration

```typescript
export const generateShotImageAsset = task({
  id: "generate-shot-image-asset",
  queue: {
    name: "image-generation",
    concurrencyLimit: 10,
  },
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
  },
  run: async (payload) => { /* ... */ },
});
```

### Completion Criteria

- all media tasks have explicit queue configuration
- video tasks do not starve image tasks
- per-user concurrency prevents single-user monopolization

## Workstream 2: Explicit Workflow Stages

Goal: make the lifecycle visible and unambiguous for both the UI and backend debugging.

### Why This Matters

Today many flows collapse into:
- queued
- generating
- done
- error

That is too coarse. It hides the difference between:
- waiting in queue
- provider running
- provider finished but file upload still pending
- final DB write pending

### Stage Model

Use a simplified 6-stage model (not 11):

| Internal Stage | User-Facing Label |
|----------------|-------------------|
| `queued` | Queued |
| `running` | Generating |
| `retrying` | Retrying |
| `finalizing` | Finalizing |
| `completed` | Done |
| `failed` | Error |

The DB does not need to store all of these permanently. The workflow layer should produce them consistently.

### Tasks

- [ ] Define a shared `MediaStage` type in `trigger/types.ts`
- [ ] Add stage logging to each Trigger task at key points
- [ ] Update image UI to show retrying/finalizing where relevant
- [ ] Update transition video UI to show more specific states
- [ ] Ensure stage fallback remains safe if Trigger state is missing

### Completion Criteria

- media flows emit consistent internal stages
- UI no longer needs to guess as much from a broad `generating` state
- debugging a stuck run becomes easier because the last known stage is explicit

## Workstream 3: Batch Processing With Native Primitives

Goal: use `batchTriggerAndWait()` for image batches instead of building a custom coordinator.

### Why This Matters

The original plan proposed building a batch coordinator. Trigger.dev provides `batchTriggerAndWait()` which:
- Triggers multiple tasks and waits for all to complete
- Returns structured results including partial failures
- Handles aggregation natively

### Tasks

- [ ] Refactor shot image batch generation to use `batchTriggerAndWait()`
- [ ] Refactor scene image batch generation to use `batchTriggerAndWait()`
- [ ] Add aggregate progress reporting from batch results
- [ ] Handle partial failures gracefully (some images fail, some succeed)

### Example Pattern

```typescript
// Instead of N individual triggers:
const results = await generateShotImageAsset.batchTriggerAndWait(
  assetPayloads.map(payload => ({ payload }))
);

const succeeded = results.filter(r => r.ok);
const failed = results.filter(r => !r.ok);

// Update batch status based on aggregate results
```

### Completion Criteria

- image batches use native batch primitives
- partial failure handling is explicit
- no custom batch coordinator needed

## Workstream 4: Reliability Hardening

Goal: combine finalization, timeout, retry, and recovery into a single reliability workstream.

### Why This Matters

The original plan split these across WS4 and WS5. They are tightly related and should be addressed together.

### Retry Configuration By Family

| Family | Max Attempts | Factor | Min Timeout | Max Timeout |
|--------|--------------|--------|-------------|-------------|
| image | 3 | 2 | 1s | 30s |
| audio | 3 | 2 | 2s | 60s |
| video | 2 | 2 | 5s | 120s |
| script | 3 | 2 | 1s | 30s |

### Tasks

- [ ] Add retry configuration to all Trigger tasks (see table above)
- [ ] Add explicit timeout budget to video tasks
- [ ] Fix missing abandonment threshold in `checkShotVideoJob`
- [ ] Audit all finalization paths for consistent error handling
- [ ] Introduce shared `finalizeMediaAsset` helper for upload+DB commit
- [ ] Distinguish error classes in user-facing messages:
  - `timed out`
  - `provider rejected input`
  - `upload failed`
  - `job abandoned`

### Video Polling With `wait.for()`

Replace self-rescheduling video checks with `wait.for()` loops:

```typescript
// Instead of self-rescheduling:
while (status === 'processing') {
  await wait.for({ seconds: 30 }); // Frees compute during wait
  status = await checkProviderStatus(jobId);
  if (attempts++ > MAX_ATTEMPTS) {
    throw new Error('Video generation timed out');
  }
}
```

### Tasks (continued)

- [ ] Refactor transition video polling to use `wait.for()` loop
- [ ] Refactor shot video polling to use `wait.for()` loop
- [ ] Add MAX_ATTEMPTS constant for abandonment threshold
- [ ] Ensure abandoned jobs are marked `error` with clear message

### Completion Criteria

- all tasks have explicit retry configuration
- video tasks have abandonment thresholds
- finalization failures are distinguishable from provider failures
- self-rescheduling is replaced with `wait.for()` loops

## Workstream 5: Observability And Debuggability

Goal: make it easy to answer "what happened to this run?" without deep manual investigation.

### Why This Matters

As the number of providers and models grows, ad hoc debugging becomes expensive.

The system should make it easy to determine:
- what was enqueued
- what stage it reached
- which provider/model family ran
- whether it failed at provider, upload, or DB finalization
- whether it was recovered later by poll fallback

### Tasks

- [ ] Standardize structured logging fields in Trigger tasks:
  - `mediaType`: image | audio | video | script
  - `modelId`: the specific model identifier
  - `rowId`: asset.id or transitionVideo.id
  - `batchId`: if applicable
  - `generationId`: for staleness checks
  - `stage`: current workflow stage
- [ ] Add concise server-side logs around enqueue decisions
- [ ] Add helper comments explaining recovery paths
- [ ] Create simple query helpers for local debugging

### Completion Criteria

- Trigger logs answer the basic lifecycle questions without guesswork
- local debugging of stuck work is faster and more consistent

## Workstream 6: Optional Realtime Upgrade

Goal: reduce reliance on polling where it materially improves UX.

### This Is Optional For Now

This is intentionally not required before the other workstreams. The system should first be made more reliable and explicit.

### Tasks

- [ ] Audit whether Trigger realtime client support fits the current frontend architecture
- [ ] Decide where realtime adds enough value to justify complexity
  - Likely candidates: transition video, large image batches
- [ ] Prototype one surface with realtime run updates
- [ ] Preserve polling as a resilience layer until realtime is proven stable

### Completion Criteria

- at least one media surface proves the realtime pattern
- polling remains as fallback until there is confidence in the replacement

## Implementation Order

The recommended order is:

1. **Workstream 0**: prerequisite refactoring (split scene-actions.ts)
2. **Workstream 1**: queue and concurrency configuration
3. **Workstream 4**: reliability hardening (retry, timeout, finalization)
4. **Workstream 2**: explicit workflow stages
5. **Workstream 3**: batch processing with native primitives
6. **Workstream 5**: observability and debuggability
7. **Workstream 6**: optional realtime upgrade

This order is intentional:
- refactoring first to reduce complexity
- queue isolation second to prevent starvation
- reliability hardening before feature polish
- batch work after the underlying execution policy is stable

## Immediate Next Tasks

These are the recommended first concrete steps when implementation begins:

1. [ ] Split scene-actions.ts into shot-actions.ts and transition-actions.ts
2. [ ] Extract `loadActiveAsset` to shared `trigger/helpers.ts`
3. [ ] Add queue + retry configuration to `generate-shot-image-asset.ts` as reference implementation
4. [ ] Fix missing timeout in `checkShotVideoJob`
5. [ ] Fix hard delete in `generate-script.ts`

## Risks And Mitigations

### Risk: Over-engineering The Workflow Layer

If too much abstraction is introduced too early, simple providers may become harder to maintain.

Mitigation:
- use native Trigger.dev primitives instead of custom abstractions
- keep configuration lightweight and explicit

### Risk: UI Complexity Increases Faster Than UX Value

Too many technical states could make the UI noisy.

Mitigation:
- keep internal stages detailed (6 stages)
- keep user-facing labels simple (5 labels)

### Risk: Concurrency Limits Are Too Aggressive Or Too Loose

Poorly chosen limits can starve throughput or overload providers.

Mitigation:
- start conservative (see queue table)
- tune by observing actual usage
- keep limits centralized and documented

### Risk: `batchTriggerAndWait()` Timeout

Large batches may hit Trigger.dev function timeout limits.

Mitigation:
- monitor batch sizes
- consider chunking very large batches
- use individual triggers for batches over threshold

## Definition Of Done

This phase is complete when:

- scene-actions.ts is split and under 1,500 lines
- all tasks have queue and retry configuration
- workflow stages are explicit and consistently surfaced
- post-success finalization is hardened across all media flows
- timeout/retry/recovery rules are standardized
- image batches use `batchTriggerAndWait()`
- video polling uses `wait.for()` loops
- operational debugging is materially easier
- the tracker below reflects implemented and verified progress

## Tracker

### Workstream 0: Prerequisite Refactoring

- [x] Split scene-actions.ts by domain (shot-actions.ts, transition-actions.ts)
- [x] Extract loadActiveAsset to shared helper (src/trigger/helpers.ts)
- [x] Fix hard delete in generate-script.ts (uses soft delete with deletedAt)

### Workstream 1: Queue And Concurrency Configuration

- [x] Add queue config to generate-shot-image-asset.ts (image-generation, 10)
- [x] Add queue config to generate-scene-image-asset.ts (image-generation, 10)
- [x] Add queue config to start-shot-video-generation.ts (video-generation, 3)
- [x] Add queue config to start-transition-video-generation.ts (video-generation, 3)
- [x] Add queue config to generate-voiceover-asset.ts (audio-generation, 5)
- [x] Add queue config to generate-script.ts (script-generation, 5)
- [ ] Add concurrencyKey for per-user fairness
- [x] Document queue strategy (in src/trigger/types.ts QUEUES constant)

### Workstream 2: Explicit Workflow Stages

- [x] Define shared MediaStage type (src/trigger/types.ts)
- [x] Add stage logging to Trigger tasks (video check tasks)
- [ ] Update image UI labels
- [ ] Update transition video UI labels
- [x] Ensure safe stage fallback (getStageLabel helper)

### Workstream 3: Batch Processing With Native Primitives

- [-] Investigated batchTrigger API - returns batch handle only, not individual run handles
- [x] Current Promise.all pattern is optimal for tracking individual run jobIds
- [ ] Add aggregate progress reporting (future enhancement)
- [x] Handle partial failures gracefully (existing pattern handles this)

### Workstream 4: Reliability Hardening

- [x] Add retry config to all tasks (image: 3, audio: 3, video: 2, script: 3)
- [x] Add timeout budget to video tasks (15 min via VIDEO_TIMEOUTS constant)
- [x] Fix missing abandonment threshold in checkShotVideoJob (now checks timeout)
- [x] Audit finalization paths (video tasks have stage-based logging)
- [ ] Create shared finalizeMediaAsset helper
- [x] Refactor transition video to wait.for loop
- [x] Refactor shot video to wait.for loop
- [x] Add MAX_ATTEMPTS constant (via VIDEO_TIMEOUTS.POLL_INTERVAL_SECONDS)
- [x] Standardize user-facing error messages (ERROR_MESSAGES constant)

### Workstream 5: Observability And Debuggability

- [x] Standardize Trigger log fields (TaskLogContext type, video tasks use it)
- [ ] Add enqueue-side logging
- [ ] Document recovery behavior inline
- [ ] Add practical local debugging helpers

### Workstream 6: Optional Realtime Upgrade

- [ ] Audit Trigger realtime fit for frontend
- [ ] Choose one surface for a pilot
- [ ] Prototype realtime with DB fallback

## Working Rules

- Mark a task `[x]` only when code is implemented and verified.
- Prefer native Trigger.dev primitives over custom abstractions.
- Preserve the database as the durable completion source of truth.
- Keep UI behavior stable while improving workflow correctness underneath.
- When in doubt, choose explicit lifecycle modeling over hidden inference.
