# Architecture Decision Records (ADR)

**Product:** SceneFrame.ai  
**Last Updated:** Feb 2026

---

## ADR-001: User API Key Storage Strategy

**Status:** Accepted

### Decision
Store user Replicate API keys server-side using **envelope encryption** with per-user Data Encryption Keys (DEKs).

### Context
SceneFrame.ai is a BYOK app — users provide their own Replicate API keys. These keys grant direct billing access to the user's Replicate account. A breach that leaks these keys causes real, immediate financial harm to users.

We evaluated three options:

| Option | Why rejected |
|---|---|
| Browser-only (localStorage) | Incompatible with server-side Trigger.dev jobs. Lost on browser clear. |
| Single server-side encryption key | One leaked env var decrypts every user's key at once. Too much blast radius. |
| Per-user envelope encryption | ✅ Chosen. See below. |

### How It Works
1. When a user saves their Replicate key, we generate a unique **DEK** (Data Encryption Key) for that user.
2. The user's API key is encrypted with their DEK using AES-256-GCM.
3. The DEK itself is encrypted with a master **KEK** (Key Encryption Key) stored as a server environment variable — never in the database.
4. Both the encrypted API key and encrypted DEK are stored in the DB.
5. To decrypt, you need both the DB row *and* the KEK from the environment. One without the other is useless.

### Security Properties
- A full database breach alone exposes nothing decryptable.
- Compromising one user's DEK does not compromise any other user.
- The decrypted key is held in memory only for the duration of the Trigger.dev job — never logged, never returned to the client.

### Future Migration Path
In a future version, replace the env-var KEK with **AWS KMS** or **Cloudflare KMS** for full envelope encryption with audit logs and automatic key rotation. The DB schema does not need to change.

### Consequences
- All Replicate API calls must go through server-side code (Trigger.dev jobs). Direct client-side calls to Replicate are not permitted.
- The encryption/decryption utility must be a server-only module — never imported in client-side code.
- Decrypted keys must never be logged at any log level.

---

## ADR-002: Async Job Orchestration via Trigger.dev

**Status:** Accepted

### Decision
All AI generation work (script, images, video, audio) runs as **Trigger.dev tasks**, not directly in server functions.

### Context
Replicate jobs are long-running — image generation takes 30–60 seconds, video generation can take 3–10 minutes. Netlify serverless functions have a maximum execution timeout that makes it impossible to wait for these jobs inline.

We evaluated three options:

| Option | Why rejected / chosen |
|---|---|
| Inline server functions | ❌ Will timeout on video/audio jobs. |
| Replicate webhooks (no queue) | Viable, but requires building retry logic, job tracking, and error handling manually. |
| Trigger.dev | ✅ Chosen. Handles retries, timeouts, observability, and long-running tasks out of the box. |

### How It Works
- Server functions enqueue a Trigger.dev task and return immediately.
- The Trigger.dev task manages the full lifecycle: call Replicate → wait → download output → upload to R2 → update DB.
- The frontend polls scene status every few seconds until `status: done` or `status: error`.

### Consequences
- Trigger.dev is a required service dependency. If it is unavailable, generation jobs cannot run.
- All AI job logic lives in Trigger.dev task definitions — not in server functions or route handlers.
- Local development requires the Trigger.dev CLI running alongside the dev server.

---

## ADR-003: Single AI Provider (Replicate Only)

**Status:** Accepted

### Decision
All AI models — LLM (script), image generation, video generation, and audio generation — are called exclusively via the **Replicate API**.

### Context
SceneFrame.ai uses a BYOK model. Supporting multiple providers (e.g., OpenAI for LLM, Stability AI for images, ElevenLabs for audio) would require users to manage multiple API keys and billing accounts — which defeats the core value proposition.

### Consequences
- Users only need one account and one API key to use the entire app.
- The app is fully dependent on Replicate's model library. If a model a user wants is not on Replicate, it cannot be supported without a breaking change to this decision.
- If Replicate has an outage, all generation functionality is unavailable.

### Future Consideration
If user demand requires models not available on Replicate, this ADR should be revisited. The most likely candidate is adding a separate audio provider (e.g., ElevenLabs) since Replicate's audio model selection is limited.

---

## ADR-004: Asset Persistence via Cloudflare R2

**Status:** Accepted

### Decision
All completed assets (images, video clips, audio files) are downloaded from Replicate and re-uploaded to **Cloudflare R2** before the URL is saved to the database.

### Context
Replicate output URLs are temporary and expire after a short period. If we store Replicate URLs directly, users will encounter broken assets when they return to a project after the URL expires.

### Consequences
- Assets are owned permanently by SceneFrame.ai (on behalf of the user) — not tied to Replicate URL lifetime.
- R2 egress costs are near-zero (Cloudflare does not charge for egress within their network).
- The R2 upload step adds a small amount of time to each job completion (downloading from Replicate + uploading to R2).
- A data retention policy will need to be defined — assets for deleted projects should be purged from R2.

---

## ADR-005: Framework Choice (TanStack Start)

**Status:** Accepted

### Decision
Use **TanStack Start** as the full-stack framework instead of Next.js or Remix.

### Context
The founder prefers TanStack's type-safety model and Vite-based developer experience. TanStack Start's Server Functions provide clean API boundaries without the boilerplate of a separate API layer, and TanStack Router's `beforeLoad` guards are a natural fit for auth-protected routes.

### Consequences
- Auth integration uses `@clerk/tanstack-start` rather than the more widely documented Next.js Clerk adapter.
- Deployment uses the Netlify adapter for TanStack Start.
- The ecosystem is smaller than Next.js — fewer third-party examples and community resources.
