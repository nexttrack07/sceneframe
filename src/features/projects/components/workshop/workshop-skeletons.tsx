import { Skeleton } from "@/components/ui/skeleton";

export function OutlinePanelSkeleton() {
	return (
		<div className="max-w-4xl space-y-4">
			<div className="flex items-center gap-2">
				<Skeleton className="h-4 w-4" />
				<Skeleton className="h-4 w-24" />
			</div>

			{[1, 2, 3].map((i) => (
				<div
					key={i}
					className="rounded-xl border border-border bg-background p-4"
				>
					<Skeleton className="h-3 w-16 mb-2" />
					<Skeleton className="h-5 w-3/4 mb-2" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-2/3 mt-1" />
				</div>
			))}
		</div>
	);
}

export function ShotsPanelSkeleton() {
	return (
		<div className="max-w-4xl space-y-5">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Skeleton className="h-4 w-4" />
					<Skeleton className="h-4 w-40" />
				</div>
			</div>

			<div className="space-y-2">
				{[1, 2, 3, 4].map((i) => (
					<div
						key={i}
						className="rounded-xl border border-border bg-background p-4"
					>
						<div className="flex items-center gap-2 mb-2">
							<Skeleton className="h-3 w-12" />
							<Skeleton className="h-3 w-1" />
							<Skeleton className="h-3 w-16" />
							<Skeleton className="h-3 w-1" />
							<Skeleton className="h-3 w-12" />
							<Skeleton className="h-3 w-1" />
							<Skeleton className="h-3 w-8" />
						</div>
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-5/6 mt-1" />
					</div>
				))}
			</div>
		</div>
	);
}

export function PromptsPanelSkeleton() {
	return (
		<div className="max-w-4xl space-y-5">
			<div className="flex items-center gap-2">
				<Skeleton className="h-4 w-4" />
				<Skeleton className="h-4 w-28" />
			</div>

			<div className="space-y-2">
				{[1, 2, 3, 4].map((i) => (
					<div
						key={i}
						className="rounded-xl border border-border bg-background p-4"
					>
						<div className="flex items-center gap-2 mb-2">
							<Skeleton className="h-3 w-12" />
							<Skeleton className="h-3 w-1" />
							<Skeleton className="h-3 w-16" />
							<Skeleton className="h-3 w-1" />
							<Skeleton className="h-3 w-12" />
						</div>
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-full mt-1" />
						<Skeleton className="h-4 w-4/5 mt-1" />
					</div>
				))}
			</div>
		</div>
	);
}
