import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface SceneRefinePanelProps {
	refineInstructions: string;
	setRefineInstructions: (value: string) => void;
	isRegenerating: boolean;
	onRegenerate: () => void;
	onRegenerateSceneAndShots?: () => void;
	isRegeneratingSceneAndShots?: boolean;
	onClose: () => void;
}

export function SceneRefinePanel({
	refineInstructions,
	setRefineInstructions,
	isRegenerating,
	onRegenerate,
	onRegenerateSceneAndShots,
	isRegeneratingSceneAndShots = false,
	onClose,
}: SceneRefinePanelProps) {
	const isBusy = isRegenerating || isRegeneratingSceneAndShots;

	return (
		<div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
			<p className="text-xs text-primary font-medium">What should change?</p>
			<Textarea
				value={refineInstructions}
				onChange={(e) => setRefineInstructions(e.target.value)}
				placeholder="e.g. Make the lighting warmer, add a sunset in the background..."
				rows={2}
				disabled={isBusy}
				className="resize-none text-sm bg-card"
				onKeyDown={(e) => {
					if (e.key === "Enter" && !e.shiftKey) {
						e.preventDefault();
						if (onRegenerateSceneAndShots) {
							onRegenerateSceneAndShots();
						} else {
							onRegenerate();
						}
					}
				}}
			/>
			{onRegenerateSceneAndShots && (
				<p className="text-[11px] text-muted-foreground">
					Regenerating scene + shots keeps existing assets and only rewrites
					descriptions.
				</p>
			)}
			<div className="flex items-center justify-end gap-2">
				<Button
					size="sm"
					variant="ghost"
					onClick={onClose}
					disabled={isBusy}
					className="text-xs"
				>
					Cancel
				</Button>
				{onRegenerateSceneAndShots && (
					<Button
						size="sm"
						variant="outline"
						onClick={onRegenerateSceneAndShots}
						disabled={!refineInstructions.trim() || isBusy}
						className="text-xs"
					>
						{isRegeneratingSceneAndShots ? (
							<Loader2 size={12} className="animate-spin mr-1.5" />
						) : (
							<Sparkles size={12} className="mr-1.5" />
						)}
						{isRegeneratingSceneAndShots
							? "Redoing scene…"
							: "Redo scene + shots"}
					</Button>
				)}
				<Button
					size="sm"
					onClick={onRegenerate}
					disabled={!refineInstructions.trim() || isBusy}
					className="bg-primary hover:bg-primary/90 text-xs"
				>
					{isRegenerating ? (
						<Loader2 size={12} className="animate-spin mr-1.5" />
					) : (
						<Sparkles size={12} className="mr-1.5" />
					)}
					{isRegenerating ? "Refining…" : "Refine scene"}
				</Button>
			</div>
		</div>
	);
}
