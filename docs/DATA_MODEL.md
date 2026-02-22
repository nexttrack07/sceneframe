# Data Model

**Product:** SceneFrame.ai  
**Last Updated:** Feb 2026

This document defines every table, its columns, relationships, and the reasoning behind each decision. The goal is to get this right before writing a single migration.

---

## Entity Relationship Overview

```
users
  └── projects (one user → many projects)
        └── scenes (one project → many scenes)
              └── assets (one scene → many assets)
```

No DB-level cascade deletes. All deletion is handled in application code to ensure R2 storage is cleaned up before rows are removed.

---

## Query Rules

These rules apply to every query across the entire codebase. Forgetting them produces incorrect results.

1. **Always filter soft-deleted rows:** All queries on `projects`, `scenes`, and `assets` must include `WHERE deleted_at IS NULL` unless the intent is explicitly to operate on deleted records (e.g. a cleanup job).
2. **Asset rows are created by the server function, not the Trigger.dev job.** When a user triggers generation, the server function creates the asset row synchronously with `status: 'generating'` and then enqueues the job with the `asset_id`. This ensures the UI has a row to poll immediately. The Trigger.dev job updates the existing row — it never creates one.
3. **The `users` row is created on first sign-in.** A server-side middleware checks for the user's Clerk ID on every authenticated request and inserts a `users` row if one doesn't exist yet (`INSERT ... ON CONFLICT DO NOTHING`). Never assume the row exists before this has run.

---

## Stage → Asset Type Mapping

The 4 Kanban stages map directly to asset types. This is the source of truth for promotion validation, job routing, and the check constraints on `assets`.

| Stage | Asset Types | Promotion requirement |
|---|---|---|
| `script` | _(no assets — description lives on the scene row)_ | `description` must be non-empty |
| `images` | `start_image`, `end_image` | Both must have a selected, `done` asset |
| `video` | `video` | Must have a selected, `done` video asset |
| `audio` | `voiceover`, `background_music` | At least one selected, `done` audio asset |

---

## Storage Key Convention

All R2 object keys follow this pattern:

```
users/{user_id}/projects/{project_id}/scenes/{scene_id}/assets/{asset_id}/{type}.{ext}
```

Examples:
- `users/user_2abc/projects/proj-uuid/scenes/scene-uuid/assets/asset-uuid/start_image.webp`
- `users/user_2abc/projects/proj-uuid/scenes/scene-uuid/assets/asset-uuid/video.mp4`
- `users/user_2abc/projects/proj-uuid/scenes/scene-uuid/assets/asset-uuid/thumbnail.webp`

This structure allows prefix-based listing and deletion:
- All assets for a user: `users/{user_id}/`
- All assets for a project: `users/{user_id}/projects/{project_id}/`
- All assets for a scene: `.../{scene_id}/`

Every R2 upload must follow this convention. The `storage_key` column stores this path.

---

## Tables

---

### `users`

Stores SceneFrame-specific data per user. Clerk is the source of truth for identity — we never store name, email, or password.

Row is created on first sign-in via `INSERT ... ON CONFLICT DO NOTHING`. See Query Rules.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `text` | PRIMARY KEY | Clerk user ID (e.g. `user_2abc...`). |
| `provider_key_enc` | `text` | nullable | AES-256-GCM encrypted AI provider API key. |
| `provider_key_dek` | `text` | nullable | The Data Encryption Key (DEK), encrypted with the env-var KEK. |
| `provider_key_iv` | `text` | nullable | Initialisation vector. A new IV must be generated on every key rotation — never reuse. |
| `onboarding_complete` | `boolean` | NOT NULL, default `false` | Gates access to the dashboard. |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | Updated when provider key is rotated. |

---

### `projects`

One project = one creative brief = one Kanban board.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY, default `gen_random_uuid()` | |
| `user_id` | `text` | NOT NULL, FK → `users.id` | No cascade. |
| `name` | `text` | NOT NULL | User-defined project name. |
| `director_prompt` | `text` | NOT NULL | The original concept the user typed. Preserved for re-generation. |
| `script_raw` | `text` | nullable | Full raw LLM output before parsing. Overwritten on regeneration. Used for debugging and recovery. |
| `script_status` | `text` | NOT NULL, default `'idle'` | Tracks script generation job: `idle`, `generating`, `done`, `error`. The only project-level job — all other jobs are tracked on `assets`. Check constraint: `IN ('idle', 'generating', 'done', 'error')`. |
| `script_job_id` | `text` | nullable | Trigger.dev job ID for the currently running script generation. Cleared on completion. |
| `settings` | `jsonb` | nullable | Project-level settings (default model, aspect ratio, style preferences, etc.). JSONB for forward compatibility — add new settings without schema migrations. |
| `deleted_at` | `timestamptz` | nullable | Soft delete. |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

**Why `script_status` on projects?**
Script generation is the only job that runs before any scenes exist. There is no asset row to track its progress on. Without this column, the UI cannot differentiate between "no scenes because generation is running" and "no scenes because nothing has happened." This is the one exception to the "derive status from assets" principle.

**Why `settings` jsonb?**
Project-level preferences (default model, aspect ratio, style) will be needed. JSONB lets us add them without migrations.

---

### `scenes`

Each scene is a card on the Kanban board. Holds the identity and description. All generated outputs live in `assets`.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY, default `gen_random_uuid()` | |
| `project_id` | `uuid` | NOT NULL, FK → `projects.id` | No cascade. |
| `order` | `double precision` | NOT NULL | Float-based display order. Start at `1.0, 2.0, 3.0…`. Reorder by setting to a value between neighbours. Unique per project. |
| `title` | `text` | nullable | Short scene title from the LLM. Display metadata only — not required for generation. |
| `description` | `text` | NOT NULL | Full visual description. Working script — editable by user, used as base prompt for image generation. Check constraint: `trim(description) != ''`. |
| `stage` | `text` | NOT NULL, default `'script'` | Current Kanban stage. Check constraint: `IN ('script', 'images', 'video', 'audio')`. |
| `deleted_at` | `timestamptz` | nullable | Soft delete. |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraints:**
- Unique: `(project_id, order)`
- Check: `stage IN ('script', 'images', 'video', 'audio')`
- Check: `trim(description) != ''`

**Why no `status` on scenes?**
Derived from assets at query time. A status column creates a second source of truth that can diverge.

**Why no DB cascade?**
Hard cascades fire before R2 cleanup, orphaning storage objects permanently.

---

### `assets`

Every generated output for a scene. Server functions create asset rows synchronously before enqueuing jobs — see Query Rules.

Unselected takes are kept (not deleted) when a new take is selected. They are soft-deleted only when the parent scene or project is deleted. This preserves a history of attempts and enables a future "compare takes" feature.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY, default `gen_random_uuid()` | |
| `scene_id` | `uuid` | NOT NULL, FK → `scenes.id` | No cascade. |
| `type` | `text` | NOT NULL | `start_image`, `end_image`, `video`, `voiceover`, `background_music`. Check constraint enforced. |
| `stage` | `text` | NOT NULL | `images`, `video`, or `audio`. Denormalised from type. Enforced by check constraint — cannot fall out of sync with `type`. |
| `prompt` | `text` | nullable | Prompt used for generation. Nullable to support user-uploaded assets. |
| `model` | `text` | nullable | Model ID used (e.g. `black-forest-labs/flux-1.1-pro`). Stored for reproducibility. |
| `model_settings` | `jsonb` | nullable | Model-specific parameters (steps, seed, aspect ratio, etc.). JSONB for flexibility across models. |
| `url` | `text` | nullable | Public URL. May change if CDN changes — use `storage_key` as stable reference. |
| `storage_key` | `text` | nullable | R2 object key. Stable permanent identifier. See Storage Key Convention. |
| `thumbnail_url` | `text` | nullable | Poster/thumbnail URL. Relevant for `video` type. Avoids loading full video for previews. |
| `thumbnail_storage_key` | `text` | nullable | R2 key for the thumbnail. |
| `width` | `integer` | nullable | Pixel width of the output. Relevant for `start_image`, `end_image`. Stored for correct aspect ratio display. |
| `height` | `integer` | nullable | Pixel height of the output. Relevant for `start_image`, `end_image`. |
| `duration_ms` | `integer` | nullable | Duration in milliseconds. Relevant for `video`, `voiceover`, `background_music`. |
| `file_size_bytes` | `bigint` | nullable | File size in bytes. Stored on R2 upload. |
| `status` | `text` | NOT NULL, default `'generating'` | `generating`, `done`, `error`. Check constraint enforced. |
| `is_selected` | `boolean` | NOT NULL, default `false` | User's chosen take for this type. Enforced by partial unique index. |
| `batch_id` | `uuid` | nullable | Groups assets from the same batch dispatch. UUID generated at dispatch — no backing table in MVP. |
| `error_message` | `text` | nullable | Error from the generation job. |
| `generation_id` | `text` | nullable | AI provider job ID. Set by Trigger.dev job after it starts. Cleared on completion. |
| `job_id` | `text` | nullable | Job orchestrator ID. Set by server function when job is enqueued. Cleared on completion. |
| `deleted_at` | `timestamptz` | nullable | Soft delete. |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

**Check constraints:**
```sql
-- Type must be a known value
CHECK (type IN ('start_image', 'end_image', 'video', 'voiceover', 'background_music'))

-- Status must be a known value
CHECK (status IN ('generating', 'done', 'error'))

-- Stage must be consistent with type — cannot fall out of sync
CHECK (
  (type IN ('start_image', 'end_image') AND stage = 'images') OR
  (type = 'video' AND stage = 'video') OR
  (type IN ('voiceover', 'background_music') AND stage = 'audio')
)
```

**Why `width` and `height`?**
Image aspect ratios vary by model and settings. Without storing actual output dimensions, the UI either uses a fixed aspect ratio (wrong for some images) or loads the full image to detect dimensions (slow).

**Why keep unselected takes?**
Deleting them on selection would permanently lose generation history. Keeping them costs storage but enables a future "compare takes" feature and lets users revert to a previous take.

---

## State Transitions

Valid `stage` transitions for scenes. Scenes only move forward. Users may edit `description` at any stage.

```
script  →  images  →  video  →  audio
```

| From | To | Requirement |
|---|---|---|
| `script` | `images` | Non-empty `description` |
| `images` | `video` | Selected `done` asset for both `start_image` and `end_image` |
| `video` | `audio` | Selected `done` asset for `video` |
| `audio` | _(final)_ | No further promotion |

Asset `status` values:

| Status | Meaning |
|---|---|
| `generating` | Job running. Row created by server function before job is enqueued. |
| `done` | Completed. `url`, `storage_key`, and metadata columns are set. |
| `error` | Failed. `error_message` is set. Retry creates a new asset row. |

---

## Indexes

| Index | Table | Columns | Type | Reason |
|---|---|---|---|---|
| `idx_projects_user_id` | `projects` | `user_id` | Standard | Dashboard: all projects for a user |
| `idx_projects_deleted` | `projects` | `deleted_at` | Partial (`WHERE deleted_at IS NOT NULL`) | Soft-delete cleanup job |
| `idx_scenes_project_id` | `scenes` | `project_id` | Standard | Workspace: all scenes for a project |
| `idx_scenes_project_stage` | `scenes` | `project_id, stage` | Standard | Kanban: scenes per column |
| `idx_scenes_project_order` | `scenes` | `project_id, order` | Unique | Enforce order uniqueness + sort |
| `idx_scenes_deleted` | `scenes` | `deleted_at` | Partial (`WHERE deleted_at IS NOT NULL`) | Soft-delete cleanup job |
| `idx_assets_scene_id` | `assets` | `scene_id` | Standard | All assets for a scene |
| `idx_assets_scene_stage` | `assets` | `scene_id, stage` | Standard | Assets for a scene filtered by stage |
| `idx_assets_selected` | `assets` | `(scene_id, type) WHERE is_selected = true` | Partial unique | One selected asset per type per scene |
| `idx_assets_batch_id` | `assets` | `batch_id` | Standard | Batch progress queries |
| `idx_assets_deleted` | `assets` | `deleted_at` | Partial (`WHERE deleted_at IS NOT NULL`) | Soft-delete cleanup job |

---

## Cascades & Deletion

No FK cascades. All deletion is orchestrated in application code.

| Action | Application code order |
|---|---|
| Delete an `asset` | 1. Set `deleted_at`. 2. Delete R2 object via `storage_key` (and `thumbnail_storage_key`). 3. Hard delete row. |
| Delete a `scene` | 1. Set `deleted_at`. 2. Delete all child assets. 3. Hard delete scene row. |
| Delete a `project` | 1. Set `deleted_at`. 2. Delete all child scenes. 3. Hard delete project row. |
| Delete a `user` | 1. Delete all projects. 2. Hard delete user row. |

---

## What's Intentionally Not Here

| Thing | Why not |
|---|---|
| `projects.status` | Derived from scenes at query time |
| `scenes.status` | Derived from assets at query time |
| `scenes.error_message` | Derived from the most recent failed asset for the current stage |
| `batches` table | `batch_id` is a UUID generated at dispatch — no metadata needed in MVP |
| `scene_versions` table | Description versioning deferred to post-MVP |
| `user_providers` table | MVP supports one AI provider per user |
| `jobs` table | Job orchestrator is the job store. Only the ID is kept on the asset row. |
| `scene_order` table | `double precision` ordering handles reordering with no extra join |
| DB-level cascade deletes | Replaced by application-code deletion to preserve R2 cleanup order |
| `teams` / `organizations` | Out of scope for MVP |
| `audit_log` | Out of scope for MVP |
