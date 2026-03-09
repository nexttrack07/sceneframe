# Faceless Video Production Workflow

Reference: "Kling 3.0 Workflow" — 2D animated faceless YouTube videos (psychology, book reviews, etc.)

---

## Overview

This documents the end-to-end workflow for producing a faceless 2D animated YouTube video. The original workflow uses multiple disconnected tools (ChatGPT, Design AI, CapCut). SceneFrame aims to consolidate everything except the final video editor into one platform.

---

## Step 1: Script Generation

**What happens:**
- Generate a full video script (e.g., 8 minutes) on the chosen topic (book summary, psychology concept, etc.)
- The script covers intro, main points, and outro

**Key details:**
- Script is generated via AI (ChatGPT or similar)
- The creator MUST edit the script — add their own tone, voice, and personality
- The final script should feel human, not raw AI output
- Script length determines how many visual scenes are needed

**SceneFrame equivalent:** Script Workshop (Creative Brief + Chat) → generates and refines a script collaboratively with AI

---

## Step 2: Base Character Generation

**What happens:**
- Generate a single "base character" image that will be the visual anchor for the entire video
- This character defines the animation style AND color palette for all scenes

**Key details:**
- Character must match the animation type (e.g., 2D watercolor wash style)
- Character must establish the color palette used throughout
- Character consistency and color consistency are the two critical goals
- Tool used: Text-to-image generation (GPT Image 1.5 / similar model)
- A detailed prompt describes the animation style, character appearance, and aesthetic
- Output quality: High
- Aspect ratio for character sheet: 2x3 (portrait)
- Generate multiple variations, pick the best one
- Download the selected character image

**Prompt structure for base character:**
- Animation type (e.g., "2D watercolor wash animation style")
- Character description (appearance, clothing, pose)
- Color palette direction
- Art style references

**SceneFrame equivalent:** Reference Images feature (the new `reference_images` table) — upload/generate a base character that anchors all scene generation

---

## Step 3: Storyboard Generation (Scene-by-Scene Shot Breakdown)

**What happens:**
- Take the script and break it into individual visual shots (one every ~5 seconds)
- Each shot gets a detailed image generation prompt
- The base character image is attached as reference so prompts maintain consistency

**Key details:**
- Input to ChatGPT:
  - The full script
  - Number of desired shots
  - Video length in minutes
  - Visual change frequency (e.g., "switch image every 5 seconds")
  - The base character image (attached as reference)
  - A master prompt template describing the desired output format
- ChatGPT produces a numbered storyboard (e.g., 81 shots for an 8-min video)
- Storyboard is organized by video sections (intro, part 1, part 2, etc.)
- Each entry describes what's happening visually at that timestamp
- Then ask ChatGPT to generate a **detailed image prompt** for each shot
- Each image prompt references the base character's style and color palette
- Prompts include the script line the scene corresponds to

**Output format per shot:**
- Shot number
- Timestamp range (e.g., 0:00–0:05)
- Script line being spoken
- Detailed image generation prompt (character action, environment, camera angle, mood)

**SceneFrame equivalent:** This is the core of SceneFrame — the AI chat generates scene breakdowns, each scene gets a description, and the Image Studio generates per-scene prompts with the structured format ([Subject], [Action], [Environment], [Cinematography], [Lighting/Style], [Technical])

---

## Step 4: Scene Image Generation

**What happens:**
- Use each image prompt (from Step 3) to generate the actual scene images
- The base character image is used as a **reference image** for every generation to maintain consistency

**Key details:**
- Model used: Nano Banana Pro (or similar image generation model)
- The base character is attached as a reference for every image generation
- Aspect ratio: 16:9 (landscape, for YouTube)
- Quality: 4K / highest available
- Generate one image per shot

**Two methods for generation:**

### Method A: One-by-one generation
- Paste each prompt individually
- Generate one image at a time
- Good for precision, slow for volume

### Method B: Grid generation (faster)
- Create a master prompt that generates a 2x2 grid (4 images at once)
- The prompt specifies: "Create a 16:9 storyboard sheet divided into a clean 2x2 grid"
- Each panel in the grid is a different shot with its own description
- Panel 1 = Shot 1, Panel 2 = Shot 2, Panel 3 = Shot 3, Panel 4 = Shot 4
- After generation, download the grid and crop each panel into individual images
- For 11 intro shots: 3 grid generations instead of 11 individual ones
- Can use 3x3 grids for even more images at once (but images come out smaller)

**SceneFrame equivalent:** Image Studio — generates images per scene using the prompt + model settings. The batch count (1–4) is analogous to the grid approach. Reference images will feed into generation for consistency.

---

## Step 5: Animation Prompt Generation

**What happens:**
- Before animating, generate **video animation prompts** for each scene image
- Each 5-second scene gets TWO camera angle/motion prompts (multi-shot)

**Key details:**
- Go back to ChatGPT with the storyboard
- Ask for "video prompts for Kling AI" with a two-shot angle approach
- Why two shots per scene: Creates dynamic camera movement instead of a single still-looking animation
- Each 5-second scene is split into:
  - Shot A (~3 seconds): e.g., "Medium shot of character talking, slight camera push-in"
  - Shot B (~2 seconds): e.g., "Close-up zoom into the object character is holding"
- This creates visual dynamism — the video doesn't look like static images with a Ken Burns effect
- Total duration of both shots must equal the scene's allocated time (e.g., 5 seconds)

**SceneFrame equivalent:** NOT YET IMPLEMENTED — future video stage. This would be a "Video Prompt" step in the pipeline after images are selected, before video generation.

---

## Step 6: Video Animation (Image-to-Video)

**What happens:**
- Take each scene image and animate it using an AI video model (Kling 3.0)
- Use the multi-shot feature for dynamic camera movement

**Key details:**
- Open generated image in the video tool
- Set canvas to 16:9
- Select AI Video → Kling 3.0 model
- The image is automatically set as the first frame
- Switch from "Simple" mode to **"Multi-shot"** mode
- Paste Shot A prompt → set duration (e.g., 3 seconds)
- Paste Shot B prompt → set duration (e.g., 2 seconds)
- Total: 5 seconds per scene
- Settings: 1080p resolution
- Optional: Enable sound generation (Kling 3.0 supports high-quality sound)
- Generate the video clip
- Result: Dynamic multi-shot animation with camera movement, not a static pan

**Repeat for every scene image.**

**SceneFrame equivalent:** NOT YET IMPLEMENTED — future video stage in the pipeline. Would use Kling 3.0 or similar model via API.

---

## Step 7: Lip Sync (Strategic Scenes Only)

**What happens:**
- For scenes where the character is speaking, add lip sync to make the animation more engaging
- Not every scene needs lip sync — only strategic moments (e.g., 4 out of many scenes)

**Key details:**
- Select a video clip where the character is talking
- Use lip sync feature → auto-detects the character's face
- Two audio options:
  - **Text-to-speech**: Choose from standard voices, or use "expressive mode"
  - **Upload your own audio**: Pre-recorded voiceover for that specific clip
- Voice creation options:
  - Clone your own voice with a 10-second audio clip
  - Design a brand new voice: describe the voice characteristics, preview text, adjust loudness and guidance
- Settings: Use "Pro" mode, 1080p
- Generate the lip-synced video
- Result: Character's mouth moves in sync with the audio

**Strategic usage:**
- Don't lip sync every scene — only key moments
- In the example: 4 lip-sync scenes out of the full video
- Creates variety — some scenes are animated with movement, some have lip sync

**SceneFrame equivalent:** NOT YET IMPLEMENTED — future audio/lip-sync stage. Would integrate voice generation (ElevenLabs or similar) and lip sync models.

---

## Step 8: Final Assembly in Video Editor

**What happens:**
- Import all generated clips + voiceover into a video editor
- Arrange clips to match the script timing
- Add transitions (optional — the multi-shot approach often makes clips blend naturally)
- Export the final video

**Key details:**
- Editor: CapCut, Canva, or editor of choice
- Import: Full voiceover track + all animated video clips
- Arrangement: Place clips sequentially, aligning with voiceover timing
- Lip sync clips go in their strategic positions
- Transitions: Often not needed because multi-shot clips blend into each other naturally
  - If desired: any standard transition between clips
- Export: 4K resolution recommended
- Name the file and upload to YouTube

**SceneFrame equivalent:** OUT OF SCOPE — this is the one step SceneFrame does NOT handle. The user exports all assets and assembles in their preferred video editor (CapCut, Premiere, DaVinci, etc.)

---

## Pipeline Summary

| Step | Task | Tool (Original) | SceneFrame Coverage |
|------|------|-----------------|-------------------|
| 1 | Script generation + editing | ChatGPT | **Yes** — Script Workshop |
| 2 | Base character generation | Design AI (GPT Image) | **Partial** — Reference Images table exists, generation via Replicate |
| 3 | Storyboard / shot breakdown | ChatGPT + character ref | **Yes** — Scene breakdown + per-scene prompts |
| 4 | Scene image generation | Design AI (Nano Banana Pro) | **Yes** — Image Studio with model selection |
| 5 | Animation prompt generation | ChatGPT | **Not yet** — Future: video prompt stage |
| 6 | Image-to-video animation | Design AI (Kling 3.0) | **Not yet** — Future: video generation stage |
| 7 | Lip sync | Design AI (lip sync) | **Not yet** — Future: audio/lip-sync stage |
| 8 | Final assembly + export | CapCut / Canva | **Out of scope** — User's own editor |

---

## Key Consistency Principles

1. **Character consistency**: Every scene image uses the same base character as a reference
2. **Color palette consistency**: Established by the base character, maintained across all scenes
3. **Animation style consistency**: Defined once (e.g., "2D watercolor wash"), enforced via prompts
4. **Dynamic visuals**: Multi-shot camera angles prevent the "slideshow" look
5. **Strategic lip sync**: Used sparingly for maximum impact, not on every scene
6. **5-second rule**: Visual changes every ~5 seconds keeps viewers engaged
