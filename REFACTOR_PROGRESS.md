# ScriptWorkshop Refactoring Progress

**Plan:** `.omc/plans/refactor-script-workshop.md`
**Status:** IN PROGRESS

---

## Phase 1: Split by Mode + Extract Sub-Components

### Step 1.1: Extract sub-components into `components/workshop/`
- [x] `workshop-header.tsx` (67 lines)
- [x] `opening-hook-preview.tsx` (68 lines)
- [x] `scene-plan-proposal.tsx` (69 lines)
- [x] `draft-preview.tsx` (91 lines)

### Step 1.2: Create `WorkshopMode` component
- [x] Move workshop state + handlers into `workshop/workshop-mode.tsx` (545 lines — will shrink in Phase 2)
- [x] Owns `isSending`, `error`, `handleSend` (workshop branch only)

### Step 1.3: Create `CopilotMode` component
- [x] Move copilot state + handlers into `workshop/copilot-mode.tsx` (452 lines — will shrink in Phase 2)
- [x] Owns `isSending`, `error`, `handleSend` (copilot branch only)

### Step 1.4: Reduce `ScriptWorkshop` to thin router
- [x] 72 lines — just renders WorkshopMode or CopilotMode
- [x] All existing imports from route file unchanged

### Phase 1 Verification
- [x] `tsc --noEmit` passes
- [ ] Intake -> hook generation -> scene plan -> approve works (needs manual test)
- [ ] Copilot select -> send -> draft -> approve works (needs manual test)

---

## Phase 2: Extract Hooks Within Each Mode

### Step 2.1: Create `useWorkshopChat` hook
- [x] Owns chat state: `chatMessages`, `input`, refs, scroll effect (137 lines)
- [x] Flat return object (matches `useImageStudio` convention)

### Step 2.2: Create `useWorkshopStages` hook
- [x] Owns stage state: `workshopStage`, `openingHook`, `selectedProposalScenes`, etc. (334 lines)
- [x] `WorkshopMode` drops to 227 lines

### Step 2.3: Create `useCopilotEditor` hook
- [ ] Deferred — copilot state remains in route file for now (depends on loader data)
- [x] `CopilotMode` uses `useWorkshopChat` hook (352 lines)

### Phase 2 Verification
- [x] `tsc --noEmit` passes
- [ ] Both flows work end-to-end (needs manual test)
- [x] WorkshopMode: 227 lines

---

## Phase 3: Split Server Actions + Deduplicate

### Step 3.1: Extract `workshop-mutations.ts`
- [x] Move `saveIntake`, `sendMessage`, `generateOpeningHook`, `generateScenePlan`, `resetWorkshop`, `approveScenes` (903 lines)
- [x] Re-export from `project-mutations.ts` for backward compat

### Step 3.2: Extract `copilot-mutations.ts`
- [x] Move `proposeScriptEdit`, `applyScriptEditDraft` (305 lines)
- [x] Re-export from `project-mutations.ts`

### Step 3.3: Deduplicate `extractJsonBlock`
- [x] Single implementation in `lib/json-extract.ts` (82 lines)
- [x] `scene-actions.ts` imports from shared module
- [x] `workshop-mutations.ts` imports from shared module (executor confirmed)
- [x] Zero duplicates across codebase (verified via grep)

### Phase 3 Verification
- [x] `tsc --noEmit` passes
- [x] `project-mutations.ts` at 139 lines (was 1396)
- [x] Zero `extractJsonBlock` duplicates
