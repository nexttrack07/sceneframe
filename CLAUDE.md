# SceneFrame — Claude Code Instructions

## Code Quality Standards

All code written for this project must follow clean code principles at a staff-engineer level. These are non-negotiable.

### Architecture

- **Single responsibility** — every file, component, and function does one thing. If a component exceeds ~200 lines, extract hooks or sub-components.
- **Custom hooks for state domains** — complex state + related handlers belong in a `hooks/` file (e.g., `useImageStudio`, `useVideoStudio`). Components are orchestrators, not state dumps.
- **Small components** — UI components should be under 150 lines. Extract sub-components when logic or JSX grows complex.
- **No god components** — components with 10+ state variables or 8+ handlers are a code smell. Extract.
- **Colocate by domain** — server actions, hooks, types, and components for a feature live together under `features/`.

### TypeScript

- No `any` without a comment explaining why
- All new server actions must have typed input validators and return types
- No implicit `any` via loose destructuring
- Prefer narrowing over casting

### React Patterns

- **Refs for stable closures** — any value used inside `setInterval`, `setTimeout`, or `useEffect` that changes over time must be a ref, not a captured closure variable
- **Memoize derived values** — `useMemo` for expensive computations and derived collections, `useCallback` for handlers passed as props
- **Stable effect dependencies** — every `useEffect` dependency array must be accurate. Prefer refs over disabling the lint rule.
- **Reset state explicitly** — when navigating between entities (shots, transitions), reset relevant state fields directly in the navigation handler, not via key-remount hacks

### Server Actions

- **Authorization first** — every server action must assert ownership before reading or writing data. For multi-entity actions (e.g., fromShotId + toShotId), assert ownership on ALL entities.
- **No N+1 queries** — batch DB reads/writes in transactions or use joins. Never loop over a query result and query inside the loop.
- **Soft delete everywhere** — always use `deletedAt` timestamps, never hard-delete. Cascade soft-deletes manually in the handler.
- **Consistent error propagation** — let errors throw and be caught by the caller. Don't swallow errors silently except in best-effort cleanup (R2 deletion, etc.).
- **Log R2 failures** — `deleteObject().catch((err) => console.error(...))` not `.catch(() => {})`.

### Naming

- Handler functions: `handleXxx` for event handlers, `doXxx` for programmatic actions
- Hooks: `useXxx`, returned as an object `{ state, handlers }`
- Boolean state: `isXxx`, `hasXxx`, `canXxx`
- Server actions: verb + noun (e.g., `generateShotImagePrompt`, `deleteTransitionVideo`)

### File Organization

```
src/features/projects/
  components/       # React components
    studio/         # Studio-specific components
  hooks/            # Custom hooks (useImageStudio, useVideoStudio, etc.)
  project-actions.ts
  project-queries.ts
  project-types.ts
  scene-actions.ts  # TODO: split by domain when > 1500 lines
```

### What NOT to do

- Don't inline 50+ line modal/drawer JSX inside parent components — extract them
- Don't pass 12+ props to a component — introduce a context or restructure
- Don't use `// @ts-ignore` or `// eslint-disable` without explaining why in a comment
- Don't commit dead files — if a component is replaced, delete it
- Don't leave TODO comments without a linked issue or immediate follow-up
