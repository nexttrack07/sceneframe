import { AlertTriangle, ImageIcon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isPromptStale } from "../../lib/stale-prompt-detection";
import type { ImagePromptEntry, ShotDraftEntry } from "../../project-types";
import { CopyButton } from "./copy-button";

interface PromptsPanelProps {
	projectId: string;
	shots: ShotDraftEntry[];
	imagePrompts: ImagePromptEntry[];
	selectedItemIds: string[];
	onSelectItem: (id: string | null, event?: React.MouseEvent) => void;
	isStale: boolean;
	onRegenerate: () => void;
	onRegeneratePrompt?: (shotIndex: number) => void;
}

export function PromptsPanel({
	shots,
	imagePrompts,
	selectedItemIds,
	onSelectItem,
	isStale,
	onRegenerate,
	onRegeneratePrompt,
}: PromptsPanelProps) {
	return (
		<div className="max-w-4xl space-y-5">
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<ImageIcon size={15} />
				<span>Image Prompts</span>
			</div>

			{isStale && (
				<div className="flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
					<div className="flex items-center gap-2 text-sm text-warning">
						<AlertTriangle size={14} />
						<span>These prompts were generated from earlier shots.</span>
					</div>
					<Button size="sm" variant="outline" onClick={onRegenerate}>
						Regenerate All
					</Button>
				</div>
			)}

			<div className="space-y-2">
				{shots.map((shot, shotIdx) => {
					// Support both v2 (shotId - not available in draft) and v1 (shotIndex)
					const prompt = imagePrompts.find((p) => p.shotIndex === shotIdx);
					const itemId = `prompt-${shotIdx}`;
					const isSelected = selectedItemIds.includes(itemId);

					// Check per-prompt staleness using sourceHash
					const promptIsStale = prompt
						? isPromptStale(prompt.sourceHash, shot.description)
						: false;

					return (
						<button
							key={itemId}
							type="button"
							onClick={(e) => onSelectItem(itemId, e)}
							className={`w-full text-left rounded-xl border p-4 transition-all duration-150 ${
								isSelected
									? "border-primary/40 bg-primary/5 ring-1 ring-primary/20 scale-[1.01] shadow-md"
									: promptIsStale
										? "border-warning/40 bg-warning/5 hover:border-warning/50"
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
								{promptIsStale && (
									<>
										<span className="text-xs text-muted-foreground">·</span>
										<span className="flex items-center gap-1 text-xs text-warning">
											<AlertTriangle size={12} />
											Stale
										</span>
									</>
								)}
							</div>
							{prompt ? (
								<>
									<p className={`text-sm leading-relaxed ${promptIsStale ? "text-muted-foreground" : "text-foreground"}`}>
										{prompt.prompt}
									</p>
									<div className="flex items-center justify-between mt-2">
										{promptIsStale && onRegeneratePrompt && (
											<Button
												size="xs"
												variant="ghost"
												onClick={(e) => {
													e.stopPropagation();
													onRegeneratePrompt(shotIdx);
												}}
												className="gap-1 text-warning hover:text-warning hover:bg-warning/10"
											>
												<RefreshCw size={12} />
												Regenerate
											</Button>
										)}
										<div className="flex-1" />
										<CopyButton text={prompt.prompt} title="Copy image prompt" />
									</div>
								</>
							) : (
								<p className="text-xs text-muted-foreground italic">
									No prompt generated for this shot yet.
								</p>
							)}
						</button>
					);
				})}
			</div>

		</div>
	);
}
