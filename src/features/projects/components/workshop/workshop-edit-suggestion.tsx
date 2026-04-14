import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	type WorkshopEdit,
	type WorkshopEditOutlineData,
	type WorkshopEditPromptData,
	type WorkshopEditShotData,
	getEditTargetLabel,
} from "../../lib/parse-workshop-edit";
import type { ScriptDraft } from "../../project-types";

interface WorkshopEditSuggestionProps {
	edit: WorkshopEdit;
	scriptDraft: ScriptDraft | null;
	onApply: () => void;
	onDismiss: () => void;
	isApplying: boolean;
}

export function WorkshopEditSuggestion({
	edit,
	scriptDraft,
	onApply,
	onDismiss,
	isApplying,
}: WorkshopEditSuggestionProps) {
	const targetLabel = getEditTargetLabel(edit);
	const { currentValue, proposedValue } = getEditValues(edit, scriptDraft);

	return (
		<div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
			<div className="flex items-start justify-between gap-2">
				<div className="space-y-1">
					<p className="text-xs font-medium text-primary">
						Suggested edit for {targetLabel}
					</p>
				</div>
				<button
					type="button"
					onClick={onDismiss}
					disabled={isApplying}
					className="shrink-0 rounded p-0.5 text-muted-foreground/70 hover:bg-primary/10 hover:text-foreground disabled:opacity-50"
					title="Dismiss"
					aria-label="Dismiss suggestion"
				>
					<X size={14} />
				</button>
			</div>

			{currentValue && (
				<div className="space-y-1">
					<p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
						Current
					</p>
					<p className="text-xs text-muted-foreground line-clamp-2 bg-muted/50 rounded px-2 py-1.5">
						{currentValue}
					</p>
				</div>
			)}

			<div className="space-y-1">
				<p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
					Proposed
				</p>
				<p className="text-xs text-foreground bg-background rounded px-2 py-1.5 border border-border/50">
					{proposedValue}
				</p>
			</div>

			<div className="flex gap-2 pt-1">
				<Button
					size="sm"
					variant="default"
					className="h-7 gap-1.5 text-xs"
					onClick={onApply}
					disabled={isApplying}
				>
					{isApplying ? (
						<Loader2 size={12} className="animate-spin" />
					) : (
						<Check size={12} />
					)}
					{isApplying ? "Applying..." : "Apply"}
				</Button>
				<Button
					size="sm"
					variant="ghost"
					className="h-7 text-xs"
					onClick={onDismiss}
					disabled={isApplying}
				>
					Dismiss
				</Button>
			</div>
		</div>
	);
}

function getEditValues(
	edit: WorkshopEdit,
	scriptDraft: ScriptDraft | null,
): { currentValue: string | null; proposedValue: string } {
	if (edit.action === "update_shot") {
		const data = edit.data as WorkshopEditShotData;
		const currentShot = scriptDraft?.shots?.[edit.index];
		return {
			currentValue: currentShot?.description ?? null,
			proposedValue: data.description ?? "Update shot details",
		};
	}

	if (edit.action === "update_prompt") {
		const data = edit.data as WorkshopEditPromptData;
		const currentPrompt = scriptDraft?.imagePrompts?.find(
			(p) => p.shotIndex === edit.index,
		);
		return {
			currentValue: currentPrompt?.prompt ?? null,
			proposedValue: data.prompt,
		};
	}

	if (edit.action === "update_outline") {
		const data = edit.data as WorkshopEditOutlineData;
		const currentBeat = scriptDraft?.outline?.[edit.index];
		const proposedParts: string[] = [];
		if (data.title) proposedParts.push(`Title: ${data.title}`);
		if (data.summary) proposedParts.push(data.summary);
		return {
			currentValue: currentBeat
				? `${currentBeat.title}: ${currentBeat.summary}`
				: null,
			proposedValue: proposedParts.join(" — ") || "Update outline beat",
		};
	}

	return { currentValue: null, proposedValue: "Unknown edit" };
}
