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

### `users`
Stores the encrypted Replicate API key per user. Clerk provides the `user_id`.

| Column | Type | Notes |
|---|---|---|
| `user_id` | text (PK) | Clerk user ID |
| `replicate_key_enc` | text | AES-256 encrypted Replicate API key |
| `created_at` | timestamp | |

### `projects`
One project = one Director Prompt = one Kanban board.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `user_id` | text | FK → users |
| `name` | text | User-defined project name |
| `director_prompt` | text | The original concept the user typed |
| `created_at` | timestamp | |

### `scenes`
One row per scene card. Tracks which stage it's in and holds asset URLs as they're generated.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `project_id` | uuid | FK → projects |
| `order` | integer | Scene sequence (1, 2, 3…) |
| `description` | text | LLM-generated scene description |
| `stage` | enum | `script`, `images`, `video`, `audio` |
| `status` | enum | `idle`, `generating`, `done`, `error` |
| `start_image_url` | text | nullable |
| `end_image_url` | text | nullable |
| `video_url` | text | nullable |
| `audio_url` | text | nullable |
| `replicate_prediction_id` | text | nullable — tracks active job |
| `updated_at` | timestamp | |

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
1. Decrypts the user's Replicate key.
2. Calls a Replicate-hosted LLM with the Director Prompt.
3. Parses the response into 3–5 scene descriptions.
4. Inserts one `scenes` row per scene (`stage: script, status: idle`).

### `generate-images`
1. Calls Replicate text-to-image twice (start frame + end frame).
2. Waits for both predictions to complete.
3. Downloads output images and uploads them to R2.
4. Updates scene with R2 URLs, sets `status: done`.

### `generate-video`
1. Calls Replicate image-to-video with the scene's R2 image URLs.
2. Waits for prediction to complete.
3. Downloads the `.mp4` and uploads it to R2.
4. Updates scene with R2 video URL, sets `status: done`.

### `generate-audio`
1. Calls Replicate audio model with the scene description.
2. Waits for prediction to complete.
3. Downloads the audio file and uploads it to R2.
4. Updates scene with R2 audio URL, sets `status: done`.

---

## Status Updates

Trigger.dev jobs update the scene row in Neon directly when a job completes or fails. The frontend polls scene status every few seconds and updates the UI when `status` changes. No separate webhook handler is needed — Trigger.dev manages the async lifecycle.

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
