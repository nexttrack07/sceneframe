# AI Model Pricing Comparison Site — Build Plan

## 1. Concept & Positioning

**Working name:** `tokenrate.io` / `genprice.io` / `modelcost.ai` *(TBD)*

**Tagline:** *"What does it actually cost to generate that?"*

**Core value prop:** The only site that compares AI image, video, and text model costs
across both raw APIs *and* consumer platforms (OpenArt, Freepik, Higgsfield, Artlist etc.)
— with free tools to calculate real costs for your specific workflow.

**Monetization:** Affiliate links to platforms + tools, with full disclosure. Potentially
a paid "Pro" tier later for API access to the pricing data itself.

---

## 2. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | TanStack Start | Full-stack React, SSR/SSG, file-based routing, great DX |
| Hosting | Netlify | Easy CI/CD from GitHub, edge functions, good free tier |
| Database | Neon Postgres | Serverless Postgres, branches for dev/prod, generous free tier |
| ORM | Drizzle ORM | Lightweight, TypeScript-first, pairs perfectly with Neon |
| Styling | Tailwind CSS v4 | Utility-first, fast, consistent |
| UI Components | shadcn/ui | Accessible, unstyled-first, easy to customise |
| Data crawling | Firecrawl | LLM-powered scraping + structured extraction |
| Job scheduling | Netlify Scheduled Functions | Trigger crawl jobs on a cron schedule |
| Auth (optional) | Clerk or Better Auth | If you add saved comparisons / alerts |
| Analytics | Plausible | Privacy-first, no cookie banner needed |
| Email | Resend | Price change alerts, newsletter |

---

## 3. Site Architecture

```text
/                         → Homepage (hero + featured comparisons)
/compare                  → Full model/platform comparison table
/compare/image            → Image models only
/compare/video            → Video models only
/compare/text             → LLM text models
/compare/platforms        → Platform aggregators (OpenArt, Freepik etc.)
/model/[slug]             → Individual model page (e.g. /model/kling-3-0)
/platform/[slug]          → Individual platform page (e.g. /platform/openart)
/tools                    → Free tools hub
/tools/workflow-calculator → "What will my workflow cost per month?"
/tools/platform-picker    → "Which platform is cheapest for me?"
/tools/api-vs-platform    → "Should I use the API or a subscription?"
/tools/credit-converter   → "What does 1 credit actually cost on X?"
/changelog                → Pricing change history feed
/blog                     → SEO content (optional Phase 2)
/about                    → Methodology + affiliate disclosure
```

---

## 4. Database Schema (Neon Postgres / Drizzle)

```typescript
// providers — OpenAI, Google, Kuaishou, etc.
providers {
  id          uuid PK
  name        text           -- "Kuaishou"
  slug        text           -- "kuaishou"
  logo_url    text
  website     text
  created_at  timestamp
}

// models — individual AI models
models {
  id            uuid PK
  provider_id   uuid FK → providers
  name          text           -- "Kling 3.0"
  slug          text           -- "kling-3-0"
  type          enum           -- 'image' | 'video' | 'text'
  description   text
  is_active     boolean
  launched_at   date
  created_at    timestamp
}

// platforms — aggregator platforms (OpenArt, Higgsfield etc.)
platforms {
  id              uuid PK
  name            text           -- "Higgsfield"
  slug            text           -- "higgsfield"
  logo_url        text
  website         text
  affiliate_url   text           -- your affiliate link
  affiliate_commission text      -- "30% recurring"
  pricing_url     text           -- page to crawl
  created_at      timestamp
}

// platform_plans — subscription tiers
platform_plans {
  id            uuid PK
  platform_id   uuid FK → platforms
  name          text           -- "Ultimate"
  price_monthly decimal
  price_annual  decimal
  credits       int            -- credits included per month (null if unlimited)
  currency      text DEFAULT 'USD'
  updated_at    timestamp
}

// model_pricing — raw API pricing per model
model_pricing {
  id              uuid PK
  model_id        uuid FK → models
  price_type      enum    -- 'per_second' | 'per_image' | 'per_1m_tokens'
  resolution      text    -- "1080p" | "4K" | null
  audio_included  boolean
  price_usd       decimal
  source_url      text
  updated_at      timestamp
}

// platform_model_pricing — what a platform charges for a specific model
platform_model_pricing {
  id                uuid PK
  platform_id       uuid FK → platforms
  platform_plan_id  uuid FK → platform_plans
  model_id          uuid FK → models
  credits_per_gen   int            -- e.g. 150 credits
  price_usd         decimal        -- normalised $/gen at that plan's credit rate
  resolution        text
  notes             text           -- "Pro plan only", "audio included" etc.
  updated_at        timestamp
}

// pricing_history — change log for all pricing rows
pricing_history {
  id            uuid PK
  table_name    text           -- which table changed
  record_id     uuid           -- which row changed
  field_name    text           -- which field changed
  old_value     text
  new_value     text
  changed_at    timestamp
}

// crawl_logs — audit trail for scraping jobs
crawl_logs {
  id            uuid PK
  target_url    text
  status        enum    -- 'success' | 'error' | 'no_change'
  raw_data      jsonb
  error_msg     text
  ran_at        timestamp
}
```

---

## 5. Firecrawl Data Pipeline

### 5a. Architecture

```text
Netlify Scheduled Function (cron: daily)
  → for each pricing_url in platforms / model_pricing sources:
      → Firecrawl: scrape + LLM extract → structured JSON
      → Normalization layer: convert to standard units
      → Diff against DB
      → If changed: update DB + insert pricing_history row
      → If changed: trigger Resend email to subscribers
```

### 5b. Firecrawl Extraction Prompt (per platform)

```typescript
// Example for Higgsfield
const extractionSchema = {
  plans: [{
    name: "string",
    price_monthly_usd: "number",
    price_annual_usd: "number",
    credits_per_month: "number | null",
  }],
  model_costs: [{
    model_name: "string",
    credits_per_generation: "number | null",
    price_per_generation_usd: "number | null",
    resolution: "string | null",
    notes: "string | null",
  }]
}
```

### 5c. Normalization Layer

This is your core IP. Everything must resolve to one of these standard units:

| Model Type | Standard Unit | Example |
|---|---|---|
| Video model (API) | USD per second of output at 1080p | $0.20/sec |
| Video model (platform) | USD per 5-sec 1080p clip | $1.00/clip |
| Image model (API) | USD per image at standard res | $0.04/image |
| Image model (platform) | USD per image (credit cost ÷ plan price) | $0.12/image |
| Text model (API) | USD per 1M output tokens | $15/1M |

```typescript
// Normalization functions
function normalizeVideoPrice(raw: RawVideoPrice): NormalizedPrice {
  // Convert credits → USD using plan's $/credit rate
  // Standardize to per-second at 1080p
  // Flag if audio is included (adds ~2x cost on some platforms)
}

function normalizeCreditCost(
  creditsPerGen: number,
  planPriceMonthly: number,
  creditsPerMonth: number
): number {
  const pricePerCredit = planPriceMonthly / creditsPerMonth
  return creditsPerGen * pricePerCredit
}
```

### 5d. Change Detection

```typescript
async function detectAndLogChanges(
  newData: NormalizedPrice,
  existingData: NormalizedPrice
) {
  const fields = ['price_usd', 'credits_per_gen', 'resolution']
  for (const field of fields) {
    if (newData[field] !== existingData[field]) {
      await db.insert(pricingHistory).values({
        table_name: 'platform_model_pricing',
        record_id: existingData.id,
        field_name: field,
        old_value: String(existingData[field]),
        new_value: String(newData[field]),
        changed_at: new Date(),
      })
    }
  }
}
```

---

## 6. Frontend Pages

### 6a. Homepage

- Hero: "Compare AI image & video model costs. Instantly."
- Quick-access comparison matrix (top 5 platforms × top 5 models)
- Recent price changes feed (pulls from pricing_history)
- Links to free tools
- "Last updated: X hours ago" trust signal

### 6b. Main Comparison Table (`/compare`)

Key UX features:
- **Filter bar:** model type (image/video/text), provider, platform, resolution
- **Toggle:** "API pricing" vs "Platform pricing" vs "Side-by-side"
- **Sort:** by cost, by quality score (manual/community), by last updated
- **Normalize toggle:** "Per image" / "Per second" / "Per month at 100 generations"
- Sticky header with platform logos
- Affiliate link on each platform name (disclosed)
- "Price changed X days ago" badge on recently updated rows
- Mobile: horizontal scroll with frozen first column

### 6c. Individual Model Page (`/model/kling-3-0`)

- Overview: provider, type, launch date, description
- Pricing across all platforms that offer it (table)
- API pricing directly
- "Cheapest way to access this model" callout
- Pricing history chart (recharts line graph)
- Related models

### 6d. Individual Platform Page (`/platform/openart`)

- Platform overview + affiliate CTA (disclosed)
- All plans with prices
- All models available + cost per model per plan
- "Best for..." positioning
- User reviews (Phase 2)

---

## 7. Free Tools

### Tool 1: Workflow Cost Calculator
**URL:** `/tools/workflow-calculator`

User inputs:
- Images per month: `[slider]`
- Videos per month (5-sec clips): `[slider]`
- Preferred models: `[multi-select]`

Output:
- Bar chart: monthly cost across all platforms
- "Cheapest option for your workflow: Higgsfield Ultimate at $X/mo"
- Affiliate CTA to winner

### Tool 2: Platform Picker
**URL:** `/tools/platform-picker`

Questionnaire:
1. Primary use: image / video / both
2. Volume: casual / regular / high-volume
3. Models you care about: `[checklist]`
4. Budget: `[range slider]`

Output: ranked platform recommendations with cost breakdown + affiliate links

### Tool 3: API vs. Platform Calculator
**URL:** `/tools/api-vs-platform`

User inputs:
- Model: `[select]`
- Generations per month: `[number]`

Output:
- Table: API cost (fal.ai / Replicate) vs. each platform subscription
- Break-even point: "At >X generations/month, API is cheaper"

### Tool 4: Credit Converter
**URL:** `/tools/credit-converter`

Select platform + plan → enter credits → see real USD cost

---

## 8. SEO Strategy

These pages are naturally high-intent:

| Page | Target query |
|---|---|
| `/compare/video` | "AI video model pricing comparison 2026" |
| `/model/kling-3-0` | "Kling 3.0 pricing per second" |
| `/platform/openart` | "OpenArt subscription cost" |
| `/tools/api-vs-platform` | "fal.ai vs Higgsfield cost" |
| `/changelog` | "AI model price changes" |

Schema markup: `PriceSpecification` on model/platform pages for Google rich results.

---

## 9. Affiliate Setup

| Platform | Likely Program | Commission |
|---|---|---|
| Higgsfield | Direct / Impact | ~20-30% |
| OpenArt | Direct | ~20% |
| Freepik | CJ Affiliate | ~10-15% |
| Artlist | Direct | ~20% |
| Runway | Direct | ~20% |
| fal.ai | Direct (check) | TBD |
| Replicate | TBD | TBD |

**Implementation:**
- All affiliate links go through a `/go/[platform]` redirect route
- Tracked in Netlify Analytics + platform dashboards
- Clear "Affiliate link" label near each CTA (trust = long-term value)

---

## 10. Build Phases

### Phase 1 — MVP (4–6 weeks)
**Goal:** Live, useful, indexable

- [ ] TanStack Start project scaffold + Netlify deploy
- [ ] Neon DB + Drizzle schema setup
- [ ] Manually seed data for top 10 models × top 5 platforms
- [ ] `/compare` table (filterable, sortable)
- [ ] Individual model + platform pages
- [ ] `/tools/workflow-calculator` (most valuable tool, build first)
- [ ] `/about` with methodology + affiliate disclosure
- [ ] Basic Plausible analytics

### Phase 2 — Automation (weeks 6–10)
**Goal:** Data stays fresh without manual work

- [ ] Firecrawl integration for top 10 pricing pages
- [ ] Normalization layer for credit → USD conversion
- [ ] Change detection + pricing_history logging
- [ ] `/changelog` feed
- [ ] Resend email alerts for price changes (opt-in)
- [ ] Crawl logs + admin view (basic)

### Phase 3 — Growth (weeks 10–16)
**Goal:** SEO traction + more tools

- [ ] Remaining free tools (platform picker, API vs. platform, credit converter)
- [ ] Blog / SEO content (model launch posts, platform reviews)
- [ ] Schema markup for Google rich results
- [ ] Social sharing cards (og:image auto-generated)
- [ ] Affiliate program applications + link integration
- [ ] Email newsletter (weekly price changes digest)

### Phase 4 — Moat (ongoing)
**Goal:** Defensible position

- [ ] Quality scores / community ratings per model
- [ ] User-submitted corrections (crowdsourced accuracy)
- [ ] API access to pricing data (paid tier)
- [ ] Embed widget for creators/blogs ("current Kling pricing")
- [ ] Discord community for AI creators

---

## 11. File Structure (TanStack Start)

```text
/
├── app/
│   ├── routes/
│   │   ├── index.tsx              # Homepage
│   │   ├── compare/
│   │   │   ├── index.tsx          # Main comparison table
│   │   │   ├── image.tsx
│   │   │   ├── video.tsx
│   │   │   └── platforms.tsx
│   │   ├── model/
│   │   │   └── $slug.tsx          # Individual model page
│   │   ├── platform/
│   │   │   └── $slug.tsx          # Individual platform page
│   │   ├── tools/
│   │   │   ├── index.tsx
│   │   │   ├── workflow-calculator.tsx
│   │   │   ├── platform-picker.tsx
│   │   │   ├── api-vs-platform.tsx
│   │   │   └── credit-converter.tsx
│   │   ├── changelog.tsx
│   │   ├── go/
│   │   │   └── $platform.tsx      # Affiliate redirect
│   │   └── about.tsx
│   ├── components/
│   │   ├── ComparisonTable.tsx
│   │   ├── PriceHistoryChart.tsx
│   │   ├── WorkflowCalculator.tsx
│   │   ├── PlatformCard.tsx
│   │   └── ModelCard.tsx
│   ├── lib/
│   │   ├── db/
│   │   │   ├── schema.ts          # Drizzle schema
│   │   │   └── index.ts           # DB client
│   │   ├── crawl/
│   │   │   ├── firecrawl.ts       # Firecrawl client
│   │   │   ├── normalize.ts       # Price normalization logic
│   │   │   └── diff.ts            # Change detection
│   │   └── utils.ts
│   └── styles/
│       └── globals.css
├── netlify/
│   └── functions/
│       └── scheduled-crawl.ts     # Cron job
├── drizzle.config.ts
├── netlify.toml
└── package.json
```

---

## 12. Key Technical Decisions & Rationale

**Why TanStack Start over Next.js?**
Server functions co-located with routes, excellent TypeScript support, and avoids
Next.js's opinionated caching behavior which can cause stale pricing data to be served.

**Why Neon over PlanetScale / Turso?**
Postgres is better for the relational pricing schema. Neon's branching is excellent
for testing schema migrations. The serverless driver works cleanly with Netlify.

**Why Drizzle over Prisma?**
Lighter, faster cold starts on serverless, and the SQL-like query builder maps
naturally to the kind of joins this schema needs.

**Why Netlify over Vercel?**
TanStack Start has first-class Netlify support. Netlify's scheduled functions are
simpler to configure than Vercel crons. No strong reason not to use Vercel though.

---

## 13. Estimated Costs to Run

| Service | Cost |
|---|---|
| Netlify (Starter) | Free (up to 100GB bandwidth) |
| Neon (Free tier) | Free (0.5GB storage, plenty for Phase 1) |
| Firecrawl | ~$15-30/month (500-1000 crawls/month) |
| Resend | Free (up to 3000 emails/month) |
| Plausible | $9/month |
| Domain | ~$12/year |
| **Total** | **~$25-40/month** |

Break-even on affiliate: 1-2 referred subscriptions per month.
