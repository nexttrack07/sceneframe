import { useCallback, useRef, useState } from "react";
import type { WorkshopState } from "../project-types";
import { restoreWorkshopSnapshot } from "../workshop-mutations";

const MAX_UNDO_DEPTH = 20;

interface UndoEntry {
	/** The workshop state before the edit was applied */
	preState: WorkshopState;
	/** Timestamp when this entry was pushed */
	timestamp: number;
	/** Optional label for the edit (e.g., "Updated shot 3") */
	label?: string;
}

interface UseWorkshopUndoArgs {
	projectId: string;
	onUndoComplete?: () => void;
}

export function useWorkshopUndo({ projectId, onUndoComplete }: UseWorkshopUndoArgs) {
	const [stack, setStack] = useState<UndoEntry[]>([]);
	const [isUndoing, setIsUndoing] = useState(false);
	const [showToast, setShowToast] = useState(false);
	const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const canUndo = stack.length > 0 && !isUndoing;

	/**
	 * Push a pre-edit snapshot onto the undo stack.
	 * Call this AFTER a successful edit with the preState returned from the server.
	 */
	const pushSnapshot = useCallback((preState: WorkshopState, label?: string) => {
		setStack((prev) => {
			const next = [{ preState, timestamp: Date.now(), label }, ...prev];
			// Cap at MAX_UNDO_DEPTH
			return next.slice(0, MAX_UNDO_DEPTH);
		});

		// Show toast for 6 seconds
		if (toastTimeoutRef.current) {
			clearTimeout(toastTimeoutRef.current);
		}
		setShowToast(true);
		toastTimeoutRef.current = setTimeout(() => {
			setShowToast(false);
		}, 6000);
	}, []);

	/**
	 * Undo the most recent edit by restoring the preState snapshot.
	 */
	const undo = useCallback(async () => {
		if (stack.length === 0 || isUndoing) return;

		const [latest, ...rest] = stack;
		setIsUndoing(true);

		try {
			await restoreWorkshopSnapshot({
				data: {
					projectId,
					snapshot: latest.preState,
				},
			});

			setStack(rest);
			onUndoComplete?.();
		} catch (err) {
			console.error("Failed to undo:", err);
			// Don't pop from stack if undo failed
		} finally {
			setIsUndoing(false);
		}
	}, [stack, isUndoing, projectId, onUndoComplete]);

	/**
	 * Clear the entire undo stack.
	 */
	const clearStack = useCallback(() => {
		setStack([]);
		setShowToast(false);
		if (toastTimeoutRef.current) {
			clearTimeout(toastTimeoutRef.current);
		}
	}, []);

	/**
	 * Dismiss the toast without undoing.
	 */
	const dismissToast = useCallback(() => {
		setShowToast(false);
		if (toastTimeoutRef.current) {
			clearTimeout(toastTimeoutRef.current);
		}
	}, []);

	return {
		/** Whether there are entries in the undo stack */
		canUndo,
		/** Number of entries in the undo stack */
		undoDepth: stack.length,
		/** Whether an undo operation is in progress */
		isUndoing,
		/** Whether the toast should be shown */
		showToast,
		/** Label of the most recent edit (if any) */
		lastEditLabel: stack[0]?.label,
		/** Push a snapshot onto the stack after a successful edit */
		pushSnapshot,
		/** Undo the most recent edit */
		undo,
		/** Clear the entire undo stack */
		clearStack,
		/** Dismiss the toast */
		dismissToast,
	};
}
