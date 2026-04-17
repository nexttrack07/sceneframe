import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReviewFinding } from "../../lib/review-finding-types";
import type { ShotDraftEntry } from "../../project-types";
import { ReviewFindingCard } from "./review-finding-card";

interface ReviewModePanelProps {
	findings: ReviewFinding[];
	summary: string | null;
	shots: ShotDraftEntry[];
	/** Map of shot ID to index for display */
	shotIndexById: Map<string, number>;
	/** Called when user clicks back to exit review mode */
	onBack: () => void;
	/** Called when user clicks a shot chip */
	onShotClick: (shotId: string) => void;
	/** Called when user applies a finding */
	onApplyFinding: (finding: ReviewFinding) => void;
	/** Called when user dismisses a finding */
	onDismissFinding: (findingId: string) => void;
	/** Finding ID currently being applied */
	applyingFindingId?: string | null;
}

export function ReviewModePanel({
	findings,
	summary,
	shots: _shots,
	shotIndexById,
	onBack,
	onShotClick,
	onApplyFinding,
	onDismissFinding,
	applyingFindingId,
}: ReviewModePanelProps) {
	// shots prop reserved for future use (showing shot context in findings)
	void _shots;
	const hasFindings = findings.length > 0;

	return (
		<div className="max-w-4xl space-y-5">
			{/* Back bar */}
			<div className="flex items-center justify-between">
				<Button
					variant="ghost"
					size="sm"
					onClick={onBack}
					className="gap-2 -ml-2 text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft size={16} />
					Back to shots
				</Button>
				<span className="text-sm text-muted-foreground">
					{findings.length} {findings.length === 1 ? "issue" : "issues"} found
				</span>
			</div>

			{/* Summary */}
			{summary && (
				<div className="rounded-xl border bg-card p-4">
					<p className="text-sm text-foreground leading-relaxed">{summary}</p>
				</div>
			)}

			{/* Findings list */}
			{hasFindings ? (
				<div className="space-y-3">
					{findings.map((finding) => (
						<ReviewFindingCard
							key={finding.id}
							finding={finding}
							shotIndexById={shotIndexById}
							onShotClick={onShotClick}
							onApply={() => onApplyFinding(finding)}
							onDismiss={() => onDismissFinding(finding.id)}
							isApplying={applyingFindingId === finding.id}
						/>
					))}
				</div>
			) : (
				<div className="flex flex-col items-center justify-center py-12 text-center">
					<CheckCircle2 size={48} className="text-green-500 mb-4" />
					<h3 className="text-lg font-medium text-foreground mb-2">
						All clear!
					</h3>
					<p className="text-sm text-muted-foreground max-w-sm">
						No issues found in your shot list. Your sequence looks well-crafted
						with good variety and flow.
					</p>
					<Button variant="outline" onClick={onBack} className="mt-6">
						Back to shots
					</Button>
				</div>
			)}
		</div>
	);
}

/** Skeleton for loading state */
export function ReviewModePanelSkeleton() {
	return (
		<div className="max-w-4xl space-y-5">
			<div className="flex items-center justify-center py-12">
				<div className="flex flex-col items-center gap-3">
					<Loader2 size={32} className="animate-spin text-primary" />
					<p className="text-sm text-muted-foreground">
						Analyzing your shot list...
					</p>
				</div>
			</div>
		</div>
	);
}
