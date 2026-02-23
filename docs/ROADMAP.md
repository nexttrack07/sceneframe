# SceneFrame.ai — MVP Roadmap

Work top to bottom. Each epic is unblocked only after the one above it is done.

---

## Epic 1: Clean Slate

- [x] Replace `src/db/schema.ts` with the real schema (`users`, `projects`, `scenes`, `assets` tables)
- [x] Delete demo files (routes, components, hooks, data, libs)
- [x] Add all env vars to `.env`: `REPLICATE_API_TOKEN`, `ENCRYPTION_KEY`, `STORAGE_*`, `TRIGGER_SECRET_KEY`, Clerk keys
- [x] Run `pnpm db:push` to apply the schema to Neon

---

## Epic 2: Infrastructure Utilities

- [x] Encryption utility (`src/lib/encryption.server.ts`): AES-256-GCM encrypt/decrypt
- [x] R2 utility (`src/lib/r2.server.ts`): upload, public URL, delete
- [x] Trigger.dev setup: SDK, config, `src/trigger/` directory

---

## Epic 3: Auth + API Key Onboarding

- [x] Clerk auth guard — redirect unauthenticated users to `/sign-in`
- [x] `/onboarding` route: Replicate API key form, encrypt + save, redirect to dashboard
- [x] Dashboard load check: no key → redirect to `/onboarding`
- [x] Context-aware onboarding (first visit vs. key rotation)

---

## Epic 4: Projects (Revised)

Create projects without auto-triggering script generation. The project is just a container — the creative work happens in the Script Workshop.

- [x] `/dashboard` route: list user's projects, "New Project" button
- [ ] Revise `/projects/new` route: collect **project name only** (remove Director Prompt field, remove auto-trigger of `generate-script`), create project with `scriptStatus: 'idle'`, redirect to project workspace
- [ ] Schema change: make `directorPrompt` nullable on `projects` table (it gets populated after the Script Workshop)

---

## Epic 5: Script Workshop (New)

A two-phase conversational experience on the project page that replaces the one-shot script generation.

### Phase 1: Guided Intake (Typeform-style)

A short, focused questionnaire that gathers the essentials before involving the LLM. Each question appears one at a time with smooth transitions.

- [ ] Add `messages` table to schema: `id`, `projectId`, `role` (system | user | assistant), `content`, `createdAt`
- [ ] Build intake UI component on `/projects/$projectId`: sequential question cards
  - Q1: "What's your video about?" (free text — the core concept)
  - Q2: "What mood or tone?" (selectable chips: cinematic, playful, dramatic, calm, edgy, etc. + custom)
  - Q3: "Who's the audience?" (free text or chips: general, kids, professionals, social media, etc.)
  - Q4: "How many scenes?" (slider or buttons: 3 / 4 / 5)
- [ ] Store answers as `user` messages in the `messages` table
- [ ] On completion, auto-transition to Phase 2

### Phase 2: Chat Refinement

A chat interface where the LLM proposes a scene breakdown and the user refines it through conversation.

- [ ] Build chat UI component: message bubbles, input bar, streaming response display
- [ ] Server function to send messages to Claude 4.5 Haiku via Replicate streaming API
  - System prompt instructs the LLM to: use intake answers as context, propose a scene breakdown as structured JSON inside the message, ask if the user wants changes, and iterate until the user approves
- [ ] Parse scene proposals from assistant messages (embedded JSON blocks)
- [ ] Show scene proposals as rich inline cards within the chat (not raw JSON)
- [ ] "Approve Script" button appears when scenes are proposed — locks in the scenes
- [ ] On approval: insert scene rows into DB, update `projects.directorPrompt` with a summary, set `scriptStatus: 'done'`

---

## Epic 6: Storyboard View (Replaces Kanban)

Once scenes are approved, the project page transitions from the Script Workshop to the Storyboard — a visual, narrative-ordered view of all scenes.

- [ ] Build storyboard layout: scenes displayed in order (horizontal scroll or responsive grid)
- [ ] Scene card component:
  - Scene number + title
  - Description text (editable inline)
  - Thumbnail preview (placeholder until images are generated)
  - Asset pipeline progress indicator: ✅ Script → ⏳ Images → ○ Video → ○ Audio
  - Click to open Scene Detail panel
- [ ] "Back to Workshop" button — returns to the chat to revise scenes (clears scene rows, resets `scriptStatus` to `'idle'`)
- [ ] Project header: project name, scene count, overall progress summary

---

## Epic 7: Scene Detail Panel

A slide-over or dedicated view for managing a single scene's assets.

- [ ] Scene detail layout: full script text (editable), asset sections for each stage
- [ ] Edit scene title and description — server function to update scene row
- [ ] "Regenerate Script" — send scene back to the LLM for a rewrite (single-scene refinement)
- [ ] Image section: "Generate Images" button, show start + end frame thumbnails when done
- [ ] Video section: "Generate Video" button (disabled until images exist), inline preview when done
- [ ] Audio section: "Generate Audio" button, inline player when done
- [ ] Each asset shows: status badge, regenerate button, download link

---

## Epic 8: Image Generation

- [ ] `generate-images` Trigger.dev job: decrypt key → call Replicate text-to-image (start + end frame) → upload to R2 → update asset rows
- [ ] Wire up "Generate Images" in Scene Detail → enqueue job → show generating state → show thumbnails when done
- [ ] Support regeneration: new assets replace old ones (soft-delete previous)

---

## Epic 9: Video Generation

- [ ] `generate-video` Trigger.dev job: decrypt key → call Replicate image-to-video with R2 URLs → upload `.mp4` to R2 → update asset row
- [ ] Wire up "Generate Video" in Scene Detail → enqueue job → show generating state → inline preview when done

---

## Epic 10: Audio Generation

- [ ] `generate-audio` Trigger.dev job: decrypt key → call Replicate audio model → upload to R2 → update asset row
- [ ] Wire up "Generate Audio" in Scene Detail → enqueue job → show generating state → inline player when done

---

## Epic 11: Downloads

- [ ] Individual asset download links in Scene Detail (image, video, audio)
- [ ] "Download All" button on project header: zip all R2 assets per scene and stream to browser

---

## Epic 12: Landing Page

- [ ] Build `/` route: hero, value prop, how-it-works (3 steps: describe → refine → generate), CTA
- [ ] Connect CTA to Clerk sign-up → onboarding flow

---

## Epic 13: Polish

- [ ] Error states + retry buttons for all failed jobs
- [ ] Loading skeletons on dashboard, storyboard, and scene detail
- [ ] Empty states (no projects, no scenes, no assets)
- [ ] `<head>` title, meta description, favicon
- [ ] Responsive layout for storyboard and scene detail
