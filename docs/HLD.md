# High-Level Design (HLD)

**Product:** SceneFrame.ai  
**Status:** MVP  
**Last Updated:** Feb 2026

---

## Overview

SceneFrame.ai is a full-stack web app built on TanStack Start. The user's browser talks to server functions (not a separate API), which in turn talk to Neon (database) and Replicate (AI compute). Clerk handles identity.

---

## System Architecture

```
Browser (React)
    │
    ├── TanStack Router       → client-side routing + auth guards
    │
    └── Server Functions      → typed RPC (no separate REST API needed)
            │
            ├── Clerk           → verify session / user identity
            ├── Neon (Postgres) → store projects, scenes, asset URLs
            ├── Trigger.dev     → job queue for all async AI work
            │       │
            │       └── Replicate API → run AI models (LLM, image, video, audio)
            │               │
            │               └── Cloudflare R2 → persist completed assets
            └── Cloudflare R2   → serve stored assets to the browser
```

AI generation is never called directly from a server function. Instead, server functions **enqueue a Trigger.dev job**, which manages the Replicate call, waits for completion, downloads the output, uploads it to R2, and updates the database. The frontend polls scene status until `status: done`.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | TanStack Start | Type-safe, Vite-based, full-stack React with no boilerplate API layer |
| Auth | Clerk | Handles sessions, UI components, and user IDs out of the box |
| Database | Neon (Serverless Postgres) | Scales to zero, pairs well with Drizzle |
| ORM | Drizzle | Type-safe schema and queries, minimal overhead |
| Job Queue | Trigger.dev | Manages async AI jobs with retries, timeouts, and observability |
| AI Compute | Replicate | Single provider covers LLM + image + video + audio models |
| Asset Storage | Cloudflare R2 | Permanent, cheap object storage — assets survive Replicate URL expiry |
| Deployment | Netlify | Zero-config with TanStack Start's Netlify adapter |

---

## Database Schema

See `docs/DATA_MODEL.md` for the full schema with all columns, constraints, indexes, and reasoning. Summary below.

### `users`
Clerk user ID as PK. Stores encrypted AI provider key using envelope encryption (`provider_key_enc`, `provider_key_dek`, `provider_key_iv`).

### `projects`
One project = one Director Prompt = one Kanban board. Stores `director_prompt` and `script_raw` (full LLM output before parsing).

### `scenes`
One row per scene card. Holds `title` (nullable), `description`, `stage`, float-based `order`, soft-delete `deleted_at`. No status column — status is derived from assets at query time.

### `assets`
One row per generated output. Stores `type` (`start_image`, `end_image`, `video`, `voiceover`, `background_music`), `stage` (denormalised), `model`, `model_settings` (jsonb), `url`, `storage_key` (stable R2 path), `is_selected`, `batch_id`, soft-delete `deleted_at`.

---

## Key Server Functions

### `saveReplicateKey(key)`
Encrypts and stores the user's Replicate API key in the `users` table.

### `createProject(name, directorPrompt)`
Creates a project row and enqueues a `generate-script` Trigger.dev job.

### `promoteScene(sceneId, targetStage)`
Validates the scene has the required assets for the target stage, then updates `stage` on the scene row.

---

## Trigger.dev Jobs

All AI work runs inside Trigger.dev tasks. This gives us retries, timeouts, real-time logs, and no risk of serverless function timeouts on long-running Replicate calls.

### `generate-script`
1. Decrypts the user's provider key.
2. Calls a Replicate-hosted LLM with the Director Prompt.
3. Stores raw LLM output in `projects.script_raw`.
4. Parses the response into 3–5 scenes.
5. Inserts one `scenes` row per scene (`stage: script`).

### `generate-images`
1. Calls image model twice (start frame + end frame).
2. Waits for both jobs to complete.
3. Downloads outputs and uploads to R2.
4. Inserts two `assets` rows (`type: start_image`, `type: end_image`) with `url`, `storage_key`, `model`, `model_settings`, `status: done`.

### `generate-video`
1. Calls image-to-video model with the selected start and end image URLs from `assets`.
2. Waits for job to complete.
3. Downloads `.mp4` and uploads to R2.
4. Inserts one `assets` row (`type: video`) with `url`, `storage_key`, `model`, `model_settings`, `status: done`.

### `generate-voiceover` / `generate-background-music`
1. Calls audio model with scene description or style prompt.
2. Waits for job to complete.
3. Downloads audio and uploads to R2.
4. Inserts one `assets` row (`type: voiceover` or `background_music`) with `url`, `storage_key`, `model`, `model_settings`, `status: done`.

---

## Status Updates

Trigger.dev jobs insert or update `assets` rows directly when a job completes or fails. Scene status is derived at query time from its assets — no status column on scenes. The frontend polls every few seconds and the UI derives state from the latest asset data.

---

## Auth & Security

- All routes are protected via TanStack Router `beforeLoad` guards — no unauthenticated access.
- The Replicate API key is encrypted with AES-256 before being stored. The encryption secret lives in the server environment, never the client.
- The webhook handler validates that the request origin is Replicate before processing.

---

## What's Not in MVP

- No real-time push — polling is used instead of WebSockets for simplicity.
- No CDN layer — R2 assets are served via standard R2 public URLs. A custom domain or CDN can be added later.
- No zip/bulk download — individual asset downloads only for MVP.
