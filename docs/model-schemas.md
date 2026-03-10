# Replicate Model Schemas

Reference for exact input parameter names for models used in SceneFrame.

---

## google/nano-banana-pro

```json
{
  "prompt": "string (required) — text description of the image",
  "image_input": "string[] (URIs) — reference images, up to 14. Used for style/subject consistency.",
  "aspect_ratio": "enum: match_input_image | 1:1 | 2:3 | 3:2 | 3:4 | 4:3 | 4:5 | 5:4 | 9:16 | 16:9 | 21:9 — default: match_input_image",
  "resolution": "enum: 1K | 2K | 4K — default: 2K",
  "output_format": "enum: jpg | png — default: jpg",
  "safety_filter_level": "enum: block_low_and_above | block_medium_and_above | block_only_high — default: block_only_high",
  "allow_fallback_model": "boolean — fallback to bytedance/seedream-5 if at capacity, default: false"
}
```

Key notes:
- `image_input` is the parameter for reference images (NOT `reference_images`)
- When `image_input` is provided, `aspect_ratio` defaults to `match_input_image` — set explicitly to override
- Use `image_input` to pass previous shot's selected image for character/style consistency

---

## kwaivgi/kling-v3-omni-video

```json
{
  "prompt": "string (required) — supports <<<image_1>>> template references",
  "start_image": "uri — first frame image (.jpg/.jpeg/.png, max 10MB, min 300px)",
  "end_image": "uri — last frame image, requires start_image (.jpg/.jpeg/.png, max 10MB, min 300px)",
  "duration": "integer — 3–15 seconds (ignored for video editing mode)",
  "mode": "enum: standard | pro — 720p vs 1080p, default: pro",
  "aspect_ratio": "enum: 16:9 | 9:16 | 1:1 — required when not using start_image",
  "generate_audio": "boolean — default: false",
  "reference_images": "uri[] — style/scene/element reference images (max 7 without video, 4 with video)",
  "reference_video": "uri — .mp4/.mov, 3–10s, 720–2160px, max 200MB",
  "video_reference_type": "enum: feature | base — feature=style reference, base=video editing",
  "multi_prompt": "JSON array [{prompt, duration}] — max 6 shots, total must equal duration",
  "keep_original_sound": "boolean — for reference video, default: true"
}
```

Key notes:
- `end_image` requires `start_image` to also be set
- `end_image` only accepts jpg/jpeg/png — NOT webp
- Output is a `FileOutput` object with non-enumerable `.url()` method; use `String(output)` to get URL
- Typical generation time: 5–15 minutes

---

## anthropic/claude-4.5-haiku (via Replicate streaming)

```json
{
  "prompt": "string",
  "max_tokens": "integer — minimum 1024",
  "temperature": "float"
}
```
