import { Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UndoToastProps {
	show: boolean;
	isUndoing: boolean;
	label?: string;
	onUndo: () => void;
	onDismiss: () => void;
}

export function UndoToast({ show, isUndoing, label, onUndo, onDismiss }: UndoToastProps) {
	if (!show) return null;

	return (
		<div className="animate-fade-in-up flex items-center gap-2 rounded-lg border border-border/50 bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm">
			<span className="text-sm text-muted-foreground">
				{label ? `Applied: ${label}` : "Edit applied"}
			</span>
			<Button
				size="xs"
				variant="ghost"
				onClick={onUndo}
				disabled={isUndoing}
				className="gap-1.5"
			>
				<Undo2 size={14} />
				{isUndoing ? "Undoing..." : "Undo"}
			</Button>
			<button
				type="button"
				onClick={onDismiss}
				className="ml-1 rounded p-1.5 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
				aria-label="Dismiss"
			>
				<X size={14} />
			</button>
		</div>
	);
}
