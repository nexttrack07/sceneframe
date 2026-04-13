import { useEffect, useRef, useState } from "react";

/**
 * Counts up from the asset's createdAt timestamp (or from 0 if not provided).
 * Persists correctly across navigation and page refreshes.
 */
export function GeneratingTimer({
	createdAt,
	startedAt,
}: {
	createdAt?: string | null;
	startedAt?: string | null;
}) {
	const startMsRef = useRef(
		startedAt
			? new Date(startedAt).getTime()
			: createdAt
				? new Date(createdAt).getTime()
				: Date.now(),
	);
	const [elapsed, setElapsed] = useState(() =>
		Math.max(0, (Date.now() - startMsRef.current) / 1000),
	);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		intervalRef.current = setInterval(() => {
			setElapsed(Math.max(0, (Date.now() - startMsRef.current) / 1000));
		}, 100);
		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
		};
	}, []); // no dependencies — startMsRef.current is stable

	return (
		<span className="text-sm font-mono font-medium text-foreground/70 tabular-nums animate-pulse">
			{elapsed.toFixed(1)}s
		</span>
	);
}
