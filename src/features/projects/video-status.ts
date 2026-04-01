import type {
	TriggerRunSummary,
	TriggerRunUiStatus,
	VideoLifecycleStatus,
} from "./project-types";

export function isPendingVideoStatus(status: VideoLifecycleStatus): boolean {
	return (
		status === "queued" || status === "generating" || status === "finalizing"
	);
}

export function getVideoStatusLabel(args: {
	videoStatus: VideoLifecycleStatus;
	runStatus?: TriggerRunUiStatus;
}): string {
	const { videoStatus, runStatus } = args;

	if (videoStatus === "queued") return "Queued";
	if (videoStatus === "finalizing") return "Finalizing";
	if (videoStatus === "error") return "Failed";
	if (videoStatus === "done") return "Ready";

	if (runStatus === "retrying") return "Retrying";
	if (runStatus === "queued") return "Queued";
	return "Generating";
}

export function getVideoStatusBadgeClass(args: {
	videoStatus: VideoLifecycleStatus;
	runStatus?: TriggerRunSummary["status"];
}): string {
	const label = getVideoStatusLabel(args);

	switch (label) {
		case "Queued":
			return "bg-amber-300 text-amber-950 ring-1 ring-amber-200";
		case "Generating":
			return "bg-sky-300 text-sky-950 ring-1 ring-sky-200";
		case "Retrying":
			return "bg-orange-300 text-orange-950 ring-1 ring-orange-200";
		case "Finalizing":
			return "bg-violet-300 text-violet-950 ring-1 ring-violet-200";
		case "Failed":
			return "bg-red-300 text-red-950 ring-1 ring-red-200";
		default:
			return "bg-emerald-300 text-emerald-950 ring-1 ring-emerald-200";
	}
}
