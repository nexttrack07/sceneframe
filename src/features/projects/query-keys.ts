/**
 * Typed query key factory for all project-related queries.
 * Follows the hierarchical key pattern for targeted invalidation.
 */
export const projectKeys = {
	all: ["projects"] as const,
	project: (projectId: string) => ["projects", projectId] as const,
	voiceovers: (projectId: string) => ["projects", projectId, "voiceovers"] as const,
	audioSegments: (projectId: string) => ["projects", projectId, "audioSegments"] as const,
} as const;
