/**
 * Review finding types for the shot review mode.
 *
 * These represent issues the LLM identifies when reviewing
 * the shot breakdown and image prompts.
 */

/** Base finding with common fields */
interface BaseFinding {
	/** Unique ID for this finding */
	id: string;
	/** Human-readable explanation of the issue */
	explanation: string;
	/** The suggested action to resolve the issue */
	suggestedAction: SuggestedAction;
}

/** Finding: two shots are visually or narratively too similar */
export interface SimilarPairFinding extends BaseFinding {
	type: "similar_pair";
	/** First shot ID in the similar pair */
	shotIdA: string;
	/** Second shot ID in the similar pair */
	shotIdB: string;
}

/** Finding: a shot is redundant and could be deleted */
export interface RedundantDeleteFinding extends BaseFinding {
	type: "redundant_delete";
	/** The shot ID that is redundant */
	shotId: string;
}

/** Finding: there's a continuity break between shots */
export interface ContinuityBreakFinding extends BaseFinding {
	type: "continuity_break";
	/** Shot ID where the continuity break occurs */
	shotId: string;
	/** Optional: the previous shot ID for context */
	previousShotId?: string;
}

/** Discriminated union of all finding types */
export type ReviewFinding =
	| SimilarPairFinding
	| RedundantDeleteFinding
	| ContinuityBreakFinding;

/** Suggested action types */
export type SuggestedAction =
	| { type: "delete"; shotId: string }
	| { type: "update"; shotId: string; suggestedDescription?: string }
	| { type: "merge"; shotIdA: string; shotIdB: string; suggestedDescription?: string };

/** Response from the reviewShots server function */
export interface ReviewShotsResponse {
	findings: ReviewFinding[];
	/** Summary of the review */
	summary: string;
}

/** Get the primary shot ID(s) affected by a finding */
export function getAffectedShotIds(finding: ReviewFinding): string[] {
	switch (finding.type) {
		case "similar_pair":
			return [finding.shotIdA, finding.shotIdB];
		case "redundant_delete":
			return [finding.shotId];
		case "continuity_break":
			return finding.previousShotId
				? [finding.shotId, finding.previousShotId]
				: [finding.shotId];
	}
}

/** Get a human-readable label for a finding type */
export function getFindingTypeLabel(type: ReviewFinding["type"]): string {
	switch (type) {
		case "similar_pair":
			return "Similar shots";
		case "redundant_delete":
			return "Redundant shot";
		case "continuity_break":
			return "Continuity issue";
	}
}
