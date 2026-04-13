import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, ImageIcon, Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ShotDraftEntry } from "../../project-types";
import { CopyButton } from "./copy-button";

interface PromptsPanelProps {
	projectId: string;
	shots: ShotDraftEntry[];
	imagePrompts: Array<{ shotIndex: number; prompt: string }>;
	selectedItemId: string | null;
	onSelectItem: (id: string | null) => void;
	isStale: boolean;
	onRegenerate: () => void;
	onApprove?: () => void;
	isApproving?: boolean;
	hasApprovedShots?: boolean;
}

export function PromptsPanel({
	projectId,
	shots,
	imagePrompts,
	selectedItemId,
	onSelectItem,
	isStale,
	onRegenerate,
	onApprove,
	isApproving,
	hasApprovedShots = false,
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
						Regenerate
					</Button>
				</div>
			)}

			<div className="space-y-2">
				{shots.map((shot, shotIdx) => {
					const prompt = imagePrompts.find((p) => p.shotIndex === shotIdx);
					const itemId = `prompt-${shotIdx}`;
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
							</div>
							{prompt ? (
								<>
									<p className="text-sm text-foreground leading-relaxed">
										{prompt.prompt}
									</p>
									<div className="flex justify-end mt-2">
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

			{hasApprovedShots ? (
				<div className="flex items-center justify-between gap-3 rounded-2xl border bg-background px-5 py-4 shadow-sm">
					<div>
						<p className="text-sm font-medium text-foreground">
							You have an existing storyboard
						</p>
						<p className="text-sm text-muted-foreground">
							Go back to continue working, or re-approve to update shots.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Button variant="outline" asChild>
							<Link
								to="/projects/$projectId"
								params={{ projectId }}
								search={{}}
								className="gap-2"
							>
								Back to Storyboard
								<ArrowRight size={14} />
							</Link>
						</Button>
						{onApprove && (
							<Button variant="secondary" onClick={onApprove} disabled={isApproving} className="gap-2">
								{isApproving ? (
									<Loader2 size={14} className="animate-spin" />
								) : (
									<Rocket size={14} />
								)}
								{isApproving ? "Updating..." : "Re-approve shots"}
							</Button>
						)}
					</div>
				</div>
			) : onApprove && (
				<div className="flex items-center justify-between gap-3 rounded-2xl border bg-background px-5 py-4 shadow-sm">
					<div>
						<p className="text-sm font-medium text-foreground">
							Ready to produce?
						</p>
						<p className="text-sm text-muted-foreground">
							Start working with your shots in the storyboard.
						</p>
					</div>
					<Button onClick={onApprove} disabled={isApproving} variant="accent" className="gap-2">
						{isApproving ? (
							<Loader2 size={14} className="animate-spin" />
						) : (
							<Rocket size={14} />
						)}
						{isApproving ? "Starting..." : "Start production"}
					</Button>
				</div>
			)}
		</div>
	);
}
