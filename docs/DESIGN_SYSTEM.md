# Design System

**Product:** SceneFrame.ai  
**Last Updated:** Feb 2026

---

## Design Philosophy

SceneFrame.ai is a professional studio tool built for YouTube creators — not software engineers. The visual language is rooted in **Notion** (approachable, document-like, spacious) with **Linear's motion principles** (fast, snappy, precise) applied on top. The goal is a tool that feels immediately familiar to a creator who uses Notion for their content calendar, while still delivering a premium, high-performance feel.

Every design decision should serve one goal: make the user feel in control of a complex workflow without feeling like they need to learn the tool first.

**Three principles:**
1. **Approachable, not dumbed down** — Clean and spacious like Notion, but structured enough to handle a 4-stage production pipeline.
2. **Whitespace is the structure** — Let generous spacing and typography do the organizational work, not heavy borders or backgrounds.
3. **Motion earns trust** — Borrow Linear's snappy 100ms interactions. Transitions orient, they don't entertain.

---

## Color

### Base Palette

| Token | Hex | Usage |
|---|---|---|
| `bg-base` | `#FFFFFF` | Main content area background |
| `bg-subtle` | `#F7F7F8` | Sidebar, swimlane column backgrounds |
| `bg-hover` | `#F0F0F2` | Hover state on cards and rows |
| `border` | `#E5E5E7` | Card borders, dividers, inputs |
| `border-strong` | `#D1D1D6` | Active/focused element borders |

### Text

| Token | Hex | Usage |
|---|---|---|
| `text-primary` | `#1A1A1E` | Headings, primary labels |
| `text-secondary` | `#6B6B7B` | Subtitles, metadata, timestamps |
| `text-placeholder` | `#A0A0AF` | Input placeholders, empty state hints |

### Brand Accent (Linear-inspired Indigo)

| Token | Hex | Usage |
|---|---|---|
| `accent` | `#5E6AD2` | Primary buttons, active states, links |
| `accent-hover` | `#4F5BBF` | Hover on accent elements |
| `accent-subtle` | `#ECEEFE` | Accent backgrounds, tag chips, badges |
| `accent-text` | `#3D4AB0` | Text on light accent backgrounds |

### Status Colors

| Token | Hex | Usage |
|---|---|---|
| `status-idle` | `#A0A0AF` | Scene not started |
| `status-generating` | `#F59E0B` | Generating in progress (amber) |
| `status-done` | `#22C55E` | Completed successfully (green) |
| `status-error` | `#EF4444` | Failed job (red) |

### Dark Mode
Dark mode is deferred to a future version. All color tokens are defined as CSS custom properties so a dark theme can be added by overriding the token values without touching component code.

---

## Typography

### Font Family
**Inter** — geometric sans-serif. Used by both Notion and Linear. Available via Google Fonts or `@fontsource/inter`.

```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
```

Enable optical sizing and variable font features:
```css
font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
```

### Type Scale

| Token | Size | Weight | Line Height | Usage |
|---|---|---|---|---|
| `text-xs` | 11px | 400 | 1.4 | Timestamps, metadata chips |
| `text-sm` | 13px | 400 | 1.5 | Body text, card descriptions |
| `text-base` | 14px | 400 | 1.6 | Default UI text |
| `text-md` | 15px | 500 | 1.5 | Emphasized labels, nav items |
| `text-lg` | 18px | 600 | 1.4 | Section headings |
| `text-xl` | 24px | 700 | 1.3 | Page titles |
| `text-2xl` | 32px | 700 | 1.2 | Landing page hero |
| `text-3xl` | 48px | 800 | 1.1 | Landing page hero headline |

---

## Spacing

Uses a base-4 scale. All spacing values are multiples of 4px.

| Token | Value | Usage |
|---|---|---|
| `space-1` | 4px | Icon padding, tight inline gaps |
| `space-2` | 8px | Internal card padding (compact) |
| `space-3` | 12px | Gap between card elements |
| `space-4` | 16px | Standard section padding |
| `space-5` | 20px | Card padding |
| `space-6` | 24px | Column padding, form group spacing |
| `space-8` | 32px | Section breaks |
| `space-12` | 48px | Large section gaps (landing page) |
| `space-16` | 64px | Hero section vertical padding |

---

## Border Radius

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | 4px | Badges, small chips, tooltips |
| `radius-md` | 6px | Buttons, inputs, cards |
| `radius-lg` | 10px | Modals, panels, dropdowns |
| `radius-xl` | 16px | Feature cards (landing page) |

---

## Shadows

Subtle, low-elevation shadows only. No dramatic drop shadows.

| Token | Value | Usage |
|---|---|---|
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Cards at rest |
| `shadow-md` | `0 2px 8px rgba(0,0,0,0.08)` | Cards on hover, dropdowns |
| `shadow-lg` | `0 8px 24px rgba(0,0,0,0.10)` | Modals, floating panels |

---

## Components

### Buttons

Three variants only:

**Primary** — Accent fill. Used for the single most important action on a screen.
```
bg: accent (#5E6AD2)
text: white
border-radius: radius-md (6px)
padding: 8px 14px
font-size: text-base (14px)
font-weight: 500
```

**Secondary** — Subtle border. Used for secondary actions.
```
bg: transparent
border: 1px solid border (#E5E5E7)
text: text-primary
hover bg: bg-hover (#F0F0F2)
```

**Ghost** — No border, no background. Used for tertiary actions inside cards.
```
bg: transparent
text: text-secondary
hover bg: bg-hover
```

All buttons use `transition: all 100ms ease` for instant, snappy feel (Linear-style, not sluggish).

---

### Scene Cards (Kanban)

Notion-influenced layout with Linear's motion. Cards are spacious and readable — a creator should be able to scan them at a glance without squinting. The thumbnail is the hero of the card once an image exists.

**Anatomy (collapsed):**
- Scene number + title — `text-base`, `font-weight: 600`
- Scene description — 3-line truncated, `text-sm`, `text-secondary`, with generous line height
- Thumbnail — full-width (16:9 ratio), shown prominently once an image asset exists; replaced by a soft placeholder illustration when empty
- Status badge — small chip, bottom-left
- Stage action button — bottom-right (e.g. "Generate Images"), ghost style at rest, accent on hover

**States:**
- **Rest:** `bg-base`, `border: 1px solid border`, `shadow-sm`, `border-radius: radius-lg (10px)`
- **Hover:** `shadow-md`, border color shifts to `border-strong`, 120ms transition
- **Generating:** Left border accent strip `3px solid status-generating` (amber), subtle pulse animation on status badge
- **Done:** Left border strip `3px solid status-done` (green)
- **Error:** Left border strip `3px solid status-error` (red)

---

### Swimlane Columns

Notion-style column feel — quiet backgrounds, clear stage headings, cards breathe within the column.

- Column background: `bg-subtle` (`#F7F7F8`)
- Column header: Stage name (`text-lg`, `font-weight: 600`) + scene count badge, with a subtle top border in accent color to identify the stage
- Column width: Fixed at `300px`, horizontal scroll if needed
- Cards stack vertically with `space-3` (12px) gap between them — more breathing room than Linear
- Columns separated by `space-6` (24px) gap
- Empty column state: centered illustration + short label ("No scenes here yet")

---

### Status Badges

Small inline chips. Used on cards and in tables.

```
padding: 2px 8px
border-radius: radius-sm (4px)
font-size: text-xs (11px)
font-weight: 500
```

Colors map to status tokens (idle/generating/done/error).

---

### Inputs & Textareas

Notion-influenced — clean, minimal borders, focus ring uses accent color.

```
border: 1px solid border (#E5E5E7)
border-radius: radius-md (6px)
padding: 8px 12px
font-size: text-base (14px)
focus border: accent (#5E6AD2)
focus ring: 0 0 0 3px rgba(94,106,210,0.15)
```

The Director Prompt input (the main textarea) gets extra treatment:
- Larger padding (`space-5`)
- Slightly larger font (`text-md`)
- Subtle placeholder text describing what to type

---

## Layout

### App Shell

```
┌─────────────┬────────────────────────────────────────┐
│             │  Header (project name + actions)       │
│  Sidebar    ├────────────────────────────────────────┤
│  240px      │                                        │
│             │  Main content area                     │
│  bg-subtle  │  (bg-base, overflow: auto)             │
│             │                                        │
└─────────────┴────────────────────────────────────────┘
```

- Sidebar: `240px` fixed, `bg-subtle`, contains project list and nav links
- Header: `48px` tall, border-bottom, project name + promote/download actions
- Content: fills remaining space, scrollable

### Kanban Board (Scene Workspace)

- Horizontal layout, swimlane columns side by side
- Full-height columns, vertically scrollable per column
- Overflow-x scroll on the board container if columns exceed viewport

---

## Motion

Linear's motion language applied to a Notion-style UI: **fast, precise, purposeful.** Nothing lingers. Creators shouldn't have to wait for the UI to catch up with them.

| Interaction | Duration | Easing |
|---|---|---|
| Button hover/active | 100ms | `ease` |
| Card hover | 120ms | `ease` |
| Sidebar expand/collapse | 200ms | `ease-in-out` |
| Modal open | 150ms | `ease-out` |
| Modal close | 100ms | `ease-in` |
| Status badge update | 200ms | `ease` |
| Generating pulse | 1.5s loop | `ease-in-out` |

No bounce, no spring physics, no dramatic entrance animations. Transitions exist to orient the user, not to entertain them.

---

## Landing Page

Inspired by Cuppa.ai's landing page: confident, benefit-led, conversion-focused.

**Structure:**
1. **Hero** — Bold headline (2xl/3xl), subheadline (text-lg, text-secondary), single CTA button, optional short demo video or animated preview
2. **Problem strip** — 3 pain points in a horizontal grid (icon + short label + 1-line description)
3. **How it works** — Numbered steps (4 stages of the workflow), clean illustration or screenshot per step
4. **Feature highlights** — 2-column alternating layout (text left/right, visual right/left)
5. **Pricing** — Simple single-plan card (BYOK MVP has one tier)
6. **CTA footer** — Repeat the primary CTA

**Landing page typography is larger and looser** than the app — more whitespace, larger headings, longer line lengths. The tone is confident and direct ("Stop paying markup on your tokens.") — not playful.

---

## Iconography

Use **Lucide React** (already in the project). Consistent stroke width (`1.5px`), `16px` default size inside UI, `20px` for empty states and feature highlights.

Do not mix icon libraries.

---

## Do / Don't

| Do | Don't |
|---|---|
| Use generous whitespace inside cards — this is Notion, not Linear | Compress cards to fit more information |
| Let thumbnails be the visual anchor once they exist | Show placeholder thumbnails with heavy chrome |
| Keep accent color for interactive elements only | Use accent color decoratively |
| Use Inter at all sizes | Mix in a display or serif font |
| Animate at 100–200ms (Linear speed) | Animate longer than 300ms for UI transitions |
| Show status via left border strips on cards | Use full card background color changes for status |
| Keep the sidebar neutral and quiet | Make the sidebar compete with the main content |
| Write UI copy in plain creator language ("Generate your images") | Use technical language ("Invoke image prediction") |
