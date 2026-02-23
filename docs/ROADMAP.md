# SceneFrame.ai — MVP Roadmap

Work top to bottom. Each epic is unblocked only after the one above it is done.

---

## Epic 1: Clean Slate

The skeleton app is full of demo files and a placeholder schema. Clear it out before building anything real.

- [x] Replace `src/db/schema.ts` with the real schema (`users`, `projects`, `scenes` tables as per DATA_MODEL.md)
- [ ] ~~Delete demo files~~ — deferred until first real routes are built and working (demo files serve as reference)
- [x] Add all missing env vars to `.env.local`: `REPLICATE_API_KEY` (for testing), `ENCRYPTION_KEY` (32-byte secret), `CLOUDFLARE_R2_*` (account ID, bucket, access key, secret), `TRIGGER_SECRET_KEY`
- [x] Run `pnpm db:push` to apply the new schema to Neon

---

## Epic 2: Infrastructure Utilities

Write the shared server-side utilities that every feature depends on. No UI yet.

- [x] Encryption utility (`src/lib/encryption.server.ts`): AES-256-GCM encrypt/decrypt functions using per-user DEK + env KEK (server-only module)
- [x] R2 utility (`src/lib/r2.server.ts`): upload file from URL, generate public URL, delete object
- [x] Trigger.dev setup: install SDK, configure client, create `src/trigger/` directory

---

## Epic 3: Auth + API Key Onboarding

- [x] Add auth guard to root route using Clerk's `getAuth` — redirect unauthenticated users to sign-in
- [x] Build `/onboarding` route: form to enter Replicate API key, server function to encrypt + save it to `users` table, redirect to dashboard on success
- [x] Add check on dashboard load: if no key saved, redirect to `/onboarding`

---

## Epic 4: Projects

- [x] Build `/dashboard` route: lists user's projects, "New Project" button
- [x] Build `/projects/new` route: project name + Director Prompt form, server function to create project row and enqueue `generate-script` Trigger.dev job, redirect to project workspace on submit

---

## Epic 5: Script Generation + Scene Workspace

- [ ] `generate-script` Trigger.dev job: decrypt user key → call Replicate LLM → parse 3–5 scenes → insert scene rows (`stage: script, status: idle`)
- [ ] Build `/projects/$projectId` route: 4-column Kanban board layout, scene cards in Script column, polling until all scenes are `status: done`
- [ ] Scene card component: title, description, status badge, left border strip, stage action button

---

## Epic 6: Image Generation

- [ ] `generate-images` Trigger.dev job: decrypt key → call Replicate text-to-image twice (start + end frame) → upload both to R2 → update scene row with R2 URLs
- [ ] Wire up "Generate Images" button on scene card → enqueue job → show generating state → show thumbnails when done

---

## Epic 7: Video Generation

- [ ] `generate-video` Trigger.dev job: decrypt key → call Replicate image-to-video with R2 image URLs → upload `.mp4` to R2 → update scene row
- [ ] Wire up "Generate Video" button on scene card → enqueue job → show generating state → inline video preview when done

---

## Epic 8: Audio Generation

- [ ] `generate-audio` Trigger.dev job: decrypt key → call Replicate audio model with scene description → upload audio to R2 → update scene row
- [ ] Wire up "Generate Audio" button on scene card → enqueue job → show generating state → inline audio player when done

---

## Epic 9: Scene Promotion + Downloads

- [ ] Server function `promoteScene`: validate required assets exist for target stage, update `stage` on scene row
- [ ] Promote button on each scene card + bulk promote action on column header
- [ ] Individual asset download links (image, video, audio) on scene card
- [ ] "Download All" button on project header: zip all R2 assets and stream to browser

---

## Epic 10: Landing Page

- [ ] Build `/` route: hero, problem strip, how-it-works (4 stages), pricing, CTA
- [ ] Connect CTA to Clerk sign-up → onboarding flow

---

## Epic 11: Polish

- [ ] Error states + retry button for failed jobs on scene cards
- [ ] Loading skeletons on dashboard and project workspace
- [ ] Empty states (no projects, no scenes, no assets yet)
- [ ] Update `<head>` title, meta description, favicon
