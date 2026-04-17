import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	type SelectionKind,
	getQuickActions,
} from "../../lib/quick-action-templates";

interface QuickActionChipsProps {
	/** The kind of item currently selected */
	selectionKind: SelectionKind | null;
	/** Called when user clicks a chip */
	onSelectAction: (prompt: string) => void;
	/** Whether actions are disabled (e.g., during sending) */
	disabled?: boolean;
}

export function QuickActionChips({
	selectionKind,
	onSelectAction,
	disabled,
}: QuickActionChipsProps) {
	if (!selectionKind) return null;

	const actions = getQuickActions(selectionKind);
	if (actions.length === 0) return null;

	return (
		<div className="flex flex-wrap items-center gap-1.5 mb-2">
			<span className="text-xs text-muted-foreground/70 mr-1">
				<Sparkles size={12} className="inline -mt-0.5" />
			</span>
			{actions.map((action) => (
				<Button
					key={action.label}
					type="button"
					size="xs"
					variant="outline"
					onClick={() => onSelectAction(action.prompt)}
					disabled={disabled}
					className="h-6 px-2 text-xs font-normal text-muted-foreground hover:text-foreground hover:bg-primary/5 hover:border-primary/30"
				>
					{action.label}
				</Button>
			))}
		</div>
	);
}
