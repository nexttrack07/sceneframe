/**
 * Typed query key factory for all project-related queries.
 * Follows the hierarchical key pattern for targeted invalidation.
 */
export const projectKeys = {
  all: ['projects'] as const,
  project: (projectId: string) => ['projects', projectId] as const,
} as const
