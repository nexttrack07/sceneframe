import { cn } from "@/lib/utils";

function Skeleton({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"rounded-md bg-muted relative overflow-hidden",
				"after:absolute after:inset-0 after:translate-x-[-100%] after:animate-[shimmer_1.5s_infinite]",
				"after:bg-gradient-to-r after:from-transparent after:via-white/10 after:to-transparent",
				className
			)}
			{...props}
		/>
	);
}

/** Text skeleton - multiple lines that mimic text */
function SkeletonText({
	lines = 3,
	className
}: {
	lines?: number;
	className?: string;
}) {
	return (
		<div className={cn("space-y-2", className)}>
			{Array.from({ length: lines }).map((_, i) => (
				<Skeleton
					key={i}
					className={cn(
						"h-4",
						// Vary line widths for natural look
						i === lines - 1 ? "w-3/4" : i % 2 === 0 ? "w-full" : "w-5/6"
					)}
				/>
			))}
		</div>
	);
}

/** Image skeleton - for image placeholders with aspect ratio */
function SkeletonImage({
	aspectRatio = "16/9",
	className
}: {
	aspectRatio?: string;
	className?: string;
}) {
	return (
		<Skeleton
			className={cn("w-full rounded-lg", className)}
			style={{ aspectRatio }}
		/>
	);
}

/** Card skeleton - complete card placeholder */
function SkeletonCard({ className }: { className?: string }) {
	return (
		<div className={cn("rounded-xl border bg-card p-4 space-y-4", className)}>
			<SkeletonImage aspectRatio="16/9" />
			<div className="space-y-2">
				<Skeleton className="h-5 w-3/4" />
				<Skeleton className="h-4 w-1/2" />
			</div>
		</div>
	);
}

/** AI Generation skeleton - pulsing effect for AI processing states */
function SkeletonGenerating({
	className,
	label = "Generating..."
}: {
	className?: string;
	label?: string;
}) {
	return (
		<div className={cn("flex flex-col items-center justify-center gap-3 p-8", className)}>
			<div className="relative">
				<div className="w-12 h-12 rounded-full bg-primary/20 animate-ping absolute inset-0" />
				<div className="w-12 h-12 rounded-full bg-primary/40 animate-pulse relative" />
			</div>
			<span className="text-sm text-muted-foreground animate-pulse">{label}</span>
		</div>
	);
}

export { Skeleton, SkeletonText, SkeletonImage, SkeletonCard, SkeletonGenerating };
