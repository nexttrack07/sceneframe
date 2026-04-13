# SceneFrame Feature Roadmap

> Last updated: 2026-04-13

## Status Legend

| Status | Description |
|--------|-------------|
| `backlog` | Planned but not started |
| `in-progress` | Currently being worked on |
| `blocked` | Waiting on dependency or decision |
| `review` | Implementation complete, needs testing/review |
| `completed` | Done and deployed |
| `cancelled` | No longer planned |

## Priority Legend

| Priority | Description |
|----------|-------------|
| `P0` | Critical - blocks core functionality or revenue |
| `P1` | High - important for user experience |
| `P2` | Medium - nice to have, improves experience |
| `P3` | Low - future consideration |

## Category Legend

| Category | Description |
|----------|-------------|
| `Architecture` | Core system design, refactoring |
| `UX` | User experience, navigation, flows |
| `UI` | Visual design, animations, polish |
| `AI/Models` | Image/video model support |
| `Infrastructure` | APIs, providers, backend plumbing |
| `Monetization` | Credits, billing, payments |
| `Admin` | Internal tools, analytics, monitoring |

---

## Features

### 1. Workshop & Navigation Consolidation

> Consolidate Storyboard into Script Workshop, creating a two-view architecture: Workshop (planning/editing) and Shot Detail (execution/generation).

| ID | Feature | Status | Priority | Category | Notes |
|----|---------|--------|----------|----------|-------|
| 1.0 | **Workshop & Navigation Consolidation** | `backlog` | `P1` | `Architecture` | Parent task |
| 1.1 | Remove standalone Storyboard view | `backlog` | `P1` | `Architecture` | Merge into Workshop |
| 1.2 | Add character generation to Workshop | `backlog` | `P1` | `UX` | Currently missing |
| 1.3 | Add location generation to Workshop | `backlog` | `P1` | `UX` | Currently missing |
| 1.4 | Migrate remaining Storyboard features to Workshop | `backlog` | `P1` | `UX` | Audit what's missing |
| 1.5 | Wire selection to chat context | `backlog` | `P0` | `UX` | Selected scene/shot/prompt should be editable via chat |
| 1.6 | Add "Edit with AI" action for selected items | `backlog` | `P1` | `UX` | Clear affordance that selection does something |
| 1.7 | Show selection context in chat input | `backlog` | `P2` | `UI` | Visual indicator of what's being edited |
| 1.8 | Update navigation to two-view model | `backlog` | `P1` | `UX` | Workshop <-> Shot Detail only |

---

### 2. UI/UX Visual Polish

> Elevate the visual design from functional to delightful. Add vibrancy, depth, and memorable animations.

| ID | Feature | Status | Priority | Category | Notes |
|----|---------|--------|----------|----------|-------|
| 2.0 | **UI/UX Visual Polish** | `backlog` | `P2` | `UI` | Parent task |
| 2.1 | Design system audit | `backlog` | `P2` | `UI` | Identify areas that feel "plain" |
| 2.2 | Add gradient accents/backgrounds | `backlog` | `P2` | `UI` | Subtle vibrancy, not overwhelming |
| 2.3 | Implement depth with shadows/layers | `backlog` | `P2` | `UI` | Card elevation, glass effects |
| 2.4 | Loading state animations (image gen) | `backlog` | `P2` | `UI` | "Wow" factor, skeleton shimmer, progress |
| 2.5 | Loading state animations (video gen) | `backlog` | `P2` | `UI` | Video-specific loading experience |
| 2.6 | Page/view transition animations | `backlog` | `P3` | `UI` | Smooth navigation feel |
| 2.7 | Micro-interactions (buttons, hovers) | `backlog` | `P3` | `UI` | Polish details |
| 2.8 | Research Aceternity UI patterns | `backlog` | `P2` | `UI` | Inspiration gathering |
| 2.9 | Component animation library setup | `backlog` | `P2` | `Infrastructure` | Framer Motion patterns, reusable |

---

### 3. Scalable Model Support

> Support dozens of image/video models with a scalable architecture for adding new models easily.

| ID | Feature | Status | Priority | Category | Notes |
|----|---------|--------|----------|----------|-------|
| 3.0 | **Scalable Model Support** | `backlog` | `P1` | `AI/Models` | Parent task |
| 3.1 | Audit current model architecture | `backlog` | `P1` | `Architecture` | Identify friction points for adding models |
| 3.2 | Design model registry/plugin system | `backlog` | `P1` | `Architecture` | Config-driven model definitions |
| 3.3 | Standardize model schema interface | `backlog` | `P1` | `Architecture` | Unified input/output mapping |
| 3.4 | Model browser UI component | `backlog` | `P2` | `UI` | Easy discovery and switching |
| 3.5 | Model comparison/recommendation | `backlog` | `P3` | `UX` | Help users choose the right model |
| 3.6 | Add 10+ new image models | `backlog` | `P2` | `AI/Models` | Expand catalog |
| 3.7 | Add 5+ new video models | `backlog` | `P2` | `AI/Models` | Expand catalog |
| 3.8 | Model favorites/presets per user | `backlog` | `P3` | `UX` | Remember preferences |

---

### 4. Multi-Provider Infrastructure

> Support multiple AI providers (Replicate, fal.ai, etc.) with automatic failover for seamless UX.

| ID | Feature | Status | Priority | Category | Notes |
|----|---------|--------|----------|----------|-------|
| 4.0 | **Multi-Provider Infrastructure** | `backlog` | `P1` | `Infrastructure` | Parent task |
| 4.1 | Design unified provider abstraction | `backlog` | `P0` | `Architecture` | Common interface for all providers |
| 4.2 | Implement fal.ai provider adapter | `backlog` | `P1` | `Infrastructure` | Match Replicate adapter pattern |
| 4.3 | Provider health monitoring | `backlog` | `P1` | `Infrastructure` | Track availability, latency, errors |
| 4.4 | Automatic failover logic | `backlog` | `P1` | `Infrastructure` | Silent switch on provider failure |
| 4.5 | Model-to-provider mapping | `backlog` | `P1` | `Architecture` | Which models available on which providers |
| 4.6 | Provider preference configuration | `backlog` | `P2` | `Infrastructure` | Default provider, fallback order |
| 4.7 | Schema translation layer | `backlog` | `P1` | `Architecture` | Map different API schemas |
| 4.8 | Cost normalization across providers | `backlog` | `P1` | `Monetization` | Same model, different provider costs |
| 4.9 | Add RunPod provider | `backlog` | `P3` | `Infrastructure` | Future expansion |
| 4.10 | Add Together.ai provider | `backlog` | `P3` | `Infrastructure` | Future expansion |

---

### 5. Credit System & Monetization

> Implement usage-based billing with credits. Users purchase credits, generations consume credits.

| ID | Feature | Status | Priority | Category | Notes |
|----|---------|--------|----------|----------|-------|
| 5.0 | **Credit System & Monetization** | `backlog` | `P0` | `Monetization` | Parent task - revenue critical |
| 5.1 | Design credit pricing model | `backlog` | `P0` | `Monetization` | Cost + markup calculation |
| 5.2 | Database schema for credits | `backlog` | `P0` | `Architecture` | User balance, transactions, history |
| 5.3 | Credit deduction on generation | `backlog` | `P0` | `Infrastructure` | Hook into all AI operations |
| 5.4 | Credit cost per model/operation | `backlog` | `P0` | `Monetization` | Different costs for different models |
| 5.5 | Stripe integration for purchases | `backlog` | `P0` | `Infrastructure` | Payment processing |
| 5.6 | Credit purchase UI | `backlog` | `P1` | `UI` | Buy credits flow |
| 5.7 | Credit balance display | `backlog` | `P1` | `UI` | Always visible, header component |
| 5.8 | Low credit warnings | `backlog` | `P1` | `UX` | Notify before running out |
| 5.9 | Transaction history page | `backlog` | `P2` | `UI` | User can see spending |
| 5.10 | Free tier/trial credits | `backlog` | `P2` | `Monetization` | Onboarding credits for new users |
| 5.11 | Refund handling | `backlog` | `P2` | `Infrastructure` | Failed generations, disputes |
| 5.12 | Subscription option (credit bundles) | `backlog` | `P3` | `Monetization` | Monthly credit packages |

---

### 6. Admin Analytics & Cost Monitoring

> Internal tools to understand AI spending, usage patterns, and system health.

| ID | Feature | Status | Priority | Category | Notes |
|----|---------|--------|----------|----------|-------|
| 6.0 | **Admin Analytics & Cost Monitoring** | `backlog` | `P1` | `Admin` | Parent task |
| 6.1 | Track all AI API calls with cost | `backlog` | `P0` | `Infrastructure` | Log every generation with $ cost |
| 6.2 | Admin dashboard page | `backlog` | `P1` | `Admin` | Protected route, admin-only |
| 6.3 | Daily/monthly spend summary | `backlog` | `P1` | `Admin` | Total costs by time period |
| 6.4 | Spend breakdown by provider | `backlog` | `P1` | `Admin` | Replicate vs fal.ai vs LLM |
| 6.5 | Spend breakdown by model | `backlog` | `P2` | `Admin` | Which models cost most |
| 6.6 | Spend breakdown by user | `backlog` | `P2` | `Admin` | Heavy users, abuse detection |
| 6.7 | LLM token usage tracking | `backlog` | `P1` | `Admin` | Anthropic/OpenAI costs |
| 6.8 | Alerts for spending thresholds | `backlog` | `P2` | `Admin` | Email/Slack when hitting limits |
| 6.9 | Margin analysis (cost vs credits) | `backlog` | `P2` | `Admin` | Ensure profitability |
| 6.10 | Usage trends visualization | `backlog` | `P3` | `Admin` | Charts, growth metrics |

---

### 7. Global Characters & Locations

> Allow characters and locations to exist outside of projects, enabling reuse across multiple projects for series content.

| ID | Feature | Status | Priority | Category | Notes |
|----|---------|--------|----------|----------|-------|
| 7.0 | **Global Characters & Locations** | `backlog` | `P1` | `Architecture` | Parent task |
| 7.1 | Database schema for global characters | `backlog` | `P1` | `Architecture` | User-level characters, not project-scoped |
| 7.2 | Database schema for global locations | `backlog` | `P1` | `Architecture` | User-level locations, not project-scoped |
| 7.3 | Character library UI | `backlog` | `P1` | `UI` | Browse/manage all characters across projects |
| 7.4 | Location library UI | `backlog` | `P1` | `UI` | Browse/manage all locations across projects |
| 7.5 | Import character into project | `backlog` | `P1` | `UX` | Pull global character into specific project |
| 7.6 | Import location into project | `backlog` | `P1` | `UX` | Pull global location into specific project |
| 7.7 | Promote project character to global | `backlog` | `P2` | `UX` | Save project character to library |
| 7.8 | Character consistency across projects | `backlog` | `P1` | `AI/Models` | Same character looks consistent in different projects |

---

### 8. Audio & Voiceover System

> Add narration, voiceover generation, and lip-sync capabilities. Design where audio fits in the shot-based workflow.

| ID | Feature | Status | Priority | Category | Notes |
|----|---------|--------|----------|----------|-------|
| 8.0 | **Audio & Voiceover System** | `backlog` | `P1` | `Architecture` | Parent task |
| 8.1 | Design audio data model | `backlog` | `P0` | `Architecture` | Where does audio live? Per-shot? Per-project? Tracks? |
| 8.2 | Narration/voiceover text per shot | `backlog` | `P1` | `UX` | Attach script text to shots for TTS |
| 8.3 | AI voiceover generation (TTS) | `backlog` | `P1` | `AI/Models` | Generate voiceover from shot narration text |
| 8.4 | Voice selection UI | `backlog` | `P1` | `UI` | Choose from available TTS voices |
| 8.5 | Audio preview in Workshop | `backlog` | `P1` | `UX` | Play generated audio inline |
| 8.6 | Lip-sync for generated videos | `backlog` | `P2` | `AI/Models` | Sync character mouth to voiceover |
| 8.7 | Background music integration | `backlog` | `P3` | `UX` | Add music track to project |
| 8.8 | Audio timeline/mixing | `backlog` | `P3` | `UI` | Layer narration + music + sound effects |

---

### 9. Animatics & Preview

> Generate rough video preview from storyboard images to check timing and flow before expensive AI video generation.

| ID | Feature | Status | Priority | Category | Notes |
|----|---------|--------|----------|----------|-------|
| 9.0 | **Animatics & Preview** | `backlog` | `P2` | `UX` | Parent task |
| 9.1 | Shot duration assignment | `backlog` | `P2` | `UX` | Set how long each shot should appear |
| 9.2 | Generate animatic from shots | `backlog` | `P2` | `AI/Models` | Stitch shot images into rough video |
| 9.3 | Basic transitions in animatic | `backlog` | `P3` | `AI/Models` | Crossfades between shots |
| 9.4 | Animatic preview player | `backlog` | `P2` | `UI` | Play animatic inline in Workshop |
| 9.5 | Include voiceover in animatic | `backlog` | `P3` | `UX` | Layer generated audio with image sequence |
| 9.6 | Export animatic as video file | `backlog` | `P3` | `Infrastructure` | Download rough cut for sharing |

---

### 10. Video Generation Enhancements

> Improve video generation quality with camera motion options and upscaling.

| ID | Feature | Status | Priority | Category | Notes |
|----|---------|--------|----------|----------|-------|
| 10.0 | **Video Generation Enhancements** | `backlog` | `P3` | `AI/Models` | Parent task |
| 10.1 | Camera motion preset library | `backlog` | `P3` | `AI/Models` | Push in, pull back, pan, orbit, etc. |
| 10.2 | Feed motion presets to LLM prompt generation | `backlog` | `P3` | `AI/Models` | LLM picks appropriate motion for scene |
| 10.3 | Manual motion override per shot | `backlog` | `P3` | `UX` | User can specify desired camera motion |
| 10.4 | 4K video upscaling | `backlog` | `P3` | `AI/Models` | Enhance resolution for final delivery |
| 10.5 | Upscaling model integration | `backlog` | `P3` | `Infrastructure` | Connect to upscaling APIs |

---

## Completed Features

| Feature | Completed Date | Category | Notes |
|---------|----------------|----------|-------|
| P-Image model with auto-routing | 2026-04-13 | AI/Models | Routes to P-Image-Edit when reference images provided |
| Batch transition video generation | 2026-04-13 | AI/Models | Toggle for regenerate all vs only missing |
| Workshop discovery/outline tab merge | 2026-04-13 | UX | Consolidated into single outline tab |

---

## Implementation Order Recommendation

Based on dependencies and business impact:

### Phase 1: Foundation (Revenue & Core UX)
1. **5.1-5.5** Credit system core - enables monetization
2. **6.1-6.3** Cost tracking - understand spending before scaling
3. **1.5-1.6** Selection → chat wiring - core Workshop UX broken

### Phase 2: Workshop Consolidation & Characters
4. **1.1-1.4, 1.8** Complete Workshop consolidation
5. **7.1-7.6** Global characters/locations - critical for series content
6. **5.6-5.8** Credit UI components

### Phase 3: Audio & Preview
7. **8.1-8.5** Audio/voiceover system core - design data model first
8. **9.1-9.4** Animatics - preview before expensive generation
9. **2.1-2.5** Visual polish, loading states

### Phase 4: Scale & Expand
10. **3.1-3.3** Model architecture refactor
11. **4.1-4.4** Multi-provider with failover
12. **3.6-3.7** Add more models

### Phase 5: Polish & Growth
13. **8.6-8.8** Lip-sync, background music, audio mixing
14. **9.5-9.6** Advanced animatic features
15. **10.1-10.5** Video enhancements (camera motion, 4K)
16. **2.6-2.9** Advanced animations
17. **5.9-5.12** Advanced monetization features
18. **6.4-6.10** Full admin analytics

---

## Notes

- Credit pricing needs research: analyze Replicate/fal.ai costs per model, decide on markup %
- Provider failover is complex: need to handle different response formats, timing, error codes
- Workshop selection issue is a bug that affects perceived quality - should be P0
- UI polish can be done incrementally without blocking other work
- **Audio data model (8.1)** is P0 because it affects database schema - need to decide early where audio lives
- **Global characters (7.x)** enables series content which is key differentiator for YouTube creators
- **Animatics (9.x)** is a cost-saver - users preview timing before spending on video generation
