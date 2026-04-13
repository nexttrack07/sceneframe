"use server";

import { createServerFn } from "@tanstack/react-start";
import { auth } from "@trigger.dev/sdk";
import { assertProjectOwner } from "@/lib/assert-project-owner.server";

/**
 * Creates a public token for subscribing to realtime run updates.
 * The token is scoped to a specific project's runs via tags.
 */
export const getRealtimeToken = createServerFn({ method: "POST" })
	.inputValidator((data: { projectId: string }) => data)
	.handler(async ({ data: { projectId } }) => {
		// Verify the user owns this project
		await assertProjectOwner(projectId, "error");

		// Create a public token scoped to this project's runs
		const token = await auth.createPublicToken({
			scopes: {
				read: {
					tags: [`project:${projectId}`],
				},
			},
			expirationTime: "1h",
		});

		return { token };
	});

/**
 * Creates a public token for subscribing to a specific batch of runs.
 */
export const getBatchRealtimeToken = createServerFn({ method: "POST" })
	.inputValidator((data: { projectId: string; batchId: string }) => data)
	.handler(async ({ data: { projectId, batchId } }) => {
		await assertProjectOwner(projectId, "error");

		const token = await auth.createPublicToken({
			scopes: {
				read: {
					tags: [`project:${projectId}`, `batch:${batchId}`],
				},
			},
			expirationTime: "1h",
		});

		return { token };
	});
