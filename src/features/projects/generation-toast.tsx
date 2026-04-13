import { useRealtimeRunsWithTag } from "@trigger.dev/react-hooks";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { toast as sonnerToast } from "sonner";
import { getRouter } from "@/router";
import { getBatchRealtimeToken } from "./realtime-actions";

function GradientSpinner() {
	return <div className="gradient-spinner" />;
}

type GenerationMedium = "image" | "video" | "workshop";
type GenerationPhase = "loading" | "success" | "error";

interface GenerationMetadata {
	model?: string;
	aspectRatio?: string;
	duration?: string;
}

interface GenerationToastRecord {
	id: string;
	title: string;
	location: string;
	medium: GenerationMedium;
	status: string;
	phase: GenerationPhase;
	message?: string;
	href?: string;
	metadata?: GenerationMetadata;
}

const generationToasts = new Map<string, GenerationToastRecord>();

function renderGenerationToast(record: GenerationToastRecord) {
	const isLoading = record.phase === "loading";

	const currentLocation =
		typeof window === "undefined"
			? null
			: `${window.location.pathname}${window.location.search}`;
	const showJumpIcon = Boolean(record.href && record.href !== currentLocation);
	const normalizedMessage =
		record.message === record.location
			? null
			: record.message?.startsWith(`${record.location} · `)
				? record.message.slice(record.location.length + 3)
				: record.message;
	const primaryLine = record.title;
	const secondaryLine = record.location;
	const handleNavigate = (event: MouseEvent<HTMLAnchorElement>) => {
		if (!record.href) return;
		event.preventDefault();
		void getRouter().navigate({ to: record.href });
	};

	const hasMetadata = record.metadata && (record.metadata.model || record.metadata.aspectRatio || record.metadata.duration);

	return (
		<div className="pointer-events-auto flex w-full items-center gap-3 p-3">
			<div className="mt-0.5 shrink-0">
				{isLoading ? (
					<GradientSpinner />
				) : record.phase === "error" ? (
					<AlertCircle size={28} strokeWidth={1.8} className="text-destructive" />
				) : (
					<CheckCircle2 size={28} strokeWidth={1.8} className="text-success" />
				)}
			</div>
			<div className="min-w-0 flex-1">
				{showJumpIcon ? (
					<a
						href={record.href}
						onClick={handleNavigate}
						className="group pointer-events-auto relative z-10 block min-w-0 cursor-pointer text-left"
					>
						<p className="truncate text-[14px] font-semibold leading-tight text-foreground transition-colors group-hover:text-blue-600 group-hover:underline">
							{primaryLine}
						</p>
					</a>
				) : (
					<p className="truncate text-[14px] font-semibold leading-tight text-foreground">
						{primaryLine}
					</p>
				)}
				<div className="flex items-center gap-1.5 overflow-hidden pt-1">
					<span className="shrink-0 text-[12px] font-medium tracking-[0.01em] text-muted-foreground/90">
						{secondaryLine}
					</span>
					{hasMetadata && (
						<>
							<span className="text-muted-foreground/50">·</span>
							{record.metadata?.model && (
								<span className="shrink-0 text-[11px] font-medium text-primary/80">
									{record.metadata.model}
								</span>
							)}
							{record.metadata?.aspectRatio && (
								<span className="shrink-0 text-[11px] text-muted-foreground/70">
									{record.metadata.aspectRatio}
								</span>
							)}
							{record.metadata?.duration && (
								<span className="shrink-0 text-[11px] text-muted-foreground/70">
									{record.metadata.duration}
								</span>
							)}
						</>
					)}
				</div>
				{normalizedMessage && record.phase === "error" ? (
					<p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
						{normalizedMessage}
					</p>
				) : null}
			</div>
		</div>
	);
}

function upsertGenerationToast(
	record: GenerationToastRecord,
	duration: number,
) {
	generationToasts.set(record.id, record);
	sonnerToast.custom(() => renderGenerationToast(record), {
		id: record.id,
		duration,
	});
}

export function beginGenerationToast(args: {
	id: string;
	title: string;
	location: string;
	medium: GenerationMedium;
	status?: string;
	message?: string;
	href?: string;
	metadata?: GenerationMetadata;
}) {
	upsertGenerationToast(
		{
			id: args.id,
			title: args.title,
			location: args.location,
			medium: args.medium,
			status: args.status ?? "Queued",
			phase: "loading",
			message: args.message,
			href: args.href,
			metadata: args.metadata,
		},
		Number.POSITIVE_INFINITY,
	);
}

export function updateGenerationToast(
	id: string,
	args: {
		status: string;
		message?: string;
	},
) {
	const current = generationToasts.get(id);
	if (!current || current.phase !== "loading") return;
	if (current.status === args.status && current.message === args.message)
		return;

	upsertGenerationToast(
		{
			...current,
			status: args.status,
			message: args.message,
		},
		Number.POSITIVE_INFINITY,
	);
}

export function resolveGenerationToast(
	id: string,
	args: {
		status: string;
		message?: string;
		error?: boolean;
	},
) {
	const current = generationToasts.get(id);
	if (!current) return;
	const phase: GenerationPhase = args.error ? "error" : "success";
	upsertGenerationToast(
		{
			...current,
			status: args.status,
			message: args.message,
			phase,
		},
		5000,
	);
	window.setTimeout(() => {
		generationToasts.delete(id);
	}, 5000);
}

export function dismissGenerationToast(id: string) {
	generationToasts.delete(id);
	sonnerToast.dismiss(id);
}

// ============================================
// BATCH GENERATION TOAST (Realtime)
// ============================================

interface BatchToastConfig {
	id: string;
	projectId: string;
	batchId: string;
	videoIds: Set<string>;
	skipped: number;
	cancelled: boolean;
}

const batchToastConfigs = new Map<string, BatchToastConfig>();

function BatchToastContent({ config }: { config: BatchToastConfig }) {
	const [realtimeToken, setRealtimeToken] = useState<string | null>(null);
	const [cancelled, setCancelled] = useState(config.cancelled);
	const [isComplete, setIsComplete] = useState(false);

	// Fetch realtime token on mount
	useEffect(() => {
		let isCancelled = false;
		getBatchRealtimeToken({
			data: { projectId: config.projectId, batchId: config.batchId },
		})
			.then(({ token }) => {
				if (!isCancelled) setRealtimeToken(token);
			})
			.catch((err) => {
				console.error("[BatchToast] Failed to get realtime token:", err);
			});
		return () => {
			isCancelled = true;
		};
	}, [config.projectId, config.batchId]);

	// Subscribe to realtime runs for this batch
	const { runs } = useRealtimeRunsWithTag([`batch:${config.batchId}`], {
		accessToken: realtimeToken ?? undefined,
		enabled: !!realtimeToken && !cancelled,
	});

	// Derive counts from realtime runs
	const counts = useMemo(() => {
		let queued = 0;
		let generating = 0;
		let done = 0;
		let errored = 0;

		if (!runs) {
			// Before realtime connects, assume all are queued
			return {
				queued: config.videoIds.size,
				generating: 0,
				done: 0,
				errored: 0,
			};
		}

		const seenVideoIds = new Set<string>();

		// Map status strings to categories
		const completedStatuses = new Set(["COMPLETED"]);
		const errorStatuses = new Set(["FAILED", "CRASHED", "SYSTEM_FAILURE", "EXPIRED", "TIMED_OUT"]);
		const cancelledStatuses = new Set(["CANCELED", "INTERRUPTED"]);
		const generatingStatuses = new Set(["EXECUTING", "REATTEMPTING"]);

		for (const run of runs) {
			const videoTag = run.tags?.find((tag) => tag.startsWith("video:"));
			if (!videoTag) continue;
			const videoId = videoTag.replace("video:", "");
			if (!config.videoIds.has(videoId)) continue;
			if (seenVideoIds.has(videoId)) continue;
			seenVideoIds.add(videoId);

			const status = run.status as string;
			if (completedStatuses.has(status)) {
				done++;
			} else if (errorStatuses.has(status)) {
				errored++;
			} else if (cancelledStatuses.has(status)) {
				// Treat cancelled as done for count purposes
				done++;
			} else if (generatingStatuses.has(status)) {
				generating++;
			} else {
				queued++;
			}
		}

		// Any video IDs not seen in runs are still queued
		const unseenCount = config.videoIds.size - seenVideoIds.size;
		queued += unseenCount;

		return { queued, generating, done, errored };
	}, [runs, config.videoIds]);

	// Track completion and auto-dismiss
	useEffect(() => {
		if (cancelled) return;
		const complete = counts.queued === 0 && counts.generating === 0;
		if (complete && !isComplete) {
			setIsComplete(true);
			// Auto-dismiss after 8 seconds
			const timeout = setTimeout(() => {
				batchToastConfigs.delete(config.id);
				sonnerToast.dismiss(config.id);
			}, 8000);
			return () => clearTimeout(timeout);
		}
	}, [counts, cancelled, isComplete, config.id]);

	const handleCancel = (e: MouseEvent) => {
		e.stopPropagation();
		setCancelled(true);
		const current = batchToastConfigs.get(config.id);
		if (current) {
			batchToastConfigs.set(config.id, { ...current, cancelled: true });
		}
		// Dismiss after 5 seconds
		setTimeout(() => {
			batchToastConfigs.delete(config.id);
			sonnerToast.dismiss(config.id);
		}, 5000);
	};

	const inProgress = counts.queued + counts.generating;
	const hasErrors = counts.errored > 0;
	const complete = counts.queued === 0 && counts.generating === 0;

	return (
		<div className="pointer-events-auto flex w-full items-center gap-3 p-3">
			<div className="mt-0.5 shrink-0">
				{cancelled ? (
					<AlertCircle size={28} strokeWidth={1.8} className="text-warning" />
				) : complete ? (
					hasErrors ? (
						<AlertCircle size={28} strokeWidth={1.8} className="text-warning" />
					) : (
						<CheckCircle2 size={28} strokeWidth={1.8} className="text-success" />
					)
				) : (
					<GradientSpinner />
				)}
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-[14px] font-semibold leading-tight text-foreground">
					{cancelled
						? "Batch generation cancelled"
						: complete
							? hasErrors
								? "Batch generation completed with errors"
								: "All transitions generated"
							: "Generating transitions"}
				</p>
				<div className="flex items-center gap-2 pt-1.5">
					{!cancelled && (
						<>
							<div className="flex items-center gap-1">
								<span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded bg-success/20 px-1.5 text-[11px] font-semibold text-success">
									{counts.done}
								</span>
								<span className="text-[11px] text-muted-foreground">done</span>
							</div>
							{inProgress > 0 && (
								<div className="flex items-center gap-1">
									<span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded bg-primary/20 px-1.5 text-[11px] font-semibold text-primary">
										{inProgress}
									</span>
									<span className="text-[11px] text-muted-foreground">in progress</span>
								</div>
							)}
							{counts.errored > 0 && (
								<div className="flex items-center gap-1">
									<span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded bg-destructive/20 px-1.5 text-[11px] font-semibold text-destructive">
										{counts.errored}
									</span>
									<span className="text-[11px] text-muted-foreground">failed</span>
								</div>
							)}
							{config.skipped > 0 && (
								<div className="flex items-center gap-1">
									<span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground">
										{config.skipped}
									</span>
									<span className="text-[11px] text-muted-foreground">skipped</span>
								</div>
							)}
						</>
					)}
				</div>
			</div>
			{!complete && !cancelled && (
				<button
					type="button"
					onClick={handleCancel}
					className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
					title="Stop tracking"
				>
					<X size={16} />
				</button>
			)}
		</div>
	);
}

export function beginBatchGenerationToast(args: {
	id: string;
	projectId: string;
	batchId: string;
	videoIds: string[];
	skipped: number;
}) {
	// Clear any existing batch toast with same id
	batchToastConfigs.delete(args.id);

	const config: BatchToastConfig = {
		id: args.id,
		projectId: args.projectId,
		batchId: args.batchId,
		videoIds: new Set(args.videoIds),
		skipped: args.skipped,
		cancelled: false,
	};

	batchToastConfigs.set(args.id, config);

	sonnerToast.custom(() => <BatchToastContent config={config} />, {
		id: args.id,
		duration: Number.POSITIVE_INFINITY,
	});
}

export function cancelBatchGeneration(id: string) {
	const config = batchToastConfigs.get(id);
	if (!config) return;

	batchToastConfigs.set(id, { ...config, cancelled: true });

	// Re-render toast to show cancelled state
	sonnerToast.custom(() => <BatchToastContent config={{ ...config, cancelled: true }} />, {
		id,
		duration: 5000,
	});

	setTimeout(() => {
		batchToastConfigs.delete(id);
	}, 5000);
}
