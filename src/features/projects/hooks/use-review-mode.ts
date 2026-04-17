import { useCallback, useState } from "react";
import type { ReviewFinding } from "../lib/review-finding-types";
import { reviewShots } from "../workshop-mutations";

interface UseReviewModeOptions {
	projectId: string;
	/** Called when a finding is applied successfully */
	onFindingApplied?: (finding: ReviewFinding) => void;
}

interface UseReviewModeReturn {
	/** Whether review mode is active */
	isReviewMode: boolean;
	/** Whether review is loading */
	isLoading: boolean;
	/** Error message if review failed */
	error: string | null;
	/** The review findings */
	findings: ReviewFinding[];
	/** Summary from the review */
	summary: string | null;
	/** Map of shot ID to index (for display) */
	shotIndexById: Map<string, number>;
	/** Finding ID currently being applied */
	applyingFindingId: string | null;
	/** Enter review mode and fetch findings */
	startReview: () => Promise<void>;
	/** Exit review mode */
	exitReview: () => void;
	/** Dismiss a finding (remove from list without applying) */
	dismissFinding: (findingId: string) => void;
	/** Mark a finding as applied (remove from list) */
	markFindingApplied: (findingId: string) => void;
	/** Set the applying finding ID (for loading state) */
	setApplyingFindingId: (id: string | null) => void;
}

export function useReviewMode({
	projectId,
	onFindingApplied,
}: UseReviewModeOptions): UseReviewModeReturn {
	const [isReviewMode, setIsReviewMode] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [findings, setFindings] = useState<ReviewFinding[]>([]);
	const [summary, setSummary] = useState<string | null>(null);
	const [shotIndexById, setShotIndexById] = useState<Map<string, number>>(
		new Map(),
	);
	const [applyingFindingId, setApplyingFindingId] = useState<string | null>(null);

	const startReview = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		setFindings([]);
		setSummary(null);
		setShotIndexById(new Map());

		try {
			const result = await reviewShots({ data: { projectId } });
			setFindings(result.findings);
			setSummary(result.summary);
			// Convert the plain object back to a Map
			const indexMap = new Map<string, number>(
				Object.entries(result.shotIdToIndex).map(([id, idx]) => [id, idx]),
			);
			setShotIndexById(indexMap);
			setIsReviewMode(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to review shots");
		} finally {
			setIsLoading(false);
		}
	}, [projectId]);

	const exitReview = useCallback(() => {
		setIsReviewMode(false);
		setFindings([]);
		setSummary(null);
		setError(null);
		setShotIndexById(new Map());
	}, []);

	const dismissFinding = useCallback((findingId: string) => {
		setFindings((prev) => prev.filter((f) => f.id !== findingId));
	}, []);

	const markFindingApplied = useCallback(
		(findingId: string) => {
			const finding = findings.find((f) => f.id === findingId);
			if (finding) {
				onFindingApplied?.(finding);
			}
			setFindings((prev) => prev.filter((f) => f.id !== findingId));
		},
		[findings, onFindingApplied],
	);

	return {
		isReviewMode,
		isLoading,
		error,
		findings,
		summary,
		shotIndexById,
		applyingFindingId,
		startReview,
		exitReview,
		dismissFinding,
		markFindingApplied,
		setApplyingFindingId,
	};
}
