# Product Requirements Document (PRD)

**Product:** SceneFrame.ai  
**Status:** MVP  
**Owner:** Solo Founder  
**Last Updated:** Feb 2026

---

## Problem

YouTube creators who produce high-volume B-roll and AI video content are stuck using expensive aggregator platforms that mark up AI compute costs. They either overpay, or they wrestle with raw APIs that have no workflow structure.

---

## Solution

SceneFrame.ai is a professional video production workspace that lets creators go from a single idea to a full set of downloadable video assets — using their own Replicate API key at wholesale prices. No middleman markup. No context switching. One tool for the full pipeline.

---

## Target User

**Primary:** Faceless YouTube creators producing B-roll or AI-generated video content at scale.

They care about:
- Speed (less time on tooling, more time publishing)
- Cost (direct Replicate pricing, no markup)
- Quality (latest models, not locked to a curated subset)

---

## Core Workflow

The app is structured as a **4-stage Kanban board**. Each scene moves through stages independently — you promote it when it's ready, not on a batch schedule.

| Stage | What happens |
|---|---|
| **1. Script** | Write a concept. An LLM breaks it into scenes. Refine until happy. |
| **2. Images** | Generate a start and end frame for each scene. |
| **3. Video** | Animate each image pair into a video clip. |
| **4. Audio** | Generate a voiceover or soundtrack for each clip. |

Each scene card lives in one stage at a time. You promote it to the next stage when you're satisfied.

---

## MVP Features

### Must Have
- **Auth & onboarding** — Clerk login. User enters and saves their Replicate API key (encrypted at rest).
- **Project creation** — User names a project and writes a Director Prompt describing their video concept.
- **Script generation** — LLM (via Replicate) breaks the prompt into 3–5 scenes, each with a short visual description.
- **Scene workspace** — The 4-stage Kanban board. Scenes start in Stage 1.
- **Image generation** — Per scene: generate a start frame and end frame via text-to-image.
- **Video generation** — Per scene: animate the image pair into an `.mp4` clip via image-to-video.
- **Audio generation** — Per scene: generate a voiceover or background audio clip.
- **Status tracking** — Real-time progress on all active Replicate predictions.
- **Asset download** — Download individual clips or all assets for a project as a zip.

### Out of Scope for MVP
- Managed billing tier (no credit system — BYOK only)
- Dark mode
- Team/collaboration features
- Video stitching or in-app editing
- Support for non-Replicate providers

---

## Success Metrics

- A user can complete the full pipeline (prompt → downloadable assets) without leaving the app.
- Asset quality is good enough to drop directly into Premiere or CapCut without pre-processing.
- The Replicate API key is the only credential a user needs to get started.
