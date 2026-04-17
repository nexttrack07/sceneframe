import { useState } from "react";
import { AlertTriangle, Camera, Loader2, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReviewFinding } from "../../lib/review-finding-types";
import type { ShotDraftEntry } from "../../project-types";
import { CopyButton } from "./copy-button";
import { InlineEditField } from "./inline-edit-field";
import { ReviewModePanel, ReviewModePanelSkeleton } from "./review-mode-panel";

interface ShotsPanelProps {
	shots: ShotDraftEntry[];
	selectedItemIds: string[];
	onSelectItem: (id: string | null, event?: React.MouseEvent) => void;
	isStale: boolean;
	onRegenerate: () => void;
	onGeneratePrompts?: () => void;
	isGenerating?: boolean;
	/** Called when user saves an inline edit */
	onInlineEdit?: (shotIndex: number, newDescription: string) => Promise<void>;
	/** Review mode state */
	isReviewMode?: boolean;
	isReviewLoading?: boolean;
	reviewFindings?: ReviewFinding[];
	reviewSummary?: string | null;
	/** Map of shot ID to index */
	shotIndexById?: Map<string, number>;
	/** Called to start review */
	onStartReview?: () => void;
	/** Called to exit review mode */
	onExitReview?: () => void;
	/** Called when user clicks a shot chip in review mode */
	onReviewShotClick?: (shotId: string) => void;
	/** Called when user applies a finding */
	onApplyFinding?: (finding: ReviewFinding) => void;
	/** Called when user dismisses a finding */
	onDismissFinding?: (findingId: string) => void;
	/** Finding ID currently being applied */
	applyingFindingId?: string | null;
}

export function ShotsPanel({
	shots,
	selectedItemIds,
	onSelectItem,
	isStale,
	onRegenerate,
	onGeneratePrompts,
	isGenerating,
	onInlineEdit,
	isReviewMode,
	isReviewLoading,
	reviewFindings,
	reviewSummary,
	shotIndexById,
	onStartReview,
	onExitReview,
	onReviewShotClick,
	onApplyFinding,
	onDismissFinding,
	applyingFindingId,
}: ShotsPanelProps) {
	const totalDuration = shots.reduce((sum, s) => sum + s.durationSec, 0);
	const [editingIndex, setEditingIndex] = useState<number | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	// Show review loading state
	if (isReviewLoading) {
		return <ReviewModePanelSkeleton />;
	}

	// Show review mode panel
	if (isReviewMode && reviewFindings && onExitReview && onReviewShotClick && onApplyFinding && onDismissFinding) {
		return (
			<ReviewModePanel
				findings={reviewFindings}
				summary={reviewSummary ?? null}
				shots={shots}
				shotIndexById={shotIndexById ?? new Map()}
				onBack={onExitReview}
				onShotClick={onReviewShotClick}
				onApplyFinding={onApplyFinding}
				onDismissFinding={onDismissFinding}
				applyingFindingId={applyingFindingId}
			/>
		);
	}

	const handleDoubleClick = (shotIdx: number) => {
		if (onInlineEdit) {
			setEditingIndex(shotIdx);
		}
	};

	const handleSave = async (shotIdx: number, newValue: string) => {
		if (!onInlineEdit) return;
		setIsSaving(true);
		try {
			await onInlineEdit(shotIdx, newValue);
			setEditingIndex(null);
		} finally {
			setIsSaving(false);
		}
	};

	const handleCancel = () => {
		setEditingIndex(null);
	};

	return (
		<div className="max-w-4xl space-y-5">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Camera size={15} />
					<span>
						Shot Breakdown — {shots.length} shots · {totalDuration}s total
					</span>
				</div>
				{onStartReview && (
					<Button
						size="sm"
						variant="outline"
						onClick={onStartReview}
						disabled={isReviewLoading}
						className="gap-1.5"
					>
						<Search size={14} />
						Review shots
					</Button>
				)}
			</div>

			{isStale && (
				<div className="flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
					<div className="flex items-center gap-2 text-sm text-warning">
						<AlertTriangle size={14} />
						<span>These shots were generated from an earlier outline.</span>
					</div>
					<Button size="sm" variant="outline" onClick={onRegenerate}>
						Regenerate
					</Button>
				</div>
			)}

			<div className="space-y-2">
				{shots.map((shot, shotIdx) => {
					const itemId = `shot-${shotIdx}`;
					const isSelected = selectedItemIds.includes(itemId);
					const isEditing = editingIndex === shotIdx;

					return (
						<div
							key={itemId}
							role="button"
							tabIndex={0}
							onClick={(e) => !isEditing && onSelectItem(itemId, e)}
							onDoubleClick={() => handleDoubleClick(shotIdx)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !isEditing) {
									onSelectItem(itemId);
								}
							}}
							className={`w-full text-left rounded-xl border p-4 transition-all duration-150 cursor-pointer ${
								isSelected
									? "border-primary/40 bg-primary/5 ring-1 ring-primary/20 scale-[1.01] shadow-md"
									: "border-border bg-background hover:border-primary/30 hover:scale-[1.005] hover:shadow-sm"
							}`}
						>
							<div className="flex items-center gap-2 mb-1">
								<span className="text-xs font-semibold text-primary uppercase tracking-wide">
									Shot {shotIdx + 1}
								</span>
								<span className="text-xs text-muted-foreground">·</span>
								<span className="text-xs font-medium text-muted-foreground uppercase">
									{shot.shotSize}
								</span>
								<span className="text-xs text-muted-foreground">·</span>
								<span className="text-xs text-muted-foreground">
									{shot.shotType}
								</span>
								<span className="text-xs text-muted-foreground">·</span>
								<span className="text-xs text-muted-foreground">
									~{shot.durationSec}s
								</span>
								{onInlineEdit && !isEditing && (
									<span className="ml-auto text-xs text-muted-foreground/50">
										Double-click to edit
									</span>
								)}
							</div>
							{isEditing ? (
								<InlineEditField
									value={shot.description}
									onSave={(newValue) => void handleSave(shotIdx, newValue)}
									onCancel={handleCancel}
									isSaving={isSaving}
									placeholder="Shot description..."
									rows={3}
								/>
							) : (
								<>
									<p className="text-sm text-foreground leading-relaxed">
										{shot.description}
									</p>
									<div className="flex justify-end mt-2">
										<CopyButton text={shot.description} title="Copy shot description" />
									</div>
								</>
							)}
						</div>
					);
				})}
			</div>

			{onGeneratePrompts && (
				<div className="flex items-center justify-between gap-3 rounded-2xl border bg-background px-5 py-4 shadow-sm">
					<div>
						<p className="text-sm font-medium text-foreground">
							Shots look good?
						</p>
						<p className="text-sm text-muted-foreground">
							Generate image prompts for each shot.
						</p>
					</div>
					<Button onClick={onGeneratePrompts} disabled={isGenerating} variant="accent" className="gap-2">
						{isGenerating ? (
							<Loader2 size={14} className="animate-spin" />
						) : (
							<Sparkles size={14} />
						)}
						{isGenerating ? "Generating..." : "Generate image prompts"}
					</Button>
				</div>
			)}
		</div>
	);
}
