import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import type { MouseEvent } from "react";
import { toast as sonnerToast } from "sonner";
import { getRouter } from "@/router";

type GenerationMedium = "image" | "video" | "workshop";
type GenerationPhase = "loading" | "success" | "error";

interface GenerationToastRecord {
	id: string;
	title: string;
	location: string;
	medium: GenerationMedium;
	status: string;
	phase: GenerationPhase;
	message?: string;
	href?: string;
}

const generationToasts = new Map<string, GenerationToastRecord>();

function renderGenerationToast(record: GenerationToastRecord) {
	const isQueued = record.phase === "loading" && record.status === "Queued";
	const statusTone =
		record.phase === "error"
			? "text-red-600"
			: record.phase === "success"
				? "text-emerald-600"
				: isQueued
					? "text-amber-500"
					: "text-blue-600";
	const Icon =
		record.phase === "error"
			? AlertCircle
			: record.phase === "success"
				? CheckCircle2
				: LoaderCircle;

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

	return (
		<div className="pointer-events-auto flex w-full items-center gap-3 p-3">
			<div className={`mt-0.5 shrink-0 ${statusTone}`}>
				<Icon
					size={30}
					strokeWidth={1.9}
					className={record.phase === "loading" ? "animate-spin" : ""}
				/>
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
						<p className="truncate pt-0.5 text-[12px] font-medium tracking-[0.01em] text-muted-foreground/90 transition-colors group-hover:text-blue-500">
							{secondaryLine}
						</p>
					</a>
				) : (
					<div className="min-w-0">
						<p className="truncate text-[14px] font-semibold leading-tight text-foreground">
							{primaryLine}
						</p>
						<p className="truncate pt-0.5 text-[12px] font-medium tracking-[0.01em] text-muted-foreground/90">
							{secondaryLine}
						</p>
					</div>
				)}
				{normalizedMessage && record.phase === "error" ? (
					<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
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
