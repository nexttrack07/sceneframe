import { AlertTriangle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OutlineEntry } from "../../project-types";

interface OutlinePanelProps {
	outline: OutlineEntry[];
	selectedItemId: string | null;
	onSelectItem: (id: string | null) => void;
	isStale: boolean;
	onRegenerate: () => void;
	onBreakdownToShots?: () => void;
	isGenerating?: boolean;
}

export function OutlinePanel({
	outline,
	selectedItemId,
	onSelectItem,
	isStale,
	onRegenerate,
	onBreakdownToShots,
	isGenerating,
}: OutlinePanelProps) {
	return (
		<div className="max-w-4xl space-y-4">
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<FileText size={15} />
				<span>Script Outline</span>
			</div>

			{isStale && (
				<div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
					<div className="flex items-center gap-2 text-sm text-amber-600">
						<AlertTriangle size={14} />
						<span>This outline was generated from an earlier version.</span>
					</div>
					<Button size="sm" variant="outline" onClick={onRegenerate}>
						Regenerate
					</Button>
				</div>
			)}

			{outline.map((entry, i) => {
				const itemId = `outline-${i}`;
				const isSelected = selectedItemId === itemId;
				return (
					<button
						key={itemId}
						type="button"
						onClick={() => onSelectItem(isSelected ? null : itemId)}
						className={`w-full text-left rounded-xl border p-4 transition-colors ${
							isSelected
								? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
								: "border-border bg-background hover:border-primary/30"
						}`}
					>
						<p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">
							Scene {i + 1}
						</p>
						<p className="text-sm font-medium text-foreground">{entry.title}</p>
						<p className="text-sm text-muted-foreground mt-1">{entry.summary}</p>
					</button>
				);
			})}

			{onBreakdownToShots && (
				<div className="flex items-center justify-between gap-3 rounded-2xl border bg-background px-5 py-4 shadow-sm">
					<div>
						<p className="text-sm font-medium text-foreground">
							Outline looks good?
						</p>
						<p className="text-sm text-muted-foreground">
							Break each scene down into individual shots.
						</p>
					</div>
					<Button onClick={onBreakdownToShots} disabled={isGenerating}>
						{isGenerating ? "Generating..." : "Break down into shots"}
					</Button>
				</div>
			)}
		</div>
	);
}
