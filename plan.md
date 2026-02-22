**SceneFrame.ai** is a fantastic choice. It’s rhythmic, descriptive, and professional. It positions you as a tool for "framing" and "composing" AI video, which suggests higher quality than a simple "generator."

Below are your three core documents, formatted for immediate use in your codebase or project management tool.

---

## 1. Product Requirements Document (PRD)

**Project:** SceneFrame.ai

**Status:** Draft / MVP Scope

**Owner:** Solo Founder

### Vision

A high-velocity, BYOK (Bring Your Own Key) video orchestration platform that enables creators to generate high-end AI video content at wholesale prices by connecting directly to Replicate’s compute.

### Target Audience

* **Faceless YouTube/TikTok Creators:** Users needing high-volume B-roll.
* **Performance Marketers:** Users A/B testing video ad creatives.
* **AI Power Users:** Creators who want the latest models (Flux, Kling, Wan) without aggregator markups.

### MVP Features (Must-Haves)

1. **Auth & Onboarding:** Clerk-based login. User must be able to input and save their Replicate API key (stored encrypted).
2. **The "Director" Prompt:** A single input field where users describe a video concept.
3. **Script Orchestration:** System uses a Replicate-hosted LLM (e.g., Gemini 3.1) to split the prompt into 3–5 distinct visual scenes.
4. **Scene Workspace:** A dashboard showing the script for each scene with buttons to:
* Generate Image (Text-to-Image).
* Animate Image (Image-to-Video).


5. **Status Tracking:** Real-time progress bars for Replicate "Predictions" using polling or webhooks.
6. **Asset Gallery:** A simple grid to preview and download finished `.mp4` clips.

---

## 2. High-Level Design (HLD)

### Tech Stack

* **Frontend/Server:** TanStack Start (Vite-powered, Full-stack React).
* **Auth:** Clerk (Session management and user ID).
* **Database:** Neon (Serverless Postgres) for project metadata.
* **ORM:** Drizzle ORM for type-safe database access.
* **Compute:** Replicate SDK (All AI inferences).

### Architecture Diagram

### Component Responsibilities

1. **TanStack Router:** Handles type-safe routing and `beforeLoad` auth guards.
2. **Server Functions:** * `createProject()`: Writes initial metadata to Neon.
* `orchestrateFlow()`: The "Brain" that sequences Replicate calls.


3. **Drizzle Schema:** * `projects`: `id`, `user_id`, `name`.
* `scenes`: `id`, `project_id`, `status`, `image_url`, `video_url`, `replicate_id`.


4. **Replicate Webhook Handler:** A dedicated POST route to receive asynchronous updates when video rendering is complete.

---

## 3. Architecture Decision Record (ADR)

### ADR-001: Key Storage Strategy

* **Status:** Accepted
* **Decision:** Encrypted Server-Side Storage (Neon)
* **Context:** We considered LocalStorage (Client-only) for maximum privacy, but it breaks the user experience when switching devices or browsers.
* **Consequences:** We must implement AES-256 encryption for the `replicate_key` field in our database. The encryption key will be stored as a secret environment variable in TanStack Start.

### ADR-002: Framework Choice (TanStack Start)

* **Status:** Accepted
* **Decision:** Use TanStack Start instead of Next.js.
* **Context:** The founder prefers TanStack's type-safety and modern Vite-based DX.
* **Consequences:** Requires using `@clerk/tanstack-start` for auth. Benefits from "Server Functions" for clean API boundaries without boilerplate.

### ADR-003: Single-Provider Model (Replicate Only)

* **Status:** Accepted
* **Decision:** All AI models (LLM, Image, Video) will be called via Replicate.
* **Context:** Simplifies the BYOK model. Users only need to manage one billing account and one API key.
* **Consequences:** Total dependence on Replicate's model library. If a new model (e.g., Sora) is not on Replicate, we cannot support it immediately.

---

### Your Next Step

Copy these into a `docs/` folder in your repo. Since you're ready to build, **would you like me to generate the Drizzle schema file (`schema.ts`) and the initial TanStack Server Function for the script generation?**