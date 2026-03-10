import { RotateCcw } from "lucide-react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function ResetDialog({
	isResetting,
	onConfirm,
}: {
	isResetting: boolean;
	onConfirm: () => void;
}) {
	return (
		<AlertDialog>
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
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={onConfirm}
						className="bg-destructive hover:bg-destructive/90 focus:ring-destructive"
					>
						Yes, start over
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
