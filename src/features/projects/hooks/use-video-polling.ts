import { useCallback, useEffect, useRef } from "react";

export interface VideoPollingConfig {
	/** Called on each poll tick. Return { done: true } to stop polling. */
	onPollTick: () => Promise<{ done: boolean }>;
	/** Called when polling completes (either by done or timeout). */
	onComplete?: () => void;
	/** Called when polling starts. */
	onStart?: () => void;
	/** Timeout in ms (default: 12 minutes). */
	timeoutMs?: number;
	/** Interval between polls in ms (default: 3 seconds). */
	intervalMs?: number;
}

export interface VideoPollingResult {
	/** Start the polling loop. No-op if already polling. */
	startPolling: () => void;
	/** Stop the polling loop. */
	stopPolling: () => void;
	/** Check if currently polling. */
	isPolling: () => boolean;
}

/**
 * Shared polling utility for video generation.
 * Manages refs, interval, timeout, and cleanup for both transition and shot videos.
 */
export function useVideoPolling({
	onPollTick,
	onComplete,
	onStart,
	timeoutMs = 12 * 60 * 1000,
	intervalMs = 3000,
}: VideoPollingConfig): VideoPollingResult {
	const cancelPollingRef = useRef(false);
	const isPollingRef = useRef(false);
	const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
		null,
	);

	const stopPolling = useCallback(() => {
		cancelPollingRef.current = true;
		if (pollingIntervalRef.current) {
			clearInterval(pollingIntervalRef.current);
			pollingIntervalRef.current = null;
		}
		isPollingRef.current = false;
		onComplete?.();
	}, [onComplete]);

	const startPolling = useCallback(() => {
		if (isPollingRef.current) return;

		cancelPollingRef.current = false;
		isPollingRef.current = true;
		onStart?.();

		const deadline = Date.now() + timeoutMs;

		pollingIntervalRef.current = setInterval(async () => {
			if (cancelPollingRef.current || Date.now() > deadline) {
				stopPolling();
				return;
			}

			try {
				const result = await onPollTick();
				if (result.done) {
					stopPolling();
				}
			} catch {
				// Transient error, keep polling.
			}
		}, intervalMs);
	}, [onPollTick, onStart, stopPolling, timeoutMs, intervalMs]);

	const isPolling = useCallback(() => isPollingRef.current, []);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (pollingIntervalRef.current) {
				clearInterval(pollingIntervalRef.current);
				pollingIntervalRef.current = null;
			}
		};
	}, []);

	return {
		startPolling,
		stopPolling,
		isPolling,
	};
}
