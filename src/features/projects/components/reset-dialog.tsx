import { RotateCcw } from "lucide-react";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CONFIRMATION_TEXT = "RESET";

export function ResetDialog({
	isResetting,
	onConfirm,
}: {
	isResetting: boolean;
	onConfirm: () => void;
}) {
	const [confirmText, setConfirmText] = useState("");
	const [open, setOpen] = useState(false);

	const canConfirm = confirmText.toUpperCase() === CONFIRMATION_TEXT;

	function handleConfirm() {
		if (!canConfirm) return;
		onConfirm();
		setOpen(false);
		setConfirmText("");
	}

	function handleOpenChange(isOpen: boolean) {
		setOpen(isOpen);
		if (!isOpen) {
			setConfirmText("");
		}
	}

	return (
		<AlertDialog open={open} onOpenChange={handleOpenChange}>
			<AlertDialogTrigger asChild>
				<Button
					size="sm"
					variant="ghost"
					disabled={isResetting}
					className="text-muted-foreground hover:text-destructive"
				>
					<RotateCcw size={13} className="mr-1.5" />
					{isResetting ? "Resetting…" : "Redo script"}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Redo script from scratch?</AlertDialogTitle>
					<AlertDialogDescription>
						This will clear all scenes and chat history for this project.
						You&apos;ll start the Creative Brief and Script Chat flow over from
						the beginning. This action cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="py-2">
					<p className="text-sm text-muted-foreground mb-2">
						Type <span className="font-mono font-semibold text-foreground">{CONFIRMATION_TEXT}</span> to confirm:
					</p>
					<Input
						value={confirmText}
						onChange={(e) => setConfirmText(e.target.value)}
						placeholder={CONFIRMATION_TEXT}
						className="font-mono"
						autoFocus
					/>
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<Button
						onClick={handleConfirm}
						disabled={!canConfirm}
						variant="destructive"
					>
						Yes, start over
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
