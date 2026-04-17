import { AlertTriangle, GitMerge, Trash2, Edit3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReviewFinding } from "../../lib/review-finding-types";
import { getFindingTypeLabel } from "../../lib/review-finding-types";

interface ReviewFindingCardProps {
	finding: ReviewFinding;
	/** Shot index lookup by ID (for displaying "Shot N" labels) */
	shotIndexById: Map<string, number>;
	/** Called when user clicks a shot chip */
	onShotClick: (shotId: string) => void;
	/** Called when user wants to apply the suggested action */
	onApply: () => void;
	/** Called when user dismisses the finding */
	onDismiss: () => void;
	/** Whether apply action is in progress */
	isApplying?: boolean;
}

export function ReviewFindingCard({
	finding,
	shotIndexById,
	onShotClick,
	onApply,
	onDismiss,
	isApplying,
}: ReviewFindingCardProps) {
	const isDestructive = finding.suggestedAction.type === "delete";
	const typeLabel = getFindingTypeLabel(finding.type);

	// Get shot number for display
	const getShotLabel = (shotId: string) => {
		const idx = shotIndexById.get(shotId);
		return idx !== undefined ? `Shot ${idx + 1}` : shotId;
	};

	// Get the action button label and icon
	const getActionButton = () => {
		const action = finding.suggestedAction;
		switch (action.type) {
			case "delete":
				return { label: "Delete shot", icon: Trash2 };
			case "update":
				return { label: "Update shot", icon: Edit3 };
			case "merge":
				return { label: "Merge shots", icon: GitMerge };
		}
	};

	const actionButton = getActionButton();

	// Get affected shot IDs for chips
	const getAffectedShotIds = (): string[] => {
		switch (finding.type) {
			case "similar_pair":
				return [finding.shotIdA, finding.shotIdB];
			case "redundant_delete":
				return [finding.shotId];
			case "continuity_break":
				return finding.previousShotId
					? [finding.previousShotId, finding.shotId]
					: [finding.shotId];
		}
	};

	const affectedShotIds = getAffectedShotIds();

	return (
		<div
			className={`rounded-xl border p-4 transition-all ${
				isDestructive
					? "border-destructive/30 bg-destructive/5"
					: "border-warning/30 bg-warning/5"
			}`}
		>
			{/* Header */}
			<div className="flex items-start justify-between gap-2 mb-2">
				<div className="flex items-center gap-2">
					<AlertTriangle
						size={14}
						className={isDestructive ? "text-destructive" : "text-warning"}
					/>
					<span
						className={`text-xs font-semibold uppercase tracking-wide ${
							isDestructive ? "text-destructive" : "text-warning"
						}`}
					>
						{typeLabel}
					</span>
				</div>
				<Button
					size="icon-xs"
					variant="ghost"
					onClick={onDismiss}
					className="text-muted-foreground hover:text-foreground -mr-1 -mt-1"
				>
					<X size={14} />
				</Button>
			</div>

			{/* Shot chips */}
			<div className="flex flex-wrap gap-1.5 mb-3">
				{affectedShotIds.map((shotId) => (
					<button
						key={shotId}
						type="button"
						onClick={() => onShotClick(shotId)}
						className="px-2 py-0.5 text-xs font-medium rounded-full bg-background border hover:bg-primary/5 hover:border-primary/30 transition-colors"
					>
						{getShotLabel(shotId)}
					</button>
				))}
			</div>

			{/* Explanation */}
			<p className="text-sm text-foreground leading-relaxed mb-3">
				{finding.explanation}
			</p>

			{/* Suggested description preview (if any) */}
			{finding.suggestedAction.type === "update" &&
				finding.suggestedAction.suggestedDescription && (
					<div className="mb-3 p-2 rounded-lg bg-background/50 border border-border/50">
						<p className="text-xs text-muted-foreground mb-1">
							Suggested revision:
						</p>
						<p className="text-sm text-foreground/80 italic">
							{finding.suggestedAction.suggestedDescription}
						</p>
					</div>
				)}

			{finding.suggestedAction.type === "merge" &&
				finding.suggestedAction.suggestedDescription && (
					<div className="mb-3 p-2 rounded-lg bg-background/50 border border-border/50">
						<p className="text-xs text-muted-foreground mb-1">
							Merged description:
						</p>
						<p className="text-sm text-foreground/80 italic">
							{finding.suggestedAction.suggestedDescription}
						</p>
					</div>
				)}

			{/* Actions */}
			<div className="flex items-center justify-end gap-2">
				<Button size="sm" variant="ghost" onClick={onDismiss} disabled={isApplying}>
					Dismiss
				</Button>
				<Button
					size="sm"
					variant={isDestructive ? "destructive" : "default"}
					onClick={onApply}
					disabled={isApplying}
					className="gap-1.5"
				>
					<actionButton.icon size={14} />
					{actionButton.label}
				</Button>
			</div>
		</div>
	);
}
