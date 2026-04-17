import { useCallback, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface InlineEditFieldProps {
	/** Current value to display/edit */
	value: string;
	/** Called when user saves the edit */
	onSave: (newValue: string) => void;
	/** Called when user cancels the edit */
	onCancel: () => void;
	/** Whether save is in progress */
	isSaving?: boolean;
	/** Placeholder text */
	placeholder?: string;
	/** Number of rows for the textarea */
	rows?: number;
}

export function InlineEditField({
	value,
	onSave,
	onCancel,
	isSaving,
	placeholder,
	rows = 3,
}: InlineEditFieldProps) {
	const [editValue, setEditValue] = useState(value);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Focus textarea on mount
	useEffect(() => {
		textareaRef.current?.focus();
		textareaRef.current?.select();
	}, []);

	const handleSave = useCallback(() => {
		const trimmed = editValue.trim();
		if (trimmed && trimmed !== value) {
			onSave(trimmed);
		} else {
			onCancel();
		}
	}, [editValue, value, onSave, onCancel]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				handleSave();
			} else if (e.key === "Escape") {
				e.preventDefault();
				onCancel();
			}
		},
		[handleSave, onCancel],
	);

	return (
		<div className="space-y-2" onClick={(e) => e.stopPropagation()}>
			<Textarea
				ref={textareaRef}
				value={editValue}
				onChange={(e) => setEditValue(e.target.value)}
				onKeyDown={handleKeyDown}
				onBlur={handleSave}
				placeholder={placeholder}
				rows={rows}
				disabled={isSaving}
				className="text-sm"
			/>
			<div className="flex items-center justify-end gap-1">
				<span className="text-xs text-muted-foreground mr-2">
					{isSaving ? "Saving..." : "⌘+Enter to save, Esc to cancel"}
				</span>
				<Button
					size="icon-xs"
					variant="ghost"
					onClick={(e) => {
						e.stopPropagation();
						onCancel();
					}}
					disabled={isSaving}
					className="text-muted-foreground hover:text-foreground"
				>
					<X size={14} />
				</Button>
				<Button
					size="icon-xs"
					variant="ghost"
					onClick={(e) => {
						e.stopPropagation();
						handleSave();
					}}
					disabled={isSaving || !editValue.trim()}
					className="text-primary hover:text-primary"
				>
					<Check size={14} />
				</Button>
			</div>
		</div>
	);
}
