import { AlertTriangle, Camera, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ShotDraftEntry } from "../../project-types";
import { CopyButton } from "./copy-button";

interface ShotsPanelProps {
	shots: ShotDraftEntry[];
	selectedItemId: string | null;
	onSelectItem: (id: string | null) => void;
	isStale: boolean;
	onRegenerate: () => void;
	onGeneratePrompts?: () => void;
	isGenerating?: boolean;
}

export function ShotsPanel({
	shots,
	selectedItemId,
	onSelectItem,
	isStale,
	onRegenerate,
	onGeneratePrompts,
	isGenerating,
}: ShotsPanelProps) {
	const totalDuration = shots.reduce((sum, s) => sum + s.durationSec, 0);

	return (
		<div className="max-w-4xl space-y-5">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Camera size={15} />
					<span>
						Shot Breakdown — {shots.length} shots · {totalDuration}s total
					</span>
				</div>
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
					const isSelected = selectedItemId === itemId;
					return (
						<button
							key={itemId}
							type="button"
							onClick={() => onSelectItem(isSelected ? null : itemId)}
							className={`w-full text-left rounded-xl border p-4 transition-all duration-150 ${
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
							</div>
							<p className="text-sm text-foreground leading-relaxed">
								{shot.description}
							</p>
							<div className="flex justify-end mt-2">
								<CopyButton text={shot.description} title="Copy shot description" />
							</div>
						</button>
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
					<Button onClick={onGeneratePrompts} disabled={isGenerating} className="gap-2">
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
